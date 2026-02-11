package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
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

	// API Routes (must be registered before catch-all)
	http.HandleFunc("/api/register", handlers.Cors(handlers.HandleRegister))
	http.HandleFunc("/api/events", handlers.Cors(handlers.HandleEvents))
	http.HandleFunc("/api/upload", handlers.Cors(handlers.HandleUpload))
	http.HandleFunc("/api/files", handlers.Cors(handlers.HandleListFiles))
	http.HandleFunc("/api/delete/", handlers.Cors(handlers.HandleDelete))
	http.HandleFunc("/api/device/", handlers.Cors(handlers.HandleGetDevice))
	http.HandleFunc("/download/", handlers.HandleDownload)

	// P2P signaling routes
	http.HandleFunc("/api/p2p/create", handlers.Cors(handlers.HandleP2PCreate))
	http.HandleFunc("/api/p2p/signal", handlers.Cors(handlers.HandleP2PSignal))
	http.HandleFunc("/api/p2p/poll", handlers.Cors(handlers.HandleP2PPoll))

	// Static file server for web assets
	fs := http.FileServer(http.Dir("web"))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Log non-API requests (skip high-frequency events polling)
		if r.URL.Path != "/api/events" && !strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("Request: %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		}

		// Fix for Windows CSS/JS MIME issues
		if strings.HasSuffix(r.URL.Path, ".css") {
			w.Header().Set("Content-Type", "text/css")
		} else if strings.HasSuffix(r.URL.Path, ".js") {
			w.Header().Set("Content-Type", "application/javascript")
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
