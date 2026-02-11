package server

import (
	"fmt"
	"log"
	"mime"
	"net"
	"net/http"
	"path/filepath"
	"strings"
)

// staticHandler serves static files and the homepage for "/".
func staticHandler(fs http.Handler, homeFile string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/events" && !strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("Request: %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		}

		contentType := mime.TypeByExtension(filepath.Ext(r.URL.Path))
		if contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}

		if r.URL.Path == "/" {
			http.ServeFile(w, r, homeFile)
			return
		}

		fs.ServeHTTP(w, r)
	}
}

// Start binds to the given port (or the next available one) and starts serving.
func Start(port int, ip string) {
	currentPort := port

	for {
		addr := fmt.Sprintf("0.0.0.0:%d", currentPort)
		l, err := net.Listen("tcp", addr)
		if err == nil {
			l.Close()
			printBanner(ip, currentPort)
			log.Fatal(http.ListenAndServe(addr, nil))
		}
		fmt.Printf("  [!] Port %d is busy, trying %d...\n", currentPort, currentPort+1)
		currentPort++
	}
}

func printBanner(ip string, port int) {
	fmt.Printf("\n  ╔═══════════════════════════════════════════════╗\n")
	fmt.Printf("  ║              GoShare                      ║\n")
	fmt.Printf("  ╠═══════════════════════════════════════════════╣\n")
	fmt.Printf("  ║  Local:   http://localhost:%-17d ║\n", port)
	fmt.Printf("  ║  Network: http://%-14s:%-12d  ║\n", ip, port)
	fmt.Printf("  ╚═══════════════════════════════════════════════╝\n\n")
	fmt.Printf("  Open the URL on any device in your LAN to share files.\n")
	fmt.Printf("  Press Ctrl+C to stop.\n\n")
}
