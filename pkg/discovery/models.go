package discovery

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

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

var (
	Lock    sync.RWMutex
	Devices = make(map[string]*Device)
)

var adjectives = []string{"Swift", "Brave", "Calm", "Bold", "Keen", "Warm", "Cool", "Wise", "Bright", "Happy", "Gentle", "Lucky", "Noble", "Quiet", "Vivid", "Witty"}
var animals = []string{"Panda", "Fox", "Owl", "Wolf", "Bear", "Hawk", "Lynx", "Orca", "Tiger", "Eagle", "Koala", "Raven", "Otter", "Falcon", "Shark", "Bison"}
var icons = []string{"fox", "panda", "owl", "wolf", "bear", "hawk", "cat", "dolphin", "tiger", "lion", "koala", "raven", "otter", "shark", "elephant", "butterfly"}

func MakeDeviceName(id string) string {
	h := md5.Sum([]byte(id))
	val := int(h[0]) | int(h[1])<<8
	return fmt.Sprintf("%s %s", adjectives[val%len(adjectives)], animals[(val>>8)%len(animals)])
}

func MakeDeviceIcon(id string) string {
	h := md5.Sum([]byte(id))
	val := int(h[0])
	return icons[val%len(icons)]
}

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

func Broadcast(eventType string, data interface{}, excludeID string) {
	msg, _ := json.Marshal(data)
	sseMsg := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, msg))

	Lock.RLock()
	defer Lock.RUnlock()
	count := 0
	for id, dev := range Devices {
		if id == excludeID {
			continue
		}
		for _, q := range dev.Queues {
			select {
			case q <- sseMsg:
				count++
				log.Printf(" -> Sent %s to %s (%s)", eventType, dev.Name, id)
			default:
				log.Printf(" !! Could not send to %s (queue full)", dev.Name)
			}
		}
	}
}

func Notify(id string, eventType string, data interface{}) {
	msg, _ := json.Marshal(data)
	sseMsg := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, msg))

	Lock.RLock()
	dev, ok := Devices[id]
	Lock.RUnlock()

	if ok {
		for _, q := range dev.Queues {
			select {
			case q <- sseMsg:
			default:
			}
		}
	}
}

func CleanupStale() {
	for {
		time.Sleep(15 * time.Second)
		var stale []string
		Lock.RLock()
		for id, dev := range Devices {
			if time.Since(dev.LastSeen) > 60*time.Second && len(dev.Queues) == 0 {
				stale = append(stale, id)
			}
		}
		Lock.RUnlock()

		if len(stale) > 0 {
			Lock.Lock()
			for _, id := range stale {
				delete(Devices, id)
			}
			Lock.Unlock()
			for _, id := range stale {
				Broadcast("device-left", map[string]string{"id": id}, "")
			}
		}
	}
}
