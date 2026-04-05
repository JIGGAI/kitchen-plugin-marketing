/**
 * Analytics Tab — self-registering browser bundle
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
    statLabel: { color: 'var(--ck-text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  };

  const stats = [
    { label: 'Total Posts', value: '0', color: 'rgba(99,179,237,0.9)' },
    { label: 'Engagements', value: '0', color: 'rgba(72,187,120,0.9)' },
    { label: 'New Followers', value: '0', color: 'rgba(237,137,54,0.9)' },
  ];

  function Analytics() {
    return h('div', { className: 'space-y-3' },
      h('div', { className: 'grid grid-cols-3 gap-3' },
        ...stats.map(s =>
          h('div', { key: s.label, className: 'text-center p-3', style: t.card },
            h('div', { className: 'text-2xl font-bold mb-1', style: { color: s.color } }, s.value),
            h('div', { style: t.statLabel }, s.label),
          ),
        ),
      ),
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-3', style: t.text }, 'Engagement Over Time'),
        h('div', {
          className: 'flex items-center justify-center py-8 text-sm',
          style: { ...t.faint, border: '1px dashed var(--ck-border-subtle)', borderRadius: '8px' },
        }, 'Start publishing content to see analytics'),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'analytics', Analytics);
})();
