export type SeriesType = "learning" | "leisure";
export type PlaybackMode = "video" | "listen";

export interface Category {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  tone: "sage" | "sky" | "apricot";
  imageUrl?: string | null;
  dailyLimitSeconds?: number | null;
  seriesType: SeriesType;
}

export type MediaSource = "youtube" | "self_hosted";
export type MediaType = "video" | "audio";

export interface MediaDescriptor {
  source: MediaSource;
  youtubeVideoId: string | null;
  mediaType: MediaType | null;
  mediaPath: string | null;
  mediaUrl: string | null;
  thumbnailPath: string | null;
}

export interface VideoFixture extends MediaDescriptor {
  id: string;
  categoryId: string;
  categoryIds: string[];
  youtubeTitle: string;
  parentLabel: string;
  thumbnailUrl: string;
  sortOrder: number;
  durationSeconds?: number | null;
  lastPositionSeconds?: number;
  isWatched?: boolean;
  isLearned?: boolean;
  learnedAt?: string | null;
  isSelectable?: boolean;
  seriesType?: SeriesType;
  lastPlayedAt?: string | null;
}

export interface ResumeInfo extends MediaDescriptor {
  videoId: string;
  youtubeTitle: string;
  parentLabel: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  lastPositionSeconds: number;
  lastPlayedAt: string;
}

export interface RecentVideo extends MediaDescriptor {
  id: string;
  youtubeTitle: string;
  parentLabel: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  lastPositionSeconds: number;
  isWatched: boolean;
  lastPlayedAt: string;
}

export interface Note {
  id: string;
  videoId: string;
  videoLabel: string;
  content: string;
  videoPositionSeconds: number;
  createdAt: string;
  parentAnnotation?: string | null;
}

export interface ViewSession {
  id: string;
  videoId: string;
  videoLabel: string;
  deviceName?: string;
  categoryNames?: string[];
  playedSeconds: number;
  lastPositionSeconds: number;
  startedAt: string;
  updatedAt: string;
  noteCount: number;
  playbackMode?: PlaybackMode;
  seriesType?: SeriesType | null;
}

export interface TodaySummary {
  totalPlayedSeconds: number;
  learningSeconds?: number;
  leisureSeconds?: number;
  listenSeconds?: number;
  playedVideoCount: number;
  sessionCount: number;
  noteCount: number;
}

export interface CategoryStat {
  categoryId: string;
  name: string;
  icon: string;
  tone: "sage" | "sky" | "apricot";
  playedSeconds: number;
  videoCount: number;
  sessionCount: number;
  noteCount: number;
  percentage: number;
  dailyLimitSeconds?: number | null;
}

export interface DeviceStat {
  deviceId: string;
  deviceName: string;
  playedSeconds: number;
  videoCount: number;
  sessionCount: number;
  percentage: number;
}

export type AccessStatus = "AVAILABLE" | "OUTSIDE_WINDOW" | "DAILY_LIMIT_REACHED" | "PAUSED_BY_PARENT";

export interface CategoryAccessState {
  categoryId: string;
  name: string;
  icon: string;
  tone: "sage" | "sky" | "apricot";
  dailyLimitSeconds: number | null;
  todayPlayedSeconds: number;
  remainingSeconds: number | null;
  isReached: boolean;
}

export interface ChildAccessState {
  state: AccessStatus;
  remainingSeconds: number;
  todayPlayedSeconds: number;
  dailyLimitSeconds: number;
  bonusSeconds: number;
  baseLimitSeconds?: number;
  earnedBonusSeconds?: number;
  learningSeconds?: number;
  leisureUsedSeconds?: number;
  listenSeconds?: number;
  gracePeriodSeconds: number;
  nextAllowedAt: string | null;
  isPaused: boolean;
  serverTimeTaipei: string;
  todayDate: string;
  message: string;
  categoryStates?: CategoryAccessState[];
}

export interface AllowedWindow {
  id: string;
  usageRuleId: "weekday" | "weekend";
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
}

export interface UsageRule {
  id: "weekday" | "weekend";
  dayType: "weekday" | "weekend";
  dailyLimitSeconds: number;
  gracePeriodSeconds: number;
  isActive: boolean;
  allowedWindows: AllowedWindow[];
}

