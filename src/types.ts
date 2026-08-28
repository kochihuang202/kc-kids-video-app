export interface Category {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  tone: "sage" | "sky" | "apricot";
}

export interface VideoFixture {
  id: string;
  categoryId: string;
  youtubeVideoId: string;
  youtubeTitle: string;
  parentLabel: string;
  thumbnailUrl: string;
  sortOrder: number;
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
  noteCount: number;
}

export interface TodayDashboard {
  notes: Note[];
  summary: TodaySummary;
  timeline: ViewSession[];
}

export interface SaveNoteInput {
  videoId: string;
  content: string;
  videoPositionSeconds: number;
}

export interface UpdateViewSessionInput {
  playedSeconds: number;
  lastPositionSeconds: number;
}
