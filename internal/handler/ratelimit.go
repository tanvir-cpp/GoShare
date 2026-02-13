package handler

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// rateLimiter tracks request counts per IP using a sliding window.
type rateLimiter struct {
	visitors sync.Map      // map[string]*visitor
	rate     int           // max requests
	window   time.Duration // per window
}

type visitor struct {
	count    int
	lastSeen time.Time
	mu       sync.Mutex
}

var defaultLimiter = newRateLimiter(300, time.Minute) // 300 requests/minute per IP

func newRateLimiter(rate int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{rate: rate, window: window}
	// Background cleanup of stale visitor entries
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			rl.visitors.Range(func(key, value interface{}) bool {
				v := value.(*visitor)
				v.mu.Lock()
				if time.Since(v.lastSeen) > 2*rl.window {
					rl.visitors.Delete(key)
				}
				v.mu.Unlock()
				return true
			})
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(ip string) bool {
	val, _ := rl.visitors.LoadOrStore(ip, &visitor{})
	v := val.(*visitor)
	v.mu.Lock()
	defer v.mu.Unlock()

	now := time.Now()
	if now.Sub(v.lastSeen) > rl.window {
		v.count = 0
	}
	v.lastSeen = now
	v.count++
	return v.count <= rl.rate
}

func getIP(r *http.Request) string {
	// Check X-Forwarded-For for reverse proxy setups (Koyeb, Cloudflare, etc.)
	// Format: "client, proxy1, proxy2" — take the first (original client) IP.
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// RateLimit wraps a handler with per-IP rate limiting.
// SSE (long-lived connections) and health checks are exempt.
func RateLimit(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Exempt SSE and health endpoints — SSE is a single long-lived
		// connection, not repeated requests.
		if r.URL.Path == "/api/events" || r.URL.Path == "/health" {
			h(w, r)
			return
		}
		ip := getIP(r)
		if !defaultLimiter.allow(ip) {
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}
		h(w, r)
	}
}