export interface DailyOverride {
  id: string;
  date: string;
  bonusSeconds: number;
  limitOverrideSeconds: number | null;
  isPaused: boolean;
}

export interface TodayPick extends MediaDescriptor {
  id: string;
  videoId: string;
  parentLabel: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  isWatched?: boolean;
  sortOrder: number;
}

export interface TodayDashboard {
  notes: Note[];
  summary: TodaySummary;
  timeline: ViewSession[];
  categoryStats?: CategoryStat[];
  deviceStats?: DeviceStat[];
  ruleState?: ChildAccessState;
  errors: Partial<Record<"notes" | "summary" | "timeline", string>>;
}

export interface CalendarHistory {
  month: string;
  dates: string[];
}

export interface DailyBar {
  date: string;
  label: string;
  playedSeconds: number;
  noteCount: number;
}

export interface SummaryAnalytics {
  range: "7d" | "30d";
  summary: TodaySummary;
  dailyBars: DailyBar[];
  notes: Note[];
  categoryStats?: CategoryStat[];
  deviceStats?: DeviceStat[];
}

export interface NoteSearchResult {
  id: string;
  videoId: string;
  videoLabel: string;
  youtubeTitle: string;
  thumbnailUrl: string;
  content: string;
  videoPositionSeconds: number;
  createdAt: string;
}

export interface VideoHistoryStats {
  playCount: number;
  totalPlayedSeconds: number;
  lastPositionSeconds: number;
  isWatched: boolean;
  lastPlayedAt: string | null;
  noteCount: number;
}

export interface VideoHistorySession {
  id: string;
  playedSeconds: number;
  lastPositionSeconds: number;
  startedAt: string;
  updatedAt: string;
  status: string;
}

export interface VideoHistoryNote {
  id: string;
  content: string;
  videoPositionSeconds: number;
  createdAt: string;
  parentAnnotation?: string | null;
}

export interface VideoHistoryResponse {
  video: AdminVideo;
  stats: VideoHistoryStats;
  sessions: VideoHistorySession[];
  notes: VideoHistoryNote[];
}

export interface SaveNoteInput {
  videoId: string;
  viewSessionId: string;
  writeToken: string;
  content: string;
  videoPositionSeconds: number;
}

export interface UpdateViewSessionInput {
  writeToken: string;
  heartbeatSeq: number;
  deltaSeconds: number;
  positionSeconds: number;
  intervalStartedAt: string | null;
  intervalEndedAt: string | null;
  status?: "active" | "ended";
}

export interface DeviceStatus {
  authorized: boolean;
  device: { id: string; name: string } | null;
}

export interface AdminCategory extends Category {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AdminVideo extends Omit<VideoFixture, "categoryId" | "sortOrder"> {
  youtubeUrl: string | null;
  availabilityStatus: "available" | "unavailable" | "private" | "not_embeddable" | "metadata_error";
  healthStatus: "healthy" | "unavailable" | "private" | "embedding_disabled" | "unknown";
  metadataError: string | null;
  lastHealthCheckAt?: string | null;
  metadataSyncedAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  categorySortOrders: Record<string, number>;
}

export interface ChildDevice {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
}

export type DiagnosticOutcome = "open" | "success" | "recovered" | "error";

export interface DiagnosticSessionSummary {
  id: string;
  deviceId: string;
  deviceName: string;
  videoId: string | null;
  videoLabel: string | null;
  categoryId: string | null;
  source: MediaSource;
  playbackMode: PlaybackMode;
  outcome: DiagnosticOutcome;
  retryCount: number;
  errorCount: number;
  lastErrorCode: string | null;
  firstPlayMs: number | null;
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  isStandalone: number;
  networkType: string | null;
  ipPrefix: string | null;
  country: string | null;
  colo: string | null;
  httpProtocol: string | null;
  tlsVersion: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface DiagnosticSummary {
  devices: Array<{
    deviceId: string; deviceName: string; sessionCount: number; successCount: number;
    problemCount: number; lastSeenAt: string | null;
  }>;
  errors: Array<{ errorCode: string; source: MediaSource; sessionCount: number; lastSeenAt: string }>;
}
