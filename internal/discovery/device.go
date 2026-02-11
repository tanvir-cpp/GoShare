package discovery

import (
	"crypto/md5"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Device represents a discovered peer on the network.
type Device struct {
	ID       string        `json:"id"`
	Name     string        `json:"name"`
	Icon     string        `json:"icon"`
	Type     string        `json:"type"`
	IP       string        `json:"-"`
	UA       string        `json:"-"`
	LastSeen time.Time     `json:"-"`
	Queues   []chan []byte `json:"-"`
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
