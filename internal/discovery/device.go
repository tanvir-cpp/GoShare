package discovery

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"
)

// isLocalIP returns true if the given IP string is a loopback, private, or link-local address.
func isLocalIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
}

// areInSameNetwork checks if two IPs should be considered part of the same discovery group.
func areInSameNetwork(ip1, ip2 string) bool {
	if ip1 == ip2 {
		return true
	}

	// If both are local/private IPs, they belong to the same LAN discovery group.
	if isLocalIP(ip1) && isLocalIP(ip2) {
		return true
	}

	// Handle IPv6 Prefix Grouping
	// In IPv6, every device gets a unique public IP, but they usually share the same /64 prefix on a LAN.
	p1 := net.ParseIP(ip1)
	p2 := net.ParseIP(ip2)

	if p1 != nil && p2 != nil {
		p1_4 := p1.To4()
		p2_4 := p2.To4()

		// If both are IPv6 (not IPv4-mapped), check the prefix
		if p1_4 == nil && p2_4 == nil {
			// Compare the first 8 bytes (64 bits) for the network prefix
			if len(p1) >= 8 && len(p2) >= 8 {
				match := true
				for i := 0; i < 8; i++ {
					if p1[i] != p2[i] {
						match = false
						break
					}
				}
				if match {
					return true
				}
			}
		}
	}

	return false
}

// Device represents a discovered peer on the network.
type Device struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Icon      string        `json:"icon"`
	Type      string        `json:"type"`
	IP        string        `json:"-"` // raw RemoteAddr (may include port)
	NetworkIP string        `json:"-"` // public IP only (for network grouping)
	UA        string        `json:"-"`
	LastSeen  time.Time     `json:"-"`
	Queues    []chan []byte `json:"-"`
}

// Global device registry.
var (
	Lock    sync.RWMutex
	Devices = make(map[string]*Device)
)

// Word lists for deterministic name/icon generation.
var adjectives = []string{
	"Swift", "Brave", "Calm", "Bold", "Keen", "Warm", "Cool", "Wise",
	"Bright", "Happy", "Gentle", "Lucky", "Noble", "Quiet", "Vivid", "Witty",
}
var animals = []string{
	"Panda", "Fox", "Owl", "Wolf", "Bear", "Hawk", "Lynx", "Orca",
	"Tiger", "Eagle", "Koala", "Raven", "Otter", "Falcon", "Shark", "Bison",
}
var icons = []string{
	"fox", "panda", "owl", "wolf", "bear", "hawk", "cat", "dolphin",
	"tiger", "lion", "koala", "raven", "otter", "shark", "elephant", "butterfly",
}

// MakeDeviceName generates a deterministic friendly name from a device ID.
func MakeDeviceName(id string) string {
	h := md5.Sum([]byte(id))
	val := int(h[0]) | int(h[1])<<8
	return fmt.Sprintf("%s %s", adjectives[val%len(adjectives)], animals[(val>>8)%len(animals)])
}

// MakeDeviceIcon generates a deterministic icon name from a device ID.
func MakeDeviceIcon(id string) string {
	h := md5.Sum([]byte(id))
	val := int(h[0])
	return icons[val%len(icons)]
}

// DetectType infers the device type from the User-Agent string.
func DetectType(ua string) string {
	ua = strings.ToLower(ua)
	if strings.Contains(ua, "iphone") || (strings.Contains(ua, "android") && strings.Contains(ua, "mobile")) {
		return "phone"
	}
	if strings.Contains(ua, "ipad") || strings.Contains(ua, "tablet") {
		return "tablet"
	}
	return "desktop"
}

