export interface GenerationRequest {
  prompt: string;
  type: 'image' | 'video';
  provider?: string;
  includeBrand?: boolean;
  /**
   * Also append the full text of the brand documents the style suffix does
   * not read (brand-system-map.md, content-ops-defaults.md, the monthly
   * calendar template). Images only — see brand-context.ts.
   */
  includeAllBrandDocs?: boolean;
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
