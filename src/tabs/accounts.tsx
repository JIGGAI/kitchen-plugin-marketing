/**
 * Accounts Tab — self-registering browser bundle
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
    banner: 'background:var(--ck-bg-glass);border:1px solid rgba(237,199,80,0.25);border-radius:14px;padding:1.25rem;color:rgba(237,199,80,0.9);font-size:0.9rem;margin-bottom:1.5rem;backdrop-filter:blur(18px)',
    platformGrid: 'display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.5rem',
    platformBtn: 'border:1px solid var(--ck-border-subtle);border-radius:12px;padding:1.25rem 1rem;cursor:pointer;text-align:center;transition:all 0.15s;background:var(--ck-bg-glass);backdrop-filter:blur(18px)',
    platformIcon: 'font-size:1.75rem;margin-bottom:0.5rem',
    platformName: 'font-size:0.85rem;font-weight:500;color:var(--ck-text-primary)',
    emptyIcon: 'font-size:2.5rem;margin-bottom:0.75rem;opacity:0.6',
    emptyCenter: 'text-align:center;padding:2.5rem 0',
  };

  // Hover effect via onmouseover isn't possible with dangerouslySetInnerHTML,
  // but the border glow gives enough visual affordance

  function Accounts() {
    return React.createElement('div', { dangerouslySetInnerHTML: { __html: `
      <div style="${s.page}">
        <h2 style="${s.h2}">Social Media Accounts</h2>
        <div style="${s.banner}">
          🔗 Connect and manage your social media accounts
        </div>
        <div style="${s.card};margin-bottom:1rem">
          <h3 style="${s.cardTitle}">Add New Account</h3>
          <div style="${s.platformGrid}">
            <div style="${s.platformBtn}">
              <div style="${s.platformIcon}">𝕏</div>
              <div style="${s.platformName}">Twitter / X</div>
            </div>
            <div style="${s.platformBtn}">
              <div style="${s.platformIcon}">📷</div>
              <div style="${s.platformName}">Instagram</div>
            </div>
            <div style="${s.platformBtn}">
              <div style="${s.platformIcon}">🎬</div>
              <div style="${s.platformName}">YouTube</div>
            </div>
            <div style="${s.platformBtn}">
              <div style="${s.platformIcon}">💼</div>
              <div style="${s.platformName}">LinkedIn</div>
            </div>
          </div>
        </div>
        <div style="${s.card}">
          <h3 style="${s.cardTitle}">Connected Accounts</h3>
          <div style="${s.emptyCenter}">
            <div style="${s.emptyIcon}">🔌</div>
            <p style="${s.muted}">No accounts connected yet</p>
            <p style="${s.mutedSm}">Click a platform above to get started</p>
          </div>
        </div>
      </div>
    ` } });
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'accounts', Accounts);
})();
