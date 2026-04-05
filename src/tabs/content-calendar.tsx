/**
 * Content Calendar Tab — self-registering browser bundle
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
    dayHeader: { color: 'var(--ck-text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600 },
    cell: { border: '1px solid var(--ck-border-subtle)', borderRadius: '6px', minHeight: '4rem', padding: '0.35rem 0.5rem' },
    cellEmpty: { minHeight: '4rem', opacity: 0.15 },
    dayNum: { color: 'var(--ck-text-secondary)', fontSize: '0.8rem', fontWeight: 500 },
    todayBadge: {
      color: 'rgba(99,179,237,1)',
      background: 'rgba(99,179,237,0.15)',
      fontSize: '0.8rem',
      fontWeight: 700,
      width: '1.5rem',
      height: '1.5rem',
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  };

  const grid7 = { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px' };

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
        cells.push(h('div', { key: i, style: t.cellEmpty }));
      } else {
        const isToday = day === today;
        cells.push(
          h('div', { key: i, style: t.cell },
            h('span', { style: isToday ? t.todayBadge : t.dayNum }, day),
          ),
        );
      }
    }

    return h('div', { style: t.card },
      h('div', { className: 'text-sm font-medium mb-3', style: t.text }, monthName),
      h('div', { style: { ...grid7, marginBottom: '3px' } },
        ...dayNames.map(d => h('div', { key: d, className: 'text-center py-1', style: t.dayHeader }, d)),
      ),
      h('div', { style: grid7 }, ...cells),
      h('div', { className: 'mt-3 text-xs', style: t.faint }, 'Scheduled posts will appear on their respective dates.'),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-calendar', ContentCalendar);
})();
