import type { Difficulty, DifficultyFilter } from "./difficulty";

export type CatalogFilters = {
  interests: string[];
  subtopics: string[];
  q: string;
  sort: "newest" | "popular";
  duration: "all" | "under-10" | "10-plus";
  difficulty: DifficultyFilter;
  transcript: "all" | "available" | "unavailable";
  page: number;
};
export type TopicLabel = { slug: string; name: string };
export type InterestWithSubtopics = TopicLabel & {
  description: string;
  subtopics: TopicLabel[];
};
export type VideoCardData = {
  youtubeId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number;
  viewCount: string | null;
  difficulty: Difficulty;
  estimatedDifficulty?: Difficulty | null;
  interests: TopicLabel[];
};
export type CategorySummary = Omit<InterestWithSubtopics, "subtopics"> & {
  videoCount: number;
  subtopics: (TopicLabel & { videoCount: number })[];
};
export type VideoDetailData = VideoCardData & {
  description: string;
  languageStatus: "unverified" | "likely_ja" | "verified_ja";
  defaultAudioLanguage: string | null;
  madeForKids: boolean | null;
  subtopics: TopicLabel[];
  format: "review" | "tutorial" | "vlog" | "interview" | "other" | null;
  difficultyEstimateNote?: string | null;
  difficultyEstimateMethod?: string | null;
  summary?: string | null;
  summaryBasis?: "metadata" | "transcript" | null;
};
export type CatalogPage = {
  items: VideoCardData[];
  total: number;
  page: number;
  pageSize: 20;
  totalPages: number;
};
