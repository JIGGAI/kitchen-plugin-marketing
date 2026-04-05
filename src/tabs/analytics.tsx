/**
 * Analytics Tab — self-registering browser bundle
 */
(function () {
  const React = (window as any).React;
  if (!React) return;

  const s = {
    page: 'padding:2rem;max-width:1200px;margin:0 auto',
    h2: 'font-size:1.5rem;font-weight:700;color:var(--ck-text-primary);margin-bottom:1.5rem',
    card: 'background:var(--ck-bg-glass);border:1px solid var(--ck-border-subtle);border-radius:14px;padding:1.5rem;backdrop-filter:blur(18px) saturate(1.25)',
    cardTitle: 'font-size:1.1rem;font-weight:600;color:var(--ck-text-primary);margin-bottom:1rem',
    muted: 'color:var(--ck-text-secondary);font-size:0.9rem',
    mutedSm: 'color:var(--ck-text-tertiary);font-size:0.85rem',
    banner: 'background:var(--ck-bg-glass);border:1px solid rgba(183,148,244,0.25);border-radius:14px;padding:1.25rem;color:rgba(183,148,244,0.9);font-size:0.9rem;margin-bottom:1.5rem;backdrop-filter:blur(18px)',
    statsGrid: 'display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem',
    statCard: 'background:var(--ck-bg-glass);border:1px solid var(--ck-border-subtle);border-radius:14px;padding:1.25rem;text-align:center;backdrop-filter:blur(18px) saturate(1.25)',
    statValue: 'font-size:2rem;font-weight:700;margin-bottom:0.25rem',
    statLabel: 'color:var(--ck-text-tertiary);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em',
    emptyChart: 'height:16rem;border-radius:10px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--ck-border-subtle)',
    emptyIcon: 'font-size:2.5rem;margin-bottom:0.75rem;opacity:0.6',
    emptyCenter: 'text-align:center',
  };

  function Analytics() {
    return React.createElement('div', { dangerouslySetInnerHTML: { __html: `
      <div style="${s.page}">
        <h2 style="${s.h2}">Analytics</h2>
        <div style="${s.banner}">
          📊 Track your content performance across platforms
        </div>
        <div style="${s.statsGrid}">
          <div style="${s.statCard}">
            <div style="${s.statValue};color:rgba(99,179,237,0.9)">0</div>
            <div style="${s.statLabel}">Total Posts</div>
          </div>
          <div style="${s.statCard}">
            <div style="${s.statValue};color:rgba(72,187,120,0.9)">0</div>
            <div style="${s.statLabel}">Engagements</div>
          </div>
          <div style="${s.statCard}">
            <div style="${s.statValue};color:rgba(237,137,54,0.9)">0</div>
            <div style="${s.statLabel}">New Followers</div>
          </div>
        </div>
        <div style="${s.card}">
          <h3 style="${s.cardTitle}">Engagement Over Time</h3>
          <div style="${s.emptyChart}">
            <div style="${s.emptyCenter}">
              <div style="${s.emptyIcon}">📈</div>
              <p style="${s.muted}">Your engagement chart will appear here</p>
              <p style="${s.mutedSm}">Start publishing content to see analytics</p>
            </div>
          </div>
        </div>
      </div>
    ` } });
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'analytics', Analytics);
})();
