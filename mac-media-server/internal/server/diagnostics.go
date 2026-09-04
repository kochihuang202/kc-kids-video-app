package server

import (
	"bufio"
	"compress/gzip"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	ErrTailscaleNotRunning = "TAILSCALE_NOT_RUNNING"
	ErrTailscaleNotOnline  = "TAILSCALE_NOT_ONLINE"
	ErrMediaRootUnreadable = "MEDIA_ROOT_UNREADABLE"
	ErrMediaNotFound       = "MEDIA_NOT_FOUND"
	ErrInvalidRange        = "INVALID_RANGE"
	ErrFileOpenFailed      = "FILE_OPEN_FAILED"
	ErrFirstByteTimeout    = "FIRST_BYTE_TIMEOUT"
	ErrStreamClientAbort   = "STREAM_CLIENT_ABORT"
	ErrStreamIO            = "STREAM_IO_ERROR"
	ErrHealthTimeout       = "HEALTH_CHECK_TIMEOUT"
	ErrInternal            = "INTERNAL_ERROR"
)

var diagnosticIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`)

type Diagnostics struct {
	cfg       Config
	startedAt time.Time
	now       func() time.Time

	mu             sync.Mutex
	activeRequests int
	activeStreams  int
	events         []metricEvent
	cache          cachedHealth
	writer         *eventWriter
}

type cachedHealth struct {
	expiresAt          time.Time
	tailscale          tailscaleSummary
	system             systemSummary
	mediaRootReadable  bool
	mediaRootLatencyMs int64
}

type metricEvent struct {
	at                 time.Time
	status             int
	bytes              int64
	rangeRequest       bool
	streamStarted      bool
	streamCompleted    bool
	streamAborted      bool
	streamErrored      bool
	openLatencyMs      int64
	firstByteLatencyMs int64
	durationMs         int64
}

type tailscaleSummary struct {
	Running      *bool   `json:"running"`
	BackendState *string `json:"backendState"`
	SelfOnline   *bool   `json:"selfOnline"`
	TailnetIP    *string `json:"tailnetIp,omitempty"`
	PeerCount    *int    `json:"peerCount,omitempty"`
	ErrorCode    *string `json:"errorCode,omitempty"`
}

type systemSummary struct {
	AwakeSeconds  *int64  `json:"awakeSeconds"`
	LastWakeAt    *string `json:"lastWakeAt"`
	DiskFreeBytes *uint64 `json:"diskFreeBytes"`
}

type streamingSummary struct {
	ActiveRequests int `json:"activeRequests"`
	ActiveStreams  int `json:"activeStreams"`
}

type metricsSummary struct {
	RequestCount          int   `json:"requestCount"`
	Status2xx             int   `json:"status2xx"`
	Status206             int   `json:"status206"`
	Status4xx             int   `json:"status4xx"`
	Status5xx             int   `json:"status5xx"`
	ClientAbort           int   `json:"clientAbort"`
	TimeoutCount          int   `json:"timeoutCount"`
	Range206              int   `json:"range206"`
	StreamStarted         int   `json:"streamStarted"`
	StreamCompleted       int   `json:"streamCompleted"`
	StreamAborted         int   `json:"streamAborted"`
	StreamErrored         int   `json:"streamErrored"`
	ActiveRequests        int   `json:"activeRequests"`
	ActiveStreams         int   `json:"activeStreams"`
	BytesSent             int64 `json:"bytesSent"`
	AverageOpenLatencyMs  int64 `json:"averageOpenLatencyMs"`
	MaxOpenLatencyMs      int64 `json:"maxOpenLatencyMs"`
	AverageFirstByteMs    int64 `json:"averageFirstByteLatencyMs"`
	MaxFirstByteMs        int64 `json:"maxFirstByteLatencyMs"`
	AverageDurationMs     int64 `json:"averageDurationMs"`
	MaxDurationMs         int64 `json:"maxDurationMs"`
	MediaRootReadFailures int   `json:"mediaRootReadFailures"`
	TailscaleUnavailable  int   `json:"tailscaleUnavailable"`
	ServiceRestartCount   int   `json:"serviceRestartCount"`
}

type checkResult struct {
	OK        bool    `json:"ok"`
	LatencyMs int64   `json:"latencyMs"`
	ErrorCode *string `json:"errorCode"`
}

type deepDiagnosticsResponse struct {
	Health         healthResponse         `json:"health"`
	Tailscale      tailscaleSummary       `json:"tailscale"`
	System         systemSummary          `json:"system"`
	Checks         map[string]checkResult `json:"checks"`
	HTTP5Minutes   metricsSummary         `json:"http5Minutes"`
	HTTP1Hour      metricsSummary         `json:"http1Hour"`
	Streams5Minute metricsSummary         `json:"streams5Minutes"`
	Process        map[string]any         `json:"process"`
}

type mediaRequestInfo struct {
	RequestID        string
	DiagnosticID     string
	Method           string
	StartedAt        time.Time
	MediaRel         string
	MediaKeyHash     string
	RangeStart       *int64
	RangeEnd         *int64
	BytesPlanned     *int64
	OpenLatency      time.Duration
	FirstByteLatency time.Duration
	firstByteLogged  bool
	rangeRequest     bool
}

type eventRecord struct {
	Timestamp          string  `json:"timestamp"`
	RequestID          string  `json:"requestId"`
	DiagnosticID       string  `json:"diagnosticId,omitempty"`
	Event              string  `json:"event"`
	MediaKeyHash       string  `json:"mediaKeyHash,omitempty"`
	Method             string  `json:"method,omitempty"`
	Status             int     `json:"status,omitempty"`
	RangeStart         *int64  `json:"rangeStart,omitempty"`
	RangeEnd           *int64  `json:"rangeEnd,omitempty"`
	BytesPlanned       *int64  `json:"bytesPlanned,omitempty"`
	BytesSent          int64   `json:"bytesSent,omitempty"`
	OpenLatencyMs      int64   `json:"openLatencyMs,omitempty"`
	FirstByteLatencyMs int64   `json:"firstByteLatencyMs,omitempty"`
	DurationMs         int64   `json:"durationMs,omitempty"`
	ErrorCode          *string `json:"errorCode"`
}

func NewDiagnostics(cfg Config, startedAt time.Time, now func() time.Time) *Diagnostics {
	d := &Diagnostics{cfg: cfg, startedAt: startedAt, now: now}
	if cfg.DiagnosticsLogDir != "" {
		d.writer = newEventWriter(cfg.DiagnosticsLogDir)
		d.writeEvent(eventRecord{
			Timestamp: startedAt.Format(time.RFC3339),
			Event:     "service_started",
		})
	}
	return d
}

func (d *Diagnostics) HealthSnapshot(ctx context.Context, mediaRoot string) cachedHealth {
	now := d.now()
	d.mu.Lock()
	if now.Before(d.cache.expiresAt) {
		cache := d.cache
		d.mu.Unlock()
		return cache
	}
	d.mu.Unlock()

	ctx, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
	defer cancel()
	tailscale := d.probeTailscale(ctx)
	system := d.probeSystem(mediaRoot)
	start := d.now()
	mediaReadable := mediaRootReadable(mediaRoot)
	latency := millis(d.now().Sub(start))

	cache := cachedHealth{
		expiresAt:          now.Add(45 * time.Second),
		tailscale:          tailscale,
		system:             system,
		mediaRootReadable:  mediaReadable,
		mediaRootLatencyMs: latency,
	}
	d.mu.Lock()
	d.cache = cache
	d.mu.Unlock()
	return cache
}

func (d *Diagnostics) DeepSnapshot(ctx context.Context, mediaRoot string) deepDiagnosticsResponse {
	checks := make(map[string]checkResult)
	tailStart := d.now()
	tailscale := d.probeTailscale(ctx)
	checks["tailscale"] = checkResult{OK: boolPtrValue(tailscale.Running) && boolPtrValue(tailscale.SelfOnline), LatencyMs: millis(d.now().Sub(tailStart)), ErrorCode: tailscale.ErrorCode}

	rootStart := d.now()
	rootOK := mediaRootReadable(mediaRoot)
	checks["mediaRoot"] = checkResult{OK: rootOK, LatencyMs: millis(d.now().Sub(rootStart)), ErrorCode: nil}
	if !rootOK {
		code := ErrMediaRootUnreadable
		checks["mediaRoot"] = checkResult{OK: false, LatencyMs: millis(d.now().Sub(rootStart)), ErrorCode: &code}
	}

	diskStart := d.now()
	system := d.probeSystem(mediaRoot)
	checks["disk"] = checkResult{OK: system.DiskFreeBytes != nil, LatencyMs: millis(d.now().Sub(diskStart)), ErrorCode: nil}
	if system.DiskFreeBytes == nil {
		code := ErrInternal
		checks["disk"] = checkResult{OK: false, LatencyMs: millis(d.now().Sub(diskStart)), ErrorCode: &code}
	}

	return deepDiagnosticsResponse{
		Tailscale:      tailscale,
		System:         system,
		Checks:         checks,
		HTTP5Minutes:   d.metricsSince(5 * time.Minute),
		HTTP1Hour:      d.metricsSince(time.Hour),
		Streams5Minute: d.metricsSince(5 * time.Minute),
		Process: map[string]any{
			"uptimeSeconds": int64(d.now().Sub(d.startedAt).Seconds()),
			"runtime":       runtime.Version(),
		},
	}
}

func (d *Diagnostics) BeginMediaRequest(w http.ResponseWriter, r *http.Request, version string) *mediaRequestInfo {
	requestID := randomID()
	diagnosticID := safeDiagnosticID(r.Header.Get("X-KC-Diagnostic-Id"))
	info := &mediaRequestInfo{
		RequestID:    requestID,
		DiagnosticID: diagnosticID,
		Method:       r.Method,
		StartedAt:    d.now(),
		rangeRequest: r.Header.Get("Range") != "",
		MediaKeyHash: "",
	}
	w.Header().Set("X-KC-Request-Id", requestID)
	w.Header().Set("X-KC-Service-Version", version)
	w.Header().Set("Server-Timing", "open;dur=0, first-byte;dur=0")

	d.mu.Lock()
	d.activeRequests++
	d.mu.Unlock()
	return info
}

func (d *Diagnostics) StreamStarted(info *mediaRequestInfo) {
	d.mu.Lock()
	d.activeStreams++
	d.mu.Unlock()
	d.writeEvent(eventRecord{
		Timestamp:    d.now().Format(time.RFC3339),
		RequestID:    info.RequestID,
		DiagnosticID: info.DiagnosticID,
		Event:        "stream_started",
		MediaKeyHash: info.MediaKeyHash,
		Method:       info.Method,
		RangeStart:   info.RangeStart,
		RangeEnd:     info.RangeEnd,
		BytesPlanned: info.BytesPlanned,
		ErrorCode:    nil,
	})
}

func (d *Diagnostics) FirstByte(info *mediaRequestInfo) {
	if info.firstByteLogged {
		return
	}
	info.firstByteLogged = true
	info.FirstByteLatency = d.now().Sub(info.StartedAt)
	d.writeEvent(eventRecord{
		Timestamp:          d.now().Format(time.RFC3339),
		RequestID:          info.RequestID,
		DiagnosticID:       info.DiagnosticID,
		Event:              "first_byte",
		MediaKeyHash:       info.MediaKeyHash,
		Method:             info.Method,
		RangeStart:         info.RangeStart,
		RangeEnd:           info.RangeEnd,
		BytesPlanned:       info.BytesPlanned,
		OpenLatencyMs:      millis(info.OpenLatency),
		FirstByteLatencyMs: millis(info.FirstByteLatency),
		ErrorCode:          nil,
	})
}

func (d *Diagnostics) EndMediaRequest(info *mediaRequestInfo, status int, bytesSent int64, errorCode string, ctxErr error) {
	if errors.Is(ctxErr, context.Canceled) && errorCode == "" {
		errorCode = ErrStreamClientAbort
	}
	eventName := "stream_completed"
	if errorCode == ErrStreamClientAbort {
		eventName = "client_aborted"
	} else if errorCode != "" || status >= 500 {
		eventName = "stream_error"
	}
	if status == http.StatusNotFound && errorCode == "" {
		errorCode = ErrMediaNotFound
	}
	if status == http.StatusRequestedRangeNotSatisfiable && errorCode == "" {
		errorCode = ErrInvalidRange
	}
	var codePtr *string
	if errorCode != "" {
		codePtr = &errorCode
	}

	duration := d.now().Sub(info.StartedAt)
	d.mu.Lock()
	if d.activeRequests > 0 {
		d.activeRequests--
	}
	if info.MediaKeyHash != "" && d.activeStreams > 0 {
		d.activeStreams--
	}
	d.events = append(d.events, metricEvent{
		at:                 d.now(),
		status:             status,
		bytes:              bytesSent,
		rangeRequest:       info.rangeRequest,
		streamStarted:      info.MediaKeyHash != "",
		streamCompleted:    eventName == "stream_completed" && info.MediaKeyHash != "",
		streamAborted:      eventName == "client_aborted",
		streamErrored:      eventName == "stream_error",
		openLatencyMs:      millis(info.OpenLatency),
		firstByteLatencyMs: millis(info.FirstByteLatency),
		durationMs:         millis(duration),
	})
	d.pruneLocked()
	d.mu.Unlock()

	d.writeEvent(eventRecord{
		Timestamp:          d.now().Format(time.RFC3339),
		RequestID:          info.RequestID,
		DiagnosticID:       info.DiagnosticID,
		Event:              eventName,
		MediaKeyHash:       info.MediaKeyHash,
		Method:             info.Method,
		Status:             status,
		RangeStart:         info.RangeStart,
		RangeEnd:           info.RangeEnd,
		BytesPlanned:       info.BytesPlanned,
		BytesSent:          bytesSent,
		OpenLatencyMs:      millis(info.OpenLatency),
		FirstByteLatencyMs: millis(info.FirstByteLatency),
		DurationMs:         millis(duration),
		ErrorCode:          codePtr,
	})
}

func (d *Diagnostics) Streaming() streamingSummary {
	d.mu.Lock()
	defer d.mu.Unlock()
	return streamingSummary{ActiveRequests: d.activeRequests, ActiveStreams: d.activeStreams}
}

func (d *Diagnostics) metricsSince(window time.Duration) metricsSummary {
	cutoff := d.now().Add(-window)
	d.mu.Lock()
	defer d.mu.Unlock()
	out := metricsSummary{
		ActiveRequests:      d.activeRequests,
		ActiveStreams:       d.activeStreams,
		ServiceRestartCount: 1,
	}
	var openTotal, openCount, firstTotal, firstCount, durationTotal, durationCount int64
	for _, event := range d.events {
		if event.at.Before(cutoff) {
			continue
		}
		out.RequestCount++
		switch {
		case event.status == http.StatusPartialContent:
			out.Status206++
			out.Status2xx++
		case event.status >= 200 && event.status < 300:
			out.Status2xx++
		case event.status >= 400 && event.status < 500:
			out.Status4xx++
		case event.status >= 500:
			out.Status5xx++
		}
		if event.rangeRequest && event.status == http.StatusPartialContent {
			out.Range206++
		}
		if event.streamStarted {
			out.StreamStarted++
		}
		if event.streamCompleted {
			out.StreamCompleted++
		}
		if event.streamAborted {
			out.ClientAbort++
			out.StreamAborted++
		}
		if event.streamErrored {
			out.StreamErrored++
		}
		out.BytesSent += event.bytes
		openTotal += event.openLatencyMs
		openCount++
		if event.openLatencyMs > out.MaxOpenLatencyMs {
			out.MaxOpenLatencyMs = event.openLatencyMs
		}
		firstTotal += event.firstByteLatencyMs
		firstCount++
		if event.firstByteLatencyMs > out.MaxFirstByteMs {
			out.MaxFirstByteMs = event.firstByteLatencyMs
		}
		durationTotal += event.durationMs
		durationCount++
		if event.durationMs > out.MaxDurationMs {
			out.MaxDurationMs = event.durationMs
		}
	}
	if openCount > 0 {
		out.AverageOpenLatencyMs = openTotal / openCount
	}
	if firstCount > 0 {
		out.AverageFirstByteMs = firstTotal / firstCount
	}
	if durationCount > 0 {
		out.AverageDurationMs = durationTotal / durationCount
	}
	if !d.cache.mediaRootReadable {
		out.MediaRootReadFailures = 1
	}
	if !boolPtrValue(d.cache.tailscale.Running) || !boolPtrValue(d.cache.tailscale.SelfOnline) {
		out.TailscaleUnavailable = 1
	}
	return out
}

func (d *Diagnostics) pruneLocked() {
	cutoff := d.now().Add(-time.Hour)
	first := 0
	for first < len(d.events) && d.events[first].at.Before(cutoff) {
		first++
	}
	if first > 0 {
		d.events = append([]metricEvent(nil), d.events[first:]...)
	}
}

func (d *Diagnostics) probeTailscale(ctx context.Context) tailscaleSummary {
	args := []string{}
	if d.cfg.TailscaleSocket != "" {
		args = append(args, "--socket="+d.cfg.TailscaleSocket)
	}
	args = append(args, "status", "--json")
	cmdCtx, cancel := context.WithTimeout(ctx, 700*time.Millisecond)
	defer cancel()
	out, err := exec.CommandContext(cmdCtx, d.cfg.TailscaleCommand, args...).Output()
	if err != nil {
		code := ErrTailscaleNotRunning
		running := false
		return tailscaleSummary{Running: &running, BackendState: nil, SelfOnline: nil, ErrorCode: &code}
	}
	var raw struct {
		BackendState string   `json:"BackendState"`
		TailscaleIPs []string `json:"TailscaleIPs"`
		Self         struct {
			Online bool `json:"Online"`
		} `json:"Self"`
		Peer map[string]any `json:"Peer"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		code := ErrInternal
		running := false
		return tailscaleSummary{Running: &running, ErrorCode: &code}
	}
	running := raw.BackendState == "Running"
	backend := raw.BackendState
	online := raw.Self.Online
	var tailnetIP *string
	if len(raw.TailscaleIPs) > 0 {
		value := raw.TailscaleIPs[0]
		tailnetIP = &value
	}
	peerCount := len(raw.Peer)
	var code *string
	if !running {
		value := ErrTailscaleNotRunning
		code = &value
	} else if !online {
		value := ErrTailscaleNotOnline
		code = &value
	}
	return tailscaleSummary{
		Running:      &running,
		BackendState: &backend,
		SelfOnline:   &online,
		TailnetIP:    tailnetIP,
		PeerCount:    &peerCount,
		ErrorCode:    code,
	}
}

