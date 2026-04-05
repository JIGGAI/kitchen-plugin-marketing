/**
 * Content Library Tab — self-registering browser bundle
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
  };

  function ContentLibrary() {
    return h('div', { className: 'space-y-3' },
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Create New Post'),
        h('div', { className: 'text-sm', style: t.muted }, 'Your content creation tools will live here:'),
        h('ul', { className: 'text-sm mt-2 space-y-1', style: { ...t.muted, listStyle: 'disc inside', paddingLeft: '0.5rem' } },
          h('li', null, 'Rich text editor with media embedding'),
          h('li', null, 'Multi-platform publishing (Twitter, Instagram, LinkedIn)'),
          h('li', null, 'Scheduling & auto-posting'),
          h('li', null, 'Template library for quick starts'),
        ),
      ),
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-2', style: t.text }, 'Recent Posts'),
        h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'No posts yet — create your first post to get started.'),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
