package discovery

import (
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// Broadcast sends an SSE event to all connected devices except excludeID.
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

// Notify sends an SSE event to a single device by ID.
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

// CleanupStale removes devices that have no active SSE connections
// and haven't been seen recently. Run this as a goroutine.
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
