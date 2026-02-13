package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleHealth(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	HandleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("expected status 'ok', got '%s'", resp["status"])
	}
}

func TestHandleInfo(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/info", nil)
	w := httptest.NewRecorder()

	HandleInfo(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["ip"] == "" {
		t.Error("expected ip field to be non-empty")
	}
}

func TestHandleRegister_MissingID(t *testing.T) {
	body := `{"id":"","name":"test"}`
	req := httptest.NewRequest("POST", "/api/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleRegister(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestHandleRegister_Success(t *testing.T) {
	body := `{"id":"test-id-12345","name":"TestUser"}`
	req := httptest.NewRequest("POST", "/api/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleRegister(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["id"] != "test-id-12345" {
		t.Errorf("expected id 'test-id-12345', got '%s'", resp["id"])
	}
	if resp["name"] != "TestUser" {
		t.Errorf("expected name 'TestUser', got '%s'", resp["name"])
	}
}

func TestHandleRegister_InvalidJSON(t *testing.T) {
	body := `not valid json`
	req := httptest.NewRequest("POST", "/api/register", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	HandleRegister(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestHandleListFiles(t *testing.T) {
	// Set SharedDir to a temp directory for isolation
	originalDir := SharedDir
	SharedDir = t.TempDir()
	defer func() { SharedDir = originalDir }()

	req := httptest.NewRequest("GET", "/api/files", nil)
	w := httptest.NewRecorder()

	HandleListFiles(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestHandleDelete_InvalidFilename(t *testing.T) {
	req := httptest.NewRequest("DELETE", "/api/delete/..", nil)
	w := httptest.NewRecorder()

	HandleDelete(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestHandleGetDevice_NotFound(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/device/nonexistent-id", nil)
	w := httptest.NewRecorder()

	HandleGetDevice(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestHandleDownload_InvalidFilename(t *testing.T) {
	req := httptest.NewRequest("GET", "/download/..", nil)
	w := httptest.NewRecorder()

	HandleDownload(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}
