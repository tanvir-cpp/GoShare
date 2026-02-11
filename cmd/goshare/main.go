package main

import (
	"flag"
	"net/http"
	"os"
	"strconv"

	"fileshare/internal/discovery"
	"fileshare/internal/handler"
	"fileshare/internal/network"
	"fileshare/internal/server"
)

func main() {
	portFlag := flag.Int("p", 8080, "Port number")
	sharedDir := flag.String("d", "shared_files", "Shared directory")
	flag.Parse()

	// PORT and SHARED_DIR env vars override flags (for cloud deployments).
	port := *portFlag
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			port = p
		}
	}

	sharedPath := *sharedDir
	if envShared := os.Getenv("SHARED_DIR"); envShared != "" {
		sharedPath = envShared
	}

	handler.SharedDir = sharedPath
	os.MkdirAll(sharedPath, 0755)

	// Static file server — serves from web/pages for HTML, web/static for assets.
	staticFS := http.FileServer(http.Dir("web"))
	server.RegisterRoutes(staticFS, "web/pages/home.html")

	// Background cleanup of stale devices.
	go discovery.CleanupStale()

	// Start the server.
	ip := network.GetLocalIP()
	server.Start(port, ip)
}