func (d *Diagnostics) probeSystem(mediaRoot string) systemSummary {
	var out systemSummary
	var stat syscall.Statfs_t
	if err := syscall.Statfs(mediaRoot, &stat); err == nil {
		free := uint64(stat.Bavail) * uint64(stat.Bsize)
		out.DiskFreeBytes = &free
	}
	if uptime := systemUptime(); uptime != nil {
		out.AwakeSeconds = uptime
		wake := d.now().Add(-time.Duration(*uptime) * time.Second).Format(time.RFC3339)
		out.LastWakeAt = &wake
	}
	return out
}

type diagnosticResponseWriter struct {
	http.ResponseWriter
	info   *mediaRequestInfo
	diag   *Diagnostics
	status int
	bytes  int64
}

func newDiagnosticResponseWriter(w http.ResponseWriter, info *mediaRequestInfo, diag *Diagnostics) *diagnosticResponseWriter {
	return &diagnosticResponseWriter{ResponseWriter: w, info: info, diag: diag}
}

func (w *diagnosticResponseWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.Header().Set("Server-Timing", fmt.Sprintf("open;dur=%d, first-byte;dur=%d", millis(w.info.OpenLatency), millis(w.info.FirstByteLatency)))
	w.ResponseWriter.WriteHeader(status)
}

