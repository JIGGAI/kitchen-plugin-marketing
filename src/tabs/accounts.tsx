/**
 * Accounts Tab Component — self-registering browser bundle
 */
(function () {
  const React = (window as any).React;
  if (!React) return;

  function Accounts() {
    return React.createElement('div', { dangerouslySetInnerHTML: { __html: `
      <div class="p-6">
        <h2 class="text-2xl font-bold mb-4">Social Media Accounts</h2>
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p class="text-yellow-800">🔗 Connect and manage your social media accounts here!</p>
        </div>
        <div style="margin-bottom:1.5rem">
          <h3 class="font-semibold text-lg mb-3">Add New Account</h3>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem">
            <button class="bg-blue-500 text-white p-4 rounded-lg hover:bg-blue-600" style="cursor:pointer;border:none">
              <div style="font-size:1.25rem;margin-bottom:0.5rem">🐦</div>
              <div>Twitter/X</div>
            </button>
            <button class="bg-pink-500 text-white p-4 rounded-lg hover:bg-pink-600" style="cursor:pointer;border:none">
              <div style="font-size:1.25rem;margin-bottom:0.5rem">📷</div>
              <div>Instagram</div>
            </button>
            <button class="bg-red-500 text-white p-4 rounded-lg hover:bg-red-600" style="cursor:pointer;border:none">
              <div style="font-size:1.25rem;margin-bottom:0.5rem">🎬</div>
              <div>YouTube</div>
            </button>
            <button class="bg-purple-500 text-white p-4 rounded-lg hover:bg-purple-600" style="cursor:pointer;border:none">
              <div style="font-size:1.25rem;margin-bottom:0.5rem">🎵</div>
              <div>TikTok</div>
            </button>
          </div>
        </div>
        <div class="bg-white border rounded-lg p-6">
          <h3 class="font-semibold text-lg mb-4">Connected Accounts</h3>
          <div style="text-align:center;padding:2rem 0">
            <div style="font-size:2.5rem;margin-bottom:0.5rem">🔌</div>
            <p class="text-gray-600">No accounts connected yet</p>
            <p class="text-sm text-gray-500">Click one of the platforms above to get started</p>
          </div>
        </div>
      </div>
    ` } });
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'accounts', Accounts);
})();
