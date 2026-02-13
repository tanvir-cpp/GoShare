package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"fileshare/internal/discovery"
	"fileshare/internal/network"
)

// SharedDir is the root directory for uploaded files.
var SharedDir = "shared_files"

// MaxUploadSize is the maximum allowed upload size (500 MB).
const MaxUploadSize = 500 << 20

// HandleRegister registers or updates a device on the network.
func HandleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	log.Printf("Registering request from %s", r.RemoteAddr)
	var body struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		log.Printf("Register error: %v", err)
		http.Error(w, "invalid json", 400)
		return
	}
	id := body.ID
	if id == "" {
		http.Error(w, "missing id", 400)
		return
	}

	var nameUpdated bool
	discovery.Lock.Lock()
	dev, ok := discovery.Devices[id]
	if !ok {
		dev = &discovery.Device{
			ID:       id,
			Name:     body.Name,
			Icon:     discovery.MakeDeviceIcon(id),
			Type:     discovery.DetectType(r.UserAgent()),
			IP:       r.RemoteAddr,
			UA:       r.UserAgent(),
			LastSeen: time.Now(),
		}
		if dev.Name == "" {
			dev.Name = discovery.MakeDeviceName(id)
		}
		discovery.Devices[id] = dev
		log.Printf("Device Registered: %s (%s) from %s", dev.Name, id, r.RemoteAddr)
	} else {
		if body.Name != "" && body.Name != dev.Name {
			dev.Name = body.Name
			log.Printf("Device Name Updated: %s (%s)", dev.Name, id)
			nameUpdated = true
		}
		dev.LastSeen = time.Now()
		dev.IP = r.RemoteAddr
	}
	discovery.Lock.Unlock()

	// Broadcast outside the lock to prevent race conditions
	if nameUpdated {
		discovery.Broadcast("device-joined", dev, id)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(dev); err != nil {
		log.Printf("Error encoding register response: %v", err)
	}
}

// HandleEvents opens an SSE stream for real-time peer updates.
func HandleEvents(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id", 400)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	q := make(chan []byte, 10)

	discovery.Lock.Lock()
	dev, ok := discovery.Devices[id]
	if !ok {
		dev = &discovery.Device{
			ID:       id,
			Name:     discovery.MakeDeviceName(id),
			Icon:     discovery.MakeDeviceIcon(id),
			Type:     discovery.DetectType(r.UserAgent()),
			IP:       r.RemoteAddr,
			UA:       r.UserAgent(),
			LastSeen: time.Now(),
		}
		discovery.Devices[id] = dev
		log.Printf("Auto-registered device on SSE connection: %s (%s)", dev.Name, id)
	}
	dev.Queues = append(dev.Queues, q)
	dev.LastSeen = time.Now()
	log.Printf("SSE Connected: %s (%s) [Total Queues: %d]", dev.Name, id, len(dev.Queues))
	discovery.Lock.Unlock()

	// Send the initial peer list.
	var list []discovery.Device
	discovery.Lock.RLock()
	for did, d := range discovery.Devices {
		if did != id {
			list = append(list, *d)
		}
	}
	discovery.Lock.RUnlock()
	msg, _ := json.Marshal(list)
	fmt.Fprintf(w, "event: peers\ndata: %s\n\n", msg)
	flusher.Flush()
	log.Printf("Sent initial peer list to %s (%d peers)", id, len(list))

	// Announce this device to others.
	discovery.Lock.RLock()
	if me, ok := discovery.Devices[id]; ok {
		go discovery.Broadcast("device-joined", me, id)
	}
	discovery.Lock.RUnlock()

	// Cleanup on disconnect.
	defer func() {
		discovery.Lock.Lock()
		shouldBroadcastLeft := false
		if dev, ok := discovery.Devices[id]; ok {
			for i, qq := range dev.Queues {
				if qq == q {
					dev.Queues = append(dev.Queues[:i], dev.Queues[i+1:]...)
					break
				}
			}
			// Only broadcast device-left when ALL SSE connections are gone
			if len(dev.Queues) == 0 {
				shouldBroadcastLeft = true
			}
		}
		discovery.Lock.Unlock()
		log.Printf("SSE Disconnected: %s", id)
		if shouldBroadcastLeft {
			discovery.Broadcast("device-left", map[string]string{"id": id}, id)
		}
	}()

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg := <-q:
			w.Write(msg)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

// HandleUpload processes multipart file uploads (public or private).
func HandleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Enforce maximum upload size.
	r.Body = http.MaxBytesReader(w, r.Body, MaxUploadSize)

	// Use a smaller memory buffer (32MB) to prevent RAM spikes.
	// Large files will be automatically streamed to disk.
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		log.Printf("Upload parse error: %v", err)
		http.Error(w, "Upload processing error", 400)
		return
	}

	rawTo := r.FormValue("to")
	fromID := r.FormValue("from")
	toID := ""
	var saved []string

	uploadDir := filepath.Join(SharedDir, "public")
	if rawTo != "" {
		toID = filepath.Base(rawTo)
		if !isValidName(toID) || len(toID) < 5 {
			http.Error(w, "invalid destination", 400)
			return
		}
		uploadDir = filepath.Join(SharedDir, "private", toID)
	}
	os.MkdirAll(uploadDir, 0755)

	files := r.MultipartForm.File["files"]
	for _, fh := range files {
		func() {
			f, err := fh.Open()
			if err != nil {
				log.Printf("Error opening uploaded file: %v", err)
				return
			}
			defer f.Close()

			safeName := filepath.Base(fh.Filename)
			outPath := filepath.Join(uploadDir, safeName)

			dst, err := os.Create(outPath)
			if err != nil {
				log.Printf("Error creating file %s: %v", outPath, err)
				return
			}
			defer dst.Close()

			if _, err := io.Copy(dst, f); err != nil {
				log.Printf("Error saving file %s: %v", outPath, err)
				return
			}
			saved = append(saved, safeName)
		}()
	}

	if toID != "" && fromID != "" && len(saved) > 0 {
		discovery.Lock.RLock()
		sender := discovery.Devices[fromID]
		discovery.Lock.RUnlock()
		if sender != nil {
			discovery.Notify(toID, "files-sent", map[string]interface{}{
				"filenames": saved,
				"from_name": sender.Name,
				"from_icon": sender.Icon,
			})
		}
	} else {
		discovery.Broadcast("shared-update", nil, "")
	}

	w.WriteHeader(200)
}

