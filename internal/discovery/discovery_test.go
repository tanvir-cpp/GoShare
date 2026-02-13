package discovery

import (
	"testing"
)

func TestMakeDeviceName(t *testing.T) {
	name1 := MakeDeviceName("test-id-1")
	name2 := MakeDeviceName("test-id-2")

	if name1 == "" {
		t.Error("expected non-empty name")
	}

	// Deterministic — same input should give same output
	name1Again := MakeDeviceName("test-id-1")
	if name1 != name1Again {
		t.Errorf("expected deterministic name, got '%s' and '%s'", name1, name1Again)
	}

	// Different inputs should (likely) give different names
	if name1 == name2 {
		t.Logf("warning: same name for different IDs: %s", name1)
	}
}

func TestMakeDeviceIcon(t *testing.T) {
	icon := MakeDeviceIcon("test-id-1")

	if icon == "" {
		t.Error("expected non-empty icon")
	}

	// Deterministic
	iconAgain := MakeDeviceIcon("test-id-1")
	if icon != iconAgain {
		t.Errorf("expected deterministic icon, got '%s' and '%s'", icon, iconAgain)
	}

	// Must be one of the valid icons
	valid := false
	for _, i := range icons {
		if icon == i {
			valid = true
			break
		}
	}
	if !valid {
		t.Errorf("icon '%s' is not in the valid icons list", icon)
	}
}

func TestDetectType(t *testing.T) {
	tests := []struct {
		ua       string
		expected string
	}{
		{"Mozilla/5.0 (iPhone; CPU iPhone OS 15_0) AppleWebKit", "phone"},
		{"Mozilla/5.0 (Linux; Android 12; Pixel 6) Mobile", "phone"},
		{"Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)", "tablet"},
		{"Mozilla/5.0 (Linux; Android 12; SM-T500) Tablet", "tablet"},
		{"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome", "desktop"},
		{"Mozilla/5.0 (Macintosh; Intel Mac OS X 12_0)", "desktop"},
		{"", "desktop"},
	}

	for _, tt := range tests {
		result := DetectType(tt.ua)
		if result != tt.expected {
			t.Errorf("DetectType(%q) = %q, want %q", tt.ua, result, tt.expected)
		}
	}
}

func TestExtractIP(t *testing.T) {
	tests := []struct {
		name     string
		remote   string
		xff      string
		xri      string
		expected string
	}{
		{"X-Forwarded-For single", "10.0.0.1:1234", "203.0.113.50", "", "203.0.113.50"},
		{"X-Forwarded-For chain", "10.0.0.1:1234", "203.0.113.50, 70.41.3.18, 150.172.238.178", "", "203.0.113.50"},
		{"X-Real-IP", "10.0.0.1:1234", "", "198.51.100.10", "198.51.100.10"},
		{"RemoteAddr with port", "192.168.1.5:54321", "", "", "192.168.1.5"},
		{"RemoteAddr no port", "192.168.1.5", "", "", "192.168.1.5"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ExtractIP(tt.remote, tt.xff, tt.xri)
			if result != tt.expected {
				t.Errorf("ExtractIP(%q, %q, %q) = %q, want %q", tt.remote, tt.xff, tt.xri, result, tt.expected)
			}
		})
	}
}

func TestPeersOnSameNetwork(t *testing.T) {
	// Setup: two devices on same network, one on different
	Lock.Lock()
	Devices["dev-a"] = &Device{ID: "dev-a", Name: "A", NetworkIP: "203.0.113.50"}
	Devices["dev-b"] = &Device{ID: "dev-b", Name: "B", NetworkIP: "203.0.113.50"}
	Devices["dev-c"] = &Device{ID: "dev-c", Name: "C", NetworkIP: "198.51.100.10"}
	Lock.Unlock()

	Lock.RLock()
	peers := PeersOnSameNetwork("dev-a")
	Lock.RUnlock()

	if len(peers) != 1 {
		t.Fatalf("expected 1 peer on same network, got %d", len(peers))
	}
	if peers[0].ID != "dev-b" {
		t.Errorf("expected peer dev-b, got %s", peers[0].ID)
	}

	// Cleanup
	Lock.Lock()
	delete(Devices, "dev-a")
	delete(Devices, "dev-b")
	delete(Devices, "dev-c")
	Lock.Unlock()
}

func TestBroadcast_SameNetworkOnly(t *testing.T) {
	qA := make(chan []byte, 10)
	qC := make(chan []byte, 10)

	Lock.Lock()
	Devices["dev-a"] = &Device{ID: "dev-a", Name: "A", NetworkIP: "203.0.113.50", Queues: []chan []byte{qA}}
	Devices["dev-b"] = &Device{ID: "dev-b", Name: "B", NetworkIP: "203.0.113.50"}
	Devices["dev-c"] = &Device{ID: "dev-c", Name: "C", NetworkIP: "198.51.100.10", Queues: []chan []byte{qC}}
	Lock.Unlock()

	// Broadcast from dev-b — should reach dev-a (same network) but NOT dev-c
	Broadcast("test-event", map[string]string{"msg": "hello"}, "dev-b")

	select {
	case msg := <-qA:
		if len(msg) == 0 {
			t.Error("expected non-empty message for dev-a")
		}
	default:
		t.Error("dev-a should have received the broadcast (same network)")
	}

	select {
	case <-qC:
		t.Error("dev-c should NOT have received the broadcast (different network)")
	default:
		// Expected — dev-c is on a different network
	}

	// Cleanup
	Lock.Lock()
	delete(Devices, "dev-a")
	delete(Devices, "dev-b")
	delete(Devices, "dev-c")
	Lock.Unlock()
}

func TestNotify(t *testing.T) {
	q := make(chan []byte, 10)

	Lock.Lock()
	Devices["dev-target"] = &Device{ID: "dev-target", Name: "Target", Queues: []chan []byte{q}}
	Lock.Unlock()

	Notify("dev-target", "files-sent", map[string]string{"from": "someone"})

	select {
	case msg := <-q:
		if len(msg) == 0 {
			t.Error("expected non-empty notification")
		}
	default:
		t.Error("target should have received the notification")
	}

	// Cleanup
	Lock.Lock()
	delete(Devices, "dev-target")
	Lock.Unlock()
}
