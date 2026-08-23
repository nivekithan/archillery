package server

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"
)

type Config struct {
	CommandTimeout time.Duration
	RepositoryPath string
}

type server struct {
	repository *gitRepository
}

type errorResponse struct {
	Error string `json:"error"`
}

func New(config Config) http.Handler {
	s := &server{
		repository: &gitRepository{
			path:    config.RepositoryPath,
			timeout: config.CommandTimeout,
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/repository", handle(s.repositoryMetadata))
	return mux
}

type repositoryResponse struct {
	DefaultBranch string `json:"defaultBranch"`
}

func (s *server) repositoryMetadata(request *http.Request) (repositoryResponse, int, error) {
	defaultBranch, err := s.repository.defaultBranch(request.Context())
	if err != nil {
		return repositoryResponse{}, 0, err
	}
	return repositoryResponse{DefaultBranch: defaultBranch}, http.StatusOK, nil
}

func handle[T any](next func(*http.Request) (T, int, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, request *http.Request) {
		response, status, err := next(request)
		if err != nil {
			log.Printf("Git browser request failed: %v", err)
			if errors.Is(err, context.DeadlineExceeded) {
				writeError(w, http.StatusGatewayTimeout, "git command timed out")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		writeJSON(w, status, response)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
