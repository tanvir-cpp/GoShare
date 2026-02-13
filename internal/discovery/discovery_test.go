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
