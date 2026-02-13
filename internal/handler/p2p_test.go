package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleP2PCreate(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/p2p/create", nil)
	w := httptest.NewRecorder()

	HandleP2PCreate(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["room"] == "" {
		t.Error("expected room ID to be non-empty")
	}

	if len(resp["room"]) != 12 { // hex(6 bytes) = 12 chars
		t.Errorf("expected room ID of length 12, got %d", len(resp["room"]))
	}
}

func TestHandleP2PCreate_WrongMethod(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/p2p/create", nil)
	w := httptest.NewRecorder()

	HandleP2PCreate(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", w.Code)
	}
}

func TestHandleP2PSignal_Success(t *testing.T) {
	// First create a room
	createReq := httptest.NewRequest("POST", "/api/p2p/create", nil)
	cw := httptest.NewRecorder()
	HandleP2PCreate(cw, createReq)

	var createResp map[string]string
	json.NewDecoder(cw.Body).Decode(&createResp)
	roomID := createResp["room"]

	// Now signal to it
	signalBody := map[string]interface{}{
		"room": roomID,
		"from": "sender",
		"type": "offer",
		"data": map[string]string{"test": "value"},
	}
	body, _ := json.Marshal(signalBody)
	req := httptest.NewRequest("POST", "/api/p2p/signal", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleP2PSignal(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestHandleP2PSignal_RoomNotFound(t *testing.T) {
	signalBody := map[string]interface{}{
		"room": "nonexistent",
		"from": "sender",
		"type": "offer",
		"data": map[string]string{"test": "value"},
	}
	body, _ := json.Marshal(signalBody)
	req := httptest.NewRequest("POST", "/api/p2p/signal", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleP2PSignal(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestHandleP2PPoll_RoomNotFound(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/p2p/poll?room=nonexistent&role=sender&since=0", nil)
	w := httptest.NewRecorder()

	HandleP2PPoll(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestHandleP2PPoll_Success(t *testing.T) {
	// Create a room first
	createReq := httptest.NewRequest("POST", "/api/p2p/create", nil)
	cw := httptest.NewRecorder()
	HandleP2PCreate(cw, createReq)

	var createResp map[string]string
	json.NewDecoder(cw.Body).Decode(&createResp)
	roomID := createResp["room"]

	// Poll it
	req := httptest.NewRequest("GET", "/api/p2p/poll?room="+roomID+"&role=sender&since=0", nil)
	w := httptest.NewRecorder()

	HandleP2PPoll(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["index"] == nil {
		t.Error("expected index field in response")
	}
}
