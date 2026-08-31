package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const allowedOrigin = "https://kc-kids-video-app.ji3cp31p4.workers.dev"

func TestHealth(t *testing.T) {
	srv := testServer(t)
	res := request(t, srv, http.MethodGet, "/health", nil)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	var body healthResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "ok" || !body.MediaRootAvailable {
		t.Fatalf("unexpected health body: %+v", body)
	}
}

func TestMediaGetHeadAndRange(t *testing.T) {
	srv := testServer(t)

	res := request(t, srv, http.MethodGet, "/media/videos/sample.mp4", nil)
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", res.StatusCode)
	}
	if got := res.Header.Get("Content-Type"); got != "video/mp4" {
		t.Fatalf("Content-Type = %q, want video/mp4", got)
	}

	res = request(t, srv, http.MethodHead, "/media/audio/sample.mp3", nil)
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("HEAD status = %d, want 200", res.StatusCode)
	}
	if got := res.Header.Get("Content-Length"); got == "" {
		t.Fatal("HEAD missing Content-Length")
	}

	res = request(t, srv, http.MethodGet, "/media/videos/sample.mp4", map[string]string{"Range": "bytes=0-1023"})
	res.Body.Close()
	if res.StatusCode != http.StatusPartialContent {
		t.Fatalf("Range status = %d, want 206", res.StatusCode)
	}
	if got := res.Header.Get("Content-Range"); got != "bytes 0-1023/4096" {
		t.Fatalf("Content-Range = %q, want bytes 0-1023/4096", got)
	}
	if got := res.Header.Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("Accept-Ranges = %q, want bytes", got)
	}

	res = request(t, srv, http.MethodGet, "/media/videos/sample.mp4", map[string]string{"Range": "bytes=2048-3071"})
	res.Body.Close()
	if res.StatusCode != http.StatusPartialContent {
		t.Fatalf("middle Range status = %d, want 206", res.StatusCode)
	}
	if got := res.Header.Get("Content-Range"); got != "bytes 2048-3071/4096" {
		t.Fatalf("middle Content-Range = %q", got)
	}
}

func TestInvalidRangeTraversalAndMethods(t *testing.T) {
	srv := testServer(t)

	res := request(t, srv, http.MethodGet, "/media/videos/sample.mp4", map[string]string{"Range": "bytes=9999-10000"})
	res.Body.Close()
	if res.StatusCode != http.StatusRequestedRangeNotSatisfiable {
		t.Fatalf("invalid Range status = %d, want 416", res.StatusCode)
	}

	for _, path := range []string{"/media/../secret.mp4", "/media/%2e%2e/secret.mp4"} {
		res = request(t, srv, http.MethodGet, path, nil)
		res.Body.Close()
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("traversal %s status = %d, want 404", path, res.StatusCode)
		}
	}

	res = request(t, srv, http.MethodPost, "/media/videos/sample.mp4", nil)
	res.Body.Close()
	if res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d, want 405", res.StatusCode)
	}
}

func TestLibraryAndCORS(t *testing.T) {
	srv := testServer(t)
	res := request(t, srv, http.MethodGet, "/library", map[string]string{"Origin": allowedOrigin})
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if got := res.Header.Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Fatalf("allowed origin header = %q", got)
	}
	var body libraryResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(body.Items))
	}
	if !strings.HasPrefix(body.Items[0].Path, "/media/") || strings.Contains(body.Items[0].Path, srv.cfg.MediaRoot) {
		t.Fatalf("library path is not a sanitized media URL: %q", body.Items[0].Path)
	}

	res = request(t, srv, http.MethodGet, "/library", map[string]string{"Origin": "https://example.invalid"})
	res.Body.Close()
	if got := res.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("disallowed origin unexpectedly got header %q", got)
	}

	res = request(t, srv, http.MethodOptions, "/media/videos/sample.mp4", map[string]string{"Origin": allowedOrigin})
	res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("OPTIONS status = %d, want 204", res.StatusCode)
	}
}

func testServer(t *testing.T) *Server {
	t.Helper()
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "videos", "sample.mp4"), 4096)
	mustWrite(t, filepath.Join(root, "audio", "sample.mp3"), 2048)
	mustWrite(t, filepath.Join(root, "ignore.txt"), 128)

	srv := New(Config{
		MediaRoot:      root,
		Host:           "127.0.0.1",
		Port:           "8080",
		AllowedOrigins: []string{allowedOrigin},
		FFProbePath:    "",
	})
	srv.now = func() time.Time { return time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC) }
	return srv
}

func mustWrite(t *testing.T, path string, size int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	data := make([]byte, size)
	for i := range data {
		data[i] = byte(i % 251)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func request(t *testing.T, handler http.Handler, method, path string, headers map[string]string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec.Result()
}
