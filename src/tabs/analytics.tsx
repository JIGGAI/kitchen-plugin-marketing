/**
 * Analytics Tab Component — self-registering browser bundle
 */
(function () {
  const React = (window as any).React;
  if (!React) return;

  function Analytics() {
    return React.createElement('div', { dangerouslySetInnerHTML: { __html: `
      <div class="p-6">
        <h2 class="text-2xl font-bold mb-4">Analytics</h2>
        <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <p class="text-purple-800">📊 Track your content performance!</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin-bottom:1.5rem">
          <div class="bg-white border rounded-lg p-4">
            <div class="text-2xl font-bold text-blue-600">0</div>
            <div class="text-gray-600">Total Posts</div>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <div class="text-2xl font-bold text-green-600">0</div>
            <div class="text-gray-600">Total Engagement</div>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <div class="text-2xl font-bold text-orange-600">0</div>
            <div class="text-gray-600">New Followers</div>
          </div>
        </div>
        <div class="bg-white border rounded-lg p-6">
          <h3 class="font-semibold text-lg mb-4">Engagement Over Time</h3>
          <div class="h-64 bg-gray-50 rounded border" style="display:flex;align-items:center;justify-content:center">
            <div style="text-align:center">
              <div style="font-size:2.5rem;margin-bottom:0.5rem">📈</div>
              <p class="text-gray-600">Your engagement chart will appear here</p>
              <p class="text-sm text-gray-500">Start publishing content to see analytics</p>
            </div>
          </div>
        </div>
      </div>
    ` } });
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'analytics', Analytics);
})();
