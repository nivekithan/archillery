package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/nivekithan/archillery/apps/git-metadata-service/internal/git"
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
	mux.HandleFunc("GET /api/v1/commit", handle(s.commit))
	mux.HandleFunc("GET /api/v1/commits", handle(s.commits))
	mux.HandleFunc("GET /api/v1/summary", handle(s.summary))
	mux.HandleFunc("GET /api/v1/content", handle(s.content))
	mux.HandleFunc("GET /api/v1/paths", handle(s.paths))
	return mux
}

func (s *server) paths(request *http.Request) (git.RepositoryPaths, int, error) {
	paths, err := s.repository.Paths(
		request.Context(),
		request.URL.Query().Get("branch"),
		request.URL.Query().Get("ref"),
	)
	if err != nil {
		return git.RepositoryPaths{}, 0, err
	}
	return paths, http.StatusOK, nil
}

type repositoryResponse struct {
	DefaultBranch string   `json:"defaultBranch"`
	Branches      []string `json:"branches"`
}

func (s *server) repositoryMetadata(request *http.Request) (repositoryResponse, int, error) {
	defaultBranch, err := s.repository.DefaultBranch(request.Context())
	if err != nil {
		return repositoryResponse{}, 0, err
	}
	branches, err := s.repository.Branches(request.Context(), defaultBranch)
	if err != nil {
		return repositoryResponse{}, 0, err
	}
	return repositoryResponse{
		DefaultBranch: defaultBranch,
		Branches:      branches,
	}, http.StatusOK, nil
}

type contentResponse struct {
	Type     string          `json:"type"`
	Entries  []git.TreeEntry `json:"entries,omitempty"`
	Contents string          `json:"contents"`
	IsBinary bool            `json:"isBinary"`
	Size     int             `json:"size"`
}

type commitsResponse struct {
	Commits []git.Commit `json:"commits"`
}

func (s *server) commit(request *http.Request) (git.CommitDetail, int, error) {
	commit, err := s.repository.Commit(
		request.Context(),
		request.URL.Query().Get("ref"),
	)
	if err != nil {
		return git.CommitDetail{}, 0, err
	}
	return commit, http.StatusOK, nil
}

func (s *server) commits(request *http.Request) (commitsResponse, int, error) {
	commits, err := s.repository.Commits(
		request.Context(),
		request.URL.Query().Get("branch"),
		request.URL.Query().Get("ref"),
		100,
	)
	if err != nil {
		return commitsResponse{}, 0, err
	}
	return commitsResponse{Commits: commits}, http.StatusOK, nil
}

func (s *server) summary(request *http.Request) (git.RepositorySummary, int, error) {
	summary, err := s.repository.Summary(
		request.Context(),
		request.URL.Query().Get("branch"),
		request.URL.Query().Get("ref"),
	)
	if err != nil {
		return git.RepositorySummary{}, 0, err
	}
	return summary, http.StatusOK, nil
}

func (s *server) content(request *http.Request) (contentResponse, int, error) {
	content, err := s.repository.Content(
		request.Context(),
		request.URL.Query().Get("branch"),
		request.URL.Query().Get("ref"),
		request.URL.Query().Get("path"),
	)
	if err != nil {
		return contentResponse{}, 0, err
	}
	if content.Type == "tree" {
		return contentResponse{Type: "tree", Entries: content.Entries}, http.StatusOK, nil
	}

	contents := content.Contents
	isBinary := bytes.IndexByte(contents, 0) >= 0 || !utf8.Valid(contents)
	response := contentResponse{Type: "blob", IsBinary: isBinary, Size: len(contents)}
	if !isBinary {
		response.Contents = string(contents)
	}
	return response, http.StatusOK, nil
}

func handle[T any](next func(*http.Request) (T, int, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, request *http.Request) {
		response, status, err := next(request)
		if err != nil {
			log.Printf("Git metadata request failed: %v", err)
			switch {
			case errors.Is(err, git.ErrInvalidPath):
				writeError(w, http.StatusBadRequest, "invalid path")
			case errors.Is(err, git.ErrBranchNotFound):
				writeError(w, http.StatusNotFound, "branch not found")
			case errors.Is(err, git.ErrCommitNotFound):
				writeError(w, http.StatusNotFound, "commit not found")
			case errors.Is(err, git.ErrInvalidRef):
				writeError(w, http.StatusBadRequest, "invalid ref")
			case errors.Is(err, git.ErrContentNotFound):
				writeError(w, http.StatusNotFound, "path not found")
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
