/**
 * Content Library Tab — self-registering browser bundle
 */
(function () {
  const React = (window as any).React;
  if (!React) return;

  const s = {
    page: 'padding:2rem;max-width:1200px;margin:0 auto',
    h2: 'font-size:1.5rem;font-weight:700;color:var(--ck-text-primary);margin-bottom:1.5rem',
    card: 'background:var(--ck-bg-glass);border:1px solid var(--ck-border-subtle);border-radius:14px;padding:1.5rem;backdrop-filter:blur(18px) saturate(1.25)',
    cardTitle: 'font-size:1.1rem;font-weight:600;color:var(--ck-text-primary);margin-bottom:0.75rem',
    muted: 'color:var(--ck-text-secondary);font-size:0.9rem;line-height:1.6',
    mutedSm: 'color:var(--ck-text-tertiary);font-size:0.85rem;font-style:italic',
    stack: 'display:flex;flex-direction:column;gap:1rem',
    list: 'color:var(--ck-text-secondary);font-size:0.9rem;line-height:2;margin-top:0.5rem;padding-left:1.25rem',
    banner: 'background:var(--ck-bg-glass);border:1px solid rgba(99,179,237,0.25);border-radius:14px;padding:1.25rem;color:rgba(99,179,237,0.9);font-size:0.9rem;margin-bottom:1.5rem;backdrop-filter:blur(18px)',
    emptyIcon: 'font-size:2.5rem;margin-bottom:0.75rem;opacity:0.6',
    emptyCenter: 'text-align:center;padding:2.5rem 0',
    btn: 'background:rgba(99,179,237,0.15);border:1px solid rgba(99,179,237,0.3);color:rgba(99,179,237,0.9);padding:0.6rem 1.25rem;border-radius:10px;cursor:pointer;font-size:0.9rem;font-weight:500;transition:all 0.15s',
  };

  function ContentLibrary() {
    return React.createElement('div', { dangerouslySetInnerHTML: { __html: `
      <div style="${s.page}">
        <h2 style="${s.h2}">Content Library</h2>
        <div style="${s.banner}">
          🎉 Marketing Suite plugin is active! Manage your content from here.
        </div>
        <div style="${s.stack}">
          <div style="${s.card}">
            <h3 style="${s.cardTitle}">Create New Post</h3>
            <p style="${s.muted}">Your content creation tools will live here:</p>
            <ul style="${s.list}">
              <li>Rich text editor with media embedding</li>
              <li>Multi-platform publishing (Twitter, Instagram, LinkedIn)</li>
              <li>Scheduling & auto-posting</li>
              <li>Template library for quick starts</li>
            </ul>
          </div>
          <div style="${s.card}">
            <h3 style="${s.cardTitle}">Recent Posts</h3>
            <div style="${s.emptyCenter}">
              <div style="${s.emptyIcon}">✍️</div>
              <p style="${s.muted}">No posts yet</p>
              <p style="${s.mutedSm}">Create your first post to get started</p>
            </div>
          </div>
        </div>
      </div>
    ` } });
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
