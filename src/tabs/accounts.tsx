/**
 * Accounts Tab — driver-based platform connections
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
    capPill: (active: boolean) => ({
      display: 'inline-block',
      background: active ? 'rgba(99,179,237,0.15)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? 'rgba(99,179,237,0.3)' : 'var(--ck-border-subtle)'}`,
      borderRadius: '999px',
      padding: '0.1rem 0.4rem',
      fontSize: '0.6rem',
      color: active ? 'rgba(210,235,255,0.9)' : 'var(--ck-text-tertiary)',
    }),
  };

  const BACKEND_COLORS: Record<string, string> = {
    postiz: 'rgba(99,179,237,0.7)',
    gateway: 'rgba(134,239,172,0.7)',
    direct: 'rgba(251,191,36,0.7)',
    none: 'rgba(100,100,100,0.5)',
  };

  const BACKEND_LABELS: Record<string, string> = {
    postiz: 'Postiz',
    gateway: 'OpenClaw',
    direct: 'Direct API',
    none: 'Not connected',
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

    const [drivers, setDrivers] = useState<DriverInfo[]>([]);
    const [manualAccounts, setManualAccounts] = useState<ManualAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Postiz config
    const [postizKey, setPostizKey] = useState('');
    const [postizUrl, setPostizUrl] = useState('https://api.postiz.com/public/v1');
    const [showPostizSetup, setShowPostizSetup] = useState(false);

    // Manual account form
    const [showManual, setShowManual] = useState(false);
    const [manPlatform, setManPlatform] = useState('x');
    const [manName, setManName] = useState('');
    const [manUser, setManUser] = useState('');
    const [manToken, setManToken] = useState('');
    const [saving, setSaving] = useState(false);

    const getStoredPostiz = () => {
      try {
        const stored = localStorage.getItem(`ck-postiz-${teamId}`);
        if (stored) return JSON.parse(stored) as { apiKey?: string; baseUrl?: string };
      } catch { /* ignore */ }
      return null;
    };

    // Load postiz key from localStorage
    useEffect(() => {
      const stored = getStoredPostiz();
      if (stored) {
        setPostizKey(stored.apiKey || '');
        setPostizUrl(stored.baseUrl || 'https://api.postiz.com/public/v1');
      }
    }, [teamId]);

    const savePostizConfig = () => {
      try {
        localStorage.setItem(`ck-postiz-${teamId}`, JSON.stringify({ apiKey: postizKey, baseUrl: postizUrl }));
      } catch { /* ignore */ }
      setShowPostizSetup(false);
      void loadDrivers();
    };

    const loadDrivers = async () => {
      setError(null);
      try {
        const stored = getStoredPostiz();
        const key = postizKey || stored?.apiKey || '';
        const url = postizUrl || stored?.baseUrl || 'https://api.postiz.com/public/v1';
        const headers: Record<string, string> = {};
        if (key) {
          headers['x-postiz-api-key'] = key;
          headers['x-postiz-base-url'] = url;
        }

        const res = await fetch(`${apiBase}/drivers?team=${encodeURIComponent(teamId)}`, { headers });
        const json = await res.json();
        setDrivers(Array.isArray(json.drivers) ? json.drivers : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load drivers');
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
      await Promise.all([loadDrivers(), loadManual()]);
      setLoading(false);
    };

    useEffect(() => {
      void refresh();
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
        await Promise.all([loadDrivers(), loadManual()]);
      } catch (e: any) {
        setError(e?.message || 'Failed to connect');
      } finally {
        setSaving(false);
      }
    };

    const connectedDrivers = useMemo(() => drivers.filter((d) => d.connected), [drivers]);
    const disconnectedDrivers = useMemo(() => drivers.filter((d) => !d.connected), [drivers]);
    const connectedCount = connectedDrivers.length;
    const totalCount = drivers.length;

    return h('div', { className: 'space-y-3' },

      // ---- Header ----
      h('div', { style: t.card },
        h('div', { className: 'flex items-start justify-between gap-2' },
          h('div', null,
            h('div', { className: 'text-sm font-medium', style: t.text }, 'Platform Drivers'),
            h('div', { className: 'mt-1 text-xs', style: t.faint },
              `${connectedCount}/${totalCount} platforms connected`
            ),
          ),
          h('div', { className: 'flex flex-wrap gap-2' },
            h('button', { type: 'button', onClick: () => void refresh(), style: t.btnGhost, disabled: loading },
              loading ? 'Loading…' : '↻ Refresh'
            ),
            h('button', { type: 'button', onClick: () => setShowPostizSetup(!showPostizSetup), style: t.btnGhost },
              postizKey ? '⚙ Postiz' : '+ Postiz'
            ),
            h('button', { type: 'button', onClick: () => setShowManual(!showManual), style: t.btnGhost }, '+ Direct token'),
          ),
        ),
        error && h('div', { className: 'mt-2 text-xs', style: { color: 'rgba(248,113,113,0.95)' } }, error),
      ),

      // ---- Postiz setup ----
      showPostizSetup && h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Postiz Configuration'),
        h('div', { className: 'text-xs mb-3', style: t.faint },
          'Postiz manages OAuth connections to social platforms. Get your API key from Postiz Settings → Developers → Public API.'
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
          h('button', { type: 'button', onClick: savePostizConfig, style: t.btnPrimary }, 'Save & Detect'),
        ),
      ),

      // ---- Manual token form ----
      showManual && h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Add direct API token'),
        h('div', { className: 'text-xs mb-3', style: t.faint }, 'For platforms where you have your own API credentials. Token is encrypted at rest.'),
        h('div', { className: 'grid grid-cols-1 gap-2 sm:grid-cols-2' },
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Platform'),
            h('select', { value: manPlatform, onChange: (e: any) => setManPlatform(e.target.value), style: t.input },
              ...drivers.map((d) => h('option', { key: d.platform, value: d.platform }, d.label))
            ),
          ),
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Display name'),
            h('input', { value: manName, onChange: (e: any) => setManName(e.target.value), placeholder: 'My account', style: t.input }),
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

      // ---- Connected platforms ----
      connectedDrivers.length > 0 && h('div', { style: t.card },
        h('div', { className: 'flex items-center gap-2 mb-3' },
          h('div', { className: 'text-sm font-medium', style: t.text }, 'Connected'),
          h('span', { style: t.badge('rgba(74,222,128,0.7)') }, `${connectedCount}`),
        ),
        h('div', { className: 'space-y-2' },
          ...connectedDrivers.map((d) =>
            h('div', { key: d.platform, style: { ...t.card, padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' } },
              d.avatar
                ? h('img', { src: d.avatar, alt: '', style: { width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' } })
                : h('div', {
                  style: {
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem',
                  },
                }, d.icon),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { className: 'text-sm font-medium', style: t.text }, d.displayName),
                h('div', { className: 'text-xs', style: t.faint },
                  [d.username, d.platform].filter(Boolean).join(' · ')
                ),
              ),
              h('div', { className: 'flex items-center gap-2 shrink-0 flex-wrap' },
                h('span', { style: t.badge(BACKEND_COLORS[d.backend] || BACKEND_COLORS.none) }, BACKEND_LABELS[d.backend] || d.backend),
                d.capabilities.canPost && h('span', { style: t.capPill(true) }, 'post'),
                d.capabilities.canSchedule && h('span', { style: t.capPill(true) }, 'schedule'),
                d.capabilities.canUploadMedia && h('span', { style: t.capPill(true) }, 'media'),
                d.capabilities.maxLength && h('span', { style: t.capPill(false) }, `${d.capabilities.maxLength} chars`),
                h('div', {
                  style: {
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'rgba(74,222,128,0.8)',
                  },
                }),
              ),
            )
          ),
        ),
      ),

      // ---- Disconnected platforms ----
      disconnectedDrivers.length > 0 && h('div', { style: t.card },
        h('div', { className: 'flex items-center gap-2 mb-3' },
          h('div', { className: 'text-sm font-medium', style: t.text }, 'Available'),
          h('span', { style: t.badge('rgba(100,100,100,0.5)') }, `${disconnectedDrivers.length}`),
        ),
        h('div', { className: 'text-xs mb-3', style: t.faint },
          'Connect these via Postiz or by adding a direct API token above.'
        ),
        h('div', { className: 'space-y-2' },
          ...disconnectedDrivers.map((d) =>
            h('div', { key: d.platform, style: { ...t.card, padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: 0.6 } },
              h('div', {
                style: {
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem',
                },
              }, d.icon),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { className: 'text-sm font-medium', style: t.text }, d.label),
                h('div', { className: 'text-xs', style: t.faint }, 'Not connected'),
              ),
              h('div', { className: 'flex items-center gap-2 shrink-0' },
                d.capabilities.maxLength && h('span', { style: t.capPill(false) }, `${d.capabilities.maxLength} chars`),
                h('div', {
                  style: {
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'rgba(100,100,100,0.4)',
                  },
                }),
              ),
            )
          ),
        ),
      ),

      // ---- Manual accounts (if any exist beyond drivers) ----
      manualAccounts.length > 0 && h('div', { style: t.card },
        h('div', { className: 'flex items-center gap-2 mb-3' },
          h('div', { className: 'text-sm font-medium', style: t.text }, 'Stored tokens'),
          h('span', { style: t.badge('rgba(251,191,36,0.7)') }, `${manualAccounts.length}`),
        ),
        h('div', { className: 'text-xs mb-3', style: t.faint }, 'Tokens stored locally, encrypted at rest. These feed into the direct backend for their platform driver.'),
        h('div', { className: 'space-y-2' },
          ...manualAccounts.map((a) =>
            h('div', { key: a.id, style: { ...t.card, padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' } },
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { className: 'text-sm', style: t.text }, a.displayName),
                h('div', { className: 'text-xs', style: t.faint },
                  [a.platform, a.username].filter(Boolean).join(' · ')
                ),
              ),
              h('div', {
                style: {
                  width: 8, height: 8, borderRadius: '50%',
                  background: a.isActive ? 'rgba(74,222,128,0.8)' : 'rgba(248,113,113,0.6)',
                },
              }),
            )
          ),
        ),
      ),

      // ---- Loading ----
      loading && drivers.length === 0 && h('div', { style: t.card },
        h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'Detecting platform drivers…'),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'accounts', Accounts);
})();
