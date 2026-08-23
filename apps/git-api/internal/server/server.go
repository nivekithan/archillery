package server

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/nivekithan/archillery/apps/git-api/internal/git"
)

type Config struct {
	CommandTimeout time.Duration
	RepositoryPath string
}

type server struct {
	repository *git.Repository
}

type errorResponse struct {
	Error string `json:"error"`
}

func New(config Config) http.Handler {
	s := &server{
		repository: git.NewRepository(config.RepositoryPath, config.CommandTimeout),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/repository", handle(s.repositoryMetadata))
	mux.HandleFunc("GET /api/v1/tree", handle(s.tree))
	return mux
}

type repositoryResponse struct {
	DefaultBranch string `json:"defaultBranch"`
}

func (s *server) repositoryMetadata(request *http.Request) (repositoryResponse, int, error) {
	defaultBranch, err := s.repository.DefaultBranch(request.Context())
	if err != nil {
		return repositoryResponse{}, 0, err
	}
	return repositoryResponse{DefaultBranch: defaultBranch}, http.StatusOK, nil
}

type treeResponse struct {
	Entries []git.TreeEntry `json:"entries"`
}

func (s *server) tree(request *http.Request) (treeResponse, int, error) {
	entries, err := s.repository.Tree(request.Context(), request.URL.Query().Get("path"))
	if err != nil {
		return treeResponse{}, 0, err
	}
	return treeResponse{Entries: entries}, http.StatusOK, nil
}

func handle[T any](next func(*http.Request) (T, int, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, request *http.Request) {
		response, status, err := next(request)
		if err != nil {
			log.Printf("Git API request failed: %v", err)
			switch {
			case errors.Is(err, git.ErrInvalidPath):
				writeError(w, http.StatusBadRequest, "invalid path")
			case errors.Is(err, git.ErrTreeNotFound):
				writeError(w, http.StatusNotFound, "directory not found")
			case errors.Is(err, context.DeadlineExceeded):
				writeError(w, http.StatusGatewayTimeout, "git command timed out")
			default:
				writeError(w, http.StatusInternalServerError, "internal server error")
			}
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
