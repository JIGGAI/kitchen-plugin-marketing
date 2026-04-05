/**
 * Accounts Tab — self-registering browser bundle
 */
(function () {
  const R = (window as any).React;
  if (!R) return;
  const h = R.createElement;

  const theme = {
    text: { color: 'var(--ck-text-primary)' },
    textMuted: { color: 'var(--ck-text-secondary)' },
    textFaint: { color: 'var(--ck-text-tertiary)' },
    card: {
      background: 'var(--ck-bg-glass)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '14px',
      backdropFilter: 'blur(18px) saturate(1.25)',
    },
    banner: {
      background: 'var(--ck-bg-glass)',
      border: '1px solid rgba(237,199,80,0.25)',
      borderRadius: '14px',
      color: 'rgba(237,199,80,0.9)',
      backdropFilter: 'blur(18px)',
    },
    platformBtn: {
      background: 'var(--ck-bg-glass)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '12px',
      cursor: 'pointer',
      backdropFilter: 'blur(18px)',
      transition: 'border-color 0.15s, background 0.15s',
    },
  };

  const platforms = [
    { icon: '𝕏', name: 'Twitter / X' },
    { icon: '📷', name: 'Instagram' },
    { icon: '🎬', name: 'YouTube' },
    { icon: '💼', name: 'LinkedIn' },
  ];

  function Accounts() {
    return h('div', { className: 'p-8 max-w-5xl mx-auto' },
      h('h2', { className: 'text-2xl font-bold mb-6', style: theme.text }, 'Social Media Accounts'),
      h('div', { className: 'p-4 mb-6 text-sm', style: theme.banner }, '🔗 Connect and manage your social media accounts'),
      h('div', { className: 'p-6 mb-4', style: theme.card },
        h('h3', { className: 'text-lg font-semibold mb-4', style: theme.text }, 'Add New Account'),
        h('div', { className: 'grid grid-cols-4 gap-3' },
          ...platforms.map(p =>
            h('div', {
              key: p.name,
              className: 'p-5 text-center',
              style: theme.platformBtn,
            },
              h('div', { className: 'text-2xl mb-2' }, p.icon),
              h('div', { className: 'text-sm font-medium', style: theme.text }, p.name),
            ),
          ),
        ),
      ),
      h('div', { className: 'p-6', style: theme.card },
        h('h3', { className: 'text-lg font-semibold mb-3', style: theme.text }, 'Connected Accounts'),
        h('div', { className: 'text-center py-8' },
          h('div', { className: 'text-4xl mb-3 opacity-60' }, '🔌'),
          h('p', { className: 'text-sm', style: theme.textMuted }, 'No accounts connected yet'),
          h('p', { className: 'text-xs mt-1', style: theme.textFaint }, 'Click a platform above to get started'),
        ),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'accounts', Accounts);
})();
