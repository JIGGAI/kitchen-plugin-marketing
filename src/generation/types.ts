export interface GenerationRequest {
  prompt: string;
  type: 'image' | 'video';
  provider?: string;
  includeBrand?: boolean;
  /** Venue/sub-brand whose imagery rules apply, e.g. 'Oakwood'. */
  brandVariant?: string;
  config?: {
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
  };
}

export interface GenerationJobResponse {
  id: string;
  sourceMediaId: string;
  type: 'image' | 'video';
  provider: string;
  status: 'running' | 'completed' | 'failed';
  prompt: string;
  generatedMediaId: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DriverResult {
  filePath: string;
  metadata?: Record<string, unknown>;
}
