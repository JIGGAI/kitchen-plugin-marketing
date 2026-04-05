/**
 * Accounts Tab — self-registering browser bundle
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
  };

  type Account = {
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

    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [platform, setPlatform] = useState('twitter');
    const [displayName, setDisplayName] = useState('');
    const [username, setUsername] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/accounts?team=${encodeURIComponent(teamId)}`);
        const json = await res.json();
        setAccounts(Array.isArray(json.accounts) ? json.accounts : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load accounts');
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teamId]);

    const onConnect = async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/accounts?team=${encodeURIComponent(teamId)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              platform,
              displayName: displayName || `${platform} account`,
              username: username || undefined,
              credentials: { accessToken },
              settings: {},
            }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.message || `Connect failed (${res.status})`);
        }
        setOpen(false);
        setDisplayName('');
        setUsername('');
        setAccessToken('');
        await refresh();
      } catch (e: any) {
        setError(e?.message || 'Failed to connect account');
      } finally {
        setSaving(false);
      }
    };

    return h('div', { className: 'space-y-3' },
      h('div', { style: t.card },
        h('div', { className: 'flex items-start justify-between gap-2' },
          h('div', null,
            h('div', { className: 'text-sm font-medium', style: t.text }, 'Accounts'),
            h('div', { className: 'mt-1 text-xs', style: t.faint }, 'OAuth flows next. For now this stores an access token placeholder per team.'),
          ),
          h('div', { className: 'flex gap-2' },
            h('button', { type: 'button', onClick: () => void refresh(), style: t.btnGhost }, 'Refresh'),
            h('button', { type: 'button', onClick: () => setOpen(true), style: t.btnPrimary }, 'Connect'),
          )
        ),
        error ? h('div', { className: 'mt-2 text-sm', style: { color: 'rgba(248,113,113,0.95)' } }, error) : null,
      ),

      open ? h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-3', style: t.text }, 'Connect account'),
        h('div', { className: 'grid grid-cols-1 gap-2 sm:grid-cols-2' },
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Platform'),
            h('select', {
              value: platform,
              onChange: (e: any) => setPlatform(e.target.value),
              style: t.input,
            },
              h('option', { value: 'twitter' }, 'Twitter / X'),
              h('option', { value: 'instagram' }, 'Instagram'),
              h('option', { value: 'linkedin' }, 'LinkedIn'),
            )
          ),
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Display name'),
            h('input', {
              value: displayName,
              onChange: (e: any) => setDisplayName(e.target.value),
              placeholder: 'e.g. RJ — Main',
              style: t.input,
            }),
          ),
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Username (optional)'),
            h('input', {
              value: username,
              onChange: (e: any) => setUsername(e.target.value),
              placeholder: 'e.g. @handle',
              style: t.input,
            }),
          ),
          h('div', null,
            h('div', { className: 'text-xs font-medium mb-1', style: t.faint }, 'Access token (placeholder)'),
            h('input', {
              value: accessToken,
              onChange: (e: any) => setAccessToken(e.target.value),
              placeholder: 'token…',
              style: t.input,
            }),
          )
        ),
        h('div', { className: 'mt-3 flex gap-2' },
          h('button', { type: 'button', onClick: () => setOpen(false), style: t.btnGhost }, 'Cancel'),
          h('button', { type: 'button', onClick: () => void onConnect(), style: { ...t.btnPrimary, opacity: saving ? 0.7 : 1 }, disabled: saving }, saving ? 'Connecting…' : 'Save'),
        )
      ) : null,

      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Connected'),
        loading
          ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'Loading…')
          : accounts.length === 0
            ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'No accounts connected yet.')
            : h('div', { className: 'space-y-2' },
              ...accounts.map((a) =>
                h('div', { key: a.id, style: { ...t.card, padding: '0.75rem' } },
                  h('div', { className: 'flex items-center justify-between gap-2' },
                    h('div', null,
                      h('div', { className: 'text-sm font-medium', style: t.text }, a.displayName),
                      h('div', { className: 'text-xs', style: t.faint }, `${a.platform}${a.username ? ` · ${a.username}` : ''}`),
                    ),
                    h('div', { className: 'text-xs', style: a.isActive ? t.muted : t.faint }, a.isActive ? 'active' : 'disabled'),
                  ),
                )
              )
            )
      )
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'accounts', Accounts);
})();