func (w *diagnosticResponseWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	if !w.info.firstByteLogged {
		w.diag.FirstByte(w.info)
	}
	w.ResponseWriter.Header().Set("Server-Timing", fmt.Sprintf("open;dur=%d, first-byte;dur=%d", millis(w.info.OpenLatency), millis(w.info.FirstByteLatency)))
	n, err := w.ResponseWriter.Write(data)
	w.bytes += int64(n)
	return n, err
}

type eventWriter struct {
	mu     sync.Mutex
	dir    string
	max    int64
	normal string
	errors string
}

func newEventWriter(dir string) *eventWriter {
	_ = os.MkdirAll(dir, 0o755)
	return &eventWriter{
		dir:    dir,
		max:    10 * 1024 * 1024,
		normal: filepath.Join(dir, "events.jsonl"),
		errors: filepath.Join(dir, "errors.jsonl"),
	}
}

func (d *Diagnostics) writeEvent(record eventRecord) {
	if d.writer == nil {
		return
	}
	d.writer.write(record)
}

func (w *eventWriter) write(record eventRecord) {
	w.mu.Lock()
	defer w.mu.Unlock()
	target := w.normal
	if record.ErrorCode != nil {
		target = w.errors
	}
	w.rotate(target)
	file, err := os.OpenFile(target, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer file.Close()
	buf := bufio.NewWriter(file)
	_ = json.NewEncoder(buf).Encode(record)
	_ = buf.Flush()
}

func (w *eventWriter) rotate(path string) {
	info, err := os.Stat(path)
	if err != nil || info.Size() < w.max {
		return
	}
	rotated := path + "." + time.Now().UTC().Format("20060102150405") + ".gz"
	_ = compressFile(path, rotated)
	_ = os.Remove(path)
	_ = filepath.WalkDir(w.dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		age := time.Since(info.ModTime())
		if strings.Contains(entry.Name(), "errors") && age > 30*24*time.Hour {
			_ = os.Remove(path)
		} else if strings.Contains(entry.Name(), "events") && age > 7*24*time.Hour {
			_ = os.Remove(path)
		}
		return nil
	})
	w.enforceTotalLimit(128 * 1024 * 1024)
}

