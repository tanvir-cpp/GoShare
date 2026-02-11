package main

import (
	"flag"
	"fmt"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"strconv"
	"strings"

	"fileshare/pkg/discovery"
	"fileshare/pkg/handlers"
	"fileshare/pkg/network"
)

func main() {
	portFlag := flag.Int("p", 8080, "Port number")
	sharedDir := flag.String("d", "shared_files", "Shared directory")
	flag.Parse()

	port := *portFlag
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			port = p
		}
	}

	handlers.SharedDir = *sharedDir
	os.MkdirAll(*sharedDir, 0755)

	// Recover from panics to keep server alive
	recoverMiddleware := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					log.Printf("PANIC recovered: %v\n%s", err, debug.Stack())
					http.Error(w, "Internal Server Error", 500)
				}
			}()
			h(w, r)
		}
	}

	appHandler := func(h http.HandlerFunc) http.HandlerFunc {
		return recoverMiddleware(handlers.Cors(h))
	}

	// API Routes (must be registered before catch-all)
	http.HandleFunc("/api/register", appHandler(handlers.HandleRegister))
	http.HandleFunc("/api/events", appHandler(handlers.HandleEvents))
	http.HandleFunc("/api/upload", appHandler(handlers.HandleUpload))
	http.HandleFunc("/api/files", appHandler(handlers.HandleListFiles))
	http.HandleFunc("/api/delete/", appHandler(handlers.HandleDelete))
	http.HandleFunc("/api/device/", appHandler(handlers.HandleGetDevice))
	http.HandleFunc("/download/", handlers.HandleDownload)

	// P2P signaling routes
	http.HandleFunc("/api/p2p/create", appHandler(handlers.HandleP2PCreate))
	http.HandleFunc("/api/p2p/signal", appHandler(handlers.HandleP2PSignal))
	http.HandleFunc("/api/p2p/poll", appHandler(handlers.HandleP2PPoll))

	// Static file server for web assets
	fs := http.FileServer(http.Dir("web"))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Log non-API requests (skip high-frequency events polling)
		if r.URL.Path != "/api/events" && !strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("Request: %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		}

		// Use standard mime package for reliable types
		contentType := mime.TypeByExtension(filepath.Ext(r.URL.Path))
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}

		// Serve homepage for root path
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "web/home.html")
			return
		}

		fs.ServeHTTP(w, r)
	})

	go discovery.CleanupStale()

	ip := network.GetLocalIP()
	currentPort := port

	for {
		addr := fmt.Sprintf("0.0.0.0:%d", currentPort)
		l, err := net.Listen("tcp", addr)
		if err == nil {
			l.Close()
			fmt.Printf("\n  ╔═══════════════════════════════════════════════╗\n")
			fmt.Printf("  ║              GoShare                      ║\n")
			fmt.Printf("  ╠═══════════════════════════════════════════════╣\n")
			fmt.Printf("  ║  Local:   http://localhost:%-17d ║\n", currentPort)
			fmt.Printf("  ║  Network: http://%-14s:%-12d  ║\n", ip, currentPort)
			fmt.Printf("  ╚═══════════════════════════════════════════════╝\n\n")
			fmt.Printf("  Open the URL on any device in your LAN to share files.\n")
			fmt.Printf("  Press Ctrl+C to stop.\n\n")
			log.Fatal(http.ListenAndServe(addr, nil))
		}
		fmt.Printf("  [!] Port %d is busy, trying %d...\n", currentPort, currentPort+1)
		currentPort++
	}
}