// ExtractIP extracts the client's public IP from the HTTP request context.
// It checks X-Forwarded-For (reverse proxy), X-Real-IP, then falls back to RemoteAddr.
func ExtractIP(remoteAddr string, xForwardedFor string, xRealIP string) string {
	var rawIP string

	// Check X-Forwarded-For first (Koyeb, Cloudflare, etc.)
	if xForwardedFor != "" {
		if i := strings.IndexByte(xForwardedFor, ','); i > 0 {
			rawIP = strings.TrimSpace(xForwardedFor[:i])
		} else {
			rawIP = strings.TrimSpace(xForwardedFor)
		}
	} else if xRealIP != "" {
		rawIP = strings.TrimSpace(xRealIP)
	} else {
		host, _, err := net.SplitHostPort(remoteAddr)
		if err != nil {
			rawIP = remoteAddr
		} else {
			rawIP = host
		}
	}

	// Double-check if rawIP still contains a port (some headers can be messy)
	if strings.Contains(rawIP, ":") && !strings.Contains(rawIP, "]") && strings.Count(rawIP, ":") == 1 {
		// Likely IPv4:Port
		if h, _, err := net.SplitHostPort(rawIP); err == nil {
			rawIP = h
		}
	} else if strings.HasPrefix(rawIP, "[") {
		// Likely [IPv6]:Port
		if h, _, err := net.SplitHostPort(rawIP); err == nil {
			rawIP = h
		}
	}

	return rawIP
}

// PeersOnSameNetwork returns all devices that share the same NetworkIP as
// the given device, excluding the device itself.
// Must be called with Lock held (at least RLock).
func PeersOnSameNetwork(selfID string) []Device {
	self, ok := Devices[selfID]
	if !ok {
		return nil
	}
	var peers []Device
	for did, d := range Devices {
		if did != selfID && areInSameNetwork(d.NetworkIP, self.NetworkIP) {
			peers = append(peers, *d)
		}
	}
	return peers
}

// Broadcast sends an SSE event to all devices on the same network as
// the sender. If senderID is empty, broadcasts to ALL devices (e.g. shared-update).
// Must be called WITHOUT the lock held.
func Broadcast(event string, data interface{}, senderID string) {
	msg, err := json.Marshal(data)
	if err != nil {
		log.Printf("Broadcast marshal error: %v", err)
		return
	}
	payload := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", event, msg))

	Lock.RLock()
	defer Lock.RUnlock()

	// Determine the sender's network IP for filtering
	senderNetworkIP := ""
	if senderID != "" {
		if sender, ok := Devices[senderID]; ok {
			senderNetworkIP = sender.NetworkIP
		}
	}

	for did, d := range Devices {
		if did == senderID {
			continue // Don't send to self
		}
		// If we know the sender's network, only send to same-network peers.
		// If senderID is empty (e.g. shared-update), send to everyone.
		if senderNetworkIP != "" && !areInSameNetwork(d.NetworkIP, senderNetworkIP) {
			continue
		}
		for _, q := range d.Queues {
			select {
			case q <- payload:
			default:
				// Queue full — skip to avoid blocking
			}
		}
	}
}

// Notify sends an SSE event to a specific device by ID.
// Must be called WITHOUT the lock held.
func Notify(targetID string, event string, data interface{}) {
	msg, err := json.Marshal(data)
	if err != nil {
		log.Printf("Notify marshal error: %v", err)
		return
	}
	payload := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", event, msg))

	Lock.RLock()
	defer Lock.RUnlock()

	if d, ok := Devices[targetID]; ok {
		for _, q := range d.Queues {
			select {
			case q <- payload:
			default:
			}
		}
	}
}

// CleanupStale periodically removes devices that have no active SSE
// connections and haven't been seen for over 2 minutes.
func CleanupStale() {
	for {
		time.Sleep(30 * time.Second)
		Lock.Lock()
		for id, d := range Devices {
			if len(d.Queues) == 0 && time.Since(d.LastSeen) > 2*time.Minute {
				delete(Devices, id)
				log.Printf("Cleaned up stale device: %s (%s)", d.Name, id)
			}
		}
		Lock.Unlock()
	}
}
