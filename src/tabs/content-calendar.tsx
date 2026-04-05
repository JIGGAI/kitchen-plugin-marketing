/**
 * Content Calendar Tab — self-registering browser bundle
 */
(function () {
  const React = (window as any).React;
  if (!React) return;

  const s = {
    page: 'padding:2rem;max-width:1200px;margin:0 auto',
    h2: 'font-size:1.5rem;font-weight:700;color:var(--ck-text-primary);margin-bottom:1.5rem',
    card: 'background:var(--ck-bg-glass);border:1px solid var(--ck-border-subtle);border-radius:14px;padding:1.5rem;backdrop-filter:blur(18px) saturate(1.25)',
    muted: 'color:var(--ck-text-secondary);font-size:0.9rem',
    mutedSm: 'color:var(--ck-text-tertiary);font-size:0.85rem;margin-top:1rem',
    banner: 'background:var(--ck-bg-glass);border:1px solid rgba(72,187,120,0.25);border-radius:14px;padding:1.25rem;color:rgba(72,187,120,0.9);font-size:0.9rem;margin-bottom:1.5rem;backdrop-filter:blur(18px)',
    grid7: 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px',
    dayHeader: 'text-align:center;padding:0.5rem;font-weight:600;font-size:0.8rem;color:var(--ck-text-tertiary);text-transform:uppercase;letter-spacing:0.05em',
    dayCell: 'border:1px solid var(--ck-border-subtle);border-radius:8px;padding:0.5rem;min-height:5rem;transition:background 0.15s',
    dayCellActive: 'border:1px solid var(--ck-border-subtle);border-radius:8px;padding:0.5rem;min-height:5rem;background:rgba(255,255,255,0.03);transition:background 0.15s',
    dayCellEmpty: 'border:1px solid transparent;border-radius:8px;padding:0.5rem;min-height:5rem;opacity:0.3',
    dayNum: 'font-size:0.8rem;font-weight:500;color:var(--ck-text-secondary)',
    todayNum: 'font-size:0.8rem;font-weight:700;color:rgba(99,179,237,1);background:rgba(99,179,237,0.15);width:1.5rem;height:1.5rem;border-radius:50%;display:inline-flex;align-items:center;justify-content:center',
  };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const headerHtml = days.map(d => `<div style="${s.dayHeader}">${d}</div>`).join('');

  let cellsHtml = '';
  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstDay + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cellsHtml += `<div style="${s.dayCellEmpty}"></div>`;
    } else {
      const isToday = dayNum === today;
      const numStyle = isToday ? s.todayNum : s.dayNum;
      cellsHtml += `<div style="${isToday ? s.dayCellActive : s.dayCellActive}">
        <span style="${numStyle}">${dayNum}</span>
      </div>`;
    }
  }

  function ContentCalendar() {
    return React.createElement('div', { dangerouslySetInnerHTML: { __html: `
      <div style="${s.page}">
        <h2 style="${s.h2}">Content Calendar</h2>
        <div style="${s.banner}">
          📅 Schedule and plan your content
        </div>
        <div style="${s.card}">
          <div style="text-align:center;font-weight:600;font-size:1.1rem;color:var(--ck-text-primary);margin-bottom:1rem">${monthName}</div>
          <div style="${s.grid7}">${headerHtml}</div>
          <div style="${s.grid7};margin-top:4px">${cellsHtml}</div>
          <p style="${s.mutedSm}">Scheduled posts will appear on their respective dates. Drag to reschedule.</p>
        </div>
      </div>
    ` } });
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-calendar', ContentCalendar);
})();
