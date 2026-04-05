/**
 * Simple build script for Marketing Plugin
 */

const { build } = require('esbuild');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

async function buildPlugin() {
  console.log('Building Marketing Plugin...');

  // Build API routes
  await build({
    entryPoints: ['src/api/routes.ts'],
    bundle: true,
    outfile: 'dist/api/routes.js',
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: ['next/server']
  });

  // Build tab components as simple modules
  const tabs = ['content-library', 'content-calendar', 'analytics', 'accounts'];
  
  for (const tab of tabs) {
    const source = readFileSync(`src/tabs/${tab}.tsx`, 'utf-8');
    
    // Simple transformation - extract the return template literal
    const match = source.match(/return\s+`([\s\S]*?)`;/);
    if (match) {
      const template = match[1];
      const jsContent = `
// Marketing Plugin - ${tab} tab
(function() {
  const html = \`${template}\`;
  
  // Simple DOM injection for demo
  if (typeof document !== 'undefined') {
    const container = document.getElementById('plugin-content');
    if (container) {
      container.innerHTML = html;
    }
  }
  
  // Export for potential import
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { html };
  }
})();
      `.trim();
      
      writeFileSync(`dist/tabs/${tab}.js`, jsContent);
    }
  }

  console.log('Build complete!');
}

buildPlugin().catch(console.error);