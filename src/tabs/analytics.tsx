/**
 * Analytics Tab — self-registering browser bundle
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
      border: '1px solid rgba(183,148,244,0.25)',
      borderRadius: '14px',
      color: 'rgba(183,148,244,0.9)',
      backdropFilter: 'blur(18px)',
    },
    statLabel: { color: 'var(--ck-text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    chartPlaceholder: {
      border: '1px dashed var(--ck-border-subtle)',
      borderRadius: '10px',
      height: '16rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  };

  const stats = [
    { label: 'Total Posts', value: '0', color: 'rgba(99,179,237,0.9)' },
    { label: 'Engagements', value: '0', color: 'rgba(72,187,120,0.9)' },
    { label: 'New Followers', value: '0', color: 'rgba(237,137,54,0.9)' },
  ];

  function Analytics() {
    return h('div', { className: 'p-8 max-w-4xl mx-auto' },
      h('h2', { className: 'text-2xl font-bold mb-6', style: theme.text }, 'Analytics'),
      h('div', { className: 'p-4 mb-6 text-sm', style: theme.banner }, '📊 Track your content performance across platforms'),
      h('div', { className: 'grid grid-cols-3 gap-4 mb-6' },
        ...stats.map(s =>
          h('div', { key: s.label, className: 'p-5 text-center', style: theme.card },
            h('div', { className: 'text-3xl font-bold mb-1', style: { color: s.color } }, s.value),
            h('div', { style: theme.statLabel }, s.label),
          ),
        ),
      ),
      h('div', { className: 'p-6', style: theme.card },
        h('h3', { className: 'text-lg font-semibold mb-4', style: theme.text }, 'Engagement Over Time'),
        h('div', { style: theme.chartPlaceholder },
          h('div', { className: 'text-center' },
            h('div', { className: 'text-4xl mb-3 opacity-60' }, '📈'),
            h('p', { className: 'text-sm', style: theme.textMuted }, 'Your engagement chart will appear here'),
            h('p', { className: 'text-xs mt-1', style: theme.textFaint }, 'Start publishing content to see analytics'),
          ),
        ),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'analytics', Analytics);
})();
