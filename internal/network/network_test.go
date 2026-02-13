package network

import (
	"net"
	"testing"
)

func TestGetLocalIP(t *testing.T) {
	ip := GetLocalIP()

	if ip == "" {
		t.Error("expected non-empty IP address")
	}

	// Should be a valid IPv4 address
	parsed := net.ParseIP(ip)
	if parsed == nil {
		t.Errorf("expected valid IP address, got %q", ip)
	}

	// Should be IPv4
	if parsed.To4() == nil {
		t.Errorf("expected IPv4 address, got %q", ip)
	}
}
