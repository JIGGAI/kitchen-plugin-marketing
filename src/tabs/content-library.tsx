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

    useEffect(() => {
      setLoading(true);
      Promise.all([loadDrivers(), loadPosts()]).finally(() => setLoading(false));
    }, [loadDrivers, loadPosts]);

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

            // Media URL (collapsible)
            h('div', null,
              h('button', {
                type: 'button',
                onClick: () => setShowMedia(!showMedia),
                style: { ...t.btnGhost, padding: '0.3rem 0.55rem', fontSize: '0.8rem' },
              }, showMedia ? '− Media' : '+ Media'),
              showMedia && h('div', { className: 'mt-2' },
                h('input', {
                  type: 'url',
                  value: mediaUrl,
                  onChange: (e: any) => setMediaUrl(e.target.value),
                  placeholder: 'Paste image or video URL…',
                  style: t.input,
                }),
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

          // RIGHT — live preview pane
          h('div', {
            style: {
              width: '320px', flexShrink: 0,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--ck-border-subtle)',
              borderRadius: '10px', padding: '1rem',
              display: 'flex', flexDirection: 'column' as const,
              alignSelf: 'flex-start',
            },
          },
            h('div', { className: 'text-sm font-medium mb-3', style: t.text }, 'Post Preview'),

            // Selected platforms
            selectedPlatforms.length > 0 && h('div', { className: 'flex flex-wrap gap-1 mb-3' },
              ...selectedPlatforms.map((pl) => {
                const drv = drivers.find((d) => d.platform === pl);
                return h('span', {
                  key: pl,
                  style: {
                    background: 'rgba(127,90,240,0.15)', border: '1px solid rgba(127,90,240,0.3)',
                    borderRadius: '999px', padding: '0.12rem 0.45rem', fontSize: '0.72rem',
                    color: 'var(--ck-text-secondary)',
                  },
                }, drv ? `${drv.icon} ${drv.label}` : pl);
              }),
            ),

            // Scheduling info
            scheduledAt && h('div', {
              className: 'text-xs mb-3',
              style: { color: 'rgba(251,191,36,0.85)' },
            }, `⏱ Scheduled: ${new Date(scheduledAt).toLocaleString()}`),

            // Content preview
            content.trim()
              ? h('div', {
                  style: {
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ck-border-subtle)',
                    borderRadius: '10px', padding: '0.85rem',
                    whiteSpace: 'pre-wrap' as const, fontSize: '0.85rem',
                    color: 'var(--ck-text-primary)', lineHeight: '1.55',
                    maxHeight: '300px', overflowY: 'auto' as const,
                    wordBreak: 'break-word' as const,
                  },
                }, content)
              : h('div', {
                  style: {
                    color: 'var(--ck-text-tertiary)', fontSize: '0.85rem',
                    fontStyle: 'italic' as const, padding: '2rem 0.5rem',
                    textAlign: 'center' as const,
                  },
                }, 'Start writing to see a preview'),

            // Media preview
            mediaUrl && showMedia && h('div', { className: 'mt-3' },
              h('img', {
                src: mediaUrl,
                style: {
                  maxWidth: '100%', borderRadius: '8px',
                  border: '1px solid var(--ck-border-subtle)',
                },
                onError: (e: any) => { e.target.style.display = 'none'; },
              }),
            ),

            // Character limit bar
            charLimit && content.length > 0 && h('div', { className: 'mt-3' },
              h('div', { style: { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
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
                className: 'text-xs mt-1',
                style: {
                  color: content.length > charLimit ? 'rgba(248,113,113,0.9)' : 'var(--ck-text-tertiary)',
                  textAlign: 'right' as const,
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