func (w *eventWriter) enforceTotalLimit(limit int64) {
	type logFile struct {
		path    string
		size    int64
		modTime time.Time
	}
	files := make([]logFile, 0)
	var total int64
	_ = filepath.WalkDir(w.dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		total += info.Size()
		files = append(files, logFile{path: path, size: info.Size(), modTime: info.ModTime()})
		return nil
	})
	sort.Slice(files, func(i, j int) bool { return files[i].modTime.Before(files[j].modTime) })
	for _, file := range files {
		if total <= limit {
			break
		}
		if file.path == w.normal || file.path == w.errors {
			continue
		}
		if os.Remove(file.path) == nil {
			total -= file.size
		}
	}
}

func compressFile(srcPath, dstPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer dst.Close()
	gz := gzip.NewWriter(dst)
	if _, err := io.Copy(gz, src); err != nil {
		_ = gz.Close()
		return err
	}
	return gz.Close()
}

func mediaRootReadable(mediaRoot string) bool {
	info, err := os.Stat(mediaRoot)
	if err != nil || !info.IsDir() {
		return false
	}
	dir, err := os.Open(mediaRoot)
	if err != nil {
		return false
	}
	defer dir.Close()
	_, err = dir.Readdirnames(1)
	return err == nil || errors.Is(err, io.EOF)
}

