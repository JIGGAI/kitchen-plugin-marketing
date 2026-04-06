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
        const res = await fetch(`${apiBase}/media?team=${encodeURIComponent(teamId)}&limit=100`);
        const json = await res.json();
        setMediaLibrary(Array.isArray(json.data) ? json.data : []);
      } catch { /* ignore */ }
    }, [apiBase, teamId]);

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

    useEffect(() => {
      setLoading(true);
      Promise.all([loadDrivers(), loadPosts(), loadMedia()]).finally(() => setLoading(false));
    }, [loadDrivers, loadPosts, loadMedia]);

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

      // ---- Posts list ----
      h('div', { style: t.card },
        h('div', { className: 'flex items-center justify-between mb-3' },
          h('div', { className: 'text-sm font-medium', style: t.text }, 'Posts'),
          h('div', { className: 'flex items-center gap-2' },
            ...['all', 'draft', 'scheduled', 'published', 'failed'].map((s) =>
              h('button', {
                key: s,
                type: 'button',
                onClick: () => setFilterStatus(s),
                style: {
                  ...t.btnGhost,
                  padding: '0.2rem 0.45rem',
                  fontSize: '0.7rem',
                  background: filterStatus === s ? 'rgba(99,179,237,0.12)' : undefined,
                  borderColor: filterStatus === s ? 'rgba(99,179,237,0.35)' : undefined,
                },
              }, s)
            ),
            h('button', { type: 'button', onClick: () => void loadPosts(), style: { ...t.btnGhost, padding: '0.2rem 0.45rem', fontSize: '0.7rem' } }, '↻'),
          ),
        ),
        loading
          ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'Loading…')
          : filteredPosts.length === 0
            ? h('div', { className: 'py-6 text-center text-sm', style: t.faint },
                filterStatus === 'all' ? 'No posts yet. Compose your first post above!' : `No ${filterStatus} posts.`
              )
            : h('div', { className: 'space-y-2' },
              ...filteredPosts.map((p) =>
                h('div', { key: p.id, style: { ...t.card, padding: '0.75rem' } },
                  h('div', { className: 'flex items-center justify-between gap-2' },
                    h('div', { className: 'flex items-center gap-2' },
                      h('span', { style: t.statusBadge(p.status) }, p.status),
                      h('span', { className: 'text-xs', style: t.faint }, new Date(p.createdAt).toLocaleString()),
                    ),
                    p.scheduledAt && h('div', { className: 'text-xs', style: t.muted }, `⏱ ${new Date(p.scheduledAt).toLocaleString()}`),
                  ),
                  h('div', {
                    className: 'mt-2 whitespace-pre-wrap text-sm',
                    style: { ...t.text, maxHeight: '120px', overflow: 'hidden', textOverflow: 'ellipsis' },
                  }, p.content),
                  p.platforms?.length > 0 && h('div', { className: 'mt-2 flex flex-wrap gap-1' },
                    ...p.platforms.map((pl) => {
                      const driver = drivers.find((d) => d.platform === pl);
                      return h('span', { key: pl, style: t.pill(true, true) },
                        driver ? `${driver.icon} ${pl}` : pl
                      );
                    }),
                  ),
                )
              )
            ),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
