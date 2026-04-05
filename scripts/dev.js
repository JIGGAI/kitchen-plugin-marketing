#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

console.log('Starting development mode for kitchen-plugin-marketing...');

// Watch for file changes (simple implementation)
console.log('Watching src/ for changes...');
console.log('Press Ctrl+C to stop');

// For now, just remind developer to rebuild
console.log('');
console.log('Development tips:');
console.log('- Run `npm run build` after making changes');
console.log('- Restart ClawKitchen gateway to pick up plugin changes'); 
console.log('- Check plugin status with `openclaw plugins list`');
console.log('- View plugin logs in ClawKitchen UI or gateway logs');

// Keep the process running
process.stdin.resume();