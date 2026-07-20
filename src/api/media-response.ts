// Shared field mapping for media API responses, so the list route
// (GET /media) and the detail route (GET /media/:id) return the same
// canonical shape — including the AI generation `prompt` the dashboard
// reveals under each post image. Callers add their route-specific extra
// (list → thumbnailDataUrl, detail → dataUrl) by spreading this.
export interface MediaRow {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  alt: string | null;
  tags: string | null;
  prompt: string | null;
  createdAt: string;
}

export function mediaResponseFields(row: MediaRow) {
  return {
    id: row.id,
    filename: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    url: row.url,
    alt: row.alt,
    tags: JSON.parse(row.tags || '[]'),
    prompt: row.prompt ?? null,
    createdAt: row.createdAt,
  };
}
