package server

import (
	"context"
	"fmt"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
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

// Start binds to the given port (or the next available one) and starts serving with graceful shutdown.
func Start(port int, ip string) {
	currentPort := port
	const maxPortRetries = 10

	for {
		if currentPort > port+maxPortRetries {
			log.Fatalf("Failed to find an available port after %d attempts", maxPortRetries)
		}

		addr := fmt.Sprintf("0.0.0.0:%d", currentPort)
		l, err := net.Listen("tcp", addr)
		if err != nil {
			fmt.Printf("  [!] Port %d is busy, trying %d...\n", currentPort, currentPort+1)
			currentPort++
			continue
		}

		printBanner(ip, currentPort)

		srv := &http.Server{
			Addr: addr,
		}

		// Channel to listen for interrupt signals
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

		// Run server in a goroutine
		go func() {
			if err := srv.Serve(l); err != nil && err != http.ErrServerClosed {
				log.Fatalf("Server error: %v", err)
			}
		}()

		<-stop // Wait for signal

		log.Println("\n  [i] Shutting down gracefully...")
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("  [!] Server Shutdown Failed: %+v", err)
		}
		log.Println("  [✓] Server stopped")
		return
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
