/**
 * Content Library Tab — compose, save drafts, publish via Postiz
 */
(function () {
  const R = (window as any).React;
  if (!R) return;
  const h = R.createElement;
  const useEffect = R.useEffect as typeof R.useEffect;
  const useMemo = R.useMemo as typeof R.useMemo;
  const useState = R.useState as typeof R.useState;
  const useCallback = R.useCallback as typeof R.useCallback;

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
    pill: (active: boolean) => ({
      background: active ? 'rgba(99,179,237,0.16)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? 'rgba(99,179,237,0.45)' : 'var(--ck-border-subtle)'}`,
      borderRadius: '999px',
      padding: '0.25rem 0.55rem',
      fontSize: '0.8rem',
      color: active ? 'rgba(210,235,255,0.95)' : 'var(--ck-text-secondary)',
      cursor: 'pointer',
      userSelect: 'none' as const,
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

  type Provider = {
    id: string;
    type: string;
    platform: string;
    displayName: string;
    isActive: boolean;
    capabilities: string[];
    meta?: Record<string, unknown>;
  };

  function ContentLibrary(props: any) {
    const teamId = String(props?.teamId || 'default');
    const apiBase = useMemo(() => `/api/plugins/marketing`, []);

    const [posts, setPosts] = useState<Post[]>([]);
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [content, setContent] = useState('');
    const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
    const [scheduledAt, setScheduledAt] = useState('');

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

    const loadPosts = useCallback(async () => {
      try {
        const res = await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}&limit=25`);
        const json = await res.json();
        setPosts(Array.isArray(json.data) ? json.data : []);
      } catch { /* ignore */ }
    }, [apiBase, teamId]);

    const loadProviders = useCallback(async () => {
      try {
        const res = await fetch(`${apiBase}/providers?team=${encodeURIComponent(teamId)}`, { headers: postizHeaders });
        const json = await res.json();
        const detected = Array.isArray(json.providers) ? json.providers : [];
        setProviders(detected);
      } catch { /* ignore */ }
    }, [apiBase, teamId, postizHeaders]);

    useEffect(() => {
      setLoading(true);
      Promise.all([loadPosts(), loadProviders()]).finally(() => setLoading(false));
    }, [loadPosts, loadProviders]);

    const toggleProvider = (id: string) => {
      setSelectedProviders((prev: string[]) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    };

    // Save as local draft
    const onSaveDraft = async () => {
      if (!content.trim()) return;
      setSaving(true);
      setError(null);
      try {
        const platforms = selectedProviders
          .map((id) => providers.find((p) => p.id === id)?.platform)
          .filter(Boolean);
        const res = await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content,
            platforms: platforms.length > 0 ? platforms : ['draft'],
            status: scheduledAt ? 'scheduled' : 'draft',
            scheduledAt: scheduledAt || undefined,
          }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        setContent('');
        setScheduledAt('');
        setSelectedProviders([]);
        await loadPosts();
      } catch (e: any) {
        setError(e?.message || 'Failed to save');
      } finally {
        setSaving(false);
      }
    };

    // Publish via Postiz
    const onPublish = async () => {
      if (!content.trim() || selectedProviders.length === 0) return;
      setPublishing(true);
      setError(null);
      setSuccess(null);

      const postizProviders = selectedProviders.filter((id) => id.startsWith('postiz:'));
      const gatewayProviders = selectedProviders.filter((id) => id.startsWith('gateway:'));

      try {
        // Publish to Postiz
        if (postizProviders.length > 0) {
          const integrationIds = postizProviders.map((id) => {
            const prov = providers.find((p) => p.id === id);
            return prov?.meta?.postizId as string;
          }).filter(Boolean);

          const res = await fetch(`${apiBase}/publish?team=${encodeURIComponent(teamId)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...postizHeaders },
            body: JSON.stringify({
              content,
              integrationIds,
              scheduledAt: scheduledAt || undefined,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.message || `Postiz publish failed (${res.status})`);
          }
        }

        // Gateway channels — these would use the OpenClaw message tool
        // For now, note them as needing manual posting
        if (gatewayProviders.length > 0 && postizProviders.length === 0) {
          setSuccess('Saved! Gateway posting requires OpenClaw agent — use the workflow or ask your assistant to post.');
        } else {
          setSuccess(scheduledAt ? 'Scheduled via Postiz!' : 'Published via Postiz!');
        }

        setContent('');
        setScheduledAt('');
        setSelectedProviders([]);
        await loadPosts();
      } catch (e: any) {
        setError(e?.message || 'Publish failed');
      } finally {
        setPublishing(false);
      }
    };

    const postizAvailable = providers.some((p) => p.type === 'postiz');
    const hasSelection = selectedProviders.length > 0;

    return h('div', { className: 'space-y-3' },

      // ---- Composer ----
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-3', style: t.text }, 'Compose'),
        h('div', { className: 'space-y-3' },

          h('textarea', {
            value: content,
            onChange: (e: any) => setContent(e.target.value),
            placeholder: 'Write your post…',
            rows: 5,
            style: { ...t.input, resize: 'vertical' as const, minHeight: '110px' },
          }),

          // Provider selector
          providers.length > 0 && h('div', null,
            h('div', { className: 'text-xs font-medium mb-2', style: t.faint }, 'Publish to'),
            h('div', { className: 'flex flex-wrap gap-2' },
              ...providers.filter((p) => p.isActive).map((p) =>
                h('span', {
                  key: p.id,
                  onClick: () => toggleProvider(p.id),
                  style: t.pill(selectedProviders.includes(p.id)),
                  role: 'button',
                  tabIndex: 0,
                },
                  `${p.displayName}`
                )
              ),
            ),
          ),

          // No providers hint
          providers.length === 0 && !loading && h('div', { className: 'text-xs', style: t.faint },
            'No publishing targets detected. Go to Accounts tab to connect Postiz or add accounts.'
          ),

          // Schedule
          h('div', { className: 'grid grid-cols-1 gap-2 sm:grid-cols-2' },
            h('div', null,
              h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Schedule (optional)'),
              h('input', {
                type: 'datetime-local',
                value: scheduledAt,
                onChange: (e: any) => setScheduledAt(e.target.value),
                style: t.input,
              }),
            ),
            h('div', { className: 'flex items-end' },
              h('div', { className: 'text-xs', style: t.faint },
                content.length > 0 ? `${content.length} chars` : ''
              ),
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

            postizAvailable && hasSelection && h('button', {
              type: 'button',
              onClick: () => void onPublish(),
              style: { ...t.btnPublish, opacity: publishing ? 0.7 : 1 },
              disabled: publishing || !content.trim(),
            }, publishing ? 'Publishing…' : (scheduledAt ? '⏱ Schedule' : '📤 Publish')),

            !postizAvailable && hasSelection && h('div', { className: 'text-xs', style: t.faint },
              'Connect Postiz on Accounts tab to publish directly.'
            ),
          ),

          error && h('div', { className: 'text-xs', style: { color: 'rgba(248,113,113,0.95)' } }, error),
          success && h('div', { className: 'text-xs', style: { color: 'rgba(74,222,128,0.9)' } }, success),
        ),
      ),

      // ---- Posts list ----
      h('div', { style: t.card },
        h('div', { className: 'flex items-center justify-between mb-2' },
          h('div', { className: 'text-sm font-medium', style: t.text }, 'Posts'),
          h('button', { type: 'button', onClick: () => void loadPosts(), style: t.btnGhost, className: 'text-xs' }, '↻'),
        ),
        loading
          ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'Loading…')
          : posts.length === 0
            ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'No posts yet.')
            : h('div', { className: 'space-y-2' },
              ...posts.map((p) =>
                h('div', { key: p.id, style: { ...t.card, padding: '0.75rem' } },
                  h('div', { className: 'flex items-center justify-between gap-2' },
                    h('div', { className: 'flex items-center gap-2' },
                      h('span', { style: t.statusBadge(p.status) }, p.status),
                      h('span', { className: 'text-xs', style: t.faint }, new Date(p.createdAt).toLocaleString()),
                    ),
                    p.scheduledAt && h('div', { className: 'text-xs', style: t.muted }, `⏱ ${new Date(p.scheduledAt).toLocaleString()}`),
                  ),
                  h('div', { className: 'mt-2 whitespace-pre-wrap text-sm', style: t.text }, p.content),
                  p.platforms?.length > 0 && h('div', { className: 'mt-2 flex flex-wrap gap-1' },
                    ...p.platforms.map((pl) => h('span', { key: pl, style: t.pill(true) }, pl)),
                  ),
                )
              )
            ),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
