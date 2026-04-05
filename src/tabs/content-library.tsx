/**
 * Content Library Tab — self-registering browser bundle
 */
(function () {
  const R = (window as any).React;
  if (!R) return;
  const h = R.createElement;
  const useEffect = R.useEffect as typeof R.useEffect;
  const useMemo = R.useMemo as typeof R.useMemo;
  const useState = R.useState as typeof R.useState;

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
  };

  type Post = {
    id: string;
    content: string;
    platforms: string[];
    status: string;
    scheduledAt?: string;
    createdAt: string;
  };

  function ContentLibrary(props: any) {
    const teamId = String(props?.teamId || 'default');

    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [content, setContent] = useState('');
    const [platforms, setPlatforms] = useState<string[]>(['twitter']);
    const [scheduledAt, setScheduledAt] = useState<string>('');

    const status = useMemo(() => (scheduledAt ? 'scheduled' : 'draft'), [scheduledAt]);

    const apiBase = useMemo(() => `/api/plugins/marketing`, []);

    const refresh = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}&limit=25&offset=0`);
        const json = await res.json();
        setPosts(Array.isArray(json.data) ? json.data : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load posts');
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId]);

    const togglePlatform = (p: string) => {
      setPlatforms((prev: string[]) => {
        if (prev.includes(p)) return prev.filter((x) => x !== p);
        return [...prev, p];
      });
    };

    const onCreate = async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              content,
              platforms,
              status,
              scheduledAt: scheduledAt || undefined,
            }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.message || `Create failed (${res.status})`);
        }
        setContent('');
        setScheduledAt('');
        await refresh();
      } catch (e: any) {
        setError(e?.message || 'Failed to create post');
      } finally {
        setSaving(false);
      }
    };

    return h('div', { className: 'space-y-3' },
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-3', style: t.text }, 'New Post'),
        h('div', { className: 'space-y-2' },
          h('textarea', {
            value: content,
            onChange: (e: any) => setContent(e.target.value),
            placeholder: 'Write your post…',
            rows: 5,
            style: { ...t.input, resize: 'vertical' as const, minHeight: '110px' },
          }),

          h('div', { className: 'flex flex-wrap gap-2 items-center' },
            h('div', { className: 'text-xs font-medium', style: t.faint }, 'Platforms'),
            ['twitter', 'instagram', 'linkedin'].map((p) =>
              h('span', {
                key: p,
                onClick: () => togglePlatform(p),
                style: t.pill(platforms.includes(p)),
                role: 'button',
                tabIndex: 0,
              }, p)
            ),
          ),

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
            h('div', null,
              h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Status'),
              h('div', { className: 'text-sm', style: t.muted }, status),
            ),
          ),

          h('div', { className: 'flex flex-wrap gap-2 items-center' },
            h('button', {
              type: 'button',
              onClick: () => void refresh(),
              style: t.btnGhost,
              disabled: saving,
            }, loading ? 'Refreshing…' : 'Refresh'),
            h('button', {
              type: 'button',
              onClick: () => void onCreate(),
              style: { ...t.btnPrimary, opacity: saving ? 0.7 : 1 },
              disabled: saving,
            }, saving ? 'Saving…' : 'Save draft'),
            h('div', { className: 'text-xs', style: t.faint }, 'Media embedding + templates next.'),
          ),

          error ? h('div', {
            className: 'text-sm mt-2',
            style: { color: 'rgba(248,113,113,0.95)' },
          }, error) : null,
        ),
      ),

      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Posts'),
        loading
          ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'Loading…')
          : posts.length === 0
            ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'No posts yet.')
            : h('div', { className: 'space-y-2' },
              ...posts.map((p) =>
                h('div', { key: p.id, style: { ...t.card, padding: '0.75rem' } },
                  h('div', { className: 'flex items-center justify-between gap-2' },
                    h('div', { className: 'text-xs font-medium', style: t.faint }, new Date(p.createdAt).toLocaleString()),
                    h('div', { className: 'text-xs', style: t.muted }, `${p.status}${p.scheduledAt ? ` · ${p.scheduledAt}` : ''}`),
                  ),
                  h('div', { className: 'mt-2 whitespace-pre-wrap text-sm', style: t.text }, p.content),
                  h('div', { className: 'mt-2 flex flex-wrap gap-2' },
                    ...(p.platforms || []).map((pl) => h('span', { key: pl, style: t.pill(true) }, pl))
                  ),
                )
              )
            )
      )
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
