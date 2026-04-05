/**
 * Content Library Tab — self-registering browser bundle
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
      border: '1px solid rgba(99,179,237,0.25)',
      borderRadius: '14px',
      color: 'rgba(99,179,237,0.9)',
      backdropFilter: 'blur(18px)',
    },
  };

  function ContentLibrary() {
    return h('div', { className: 'p-8 max-w-4xl mx-auto' },
      h('h2', { className: 'text-2xl font-bold mb-6', style: theme.text }, 'Content Library'),
      h('div', { className: 'p-4 mb-6 text-sm', style: theme.banner }, '🎉 Marketing Suite plugin is active! Manage your content from here.'),
      h('div', { className: 'flex flex-col gap-4' },
        h('div', { className: 'p-6', style: theme.card },
          h('h3', { className: 'text-lg font-semibold mb-3', style: theme.text }, 'Create New Post'),
          h('p', { className: 'text-sm mb-2', style: theme.textMuted }, 'Your content creation tools will live here:'),
          h('ul', { className: 'text-sm space-y-1', style: { ...theme.textMuted, listStyle: 'disc inside', paddingLeft: '0.5rem' } },
            h('li', null, 'Rich text editor with media embedding'),
            h('li', null, 'Multi-platform publishing (Twitter, Instagram, LinkedIn)'),
            h('li', null, 'Scheduling & auto-posting'),
            h('li', null, 'Template library for quick starts'),
          ),
        ),
        h('div', { className: 'p-6', style: theme.card },
          h('h3', { className: 'text-lg font-semibold mb-3', style: theme.text }, 'Recent Posts'),
          h('div', { className: 'text-center py-8' },
            h('div', { className: 'text-4xl mb-3 opacity-60' }, '✍️'),
            h('p', { className: 'text-sm', style: theme.textMuted }, 'No posts yet'),
            h('p', { className: 'text-xs mt-1', style: theme.textFaint }, 'Create your first post to get started'),
          ),
        ),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
