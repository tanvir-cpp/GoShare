package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"fileshare/pkg/discovery"
)

var SharedDir = "shared_files"

func Cors(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			return
		}
		h(w, r)
	}
}

func HandleRegister(w http.ResponseWriter, r *http.Request) {
	log.Printf("Registering request from %s", r.RemoteAddr)
	var body struct{ ID string }
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

	discovery.Lock.Lock()
	defer discovery.Lock.Unlock()
	if _, ok := discovery.Devices[id]; !ok {
		discovery.Devices[id] = &discovery.Device{
			ID:       id,
			Name:     discovery.MakeDeviceName(id),
			Icon:     discovery.MakeDeviceIcon(id),
			Type:     discovery.DetectType(r.UserAgent()),
			IP:       r.RemoteAddr,
			UA:       r.UserAgent(),
			LastSeen: time.Now(),
		}
		log.Printf("Device Registered: %s (%s) from %s", discovery.Devices[id].Name, id, r.RemoteAddr)
	} else {
		discovery.Devices[id].LastSeen = time.Now()
		discovery.Devices[id].IP = r.RemoteAddr
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(discovery.Devices[id])
}

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

	discovery.Lock.RLock()
	if me, ok := discovery.Devices[id]; ok {
		go discovery.Broadcast("device-joined", me, id)
	}
	discovery.Lock.RUnlock()

	defer func() {
		discovery.Lock.Lock()
		if dev, ok := discovery.Devices[id]; ok {
			for i, qq := range dev.Queues {
				if qq == q {
					dev.Queues = append(dev.Queues[:i], dev.Queues[i+1:]...)
					break
				}
			}
		}
		discovery.Lock.Unlock()
		log.Printf("SSE Disconnected: %s", id)
		discovery.Broadcast("device-left", map[string]string{"id": id}, id)
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

func HandleUpload(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(100 << 20)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	rawTo := r.FormValue("to")
	fromID := r.FormValue("from")
	toID := ""
	var saved []string

	uploadDir := filepath.Join(SharedDir, "public")
	if rawTo != "" {
		toID = filepath.Base(rawTo)
		uploadDir = filepath.Join(SharedDir, "private", toID)
	}
	os.MkdirAll(uploadDir, 0755)

	files := r.MultipartForm.File["files"]
	for _, fh := range files {
		f, _ := fh.Open()
		safeName := filepath.Base(fh.Filename)
		dst, _ := os.Create(filepath.Join(uploadDir, safeName))
		io.Copy(dst, f)
		f.Close()
		dst.Close()
		saved = append(saved, safeName)
	}

	if toID != "" && fromID != "" && len(saved) > 0 {
		discovery.Lock.RLock()
		sender := discovery.Devices[fromID]
		discovery.Lock.RUnlock()
		if sender != nil {
			for _, name := range saved {
				discovery.Notify(toID, "file-sent", map[string]interface{}{
					"filename":  name,
					"from_name": sender.Name,
					"from_icon": sender.Icon,
				})
			}
		}
	} else {
		discovery.Broadcast("shared-update", nil, "")
	}

	w.WriteHeader(200)
}

func HandleListFiles(w http.ResponseWriter, r *http.Request) {
	publicDir := filepath.Join(SharedDir, "public")
	os.MkdirAll(publicDir, 0755)
	entries, _ := os.ReadDir(publicDir)
	var list []map[string]interface{}
	for _, e := range entries {
		if !e.IsDir() {
			info, _ := e.Info()
			list = append(list, map[string]interface{}{
				"name": e.Name(),
				"size": info.Size(),
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func HandleDelete(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Path)
	// Only allow deleting from public for now to prevent unauthorized deletion of private files
	os.Remove(filepath.Join(SharedDir, "public", name))
	discovery.Broadcast("shared-update", nil, "")
	w.WriteHeader(200)
}

func HandleDownload(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Path)
	myID := filepath.Base(r.URL.Query().Get("id"))

	// Try private folder first if id is provided
	if myID != "" && myID != "." && myID != "\\" && myID != "/" {
		privatePath := filepath.Join(SharedDir, "private", myID, name)
		if _, err := os.Stat(privatePath); err == nil {
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
			// Auto-delete private files after download to enhance privacy
			defer os.Remove(privatePath)
			http.ServeFile(w, r, privatePath)
			return
		}
	}

	// Fallback to public folder
	publicPath := filepath.Join(SharedDir, "public", name)
	if _, err := os.Stat(publicPath); err == nil {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
		http.ServeFile(w, r, publicPath)
	} else {
		http.NotFound(w, r)
	}
}

func HandleGetDevice(w http.ResponseWriter, r *http.Request) {
	id := filepath.Base(r.URL.Path)
	discovery.Lock.RLock()
	defer discovery.Lock.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(discovery.Devices[id])
}
