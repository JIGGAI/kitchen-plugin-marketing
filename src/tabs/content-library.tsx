/**
 * Content Library Tab Component — self-registering browser bundle
 */
(function () {
  const React = (window as any).React;
  if (!React) return;

  function ContentLibrary() {
    return React.createElement('div', { dangerouslySetInnerHTML: { __html: `
      <div class="p-6">
        <h2 class="text-2xl font-bold mb-4">Content Library</h2>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p class="text-blue-800">🎉 Marketing Suite plugin is working! This is the Content Library tab.</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div class="bg-white border rounded-lg p-4">
            <h3 class="font-semibold text-lg mb-2">Create New Post</h3>
            <p class="text-gray-600">Your content creation tools would go here. You could add:</p>
            <ul class="list-disc list-inside mt-2 text-gray-600">
              <li>Rich text editor</li>
              <li>Media upload</li>
              <li>Platform selection (Twitter, Instagram, etc.)</li>
              <li>Scheduling options</li>
            </ul>
          </div>
          <div class="bg-white border rounded-lg p-4">
            <h3 class="font-semibold text-lg mb-2">Recent Posts</h3>
            <p class="text-gray-500 italic">No posts yet. Create your first post above!</p>
          </div>
        </div>
      </div>
    ` } });
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
