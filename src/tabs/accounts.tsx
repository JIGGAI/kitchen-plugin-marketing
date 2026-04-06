/**
 * Accounts Tab — auto-detects providers (Postiz, Gateway channels, manual)
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
      padding: '0.5rem 0.75rem',
      color: 'white',
      fontWeight: 700,
      cursor: 'pointer',
      fontSize: '0.8rem',
    },
    btnGhost: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px',
      padding: '0.5rem 0.75rem',
      color: 'var(--ck-text-primary)',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: '0.8rem',
    },
    badge: (color: string) => ({
      display: 'inline-block',
      background: color,
      borderRadius: '999px',
      padding: '0.15rem 0.5rem',
      fontSize: '0.7rem',
      fontWeight: 600,
      color: 'white',
    }),
  };

  const PLATFORM_ICONS: Record<string, string> = {
    x: '𝕏',
    twitter: '𝕏',
    instagram: '📷',
    linkedin: '💼',
    facebook: '📘',
    youtube: '▶️',
    tiktok: '🎵',
    bluesky: '🦋',
    mastodon: '🐘',
    reddit: '🤖',
    discord: '💬',
    telegram: '✈️',
    pinterest: '📌',
    threads: '🧵',
    medium: '✍️',
    wordpress: '📝',
  };

  const TYPE_COLORS: Record<string, string> = {
    postiz: 'rgba(99,179,237,0.7)',
    gateway: 'rgba(134,239,172,0.7)',
    skill: 'rgba(251,191,36,0.7)',
    manual: 'rgba(167,139,250,0.7)',
  };

  type Provider = {
    id: string;
    type: string;
    platform: string;
    displayName: string;
    username?: string;
    avatar?: string;
    isActive: boolean;
    capabilities: string[];
    meta?: Record<string, unknown>;
  };

  type ManualAccount = {
    id: string;
    platform: string;
    displayName: string;
    username?: string;
    isActive: boolean;
    createdAt: string;
  };

  function Accounts(props: any) {
    const teamId = String(props?.teamId || 'default');
    const apiBase = useMemo(() => `/api/plugins/marketing`, []);

    const [providers, setProviders] = useState<Provider[]>([]);
    const [manualAccounts, setManualAccounts] = useState<ManualAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [detecting, setDetecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Postiz config
    const [postizKey, setPostizKey] = useState('');
    const [postizUrl, setPostizUrl] = useState('https://api.postiz.com/public/v1');
    const [showPostizSetup, setShowPostizSetup] = useState(false);

    // Manual account form
    const [showManual, setShowManual] = useState(false);
    const [manPlatform, setManPlatform] = useState('twitter');
    const [manName, setManName] = useState('');
    const [manUser, setManUser] = useState('');
    const [manToken, setManToken] = useState('');
    const [saving, setSaving] = useState(false);

    // Load postiz key from localStorage
    useEffect(() => {
      try {
        const stored = localStorage.getItem(`ck-postiz-${teamId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setPostizKey(parsed.apiKey || '');
          setPostizUrl(parsed.baseUrl || 'https://api.postiz.com/public/v1');
        }
      } catch { /* ignore */ }
    }, [teamId]);

    const savePostizConfig = () => {
      try {
        localStorage.setItem(`ck-postiz-${teamId}`, JSON.stringify({ apiKey: postizKey, baseUrl: postizUrl }));
      } catch { /* ignore */ }
      setShowPostizSetup(false);
      void detectAll();
    };

    const getStoredPostiz = () => {
      try {
        const stored = localStorage.getItem(`ck-postiz-${teamId}`);
        if (stored) return JSON.parse(stored) as { apiKey?: string; baseUrl?: string };
      } catch { /* ignore */ }
      return null;
    };

    const detectAll = async () => {
      setDetecting(true);
      setError(null);
      try {
        // Read directly from localStorage to avoid stale state on mount
        const stored = getStoredPostiz();
        const key = postizKey || stored?.apiKey || '';
        const url = postizUrl || stored?.baseUrl || 'https://api.postiz.com/public/v1';
        const headers: Record<string, string> = {};
        if (key) {
          headers['x-postiz-api-key'] = key;
          headers['x-postiz-base-url'] = url;
        }

        const res = await fetch(`${apiBase}/providers?team=${encodeURIComponent(teamId)}`, { headers });
        const json = await res.json();
        setProviders(Array.isArray(json.providers) ? json.providers : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to detect providers');
      } finally {
        setDetecting(false);
      }
    };

    const loadManual = async () => {
      try {
        const res = await fetch(`${apiBase}/accounts?team=${encodeURIComponent(teamId)}`);
        const json = await res.json();
        setManualAccounts(Array.isArray(json.accounts) ? json.accounts : []);
      } catch { /* ignore */ }
    };

    const refresh = async () => {
      setLoading(true);
      await Promise.all([detectAll(), loadManual()]);
      setLoading(false);
    };

    useEffect(() => {
      void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId]);

    const onManualConnect = async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/accounts?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            platform: manPlatform,
            displayName: manName || `${manPlatform} account`,
            username: manUser || undefined,
            credentials: { accessToken: manToken },
          }),
        });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        setShowManual(false);
        setManName('');
        setManUser('');
        setManToken('');
        await loadManual();
      } catch (e: any) {
        setError(e?.message || 'Failed to connect');
      } finally {
        setSaving(false);
      }
    };

    const allProviders = useMemo(() => {
      const combined: Provider[] = [...providers];
      for (const ma of manualAccounts) {
        combined.push({
          id: `manual:${ma.id}`,
          type: 'manual',
          platform: ma.platform,
          displayName: ma.displayName,
          username: ma.username,
          isActive: ma.isActive,
          capabilities: ['post'],
        });
      }
      return combined;
    }, [providers, manualAccounts]);

    const grouped = useMemo(() => {
      const g: Record<string, Provider[]> = {};
      for (const p of allProviders) {
        const key = p.type;
        if (!g[key]) g[key] = [];
        g[key].push(p);
      }
      return g;
    }, [allProviders]);

    const typeLabels: Record<string, string> = {
      postiz: 'Postiz',
      gateway: 'OpenClaw Channels',
      skill: 'Skills',
      manual: 'Manual',
    };

    return h('div', { className: 'space-y-3' },

      // ---- Header ----
      h('div', { style: t.card },
        h('div', { className: 'flex items-start justify-between gap-2' },
          h('div', null,
            h('div', { className: 'text-sm font-medium', style: t.text }, 'Connected Accounts'),
            h('div', { className: 'mt-1 text-xs', style: t.faint },
              `${allProviders.length} provider${allProviders.length !== 1 ? 's' : ''} detected`
            ),
          ),
          h('div', { className: 'flex flex-wrap gap-2' },
            h('button', { type: 'button', onClick: () => void refresh(), style: t.btnGhost, disabled: detecting },
              detecting ? 'Detecting…' : '↻ Refresh'
            ),
            h('button', { type: 'button', onClick: () => setShowPostizSetup(!showPostizSetup), style: t.btnGhost },
              postizKey ? '⚙ Postiz' : '+ Postiz'
            ),
            h('button', { type: 'button', onClick: () => setShowManual(!showManual), style: t.btnGhost }, '+ Manual'),
          ),
        ),
        error && h('div', { className: 'mt-2 text-xs', style: { color: 'rgba(248,113,113,0.95)' } }, error),
      ),

      // ---- Postiz setup ----
      showPostizSetup && h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Postiz Configuration'),
        h('div', { className: 'text-xs mb-3', style: t.faint },
          'Connect Postiz to manage social accounts via their platform. Get your API key from Postiz Settings → Developers → Public API.'
        ),
        h('div', { className: 'grid grid-cols-1 gap-2 sm:grid-cols-2' },
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'API Key'),
            h('input', {
              type: 'password',
              value: postizKey,
              onChange: (e: any) => setPostizKey(e.target.value),
              placeholder: 'your-postiz-api-key',
              style: t.input,
            }),
          ),
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Base URL'),
            h('input', {
              value: postizUrl,
              onChange: (e: any) => setPostizUrl(e.target.value),
              placeholder: 'https://api.postiz.com/public/v1',
              style: t.input,
            }),
          ),
        ),
        h('div', { className: 'mt-3 flex gap-2' },
          h('button', { type: 'button', onClick: () => setShowPostizSetup(false), style: t.btnGhost }, 'Cancel'),
          h('button', { type: 'button', onClick: savePostizConfig, style: t.btnPrimary }, postizKey ? 'Save & Detect' : 'Save'),
        ),
      ),

      // ---- Manual account form ----
      showManual && h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Add manual account'),
        h('div', { className: 'text-xs mb-3', style: t.faint }, 'For direct API access without Postiz. You provide the token.'),
        h('div', { className: 'grid grid-cols-1 gap-2 sm:grid-cols-2' },
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Platform'),
            h('select', { value: manPlatform, onChange: (e: any) => setManPlatform(e.target.value), style: t.input },
              h('option', { value: 'twitter' }, 'Twitter / X'),
              h('option', { value: 'instagram' }, 'Instagram'),
              h('option', { value: 'linkedin' }, 'LinkedIn'),
              h('option', { value: 'bluesky' }, 'Bluesky'),
              h('option', { value: 'mastodon' }, 'Mastodon'),
            ),
          ),
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Display name'),
            h('input', { value: manName, onChange: (e: any) => setManName(e.target.value), placeholder: 'My X account', style: t.input }),
          ),
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Username'),
            h('input', { value: manUser, onChange: (e: any) => setManUser(e.target.value), placeholder: '@handle', style: t.input }),
          ),
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Access token'),
            h('input', { type: 'password', value: manToken, onChange: (e: any) => setManToken(e.target.value), placeholder: 'token…', style: t.input }),
          ),
        ),
        h('div', { className: 'mt-3 flex gap-2' },
          h('button', { type: 'button', onClick: () => setShowManual(false), style: t.btnGhost }, 'Cancel'),
          h('button', { type: 'button', onClick: () => void onManualConnect(), style: t.btnPrimary, disabled: saving }, saving ? 'Saving…' : 'Connect'),
        ),
      ),

      // ---- Loading ----
      loading && h('div', { style: t.card },
        h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'Detecting providers…'),
      ),

      // ---- Provider groups ----
      !loading && allProviders.length === 0 && h('div', { style: t.card },
        h('div', { className: 'py-6 text-center space-y-2' },
          h('div', { className: 'text-sm', style: t.faint }, 'No providers detected'),
          h('div', { className: 'text-xs', style: t.faint },
            'Connect Postiz for full social media management, or add accounts manually.'
          ),
        ),
      ),

      !loading && Object.entries(grouped).map(([type, items]) =>
        h('div', { key: type, style: t.card },
          h('div', { className: 'flex items-center gap-2 mb-3' },
            h('div', { className: 'text-sm font-medium', style: t.text }, typeLabels[type] || type),
            h('span', { style: t.badge(TYPE_COLORS[type] || 'rgba(100,100,100,0.6)') }, `${items.length}`),
          ),
          h('div', { className: 'space-y-2' },
            ...items.map((p) =>
              h('div', { key: p.id, style: { ...t.card, padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' } },
                // Avatar or platform icon
                p.avatar
                  ? h('img', { src: p.avatar, alt: '', style: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' } })
                  : h('div', {
                    style: {
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1rem',
                    },
                  }, PLATFORM_ICONS[p.platform] || '🔗'),
                // Info
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('div', { className: 'text-sm font-medium', style: t.text }, p.displayName),
                  h('div', { className: 'text-xs', style: t.faint },
                    [p.platform, p.username].filter(Boolean).join(' · ')
                  ),
                ),
                // Status + capabilities
                h('div', { className: 'flex items-center gap-2 shrink-0' },
                  p.capabilities?.includes('schedule') && h('span', { className: 'text-xs', style: t.faint }, '⏱'),
                  p.capabilities?.includes('post') && h('span', { className: 'text-xs', style: t.faint }, '📤'),
                  h('div', {
                    style: {
                      width: 8, height: 8, borderRadius: '50%',
                      background: p.isActive ? 'rgba(74,222,128,0.8)' : 'rgba(248,113,113,0.6)',
                    },
                  }),
                ),
              )
            ),
          ),
        )
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'accounts', Accounts);
})();
