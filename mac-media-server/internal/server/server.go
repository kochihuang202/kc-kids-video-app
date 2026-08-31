package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	MediaRoot      string
	Host           string
	Port           string
	AllowedOrigins []string
	FFProbePath    string
	ProbeDurations bool
}

type Server struct {
	cfg            Config
	allowedOrigins map[string]struct{}
	now            func() time.Time
}

type healthResponse struct {
	Status             string `json:"status"`
	MediaRootAvailable bool   `json:"mediaRootAvailable"`
	ServerTime         string `json:"serverTime"`
	Error              string `json:"error,omitempty"`
}

type libraryResponse struct {
	GeneratedAt string        `json:"generatedAt"`
	Items       []libraryItem `json:"items"`
}

type libraryItem struct {
	Path            string   `json:"path"`
	Name            string   `json:"name"`
	MediaType       string   `json:"mediaType"`
	MIMEType        string   `json:"mimeType"`
	SizeBytes       int64    `json:"sizeBytes"`
	ModifiedAt      string   `json:"modifiedAt"`
	DurationSeconds *float64 `json:"durationSeconds"`
}

func ConfigFromEnv() (Config, error) {
	cfg := Config{
		MediaRoot:      strings.TrimSpace(os.Getenv("MEDIA_ROOT")),
		Host:           valueOrDefault(os.Getenv("SERVER_HOST"), "127.0.0.1"),
		Port:           valueOrDefault(os.Getenv("SERVER_PORT"), "8080"),
		FFProbePath:    valueOrDefault(os.Getenv("FFPROBE_PATH"), "ffprobe"),
		ProbeDurations: parseBool(os.Getenv("PROBE_DURATIONS")),
	}
	if cfg.MediaRoot == "" {
		return cfg, errors.New("MEDIA_ROOT is required")
	}
	origins := splitCSV(os.Getenv("ALLOWED_ORIGINS"))
	if len(origins) == 0 {
		return cfg, errors.New("ALLOWED_ORIGINS is required")
	}
	cfg.AllowedOrigins = origins
	return cfg, nil
}

func New(cfg Config) *Server {
	allowed := make(map[string]struct{}, len(cfg.AllowedOrigins))
	for _, origin := range cfg.AllowedOrigins {
		allowed[origin] = struct{}{}
	}
	return &Server{
		cfg:            cfg,
		allowedOrigins: allowed,
		now:            func() time.Time { return time.Now().UTC() },
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.applyCORS(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch {
	case r.URL.Path == "/health":
		s.handleHealth(w, r)
	case r.URL.Path == "/library":
		s.handleLibrary(w, r)
	case strings.HasPrefix(r.URL.Path, "/media/"):
		s.handleMedia(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		methodNotAllowed(w)
		return
	}

	available := dirExists(s.cfg.MediaRoot)
	status := "ok"
	errText := ""
	if !available {
		status = "error"
		errText = "MEDIA_ROOT is not available"
	}

	writeJSON(w, r, http.StatusOK, healthResponse{
		Status:             status,
		MediaRootAvailable: available,
		ServerTime:         s.now().Format(time.RFC3339),
		Error:              errText,
	})
}

func (s *Server) handleLibrary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		methodNotAllowed(w)
		return
	}
	if !dirExists(s.cfg.MediaRoot) {
		writeJSON(w, r, http.StatusServiceUnavailable, map[string]string{
			"status": "error",
			"error":  "MEDIA_ROOT is not available",
		})
		return
	}

	items := make([]libraryItem, 0)
	_ = filepath.WalkDir(s.cfg.MediaRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() || !isAllowedMediaName(entry.Name()) {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		rel, err := filepath.Rel(s.cfg.MediaRoot, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		mimeType, mediaType := mediaMetadata(rel)
		items = append(items, libraryItem{
			Path:            mediaURLPath(rel),
			Name:            filepath.Base(rel),
			MediaType:       mediaType,
			MIMEType:        mimeType,
			SizeBytes:       info.Size(),
			ModifiedAt:      info.ModTime().UTC().Format(time.RFC3339),
			DurationSeconds: s.duration(path),
		})
		return nil
	})

	sort.Slice(items, func(i, j int) bool {
		return items[i].Path < items[j].Path
	})

	writeJSON(w, r, http.StatusOK, libraryResponse{
		GeneratedAt: s.now().Format(time.RFC3339),
		Items:       items,
	})
}

func (s *Server) handleMedia(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		methodNotAllowed(w)
		return
	}
	target, err := s.safeMediaPath(r)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	info, err := os.Stat(target)
	if err != nil || info.IsDir() || !isAllowedMediaName(target) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	mimeType, _ := mediaMetadata(target)
	file, err := os.Open(target)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to open media: %v", err), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, filepath.Base(target), info.ModTime(), file)
}

func (s *Server) safeMediaPath(r *http.Request) (string, error) {
	escaped := strings.TrimPrefix(r.URL.EscapedPath(), "/media/")
	rel, err := url.PathUnescape(escaped)
	if err != nil || rel == "" || strings.Contains(rel, "\x00") {
		return "", errors.New("invalid path")
	}
	rel = filepath.Clean(filepath.FromSlash(rel))
	if rel == "." || filepath.IsAbs(rel) || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || rel == ".." {
		return "", errors.New("invalid path")
	}

	rootAbs, err := filepath.Abs(s.cfg.MediaRoot)
	if err != nil {
		return "", err
	}
	targetAbs, err := filepath.Abs(filepath.Join(rootAbs, rel))
	if err != nil {
		return "", err
	}
	within, err := pathWithin(rootAbs, targetAbs)
	if err != nil || !within {
		return "", errors.New("path escapes media root")
	}

	rootEval, rootErr := filepath.EvalSymlinks(rootAbs)
	targetEval, targetErr := filepath.EvalSymlinks(targetAbs)
	if rootErr == nil && targetErr == nil {
		within, err = pathWithin(rootEval, targetEval)
		if err != nil || !within {
			return "", errors.New("symlink escapes media root")
		}
	}

	return targetAbs, nil
}

func (s *Server) applyCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if _, ok := s.allowedOrigins[origin]; origin != "" && ok {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Range, Content-Type")
		w.Header().Set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Range, Content-Length, Content-Type")
	}
}

func (s *Server) duration(path string) *float64 {
	if !s.cfg.ProbeDurations || s.cfg.FFProbePath == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, s.cfg.FFProbePath, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path)
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	seconds, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if err != nil || seconds < 0 {
		return nil
	}
	return &seconds
}

func valueOrDefault(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func parseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func isAllowedMediaName(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".mp4" || ext == ".mp3"
}

func mediaMetadata(path string) (mimeType string, mediaType string) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp4":
		return "video/mp4", "video"
	case ".mp3":
		return "audio/mpeg", "audio"
	default:
		detected := mime.TypeByExtension(filepath.Ext(path))
		if detected == "" {
			detected = "application/octet-stream"
		}
		return detected, "unknown"
	}
}

func mediaURLPath(rel string) string {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return "/media/" + strings.Join(parts, "/")
}

func pathWithin(root, target string) (bool, error) {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false, err
	}
	return rel == "." || (!strings.HasPrefix(rel, ".."+string(filepath.Separator)) && rel != ".."), nil
}

func methodNotAllowed(w http.ResponseWriter) {
	w.Header().Set("Allow", "GET, HEAD, OPTIONS")
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func writeJSON(w http.ResponseWriter, r *http.Request, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if r.Method == http.MethodHead {
		return
	}
	_ = json.NewEncoder(w).Encode(value)
}
