export interface GeneratedVideo {
  uri: string;
  mimeType: string;
}

export interface VideoGenerationState {
  isLoading: boolean;
  progress: string;
  error: string | null;
  videoUri: string | null;
}
