package handler

import (
	"log"
	"os"
	"path/filepath"
	"time"
)

// StartPrivateCleanup starts a background goroutine that removes stale
// private files that were never downloaded. Files older than 30 minutes
// are deleted to prevent disk exhaustion.
func StartPrivateCleanup() {
	go cleanupPrivateFiles()
}

func cleanupPrivateFiles() {
	for {
		time.Sleep(5 * time.Minute)
		privateDir := filepath.Join(SharedDir, "private")
		entries, err := os.ReadDir(privateDir)
		if err != nil {
			continue // directory may not exist yet
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			deviceDir := filepath.Join(privateDir, entry.Name())
			files, err := os.ReadDir(deviceDir)
			if err != nil {
				continue
			}
			if len(files) == 0 {
				os.Remove(deviceDir) // clean up empty directories
				continue
			}
			for _, f := range files {
				if f.IsDir() {
					continue
				}
				info, err := f.Info()
				if err != nil {
					continue
				}
				if time.Since(info.ModTime()) > 30*time.Minute {
					target := filepath.Join(deviceDir, f.Name())
					if err := os.Remove(target); err != nil {
						log.Printf("Failed to clean up private file %s: %v", target, err)
					} else {
						log.Printf("Cleaned up stale private file: %s", target)
					}
				}
			}
			// Remove the device dir if now empty
			remaining, _ := os.ReadDir(deviceDir)
			if len(remaining) == 0 {
				os.Remove(deviceDir)
			}
		}
	}
}