// HandleListFiles returns a JSON list of publicly shared files.
func HandleListFiles(w http.ResponseWriter, r *http.Request) {
	publicDir := filepath.Join(SharedDir, "public")
	if err := os.MkdirAll(publicDir, 0755); err != nil {
		log.Printf("Error creating public dir: %v", err)
		http.Error(w, "internal error", 500)
		return
	}
	entries, err := os.ReadDir(publicDir)
	if err != nil {
		log.Printf("Error reading public dir: %v", err)
		http.Error(w, "internal error", 500)
		return
	}
	var list []map[string]interface{}
	for _, e := range entries {
		if !e.IsDir() {
			info, err := e.Info()
			if err != nil {
				continue
			}
			list = append(list, map[string]interface{}{
				"name": e.Name(),
				"size": info.Size(),
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(list); err != nil {
		log.Printf("Error encoding file list: %v", err)
	}
}

// isValidName checks if a filename or ID is safe for filesystem use.
func isValidName(name string) bool {
	return name != "" && name != "." && name != ".." &&
		!strings.ContainsAny(name, "/\\:*?\"<>|")
}

// HandleDelete removes a file from the public shared directory.
func HandleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := filepath.Base(r.URL.Path)
	if !isValidName(name) {
		http.Error(w, "invalid filename", 400)
		return
	}
	target := filepath.Join(SharedDir, "public", name)
	if err := os.Remove(target); err != nil {
		log.Printf("Error deleting file %s: %v", target, err)
		http.Error(w, "could not delete file", 500)
		return
	}
	log.Printf("File deleted: %s", name)
	discovery.Broadcast("shared-update", nil, "")
	w.WriteHeader(200)
}

// HandleDownload serves a file (private first, then public fallback).
func HandleDownload(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Path)
	if !isValidName(name) {
		http.Error(w, "invalid filename", 400)
		return
	}
	myID := filepath.Base(r.URL.Query().Get("id"))

	if myID != "" && isValidName(myID) {
		privatePath := filepath.Join(SharedDir, "private", myID, name)
		if _, err := os.Stat(privatePath); err == nil {
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
			defer os.Remove(privatePath)
			http.ServeFile(w, r, privatePath)
			return
		}
	}

	publicPath := filepath.Join(SharedDir, "public", name)
	if _, err := os.Stat(publicPath); err == nil {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
		http.ServeFile(w, r, publicPath)
	} else {
		http.NotFound(w, r)
	}
}

// HandleGetDevice returns a single device's info by ID.
func HandleGetDevice(w http.ResponseWriter, r *http.Request) {
	id := filepath.Base(r.URL.Path)
	discovery.Lock.RLock()
	dev, ok := discovery.Devices[id]
	discovery.Lock.RUnlock()

	if !ok {
		http.Error(w, "device not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(dev); err != nil {
		log.Printf("Error encoding device response: %v", err)
	}
}

// HandleHealth returns a simple health check for container probes.
func HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

// HandleInfo returns the server's LAN IP address.
func HandleInfo(w http.ResponseWriter, r *http.Request) {
	data := struct {
		IP string `json:"ip"`
	}{
		IP: network.GetLocalIP(),
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding info response: %v", err)
	}
}
