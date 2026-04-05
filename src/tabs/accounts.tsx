/**
 * Accounts Tab — self-registering browser bundle
 */
(function () {
  const R = (window as any).React;
  if (!R) return;
  const h = R.createElement;

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
    platformBtn: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px',
      cursor: 'pointer',
      transition: 'border-color 0.15s, background 0.15s',
      padding: '1rem',
      textAlign: 'center' as const,
    },
  };

  const platforms = [
    { icon: '𝕏', name: 'Twitter / X' },
    { icon: '📷', name: 'Instagram' },
    { icon: '🎬', name: 'YouTube' },
    { icon: '💼', name: 'LinkedIn' },
  ];

  function Accounts() {
    return h('div', { className: 'space-y-3' },
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-3', style: t.text }, 'Connect Account'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.5rem' } },
          ...platforms.map(p =>
            h('div', { key: p.name, style: t.platformBtn },
              h('div', { className: 'text-xl mb-1' }, p.icon),
              h('div', { className: 'text-xs font-medium', style: t.text }, p.name),
            ),
          ),
        ),
      ),
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Connected Accounts'),
        h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'No accounts connected yet.'),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'accounts', Accounts);
})();
