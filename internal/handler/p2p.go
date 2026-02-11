package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// P2PRoom holds signaling data for a WebRTC session.
type P2PRoom struct {
	ID        string      `json:"id"`
	CreatedAt time.Time   `json:"-"`
	Signals   []P2PSignal `json:"-"`
	mu        sync.Mutex
}

// P2PSignal is a single signaling message (offer, answer, ICE candidate, etc.).
type P2PSignal struct {
	From string          `json:"from"`
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

var (
	p2pLock  sync.RWMutex
	p2pRooms = make(map[string]*P2PRoom)
)

func init() {
	go cleanupP2PRooms()
}

func cleanupP2PRooms() {
	for {
		time.Sleep(5 * time.Minute)
		p2pLock.Lock()
		for id, room := range p2pRooms {
			if time.Since(room.CreatedAt) > 30*time.Minute {
				delete(p2pRooms, id)
				log.Printf("P2P room expired: %s", id)
			}
		}
		p2pLock.Unlock()
	}
}

func generateRoomID() string {
	b := make([]byte, 6)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// HandleP2PCreate creates a new P2P signaling room.
func HandleP2PCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", 405)
		return
	}

	roomID := generateRoomID()
	room := &P2PRoom{
		ID:        roomID,
		CreatedAt: time.Now(),
		Signals:   make([]P2PSignal, 0),
	}

	p2pLock.Lock()
	p2pRooms[roomID] = room
	p2pLock.Unlock()

	log.Printf("P2P room created: %s", roomID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"room": roomID})
}

// HandleP2PSignal stores a signaling message in a room.
func HandleP2PSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "method not allowed", 405)
		return
	}

	var req struct {
		Room string          `json:"room"`
		From string          `json:"from"`
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", 400)
		return
	}

	p2pLock.RLock()
	room, ok := p2pRooms[req.Room]
	p2pLock.RUnlock()

	if !ok {
		http.Error(w, "room not found", 404)
		return
	}

	room.mu.Lock()
	room.Signals = append(room.Signals, P2PSignal{
		From: req.From,
		Type: req.Type,
		Data: req.Data,
	})
	room.mu.Unlock()

	log.Printf("P2P signal [%s] %s from %s", req.Room, req.Type, req.From)
	w.WriteHeader(200)
}

// HandleP2PPoll returns new signals for a given role since a specific index.
func HandleP2PPoll(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	role := r.URL.Query().Get("role")
	sinceStr := r.URL.Query().Get("since")

	since := 0
	if sinceStr != "" {
		if s, err := strconv.Atoi(sinceStr); err == nil {
			since = s
		}
	}

	p2pLock.RLock()
	room, ok := p2pRooms[roomID]
	p2pLock.RUnlock()

	if !ok {
		http.Error(w, "room not found", 404)
		return
	}

	room.mu.Lock()
	var result []P2PSignal
	for i := since; i < len(room.Signals); i++ {
		if room.Signals[i].From != role {
			result = append(result, room.Signals[i])
		}
	}
	total := len(room.Signals)
	room.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"signals": result,
		"index":   total,
	})
}