func randomID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(bytes[:])
}

func safeDiagnosticID(value string) string {
	value = strings.TrimSpace(value)
	if diagnosticIDPattern.MatchString(value) {
		return value
	}
	return ""
}

func sanitizedMediaRel(root, target string) string {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}

func hashMediaKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:12])
}

func parseRangeHeader(header string, size int64) (*int64, *int64, *int64) {
	if !strings.HasPrefix(header, "bytes=") || size <= 0 {
		return nil, nil, nil
	}
	spec := strings.TrimPrefix(header, "bytes=")
	if strings.Contains(spec, ",") {
		return nil, nil, nil
	}
	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return nil, nil, nil
	}
	var start, end int64
	var err error
	switch {
	case parts[0] == "":
		suffix, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || suffix <= 0 {
			return nil, nil, nil
		}
		if suffix > size {
			suffix = size
		}
		start = size - suffix
		end = size - 1
	case parts[1] == "":
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 {
			return nil, nil, nil
		}
		end = size - 1
	default:
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 {
			return nil, nil, nil
		}
		end, err = strconv.ParseInt(parts[1], 10, 64)
		if err != nil || end < start {
			return nil, nil, nil
		}
		if end >= size {
			end = size - 1
		}
	}
	planned := end - start + 1
	return &start, &end, &planned
}

func systemUptime() *int64 {
	out, err := exec.Command("sysctl", "-n", "kern.boottime").Output()
	if err != nil {
		return nil
	}
	text := string(out)
	idx := strings.Index(text, "sec = ")
	if idx < 0 {
		return nil
	}
	rest := text[idx+6:]
	end := strings.Index(rest, ",")
	if end < 0 {
		return nil
	}
	sec, err := strconv.ParseInt(strings.TrimSpace(rest[:end]), 10, 64)
	if err != nil {
		return nil
	}
	uptime := time.Now().Unix() - sec
	if uptime < 0 {
		return nil
	}
	return &uptime
}

func millis(d time.Duration) int64 {
	if d <= 0 {
		return 0
	}
	return int64(d / time.Millisecond)
}

func boolPtrValue(value *bool) bool {
	return value != nil && *value
}
