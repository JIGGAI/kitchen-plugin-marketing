/**
 * Content Calendar Tab Component
 */

export default function ContentCalendar() {
  return `
    <div class="p-6">
      <h2 class="text-2xl font-bold mb-4">Content Calendar</h2>
      <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <p class="text-green-800">📅 This is the Content Calendar tab - schedule and plan your content!</p>
      </div>
      <div class="bg-white border rounded-lg p-6">
        <div class="grid grid-cols-7 gap-2 mb-4">
          <div class="font-semibold text-center p-2">Sun</div>
          <div class="font-semibold text-center p-2">Mon</div>
          <div class="font-semibold text-center p-2">Tue</div>
          <div class="font-semibold text-center p-2">Wed</div>
          <div class="font-semibold text-center p-2">Thu</div>
          <div class="font-semibold text-center p-2">Fri</div>
          <div class="font-semibold text-center p-2">Sat</div>
        </div>
        <div class="grid grid-cols-7 gap-2">
          ${Array.from({ length: 35 }, (_, i) => {
            const day = ((i % 7) === 0) ? Math.floor(i / 7) + 1 : '';
            return `<div class="border rounded p-2 h-20 ${day ? 'bg-gray-50' : 'bg-gray-100'}">
              ${day ? `<div class="text-sm font-medium">${day}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <p class="text-gray-500 text-sm mt-4">Scheduled posts would appear on their respective dates. Drag to reschedule!</p>
      </div>
    </div>
  `;
}