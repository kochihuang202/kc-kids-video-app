package server

import (
	"context"
	"encoding/json"
	"io"
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
	if body.ServiceVersion == "" || body.UptimeSeconds < 0 || !body.MediaRootReadable {
		t.Fatalf("missing diagnostics health fields: %+v", body)
	}
	if got := res.Header.Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
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

	res = request(t, srv, http.MethodGet, "/media/videos/sample.mp4", map[string]string{"Range": "bytes=-512"})
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusPartialContent {
		t.Fatalf("tail Range status = %d, want 206", res.StatusCode)
	}
	if len(body) != 512 {
		t.Fatalf("tail Range length = %d, want 512", len(body))
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
	if got := res.Header.Get("Access-Control-Expose-Headers"); !strings.Contains(got, "X-KC-Request-Id") || !strings.Contains(got, "Server-Timing") {
		t.Fatalf("Expose headers missing diagnostics fields: %q", got)
	}
}

func TestMediaDiagnosticsHeadersAndLog(t *testing.T) {
	srv := testServer(t)
	now := time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC)
	srv.now = func() time.Time {
		now = now.Add(5 * time.Millisecond)
		return now
	}
	srv.diagnostics.now = srv.now
	res := request(t, srv, http.MethodGet, "/media/videos/sample.mp4", map[string]string{
		"Range":              "bytes=0-15",
		"X-KC-Diagnostic-Id": "diag-123",
	})
	_, _ = io.Copy(io.Discard, res.Body)
	res.Body.Close()

	if res.StatusCode != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206", res.StatusCode)
	}
	if got := res.Header.Get("X-KC-Request-Id"); got == "" {
		t.Fatal("missing X-KC-Request-Id")
	}
	if got := res.Header.Get("X-KC-Service-Version"); got != "test-version" {
		t.Fatalf("service version = %q", got)
	}
	if got := res.Header.Get("Server-Timing"); !strings.Contains(got, "open;dur=") {
		t.Fatalf("missing Server-Timing: %q", got)
	} else if strings.Contains(got, "first-byte;dur=0") {
		t.Fatalf("Server-Timing first-byte was not computed before headers: %q", got)
	}

	eventBytes, err := os.ReadFile(filepath.Join(srv.cfg.DiagnosticsLogDir, "events.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	events := string(eventBytes)
	if !strings.Contains(events, `"diagnosticId":"diag-123"`) {
		t.Fatalf("event log missing diagnostic id: %s", events)
	}
	if strings.Contains(events, srv.cfg.MediaRoot) {
		t.Fatalf("event log leaked media root: %s", events)
	}
}

func TestDeepDiagnosticsAndDegradedHealth(t *testing.T) {
	srv := testServer(t)
	res := request(t, srv, http.MethodGet, "/diagnostics/deep", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	var body deepDiagnosticsResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Health.Status != "ok" || body.Checks["mediaRoot"].OK != true {
		t.Fatalf("unexpected deep diagnostics: %+v", body)
	}

	missing := New(Config{
		MediaRoot:         filepath.Join(t.TempDir(), "missing"),
		Host:              "127.0.0.1",
		Port:              "8080",
		AllowedOrigins:    []string{allowedOrigin},
		DiagnosticsLogDir: t.TempDir(),
		TailscaleCommand:  "/bin/false",
		ServiceVersion:    "test-version",
	})
	res = request(t, missing, http.MethodGet, "/health", nil)
	defer res.Body.Close()
	var degraded healthResponse
	if err := json.NewDecoder(res.Body).Decode(&degraded); err != nil {
		t.Fatal(err)
	}
	if degraded.Status != "degraded" || degraded.MediaRootReadable {
		t.Fatalf("expected degraded health, got %+v", degraded)
	}
}

func TestStreamAbortAndActiveCounts(t *testing.T) {
	srv := testServer(t)
	req1 := httptest.NewRequest(http.MethodGet, "/media/videos/sample.mp4", nil)
	req2 := httptest.NewRequest(http.MethodGet, "/media/videos/sample.mp4", nil)
	info1 := srv.diagnostics.BeginMediaRequest(httptest.NewRecorder(), req1, srv.cfg.ServiceVersion)
	info2 := srv.diagnostics.BeginMediaRequest(httptest.NewRecorder(), req2, srv.cfg.ServiceVersion)
	info1.MediaKeyHash = hashMediaKey("videos/sample-1.mp4")
	info2.MediaKeyHash = hashMediaKey("videos/sample-2.mp4")

	srv.diagnostics.StreamStarted(info1)
	srv.diagnostics.StreamStarted(info2)
	if got := srv.diagnostics.Streaming(); got.ActiveRequests != 2 || got.ActiveStreams != 2 {
		t.Fatalf("active counts = %+v, want 2 requests and 2 streams", got)
	}

	srv.diagnostics.EndMediaRequest(info1, http.StatusOK, 10, "", context.Canceled)
	srv.diagnostics.EndMediaRequest(info2, http.StatusOK, 20, "", nil)
	if got := srv.diagnostics.Streaming(); got.ActiveRequests != 0 || got.ActiveStreams != 0 {
		t.Fatalf("active counts after end = %+v, want zero", got)
	}
	summary := srv.diagnostics.metricsSince(5 * time.Minute)
	if summary.ClientAbort != 1 || summary.StreamAborted != 1 || summary.StreamCompleted != 1 {
		t.Fatalf("unexpected stream summary: %+v", summary)
	}
}

func TestDiagnosticHelpers(t *testing.T) {
	if safeDiagnosticID("../bad") != "" {
		t.Fatal("unsafe diagnostic id accepted")
	}
	start, end, planned := parseRangeHeader("bytes=10-19", 100)
	if start == nil || end == nil || planned == nil || *start != 10 || *end != 19 || *planned != 10 {
		t.Fatalf("bad explicit range parse: %v %v %v", start, end, planned)
	}
	start, end, planned = parseRangeHeader("bytes=-20", 100)
	if start == nil || end == nil || planned == nil || *start != 80 || *end != 99 || *planned != 20 {
		t.Fatalf("bad suffix range parse: %v %v %v", start, end, planned)
	}
	writer := newEventWriter(t.TempDir(), time.Now)
	writer.max = 1
	writer.write(eventRecord{Timestamp: time.Now().Format(time.RFC3339), Event: "stream_started"})
	writer.write(eventRecord{Timestamp: time.Now().Format(time.RFC3339), Event: "stream_completed"})
	matches, err := filepath.Glob(filepath.Join(writer.dir, "events.jsonl.*"))
	if err != nil || len(matches) == 0 {
		t.Fatalf("expected rotated log, matches=%v err=%v", matches, err)
	}
}

func TestEventWriterRetentionCleansExpiredSmallFiles(t *testing.T) {
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	dir := t.TempDir()
	events := filepath.Join(dir, "events.jsonl")
	errorsPath := filepath.Join(dir, "errors.jsonl")
	if err := os.WriteFile(events, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(errorsPath, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	oldEvent := now.Add(-8 * 24 * time.Hour)
	oldError := now.Add(-31 * 24 * time.Hour)
	if err := os.Chtimes(events, oldEvent, oldEvent); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(errorsPath, oldError, oldError); err != nil {
		t.Fatal(err)
	}

	_ = newEventWriter(dir, func() time.Time { return now })
	if _, err := os.Stat(events); !os.IsNotExist(err) {
		t.Fatalf("expired small events log still exists, err=%v", err)
	}
	if _, err := os.Stat(errorsPath); !os.IsNotExist(err) {
		t.Fatalf("expired small errors log still exists, err=%v", err)
	}
}

func TestEventWriterPeriodicCleanupAndDateRotation(t *testing.T) {
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	writer := newEventWriter(t.TempDir(), func() time.Time { return now })

	expired := filepath.Join(writer.dir, "events.jsonl.20260822000000.gz")
	if err := os.WriteFile(expired, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	old := now.Add(-8 * 24 * time.Hour)
	if err := os.Chtimes(expired, old, old); err != nil {
		t.Fatal(err)
	}
	writer.write(eventRecord{Timestamp: now.Format(time.RFC3339), Event: "stream_started"})
	if _, err := os.Stat(expired); err != nil {
		t.Fatalf("cleanup ran before interval elapsed, err=%v", err)
	}

	now = now.Add(7 * time.Hour)
	writer.write(eventRecord{Timestamp: now.Format(time.RFC3339), Event: "stream_completed"})
	if _, err := os.Stat(expired); !os.IsNotExist(err) {
		t.Fatalf("expired rotated log still exists after periodic cleanup, err=%v", err)
	}

	active := filepath.Join(writer.dir, "events.jsonl")
	yesterday := now.Add(-24 * time.Hour)
	if err := os.Chtimes(active, yesterday, yesterday); err != nil {
		t.Fatal(err)
	}
	writer.write(eventRecord{Timestamp: now.Format(time.RFC3339), Event: "stream_started"})
	matches, err := filepath.Glob(filepath.Join(writer.dir, "events.jsonl.*.gz"))
	if err != nil || len(matches) == 0 {
		t.Fatalf("expected date rotation for active log, matches=%v err=%v", matches, err)
	}
}

func testServer(t *testing.T) *Server {
	t.Helper()
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "videos", "sample.mp4"), 4096)
	mustWrite(t, filepath.Join(root, "audio", "sample.mp3"), 2048)
	mustWrite(t, filepath.Join(root, "ignore.txt"), 128)

	srv := New(Config{
		MediaRoot:         root,
		Host:              "127.0.0.1",
		Port:              "8080",
		AllowedOrigins:    []string{allowedOrigin},
		FFProbePath:       "",
		ServiceVersion:    "test-version",
		DiagnosticsLogDir: t.TempDir(),
		TailscaleCommand:  "/bin/false",
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
