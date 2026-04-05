/**
 * Content Calendar Tab Component — self-registering browser bundle
 */
(function () {
  const React = (window as any).React;
  if (!React) return;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const headerHtml = days.map(d => `<div class="font-semibold text-center p-2">${d}</div>`).join('');
  const cellsHtml = Array.from({ length: 35 }, (_, i) => {
    const day = i < 31 ? i + 1 : '';
    return `<div class="border rounded p-2 h-20 ${day ? 'bg-gray-50' : 'bg-gray-100'}">
      ${day ? `<div class="text-sm font-medium">${day}</div>` : ''}
    </div>`;
  }).join('');

  function ContentCalendar() {
    return React.createElement('div', { dangerouslySetInnerHTML: { __html: `
      <div class="p-6">
        <h2 class="text-2xl font-bold mb-4">Content Calendar</h2>
        <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p class="text-green-800">📅 Schedule and plan your content!</p>
        </div>
        <div class="bg-white border rounded-lg p-6">
          <div class="grid grid-cols-7 gap-2 mb-4">${headerHtml}</div>
          <div class="grid grid-cols-7 gap-2">${cellsHtml}</div>
          <p class="text-gray-500 text-sm mt-4">Scheduled posts would appear on their respective dates.</p>
        </div>
      </div>
    ` } });
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-calendar', ContentCalendar);
})();
