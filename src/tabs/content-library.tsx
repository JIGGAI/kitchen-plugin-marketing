/**
 * Content Library Tab — compose, save drafts, publish via driver system
 */
(function () {
  const R = (window as any).React;
  if (!R) return;
  const h = R.createElement;
  const useEffect = R.useEffect as typeof R.useEffect;
  const useMemo = R.useMemo as typeof R.useMemo;
  const useState = R.useState as typeof R.useState;
  const useCallback = R.useCallback as typeof R.useCallback;
  const useRef = R.useRef as typeof R.useRef;

  const t = {
    text: { color: 'var(--ck-text-primary)' },
    muted: { color: 'var(--ck-text-secondary)' },
    faint: { color: 'var(--ck-text-tertiary)' },
    card: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px',
      padding: '1rem',
    },
    input: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px',
      padding: '0.6rem 0.75rem',
      color: 'var(--ck-text-primary)',
      width: '100%',
    },
    btnPrimary: {
      background: 'var(--ck-accent-red)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '0.6rem 0.85rem',
      color: 'white',
      fontWeight: 700,
      cursor: 'pointer',
    },
    btnGhost: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px',
      padding: '0.6rem 0.85rem',
      color: 'var(--ck-text-primary)',
      fontWeight: 600,
      cursor: 'pointer',
    },
    btnPublish: {
      background: 'rgba(99,179,237,0.2)',
      border: '1px solid rgba(99,179,237,0.4)',
      borderRadius: '10px',
      padding: '0.6rem 0.85rem',
      color: 'rgba(210,235,255,0.95)',
      fontWeight: 700,
      cursor: 'pointer',
    },
    pill: (active: boolean, connected: boolean) => ({
      background: active ? 'rgba(99,179,237,0.16)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? 'rgba(99,179,237,0.45)' : 'var(--ck-border-subtle)'}`,
      borderRadius: '999px',
      padding: '0.25rem 0.55rem',
      fontSize: '0.8rem',
      color: active ? 'rgba(210,235,255,0.95)' : connected ? 'var(--ck-text-secondary)' : 'var(--ck-text-tertiary)',
      cursor: connected ? 'pointer' : 'default',
      userSelect: 'none' as const,
      opacity: connected ? 1 : 0.5,
    }),
    statusBadge: (status: string) => {
      const colors: Record<string, string> = {
        draft: 'rgba(167,139,250,0.7)',
        scheduled: 'rgba(251,191,36,0.7)',
        published: 'rgba(74,222,128,0.7)',
        failed: 'rgba(248,113,113,0.7)',
      };
      return {
        display: 'inline-block',
        background: colors[status] || 'rgba(100,100,100,0.5)',
        borderRadius: '999px',
        padding: '0.1rem 0.45rem',
        fontSize: '0.7rem',
        fontWeight: 600,
        color: 'white',
      };
    },
    backendBadge: (backend: string) => {
      const colors: Record<string, string> = {
        postiz: 'rgba(99,179,237,0.5)',
        gateway: 'rgba(134,239,172,0.5)',
        direct: 'rgba(251,191,36,0.5)',
      };
      return {
        display: 'inline-block',
        background: colors[backend] || 'rgba(100,100,100,0.3)',
        borderRadius: '999px',
        padding: '0.05rem 0.35rem',
        fontSize: '0.6rem',
        fontWeight: 600,
        color: 'white',
        marginLeft: '0.25rem',
      };
    },
    charWarn: (pct: number) => ({
      color: pct > 100 ? 'rgba(248,113,113,0.95)' : pct > 90 ? 'rgba(251,191,36,0.9)' : 'var(--ck-text-tertiary)',
      fontSize: '0.75rem',
    }),
    // Modal — uses kitchen design tokens (matches s.overlay / s.modal in
    // content-calendar.tsx) but follows dashboard's topbar + two-column
    // layout pattern for content.
    modalOverlay: {
      position: 'fixed' as const,
      inset: '0',
      background: 'rgba(0,0,0,0.65)',
      display: 'flex' as const,
      alignItems: 'flex-start' as const,
      justifyContent: 'center' as const,
      padding: '16px',
      zIndex: 9999,
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
    },
    modalCard: {
      position: 'relative' as const,
      // Match plugin tab page card color (kitchen --ck-bg-soft, #121b29).
      background: 'var(--ck-bg-soft, #121b29)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '14px',
      width: '96vw',
      maxWidth: '1200px',
      maxHeight: '92vh',
      overflow: 'auto' as const,
      padding: '20px',
    },
    modalCloseBtn: {
      position: 'absolute' as const,
      top: '12px',
      right: '12px',
      background: 'none',
      border: 'none',
      color: 'var(--ck-text-tertiary)',
      cursor: 'pointer' as const,
      fontSize: '1.4rem',
      padding: '0.25rem 0.5rem',
      lineHeight: 1,
    },
    modalTopbar: {
      display: 'grid' as const,
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: '24px',
      paddingRight: '40px',
      paddingBottom: '14px',
      marginBottom: '16px',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    },
    modalTopbarTitle: {
      fontSize: '1rem',
      fontWeight: 700,
      color: 'var(--ck-text-primary)',
    },
    modalTopbarLabel: {
      fontSize: '1rem',
      fontWeight: 600,
      color: 'var(--ck-text-primary)',
    },
    modalTwoCol: {
      display: 'grid' as const,
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: '20px',
    },
  };

  type DriverInfo = {
    platform: string;
    label: string;
    icon: string;
    connected: boolean;
    backend: string;
    displayName: string;
    username?: string;
    avatar?: string;
    integrationId?: string;
    capabilities: {
      canPost: boolean;
      canSchedule: boolean;
      canDelete: boolean;
      canUploadMedia: boolean;
      maxLength?: number;
    };
  };

  type Post = {
    id: string;
    content: string;
    platforms: string[];
    status: string;
    scheduledAt?: string;
    publishedAt?: string;
    createdAt: string;
  };

  function ContentLibrary(props: any) {
    const teamId = String(props?.teamId || 'default');
    const apiBase = useMemo(() => `/api/plugins/marketing`, []);

    const [drivers, setDrivers] = useState<DriverInfo[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');

    const [content, setContent] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
    const [scheduledAt, setScheduledAt] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [showMedia, setShowMedia] = useState(false);
    const [mediaLibrary, setMediaLibrary] = useState<any[]>([]);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Media library paging
    const MEDIA_PAGE_SIZE = 24;
    const [mediaPage, setMediaPage] = useState(0);
    const [mediaTotal, setMediaTotal] = useState(0);
    const [mediaHasMore, setMediaHasMore] = useState(false);

    // Media-detail modal state
    const [mediaModalItem, setMediaModalItem] = useState<any | null>(null);
    const [mediaModalUrl, setMediaModalUrl] = useState<string>('');
    const [mediaEditName, setMediaEditName] = useState('');
    const [mediaEditAlt, setMediaEditAlt] = useState('');
    const [mediaEditTagsInput, setMediaEditTagsInput] = useState(''); // comma-separated UI
    const [mediaSaving, setMediaSaving] = useState(false);
    const [mediaDeleting, setMediaDeleting] = useState(false);
    const [mediaModalError, setMediaModalError] = useState<string | null>(null);

    const successTimeout = useRef<any>(null);

    const postizHeaders = useMemo(() => {
      try {
        const stored = localStorage.getItem(`ck-postiz-${teamId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.apiKey) {
            return {
              'x-postiz-api-key': parsed.apiKey,
              'x-postiz-base-url': parsed.baseUrl || 'https://api.postiz.com/public/v1',
            };
          }
        }
      } catch { /* ignore */ }
      return {};
    }, [teamId]);

    const loadDrivers = useCallback(async () => {
      try {
        const res = await fetch(`${apiBase}/drivers?team=${encodeURIComponent(teamId)}`, { headers: postizHeaders });
        const json = await res.json();
        setDrivers(Array.isArray(json.drivers) ? json.drivers : []);
      } catch { /* ignore */ }
    }, [apiBase, teamId, postizHeaders]);

    const loadPosts = useCallback(async () => {
      try {
        const url = `${apiBase}/posts?team=${encodeURIComponent(teamId)}&limit=50`;
        const res = await fetch(url);
        const json = await res.json();
        setPosts(Array.isArray(json.data) ? json.data : []);
      } catch { /* ignore */ }
    }, [apiBase, teamId]);

    const loadMedia = useCallback(async () => {
      try {
        const offset = mediaPage * MEDIA_PAGE_SIZE;
        const res = await fetch(`${apiBase}/media?team=${encodeURIComponent(teamId)}&limit=${MEDIA_PAGE_SIZE}&offset=${offset}`);
        const json = await res.json();
        setMediaLibrary(Array.isArray(json.data) ? json.data : []);
        setMediaTotal(typeof json.total === 'number' ? json.total : 0);
        setMediaHasMore(Boolean(json.hasMore));
      } catch { /* ignore */ }
    }, [apiBase, teamId, mediaPage]);

    const handleFileUpload = useCallback(async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const res = await fetch(`${apiBase}/media?team=${encodeURIComponent(teamId)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ data: base64, filename: file.name, mimeType: file.type }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `Upload failed (${res.status})`);
          }
          const item = await res.json();
          // Auto-select newly uploaded item
          setSelectedMediaIds((prev) => [...prev, item.id]);
        }
        await loadMedia();
        showSuccess(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`);
      } catch (e: any) {
        setError(e?.message || 'Upload failed');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }, [apiBase, teamId, loadMedia]);

    const deleteMedia = useCallback(async (id: string) => {
      try {
        await fetch(`${apiBase}/media/${id}?team=${encodeURIComponent(teamId)}`, { method: 'DELETE' });
        setSelectedMediaIds((prev) => prev.filter((x) => x !== id));
        await loadMedia();
      } catch { /* ignore */ }
    }, [apiBase, teamId, loadMedia]);

    const toggleMediaSelect = (id: string) => {
      setSelectedMediaIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    };

    const openMediaModal = useCallback(async (item: any) => {
      setMediaModalItem(item);
      setMediaModalUrl('');
      setMediaModalError(null);
      setMediaEditName(String(item.originalName || item.filename || ''));
      setMediaEditAlt(String(item.alt || ''));
      const tags = Array.isArray(item.tags) ? item.tags : [];
      setMediaEditTagsInput(tags.join(', '));
      // Fetch the dataUrl for inline preview / playback
      try {
        const res = await fetch(`${apiBase}/media/${item.id}/file?team=${encodeURIComponent(teamId)}`);
        const json = await res.json();
        if (json?.dataUrl) setMediaModalUrl(String(json.dataUrl));
      } catch {
        // Fall back to item.url; not all media exposes a viewable URL
        if (item.url) setMediaModalUrl(String(item.url));
      }
    }, [apiBase, teamId]);

    const closeMediaModal = useCallback(() => {
      setMediaModalItem(null);
      setMediaModalUrl('');
      setMediaModalError(null);
    }, []);

    const saveMediaModal = useCallback(async () => {
      if (!mediaModalItem) return;
      setMediaSaving(true);
      setMediaModalError(null);
      try {
        const tags = mediaEditTagsInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const body = {
          originalName: mediaEditName.trim() || undefined,
          alt: mediaEditAlt,
          tags,
        };
        const res = await fetch(`${apiBase}/media/${mediaModalItem.id}?team=${encodeURIComponent(teamId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err && (err.error || err.message)) || `Save failed (HTTP ${res.status})`);
        }
        await loadMedia();
        closeMediaModal();
      } catch (e: any) {
        setMediaModalError(String(e?.message || e));
      } finally {
        setMediaSaving(false);
      }
    }, [apiBase, teamId, mediaModalItem, mediaEditName, mediaEditAlt, mediaEditTagsInput, loadMedia, closeMediaModal]);

    const deleteMediaModal = useCallback(async () => {
      if (!mediaModalItem) return;
      if (!window.confirm(`Delete "${mediaModalItem.originalName || mediaModalItem.filename}"? This cannot be undone.`)) return;
      setMediaDeleting(true);
      setMediaModalError(null);
      try {
        await deleteMedia(mediaModalItem.id);
        closeMediaModal();
      } catch (e: any) {
        setMediaModalError(String(e?.message || e));
      } finally {
        setMediaDeleting(false);
      }
    }, [mediaModalItem, deleteMedia, closeMediaModal]);

    useEffect(() => {
      setLoading(true);
      Promise.all([loadDrivers(), loadPosts()]).finally(() => setLoading(false));
    }, [loadDrivers, loadPosts]);

    // loadMedia identity changes when mediaPage changes, so this effect both
    // does the initial load and re-fires whenever the user clicks Prev/Next.
    useEffect(() => {
      void loadMedia();
    }, [loadMedia]);

    const connectedDrivers = useMemo(() => drivers.filter((d) => d.connected), [drivers]);
    const disconnectedDrivers = useMemo(() => drivers.filter((d) => !d.connected), [drivers]);

    const togglePlatform = (platform: string) => {
      const driver = drivers.find((d) => d.platform === platform);
      if (!driver?.connected) return;
      setSelectedPlatforms((prev: string[]) =>
        prev.includes(platform) ? prev.filter((x) => x !== platform) : [...prev, platform]
      );
    };

    // Character limit — show strictest of selected platforms
    const charLimit = useMemo(() => {
      if (selectedPlatforms.length === 0) return undefined;
      const limits = selectedPlatforms
        .map((p) => drivers.find((d) => d.platform === p)?.capabilities?.maxLength)
        .filter((l): l is number => l !== undefined);
      return limits.length > 0 ? Math.min(...limits) : undefined;
    }, [selectedPlatforms, drivers]);

    const canSchedule = useMemo(() => {
      return selectedPlatforms.some((p) => drivers.find((d) => d.platform === p)?.capabilities?.canSchedule);
    }, [selectedPlatforms, drivers]);

    const showSuccess = (msg: string) => {
      setSuccess(msg);
      if (successTimeout.current) clearTimeout(successTimeout.current);
      successTimeout.current = setTimeout(() => setSuccess(null), 5000);
    };

    // Save as local draft
    const onSaveDraft = async () => {
      if (!content.trim()) return;
      setSaving(true);
      setError(null);
      try {
        const platforms = selectedPlatforms.length > 0 ? selectedPlatforms : ['draft'];
        const res = await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content,
            platforms,
            status: scheduledAt ? 'scheduled' : 'draft',
            scheduledAt: scheduledAt || undefined,
          }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        setContent('');
        setScheduledAt('');
        setSelectedPlatforms([]);
        setMediaUrl('');
        showSuccess('Draft saved!');
        await loadPosts();
      } catch (e: any) {
        setError(e?.message || 'Failed to save');
      } finally {
        setSaving(false);
      }
    };

    // Publish via unified driver system
    const onPublish = async () => {
      if (!content.trim() || selectedPlatforms.length === 0) return;
      setPublishing(true);
      setError(null);
      setSuccess(null);

      try {
        const res = await fetch(`${apiBase}/publish?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...postizHeaders },
          body: JSON.stringify({
            content,
            platforms: selectedPlatforms,
            scheduledAt: scheduledAt || undefined,
            mediaUrls: mediaUrl ? [mediaUrl] : undefined,
          }),
        });
        const json = await res.json();

        if (json.results) {
          const succeeded = json.results.filter((r: any) => r.success);
          const failed = json.results.filter((r: any) => !r.success);

          if (failed.length > 0 && succeeded.length === 0) {
            throw new Error(failed.map((f: any) => `${f.platform}: ${f.error}`).join('; '));
          }

          const parts: string[] = [];
          if (succeeded.length > 0) {
            parts.push(`${scheduledAt ? 'Scheduled' : 'Published'} to ${succeeded.map((s: any) => s.platform).join(', ')}`);
          }
          if (failed.length > 0) {
            parts.push(`Failed: ${failed.map((f: any) => `${f.platform} (${f.error})`).join(', ')}`);
          }
          showSuccess(parts.join(' · '));
        } else {
          showSuccess(scheduledAt ? 'Scheduled!' : 'Published!');
        }

        // Also save as local record
        await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content,
            platforms: selectedPlatforms,
            status: scheduledAt ? 'scheduled' : 'published',
            scheduledAt: scheduledAt || undefined,
          }),
        }).catch(() => {});

        setContent('');
        setScheduledAt('');
        setSelectedPlatforms([]);
        setMediaUrl('');
        await loadPosts();
      } catch (e: any) {
        setError(e?.message || 'Publish failed');
      } finally {
        setPublishing(false);
      }
    };

    const hasConnected = connectedDrivers.length > 0;
    const hasSelection = selectedPlatforms.length > 0;

    const filteredPosts = useMemo(() => {
      if (filterStatus === 'all') return posts;
      return posts.filter((p) => p.status === filterStatus);
    }, [posts, filterStatus]);

    return h('div', { className: 'space-y-3' },

      // ---- Composer (two-column: compose left, preview right) ----
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-3', style: t.text }, 'Compose'),
        h('div', { style: { display: 'flex', gap: '1rem' } },

          // LEFT — compose pane
          h('div', { style: { flex: 1, minWidth: 0 }, className: 'space-y-3' },

            h('textarea', {
              value: content,
              onChange: (e: any) => setContent(e.target.value),
              placeholder: 'Write your post…',
              rows: 5,
              style: { ...t.input, resize: 'vertical' as const, minHeight: '160px', fontFamily: 'inherit' },
            }),

            // Character count
            charLimit && content.length > 0 && h('div', { style: t.charWarn((content.length / charLimit) * 100) },
              `${content.length} / ${charLimit} characters`,
              content.length > charLimit && ' ⚠ over limit'
            ),
            !charLimit && content.length > 0 && h('div', { className: 'text-xs', style: t.faint }, `${content.length} chars`),

            // Platform selector — connected
            h('div', null,
              h('div', { className: 'text-xs font-medium mb-2', style: t.faint }, 'Publish to'),
              connectedDrivers.length > 0
                ? h('div', { className: 'flex flex-wrap gap-2' },
                    ...connectedDrivers.map((d) =>
                      h('span', {
                        key: d.platform,
                        onClick: () => togglePlatform(d.platform),
                        style: t.pill(selectedPlatforms.includes(d.platform), true),
                        role: 'button',
                        tabIndex: 0,
                        title: `${d.displayName} via ${d.backend}`,
                      },
                        `${d.icon} ${d.label}`,
                        h('span', { style: t.backendBadge(d.backend) }, d.backend),
                      )
                    ),
                    // Show disconnected as disabled
                    ...disconnectedDrivers.map((d) =>
                      h('span', {
                        key: d.platform,
                        style: t.pill(false, false),
                        title: `${d.label} — not connected`,
                      }, `${d.icon} ${d.label}`)
                    ),
                  )
                : h('div', { className: 'flex flex-wrap gap-2' },
                    ...drivers.map((d) =>
                      h('span', { key: d.platform, style: t.pill(false, false), title: 'Not connected' },
                        `${d.icon} ${d.label}`
                      )
                    ),
                    h('div', { className: 'text-xs mt-1', style: t.faint },
                      'No platforms connected. Go to Accounts tab to set up Postiz or add accounts.'
                    ),
                  ),
            ),

            // Media (upload, URL, or library picker)
            h('div', null,
              h('button', {
                type: 'button',
                onClick: () => setShowMedia(!showMedia),
                style: { ...t.btnGhost, padding: '0.3rem 0.55rem', fontSize: '0.8rem' },
              }, showMedia ? '− Media' : '+ Media'),
              showMedia && h('div', { className: 'mt-2 space-y-2' },

                // Upload + URL row
                h('div', { className: 'flex gap-2 items-center' },
                  h('input', {
                    ref: fileInputRef,
                    type: 'file',
                    accept: 'image/*,video/*',
                    multiple: true,
                    style: { display: 'none' },
                    onChange: (e: any) => handleFileUpload(e.target.files),
                  }),
                  h('button', {
                    type: 'button',
                    onClick: () => fileInputRef.current?.click(),
                    style: { ...t.btnGhost, padding: '0.35rem 0.7rem', fontSize: '0.8rem', whiteSpace: 'nowrap' as const },
                    disabled: uploading,
                  }, uploading ? '⏳ Uploading…' : '📁 Upload'),
                  h('button', {
                    type: 'button',
                    onClick: () => { loadMedia(); setShowMediaPicker(!showMediaPicker); },
                    style: { ...t.btnGhost, padding: '0.35rem 0.7rem', fontSize: '0.8rem', whiteSpace: 'nowrap' as const },
                  }, showMediaPicker ? 'Hide Library' : '🖼️ Library'),
                  h('input', {
                    type: 'url',
                    value: mediaUrl,
                    onChange: (e: any) => setMediaUrl(e.target.value),
                    placeholder: '…or paste a URL',
                    style: { ...t.input, flex: 1 },
                  }),
                ),

                // Selected media thumbnails
                selectedMediaIds.length > 0 && h('div', { className: 'flex flex-wrap gap-2' },
                  ...selectedMediaIds.map((id: string) => {
                    const item = mediaLibrary.find((m: any) => m.id === id);
                    if (!item) return null;
                    return h('div', {
                      key: id,
                      style: {
                        position: 'relative' as const, width: '72px', height: '72px',
                        borderRadius: '8px', overflow: 'hidden',
                        border: '2px solid rgba(127,90,240,0.5)',
                      },
                    },
                      item.mimeType?.startsWith('video/')
                        ? h('div', {
                            style: {
                              width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: '1.2rem',
                            },
                          }, '🎥')
                        : h('img', {
                            src: item.thumbnailDataUrl || item.url,
                            style: { width: '100%', height: '100%', objectFit: 'cover' as const },
                          }),
                      h('button', {
                        type: 'button',
                        onClick: () => toggleMediaSelect(id),
                        style: {
                          position: 'absolute' as const, top: '2px', right: '2px',
                          background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                          width: '18px', height: '18px', color: 'white', fontSize: '0.65rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          lineHeight: '1',
                        },
                      }, '✕'),
                    );
                  }),
                ),

                // Media library picker grid
                showMediaPicker && h('div', {
                  style: {
                    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--ck-border-subtle)',
                    borderRadius: '10px', padding: '0.75rem', maxHeight: '260px', overflowY: 'auto' as const,
                  },
                },
                  h('div', { className: 'text-xs font-medium mb-2', style: t.faint },
                    `Media Library (${mediaLibrary.length} items)`
                  ),
                  mediaLibrary.length === 0
                    ? h('div', { className: 'text-xs py-4 text-center', style: t.faint }, 'No media yet. Upload some files!')
                    : h('div', {
                        style: {
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                          gap: '0.5rem',
                        },
                      },
                        ...mediaLibrary.map((item: any) => {
                          const isSelected = selectedMediaIds.includes(item.id);
                          return h('div', {
                            key: item.id,
                            onClick: () => toggleMediaSelect(item.id),
                            style: {
                              position: 'relative' as const, cursor: 'pointer',
                              width: '100%', paddingTop: '100%', borderRadius: '8px',
                              overflow: 'hidden',
                              border: isSelected ? '2px solid rgba(127,90,240,0.7)' : '1px solid var(--ck-border-subtle)',
                              boxShadow: isSelected ? '0 0 8px rgba(127,90,240,0.3)' : 'none',
                            },
                          },
                            item.mimeType?.startsWith('video/')
                              ? h('div', {
                                  style: {
                                    position: 'absolute' as const, inset: '0',
                                    background: 'rgba(0,0,0,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: '1.5rem',
                                  },
                                }, '🎥')
                              : h('img', {
                                  src: item.thumbnailDataUrl || item.url,
                                  style: {
                                    position: 'absolute' as const, inset: '0',
                                    width: '100%', height: '100%', objectFit: 'cover' as const,
                                  },
                                }),
                            isSelected && h('div', {
                              style: {
                                position: 'absolute' as const, top: '4px', right: '4px',
                                background: 'rgba(127,90,240,0.85)', borderRadius: '50%',
                                width: '20px', height: '20px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: '0.7rem', fontWeight: '700',
                              },
                            }, '✓'),
                            h('button', {
                              type: 'button',
                              onClick: (e: any) => { e.stopPropagation(); deleteMedia(item.id); },
                              style: {
                                position: 'absolute' as const, bottom: '4px', right: '4px',
                                background: 'rgba(220,38,38,0.7)', border: 'none', borderRadius: '50%',
                                width: '18px', height: '18px', color: 'white', fontSize: '0.6rem',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: '0.6', lineHeight: '1',
                              },
                              title: 'Delete from library',
                            }, '🗑'),
                            h('div', {
                              style: {
                                position: 'absolute' as const, bottom: '0', left: '0', right: '0',
                                background: 'rgba(0,0,0,0.6)', padding: '2px 4px',
                                fontSize: '0.55rem', color: 'rgba(255,255,255,0.8)',
                                whiteSpace: 'nowrap' as const, overflow: 'hidden',
                                textOverflow: 'ellipsis' as const,
                              },
                            }, item.filename),
                          );
                        }),
                      ),
                ),
              ),
            ),

            // Schedule (only if any selected platform supports it)
            (canSchedule || !hasSelection) && h('div', { className: 'grid grid-cols-1 gap-2 sm:grid-cols-2' },
              h('div', null,
                h('div', { className: 'text-xs font-medium mb-1', style: t.faint },
                  canSchedule ? 'Schedule (optional)' : 'Schedule (connect Postiz for scheduling)'
                ),
                h('input', {
                  type: 'datetime-local',
                  value: scheduledAt,
                  onChange: (e: any) => setScheduledAt(e.target.value),
                  style: { ...t.input, opacity: canSchedule || !hasSelection ? 1 : 0.5 },
                  disabled: hasSelection && !canSchedule,
                }),
              ),
            ),

            // Actions
            h('div', { className: 'flex flex-wrap gap-2 items-center' },
              h('button', {
                type: 'button',
                onClick: () => void onSaveDraft(),
                style: { ...t.btnGhost, opacity: saving ? 0.7 : 1 },
                disabled: saving || !content.trim(),
              }, saving ? 'Saving…' : 'Save draft'),

              hasConnected && hasSelection && h('button', {
                type: 'button',
                onClick: () => void onPublish(),
                style: { ...t.btnPublish, opacity: publishing ? 0.7 : 1 },
                disabled: publishing || !content.trim(),
              }, publishing ? 'Publishing…' : (scheduledAt ? '⏱ Schedule' : '📤 Publish now')),
            ),

            error && h('div', { className: 'text-xs', style: { color: 'rgba(248,113,113,0.95)' } }, error),
            success && h('div', { className: 'text-xs', style: { color: 'rgba(74,222,128,0.9)' } }, success),
          ),

          // RIGHT — social-post-style preview
          h('div', {
            style: {
              width: '380px', flexShrink: 0,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--ck-border-subtle)',
              borderRadius: '16px', padding: '1.25rem',
              display: 'flex', flexDirection: 'column' as const,
              alignSelf: 'flex-start',
            },
          },
            h('div', {
              style: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--ck-text-secondary)', marginBottom: '1rem' },
            }, 'Post Preview'),

            // Social post card
            h('div', {
              style: {
                background: 'rgba(22,22,28,0.95)', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
              },
            },
              // Post header (avatar + name + handle)
              h('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: '0.65rem',
                  padding: '0.85rem 1rem 0',
                },
              },
                // Avatar circle
                h('div', {
                  style: {
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: 'rgba(127,90,240,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', color: 'rgba(127,90,240,0.9)',
                    flexShrink: 0,
                  },
                }, '👤'),
                h('div', null,
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.3rem' } },
                    h('span', {
                      style: { fontWeight: 700, fontSize: '0.9rem', color: 'var(--ck-text-primary)' },
                    }, 'Your Brand'),
                    h('span', { style: { color: 'rgba(99,179,237,0.9)', fontSize: '0.85rem' } }, '✓'),
                  ),
                  h('div', {
                    style: { fontSize: '0.75rem', color: 'var(--ck-text-tertiary)' },
                  }, scheduledAt
                    ? `Scheduled · ${new Date(scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : 'Just now'),
                ),
              ),

              // Post body
              h('div', { style: { padding: '0.65rem 1rem 0.75rem' } },
                content.trim()
                  ? h('div', {
                      style: {
                        whiteSpace: 'pre-wrap' as const, fontSize: '0.9rem',
                        color: 'var(--ck-text-primary)', lineHeight: '1.5',
                        maxHeight: '260px', overflowY: 'auto' as const,
                        wordBreak: 'break-word' as const,
                      },
                    }, content)
                  : h('div', {
                      style: {
                        color: 'var(--ck-text-tertiary)', fontSize: '0.85rem',
                        fontStyle: 'italic' as const, padding: '1.5rem 0',
                        textAlign: 'center' as const,
                      },
                    }, 'Start writing to see a preview'),
              ),

              // Media preview
              (selectedMediaIds.length > 0 || (mediaUrl && showMedia)) && h('div', {
                style: { padding: '0 0 0' },
              },
                ...selectedMediaIds.map((id: string) => {
                  const item = mediaLibrary.find((m: any) => m.id === id);
                  if (!item) return null;
                  return item.mimeType?.startsWith('video/')
                    ? h('div', {
                        key: id,
                        style: {
                          background: 'rgba(0,0,0,0.4)',
                          padding: '1.5rem', textAlign: 'center' as const,
                          color: 'var(--ck-text-secondary)', fontSize: '0.85rem',
                        },
                      }, `\ud83c\udfa5 ${item.filename}`)
                    : h('img', {
                        key: id,
                        src: item.thumbnailDataUrl || item.url,
                        style: { width: '100%', display: 'block' },
                      });
                }),
                mediaUrl && showMedia && h('img', {
                  src: mediaUrl,
                  style: { width: '100%', display: 'block' },
                  onError: (e: any) => { e.target.style.display = 'none'; },
                }),
              ),

              // Engagement bar (fake social actions)
              h('div', {
                style: {
                  display: 'flex', justifyContent: 'space-around',
                  padding: '0.6rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '0.8rem', color: 'var(--ck-text-tertiary)',
                },
              },
                h('span', null, '❤\ufe0f 0'),
                h('span', null, '\ud83d\udcac 0'),
                h('span', null, '\ud83d\udd01 0'),
                h('span', null, '\ud83d\udcca 0'),
              ),
            ),

            // Platform pills below card
            selectedPlatforms.length > 0 && h('div', {
              style: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.35rem', marginTop: '0.75rem' },
            },
              ...selectedPlatforms.map((pl) => {
                const drv = drivers.find((d) => d.platform === pl);
                return h('span', {
                  key: pl,
                  style: {
                    background: 'rgba(127,90,240,0.12)', border: '1px solid rgba(127,90,240,0.25)',
                    borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: '0.7rem',
                    color: 'var(--ck-text-secondary)',
                  },
                }, drv ? `${drv.icon} ${drv.label}` : pl);
              }),
            ),

            // Character limit bar
            charLimit && content.length > 0 && h('div', { style: { marginTop: '0.75rem' } },
              h('div', { style: { height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
                h('div', {
                  style: {
                    height: '100%', borderRadius: '2px',
                    width: `${Math.min((content.length / charLimit) * 100, 100)}%`,
                    background: content.length > charLimit ? 'rgba(248,113,113,0.8)'
                      : content.length > charLimit * 0.9 ? 'rgba(251,191,36,0.8)'
                      : 'rgba(127,90,240,0.6)',
                    transition: 'width 0.2s, background 0.2s',
                  },
                }),
              ),
              h('div', {
                style: {
                  fontSize: '0.7rem', marginTop: '0.2rem', textAlign: 'right' as const,
                  color: content.length > charLimit ? 'rgba(248,113,113,0.9)' : 'var(--ck-text-tertiary)',
                },
              }, `${content.length} / ${charLimit}`),
            ),
          ),
        ),
      ),

      // ---- Media library grid ----
      (() => {
        const totalPages = Math.max(1, Math.ceil(mediaTotal / MEDIA_PAGE_SIZE));
        const currentPageDisplay = mediaPage + 1;
        const startIdx = mediaTotal === 0 ? 0 : mediaPage * MEDIA_PAGE_SIZE + 1;
        const endIdx = Math.min(mediaTotal, mediaPage * MEDIA_PAGE_SIZE + mediaLibrary.length);
        return h('div', { style: t.card },
          h('div', { className: 'flex items-center justify-between mb-3' },
            h('div', { className: 'text-sm font-medium', style: t.text },
              mediaTotal > 0 ? `Media (${startIdx}-${endIdx} of ${mediaTotal})` : `Media (${mediaTotal})`
            ),
            h('div', { className: 'flex items-center gap-2' },
              h('button', {
                type: 'button',
                onClick: () => fileInputRef.current?.click(),
                style: { ...t.btnGhost, padding: '0.3rem 0.6rem', fontSize: '0.75rem' },
              }, '+ Upload'),
              h('button', {
                type: 'button',
                onClick: () => void loadMedia(),
                title: 'Refresh',
                style: { ...t.btnGhost, padding: '0.3rem 0.6rem', fontSize: '0.75rem' },
              }, '↻'),
            ),
          ),
        loading
          ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'Loading…')
          : mediaLibrary.length === 0
            ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'No media yet. Upload images or videos above.')
            : h('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '0.65rem',
                },
              },
              ...mediaLibrary.map((item: any) => {
                const isVideo = String(item.mimeType || '').startsWith('video/');
                // The API returns a base64 data URL on item.thumbnailDataUrl for
                // both images and (poster-frame) videos. item.url points at the
                // /file endpoint which returns a JSON envelope, not raw bytes,
                // so it can't be used directly as <img src>.
                const thumb = String(item.thumbnailDataUrl || item.thumbnailUrl || '');
                return h('div', {
                  key: item.id,
                  onClick: () => void openMediaModal(item),
                  style: {
                    position: 'relative' as const,
                    aspectRatio: '1',
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid var(--ck-border-subtle)',
                    borderRadius: '10px',
                    overflow: 'hidden' as const,
                    cursor: 'pointer' as const,
                    display: 'flex' as const,
                    alignItems: 'center' as const,
                    justifyContent: 'center' as const,
                  },
                },
                  thumb
                    ? h('img', {
                        src: thumb,
                        alt: item.originalName || '',
                        style: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
                      })
                    : h('div', {
                        style: { color: 'var(--ck-text-tertiary)', fontSize: '0.7rem', textAlign: 'center' as const, padding: '0.5rem' },
                      }, isVideo ? '🎬' : '🖼'),
                  isVideo && h('div', {
                    style: {
                      position: 'absolute' as const,
                      inset: 0,
                      display: 'flex' as const,
                      alignItems: 'center' as const,
                      justifyContent: 'center' as const,
                      background: 'rgba(0,0,0,0.25)',
                      color: 'white',
                      fontSize: '2rem',
                      pointerEvents: 'none' as const,
                    },
                  }, '▶'),
                  h('div', {
                    style: {
                      position: 'absolute' as const,
                      left: 0, right: 0, bottom: 0,
                      padding: '0.35rem 0.5rem',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
                      color: 'white',
                      fontSize: '0.7rem',
                      whiteSpace: 'nowrap' as const,
                      overflow: 'hidden' as const,
                      textOverflow: 'ellipsis',
                    },
                  }, item.originalName || item.filename),
                );
              })
            ),
          // Pager
          totalPages > 1 && h('div', {
            style: {
              display: 'flex' as const,
              alignItems: 'center' as const,
              justifyContent: 'space-between' as const,
              gap: '0.5rem',
              marginTop: '0.85rem',
              paddingTop: '0.65rem',
              borderTop: '1px solid var(--ck-border-subtle)',
            },
          },
            h('button', {
              type: 'button',
              onClick: () => setMediaPage((p: number) => Math.max(0, p - 1)),
              disabled: mediaPage === 0,
              style: {
                ...t.btnGhost,
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                opacity: mediaPage === 0 ? 0.4 : 1,
                cursor: mediaPage === 0 ? 'not-allowed' as const : 'pointer' as const,
              },
            }, '← Prev'),
            h('span', {
              style: { fontSize: '0.75rem', color: 'var(--ck-text-secondary)' },
            }, `Page ${currentPageDisplay} of ${totalPages}`),
            h('button', {
              type: 'button',
              onClick: () => setMediaPage((p: number) => p + 1),
              disabled: !mediaHasMore,
              style: {
                ...t.btnGhost,
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                opacity: !mediaHasMore ? 0.4 : 1,
                cursor: !mediaHasMore ? 'not-allowed' as const : 'pointer' as const,
              },
            }, 'Next →'),
          ),
        );
      })(),

      // ---- Media detail modal — dashboard layout (topbar + two-column),
      // kitchen design tokens. ----
      mediaModalItem && h('div', { style: t.modalOverlay, onClick: closeMediaModal },
        h('div', { style: t.modalCard, onClick: (e: any) => e.stopPropagation() },
          h('button', { type: 'button', onClick: closeMediaModal, style: t.modalCloseBtn, 'aria-label': 'Close' }, '×'),
          // Topbar: title left, "Details" label right
          h('div', { style: t.modalTopbar },
            h('div', { style: t.modalTopbarTitle }, 'Media Asset'),
            h('div', { style: t.modalTopbarLabel }, 'Details'),
          ),
          // Two columns
          h('div', { style: t.modalTwoCol },
            // LEFT — preview
            h('div', null,
              h('div', {
                style: {
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--ck-border-subtle)',
                  borderRadius: '12px',
                  padding: '0.5rem',
                  minHeight: '280px',
                  display: 'flex' as const,
                  alignItems: 'center' as const,
                  justifyContent: 'center' as const,
                },
              },
                !mediaModalUrl
                  ? h('div', { style: { color: 'var(--ck-text-tertiary)', fontSize: '0.85rem' } }, 'Loading preview…')
                  : String(mediaModalItem.mimeType || '').startsWith('video/')
                    ? h('video', {
                        src: mediaModalUrl,
                        controls: true,
                        style: { maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px' },
                      })
                    : h('img', {
                        src: mediaModalUrl,
                        alt: mediaModalItem.alt || mediaModalItem.originalName || '',
                        style: { maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px', objectFit: 'contain' as const, display: 'block' },
                      }),
              ),
              mediaModalItem.prompt && h('div', { style: { marginTop: '12px' } },
                h('div', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.35rem' } }, 'Generation prompt'),
                h('div', {
                  style: {
                    ...t.input,
                    fontSize: '0.8rem',
                    color: 'var(--ck-text-secondary)',
                    whiteSpace: 'pre-wrap' as const,
                    maxHeight: '8rem',
                    overflow: 'auto' as const,
                    cursor: 'default' as const,
                  },
                }, String(mediaModalItem.prompt)),
              ),
            ),
            // RIGHT — meta + edit form
            h('div', null,
              // Heading: filename
              h('h2', {
                style: {
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--ck-text-primary)',
                  marginTop: 0,
                  marginBottom: '0.5rem',
                  wordBreak: 'break-word' as const,
                },
              }, mediaModalItem.originalName || mediaModalItem.filename || 'Untitled media'),
              // Meta line: type · size · dimensions
              h('div', {
                style: {
                  fontSize: '0.75rem',
                  color: 'var(--ck-text-tertiary)',
                  display: 'flex' as const,
                  flexWrap: 'wrap' as const,
                  gap: '0.4rem',
                  marginBottom: '1rem',
                },
              },
                h('span', null, mediaModalItem.mimeType || 'Unknown type'),
                mediaModalItem.size && h('span', null, `· ${(Number(mediaModalItem.size) / 1024 / 1024).toFixed(2)} MB`),
                mediaModalItem.width && mediaModalItem.height && h('span', null, `· ${mediaModalItem.width}×${mediaModalItem.height}`),
                mediaModalItem.createdAt && h('span', null, `· Created ${new Date(mediaModalItem.createdAt).toLocaleDateString()}`),
              ),
              // Section: Edit asset
              h('div', {
                style: {
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--ck-border-subtle)',
                  borderRadius: '12px',
                  padding: '14px',
                },
              },
                h('div', {
                  style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.65rem' },
                }, 'Edit asset'),
                h('div', { style: { display: 'grid', gap: '0.6rem' } },
                  h('label', { style: { display: 'block' } },
                    h('span', { style: { display: 'block', fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.25rem' } }, 'Name'),
                    h('input', {
                      type: 'text',
                      value: mediaEditName,
                      onChange: (e: any) => setMediaEditName(e.target.value),
                      style: t.input,
                    }),
                  ),
                  h('label', { style: { display: 'block' } },
                    h('span', { style: { display: 'block', fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.25rem' } }, 'Alt text'),
                    h('input', {
                      type: 'text',
                      value: mediaEditAlt,
                      onChange: (e: any) => setMediaEditAlt(e.target.value),
                      placeholder: 'Accessible description',
                      style: t.input,
                    }),
                  ),
                  h('label', { style: { display: 'block' } },
                    h('span', { style: { display: 'block', fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.25rem' } }, 'Tags'),
                    h('input', {
                      type: 'text',
                      value: mediaEditTagsInput,
                      onChange: (e: any) => setMediaEditTagsInput(e.target.value),
                      placeholder: 'promo, haircut, spring',
                      style: t.input,
                    }),
                  ),
                  mediaModalError && h('div', {
                    style: { color: 'rgba(248,113,113,0.95)', fontSize: '0.8rem' },
                  }, mediaModalError),
                  h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'space-between', marginTop: '0.5rem', flexWrap: 'wrap' as const } },
                    h('button', {
                      type: 'button',
                      onClick: () => void saveMediaModal(),
                      disabled: mediaSaving || mediaDeleting,
                      style: { ...t.btnPrimary, opacity: (mediaSaving || mediaDeleting) ? 0.6 : 1 },
                    }, mediaSaving ? 'Saving…' : 'Save changes'),
                    h('button', {
                      type: 'button',
                      onClick: () => void deleteMediaModal(),
                      disabled: mediaSaving || mediaDeleting,
                      style: {
                        ...t.btnGhost,
                        color: 'rgba(248,113,113,0.9)',
                        borderColor: 'rgba(248,113,113,0.3)',
                        opacity: (mediaSaving || mediaDeleting) ? 0.6 : 1,
                      },
                    }, mediaDeleting ? 'Deleting…' : 'Delete asset'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
