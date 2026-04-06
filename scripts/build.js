#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

console.log('Building kitchen-plugin-marketing...\n');

// Clean dist
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'api'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'tabs'), { recursive: true });

const externals = '--external:better-sqlite3 --external:drizzle-orm --external:drizzle-orm/* --external:express --external:multer --external:crypto --external:path --external:fs --external:fs/promises --external:node:crypto';

try {
  // 1. Build main entry point
  execSync(
    `esbuild src/index.ts --bundle --platform=node --target=node18 --format=cjs --outfile=dist/index.js ${externals}`,
    { cwd: root, stdio: 'inherit' }
  );
  console.log('✓ Built dist/index.js (main entry)');

  // 2. Build API handler (Kitchen expects handleRequest())
  execSync(
    `esbuild src/api/handler.ts --bundle --platform=node --target=node18 --format=cjs --outfile=dist/api/handler.js ${externals}`,
    { cwd: root, stdio: 'inherit' }
  );
  console.log('✓ Built dist/api/handler.js (Kitchen API handler)');

  // 3. Build browser tabs
  const tabsDir = path.join(root, 'src/tabs');
  const tabFiles = fs.readdirSync(tabsDir).filter(f => f.endsWith('.tsx'));
  
  for (const tabFile of tabFiles) {
    const name = tabFile.replace('.tsx', '');
    execSync(
      `esbuild src/tabs/${tabFile} --bundle --platform=browser --target=es2020 --format=iife --outfile=dist/tabs/${name}.js --external:react --external:react-dom --jsx=automatic`,
      { cwd: root, stdio: 'inherit' }
    );
    console.log(`✓ Built dist/tabs/${name}.js (browser tab)`);
  }

  // 4. Copy database migrations
  const migrationsDir = path.join(root, 'db/migrations');
  const distMigrationsDir = path.join(distDir, 'db/migrations');
  fs.mkdirSync(distMigrationsDir, { recursive: true });
  for (const file of fs.readdirSync(migrationsDir)) {
    const src = path.join(migrationsDir, file);
    const dest = path.join(distMigrationsDir, file);
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
  console.log('✓ Copied database migrations');

  console.log('\n✅ Build complete! Plugin ready for installation.\n');

} catch (error) {
  console.error('✗ Build failed:', error.message);
  process.exit(1);
}
