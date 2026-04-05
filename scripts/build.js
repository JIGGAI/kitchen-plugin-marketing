#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building kitchen-plugin-marketing...');

// Create dist directory
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Create dist/api and dist/tabs directories
const distApiDir = path.join(distDir, 'api');
const distTabsDir = path.join(distDir, 'tabs');
fs.mkdirSync(distApiDir, { recursive: true });
fs.mkdirSync(distTabsDir, { recursive: true });

// Copy source files to dist (simple copy for now)
try {
  execSync(`cp -r src/* ${distDir}/`, { stdio: 'inherit' });
  console.log('✓ TypeScript files copied to dist/');

  // Copy package.json and other required files
  execSync(`cp package.json ${distDir}/`, { stdio: 'inherit' });
  execSync(`cp README.md ${distDir}/`, { stdio: 'inherit' });
  
  // Copy database files
  execSync(`cp -r db ${distDir}/`, { stdio: 'inherit' });
  execSync(`cp drizzle.config.ts ${distDir}/`, { stdio: 'inherit' });
  
  console.log('✓ Package files copied');
  
  console.log('✓ Build complete! Plugin ready for installation.');
  console.log('');
  console.log('Next steps:');
  console.log('1. Install in ClawKitchen: npm install /path/to/kitchen-plugin-marketing');
  console.log('2. Or publish to npm: npm publish');
  
} catch (error) {
  console.error('✗ Build failed:', error.message);
  process.exit(1);
}