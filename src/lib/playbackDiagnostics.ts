import { diagnosticRepository, type DiagnosticEventInput } from "../data/repositories";
import type { DeviceStatus, PlaybackMode, VideoFixture } from "../types";

const PENDING_KEY = "kid_diagnostic_pending_v1";

function clientInfo() {
  const ua = navigator.userAgent;
  const apple = ua.match(/(iPhone|iPad|iPod).*OS ([\d_]+)/i);
  const android = ua.match(/Android\s([\d.]+)/i);
  const windows = ua.match(/Windows NT\s([\d.]+)/i);
  const mac = ua.match(/Mac OS X\s([\d_]+)/i);
  const iPadDesktopMode = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  const edge = ua.match(/Edg\/([\d.]+)/);
  const chrome = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/);
  const safari = !chrome && ua.match(/Version\/([\d.]+).*Safari/);
  const browser = edge ? ["Edge", edge[1]] : chrome ? ["Chrome", chrome[1]] : safari ? ["Safari", safari[1]] : ["Unknown", ""];
  const os = iPadDesktopMode ? ["iPadOS", "unknown"]
    : apple ? [apple[1] === "iPad" ? "iPadOS" : "iOS", apple[2].replaceAll("_", ".")]
    : android ? ["Android", android[1]] : windows ? ["Windows", windows[1]]
      : mac ? ["macOS", mac[1].replaceAll("_", ".")] : ["Unknown", ""];
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return {
    userAgent: ua.slice(0, 500), platform: navigator.platform || null,
    browserName: browser[0], browserVersion: browser[1], osName: os[0], osVersion: os[1],
    viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    isStandalone: window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    networkType: connection?.effectiveType || null,
  };
}

function savePending(item: Record<string, unknown>) {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]") as Record<string, unknown>[];
    pending.push(item);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending.slice(-20)));
  } catch { /* diagnostics must never break playback */ }
}

async function replayPending() {
  let pending: Array<{ kind: "events" | "finish"; id: string; payload: unknown }> = [];
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return; }
  if (!pending.length) return;
  const failed: typeof pending = [];
  for (const item of pending) {
    try {
      if (item.kind === "events") await diagnosticRepository.events(item.id, item.payload as DiagnosticEventInput[]);
      else await diagnosticRepository.finish(item.id, item.payload as "success" | "recovered" | "error");
    } catch { failed.push(item); }
  }
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(failed.slice(-20))); } catch { /* ignore */ }
}

export class PlaybackDiagnostics {
  readonly clientSessionId = crypto.randomUUID();
  private idPromise: Promise<string | null>;
  private queue: DiagnosticEventInput[] = [];
  private seq = 0;
  private timer: number;
  private hadError = false;
  private hadRetry = false;
  private played = false;
  private closed = false;
  private finishing = false;

  constructor(device: DeviceStatus, video: VideoFixture, mode: PlaybackMode) {
    void replayPending();
    this.idPromise = diagnosticRepository.start({
      clientSessionId: this.clientSessionId, videoId: video.id, videoLabel: video.parentLabel,
      categoryId: video.categoryId, source: video.source, playbackMode: mode, ...clientInfo(),
    }).then(({ id }) => id).catch(() => null);
    this.timer = window.setInterval(() => void this.flush(), 10_000);
    this.event("page_opened", { networkOnline: navigator.onLine, state: device.device?.name || "unknown" });
  }

  event(type: string, detail?: Record<string, string | number | boolean | null | undefined>, errorCode?: string, positionSeconds?: number) {
    if (this.closed) return;
    if (errorCode) this.hadError = true;
    if (type === "retry_started") this.hadRetry = true;
    if (type === "playing") this.played = true;
    this.queue.push({ seq: ++this.seq, type, occurredAt: new Date().toISOString(), detail, errorCode, positionSeconds });
    if (errorCode || this.queue.length >= 20) void this.flush();
  }

  hasPlayedSuccessfully() {
    return this.played;
  }

  async flush(keepalive = false) {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, 30);
    try {
      const id = await this.idPromise;
      if (!id) return;
      await diagnosticRepository.events(id, batch, keepalive);
    } catch {
      try {
        const id = await this.idPromise;
        if (id) savePending({ kind: "events", id, payload: batch });
      } catch { /* start failure is intentionally isolated */ }
    }
  }

  async probeMedia(url: string, reason: string) {
    const mediaUrl = new URL(url, window.location.href);
    const started = performance.now();
    try {
      const response = await fetch(mediaUrl, {
        method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5_000),
        headers: { "X-KC-Diagnostic-Id": this.clientSessionId },
      });
      this.event("media_probe", {
        state: reason, status: response.status, latencyMs: Math.round(performance.now() - started),
        requestId: response.headers.get("X-KC-Request-Id") || "",
        serviceVersion: response.headers.get("X-KC-Service-Version") || "",
        serverTiming: response.headers.get("Server-Timing") || "",
      }, response.ok ? undefined : `MEDIA_PROBE_HTTP_${response.status}`);
    } catch (error) {
      this.event("media_probe", {
        state: reason, latencyMs: Math.round(performance.now() - started), networkOnline: navigator.onLine,
        message: error instanceof Error ? error.name : "probe_failed",
      }, "MEDIA_PROBE_FAILED");
    }
    try {
      const endpoint = new URL(reason === "playback_start" ? "/health" : "/diagnostics/deep", mediaUrl).toString();
      const healthStarted = performance.now();
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      const health = body?.health && typeof body.health === "object" ? body.health as Record<string, unknown> : body;
      const tailscale = health?.tailscale && typeof health.tailscale === "object" ? health.tailscale as Record<string, unknown> : null;
      const streaming = health?.streaming && typeof health.streaming === "object" ? health.streaming as Record<string, unknown> : null;
      this.event("media_probe", {
        state: `${reason}_${reason === "playback_start" ? "health" : "deep"}`,
        status: response.status, latencyMs: Math.round(performance.now() - healthStarted),
        tailscaleRunning: tailscale?.running as boolean | undefined,
        tailscaleOnline: tailscale?.selfOnline as boolean | undefined,
        mediaRootReadable: health?.mediaRootReadable as boolean | undefined,
        activeStreams: streaming?.activeStreams as number | undefined,
      }, response.ok ? undefined : `MAC_HEALTH_HTTP_${response.status}`);
    } catch (error) {
      this.event("media_probe", {
        state: `${reason}_health`, networkOnline: navigator.onLine,
        message: error instanceof Error ? error.name : "health_failed",
      }, "MAC_HEALTH_UNREACHABLE");
    }
  }

  async finish(keepalive = false) {
    if (this.closed || this.finishing) return;
    this.event("route_left");
    this.finishing = true;
    this.closed = true;
    window.clearInterval(this.timer);
    const outcome = this.hadError || this.hadRetry ? (this.played ? "recovered" : "error") : "success";
    const batch = this.queue.splice(0, 30);
    try {
      const id = await this.idPromise;
      if (!id) return;
      await Promise.all([
        batch.length ? diagnosticRepository.events(id, batch, keepalive) : Promise.resolve({ ok: true as const }),
        diagnosticRepository.finish(id, outcome, keepalive),
      ]);
    } catch {
      try {
        const id = await this.idPromise;
        if (id) {
          if (batch.length) savePending({ kind: "events", id, payload: batch });
          savePending({ kind: "finish", id, payload: outcome });
        }
      } catch { /* ignore */ }
    }
  }
}
