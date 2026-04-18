export interface PostCreateRequest {
  content: string;
  platforms: string[];
  scheduledAt?: string;
  status?: 'draft' | 'scheduled';
  tags?: string[];
  mediaIds?: string[];
  templateId?: string;
}

export interface PostUpdateRequest {
  content?: string;
  platforms?: string[];
  scheduledAt?: string;
  status?: 'draft' | 'scheduled' | 'published';
  tags?: string[];
  mediaIds?: string[];
}

export interface PostResponse {
  id: string;
  content: string;
  platforms: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledAt?: string;
  publishedAt?: string;
  tags: string[];
  mediaIds: string[];
  templateId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  metrics?: {
    [platform: string]: {
      impressions: number;
      likes: number;
      shares: number;
      comments: number;
      clicks: number;
      engagementRate: number;
    };
  };
}

export interface MediaUploadRequest {
  alt?: string;
  tags?: string[];
}

export interface MediaResponse {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  alt?: string;
  tags: string[];
  url: string;
  thumbnailUrl?: string;
  createdAt: string;
  createdBy: string;
}

export interface TemplateCreateRequest {
  name: string;
  content: string;
  variables?: TemplateVariable[];
  tags?: string[];
}

export interface TemplateVariable {
  name: string;
  type: 'text' | 'url' | 'number' | 'date';
  required: boolean;
  description?: string;
}

export interface TemplateResponse {
  id: string;
  name: string;
  content: string;
  variables: TemplateVariable[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface SocialAccountCreateRequest {
  platform: string;
  displayName: string;
  username?: string;
  credentials: object;
  settings?: object;
}

export interface SocialAccountResponse {
  id: string;
  platform: string;
  displayName: string;
  username?: string;
  avatar?: string;
  isActive: boolean;
  settings: object;
  lastSync?: string;
  createdAt: string;
  updatedAt: string;
  metrics?: {
    followers: number;
    following: number;
    postsCount: number;
  };
}

export interface AnalyticsOverviewResponse {
  period: string;
  metrics: {
    totalPosts: number;
    totalImpressions: number;
    totalEngagements: number;
    totalClicks: number;
    engagementRate: number;
    averageImpressions: number;
  };
  platformBreakdown: {
    [platform: string]: {
      posts: number;
      impressions: number;
      engagements: number;
    };
  };
}

export interface EngagementAnalyticsResponse {
  platform?: string;
  period: string;
  dailyEngagements: Array<{
    date: string;
    likes: number;
    shares: number;
    comments: number;
    total: number;
  }>;
  topPosts: Array<{
    id: string;
    content: string;
    engagements: number;
    impressions: number;
  }>;
}

export interface CalendarResponse {
  view: 'day' | 'week' | 'month';
  period: string;
  events: Array<{
    date: string;
    posts: PostResponse[];
  }>;
  summary: {
    totalScheduled: number;
    byPlatform: {
      [platform: string]: number;
    };
  };
}

export interface WebhookCreateRequest {
  url: string;
  events: string[];
  secret?: string;
}

export interface WebhookResponse {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  lastTriggered?: string;
}

export interface ApiError {
  error: string;
  message: string;
  code?: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface QueryParams {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: any;
}

// Generation
export type { GenerationRequest, GenerationJobResponse } from '../generation/types';