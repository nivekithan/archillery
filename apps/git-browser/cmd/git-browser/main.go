package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/nivekithan/archillery/apps/git-browser/internal/server"
)

const (
	defaultAddress        = ":3001"
	defaultRepository     = "/var/lib/git/repository.git"
	defaultCommandTimeout = 10 * time.Second
)

func main() {
	address := envOrDefault("GIT_BROWSER_ADDRESS", defaultAddress)
	repositoryPath := envOrDefault("GIT_REPOSITORY_PATH", defaultRepository)
	handler := server.New(server.Config{
		CommandTimeout: envDuration("GIT_COMMAND_TIMEOUT", defaultCommandTimeout),
		RepositoryPath: repositoryPath,
	})

	log.Printf("Git browser listening on %s for %s", address, repositoryPath)
	if err := http.ListenAndServe(address, handler); err != nil {
		log.Fatal(err)
	}
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func envDuration(name string, fallback time.Duration) time.Duration {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil || duration <= 0 {
		log.Fatalf("%s must be a positive duration", name)
	}
	return duration
}
