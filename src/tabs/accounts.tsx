/**
 * Accounts Tab Component
 */

export default function Accounts() {
  return `
    <div class="p-6">
      <h2 class="text-2xl font-bold mb-4">Social Media Accounts</h2>
      <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p class="text-yellow-800">🔗 Connect and manage your social media accounts here!</p>
      </div>
      
      <div class="mb-6">
        <h3 class="font-semibold text-lg mb-3">Add New Account</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button class="bg-blue-500 text-white p-4 rounded-lg hover:bg-blue-600 transition-colors">
            <div class="text-xl mb-2">🐦</div>
            <div>Twitter/X</div>
          </button>
          <button class="bg-pink-500 text-white p-4 rounded-lg hover:bg-pink-600 transition-colors">
            <div class="text-xl mb-2">📷</div>
            <div>Instagram</div>
          </button>
          <button class="bg-red-500 text-white p-4 rounded-lg hover:bg-red-600 transition-colors">
            <div class="text-xl mb-2">🎬</div>
            <div>YouTube</div>
          </button>
          <button class="bg-purple-500 text-white p-4 rounded-lg hover:bg-purple-600 transition-colors">
            <div class="text-xl mb-2">🎵</div>
            <div>TikTok</div>
          </button>
        </div>
      </div>
      
      <div class="bg-white border rounded-lg p-6">
        <h3 class="font-semibold text-lg mb-4">Connected Accounts</h3>
        <div class="text-center py-8">
          <div class="text-4xl mb-2">🔌</div>
          <p class="text-gray-600">No accounts connected yet</p>
          <p class="text-sm text-gray-500">Click one of the platforms above to get started</p>
        </div>
      </div>
    </div>
  `;
}