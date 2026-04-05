/**
 * Content Calendar Tab — self-registering browser bundle
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
      border: '1px solid rgba(72,187,120,0.25)',
      borderRadius: '14px',
      color: 'rgba(72,187,120,0.9)',
      backdropFilter: 'blur(18px)',
    },
    dayHeader: { color: 'var(--ck-text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    cell: {
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '8px',
      minHeight: '5rem',
      background: 'rgba(255,255,255,0.02)',
    },
    cellEmpty: {
      border: '1px solid transparent',
      borderRadius: '8px',
      minHeight: '5rem',
      opacity: 0.2,
    },
    dayNum: { color: 'var(--ck-text-secondary)', fontSize: '0.8rem', fontWeight: 500 },
    todayBadge: {
      color: 'rgba(99,179,237,1)',
      background: 'rgba(99,179,237,0.15)',
      fontSize: '0.8rem',
      fontWeight: 700,
      width: '1.6rem',
      height: '1.6rem',
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function ContentCalendar() {
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const day = i - firstDay + 1;
      if (day < 1 || day > daysInMonth) {
        cells.push(h('div', { key: i, style: theme.cellEmpty }));
      } else {
        const isToday = day === today;
        cells.push(
          h('div', { key: i, className: 'p-2', style: theme.cell },
            h('span', { style: isToday ? theme.todayBadge : theme.dayNum }, day),
          ),
        );
      }
    }

    return h('div', { className: 'p-8 max-w-4xl mx-auto' },
      h('h2', { className: 'text-2xl font-bold mb-6', style: theme.text }, 'Content Calendar'),
      h('div', { className: 'p-4 mb-6 text-sm', style: theme.banner }, '📅 Schedule and plan your content'),
      h('div', { className: 'p-6', style: theme.card },
        h('div', { className: 'text-center font-semibold text-lg mb-4', style: theme.text }, monthName),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', marginBottom: '4px' } },
          ...dayNames.map(d => h('div', { key: d, className: 'text-center py-2 font-semibold', style: theme.dayHeader }, d)),
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px' } }, ...cells),
        h('p', { className: 'text-xs mt-4', style: theme.textFaint }, 'Scheduled posts will appear on their respective dates.'),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-calendar', ContentCalendar);
})();
