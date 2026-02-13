package server

import (
	"net/http"

	"fileshare/internal/handler"
)

// wrap applies recovery + security headers + CORS + rate limit middleware to a handler.
func wrap(h http.HandlerFunc) http.HandlerFunc {
	return handler.Recover(handler.SecureHeaders(handler.Cors(handler.RateLimit(h))))
}

// RegisterRoutes wires all API and static file routes to the default mux.
func RegisterRoutes(staticFS http.Handler, homeFile, notFoundFile string) {
	// LAN API
	http.HandleFunc("/api/register", wrap(handler.HandleRegister))
	http.HandleFunc("/api/events", wrap(handler.HandleEvents))
	http.HandleFunc("/api/upload", wrap(handler.HandleUpload))
	http.HandleFunc("/api/files", wrap(handler.HandleListFiles))
	http.HandleFunc("/api/delete/", wrap(handler.HandleDelete))
	http.HandleFunc("/api/device/", wrap(handler.HandleGetDevice))
	http.HandleFunc("/api/info", wrap(handler.HandleInfo))
	http.HandleFunc("/health", handler.HandleHealth)
	http.HandleFunc("/download/", handler.HandleDownload)

	// P2P signaling API
	http.HandleFunc("/api/p2p/create", wrap(handler.HandleP2PCreate))
	http.HandleFunc("/api/p2p/signal", wrap(handler.HandleP2PSignal))
	http.HandleFunc("/api/p2p/poll", wrap(handler.HandleP2PPoll))

	// Static files (homepage + assets)
	http.HandleFunc("/", staticHandler(staticFS, homeFile, notFoundFile))
}
