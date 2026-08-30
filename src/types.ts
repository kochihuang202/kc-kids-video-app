export interface Category {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  tone: "sage" | "sky" | "apricot";
  imageUrl?: string | null;
}

export interface VideoFixture {
  id: string;
  categoryId: string;
  categoryIds: string[];
  youtubeVideoId: string;
  youtubeTitle: string;
  parentLabel: string;
  thumbnailUrl: string;
  sortOrder: number;
  durationSeconds?: number | null;
}

export interface Note {
  id: string;
  videoId: string;
  videoLabel: string;
  content: string;
  videoPositionSeconds: number;
  createdAt: string;
}

export interface ViewSession {
  id: string;
  videoId: string;
  videoLabel: string;
  playedSeconds: number;
  lastPositionSeconds: number;
  startedAt: string;
  updatedAt: string;
  noteCount: number;
}

export interface TodaySummary {
  totalPlayedSeconds: number;
  playedVideoCount: number;
  sessionCount: number;
  noteCount: number;
}

export interface TodayDashboard {
  notes: Note[];
  summary: TodaySummary;
  timeline: ViewSession[];
  errors: Partial<Record<"notes" | "summary" | "timeline", string>>;
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
  source: "youtube" | "self_hosted";
  youtubeUrl: string;
  availabilityStatus: "available" | "unavailable" | "private" | "not_embeddable" | "metadata_error";
  metadataError: string | null;
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
