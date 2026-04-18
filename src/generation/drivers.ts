import { existsSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { homedir } from 'os';
import { execFile } from 'child_process';
import type { DriverResult } from './types';

const SKILL_ROOTS = [
  join(homedir(), '.openclaw', 'skills'),
  join(homedir(), '.openclaw', 'workspace', 'skills'),
  join(homedir(), '.openclaw', 'workspace'),
];

function findSkillDir(slug: string): string | null {
  for (const root of SKILL_ROOTS) {
    const dir = join(root, slug);
    if (existsSync(dir)) return dir;
  }
  return null;
}

function loadConfigEnv(): Record<string, string> {
  const envPath = join(homedir(), '.config', 'openclaw', 'env');
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && val) env[key] = val;
    }
  } catch { /* env file missing */ }
  return env;
}

function spawnScript(
  runner: string,
  scriptPath: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string>; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(runner, [scriptPath, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        const msg = [
          error.message || 'Script execution failed',
          stdout ? `\n--- stdout ---\n${String(stdout).trim()}` : '',
          stderr ? `\n--- stderr ---\n${String(stderr).trim()}` : '',
        ].filter(Boolean).join('');
        reject(new Error(msg));
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

export async function generateImage(
  sourcePath: string,
  prompt: string,
  outputDir: string,
  config?: Record<string, unknown>,
): Promise<DriverResult> {
  const configEnv = loadConfigEnv();

  mkdirSync(outputDir, { recursive: true });

  // Try nano-banana-pro skill first (may have its own auth)
  const skillDir = findSkillDir('nano-banana-pro');
  if (skillDir) {
    const scriptPath = join(skillDir, 'scripts', 'generate_image.py');
    if (existsSync(scriptPath)) {
      const venvPython = join(skillDir, '.venv', 'bin', 'python');
      const runner = existsSync(venvPython) ? venvPython : 'python3';
      const resolution = String(config?.resolution ?? '1K');

      const { stdout } = await spawnScript(runner, scriptPath, [
        '--prompt', prompt,
        '--filename', 'output.png',
        '--resolution', resolution,
      ], {
        cwd: outputDir,
        env: { ...configEnv, HOME: homedir() },
        timeoutMs: 180_000,
      });

      const outputPath = stdout.trim();
      if (outputPath && existsSync(outputPath)) {
        return { filePath: outputPath, metadata: { skill: 'nano-banana-pro', prompt } };
      }
      const files = readdirSync(outputDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
      if (files.length) {
        return { filePath: join(outputDir, files[0]), metadata: { skill: 'nano-banana-pro', prompt } };
      }
    }
  }

  // Fallback: direct Gemini API (requires GEMINI_API_KEY)
  if (!configEnv.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Set it in ~/.config/openclaw/env');
  }
  const sourceBuffer = await readFile(sourcePath);
  const sourceBase64 = sourceBuffer.toString('base64');
  const ext = extname(sourcePath).toLowerCase();
  const MIME_MAP: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif',
  };
  const sourceMime = MIME_MAP[ext] || 'image/png';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${configEnv.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `Edit this image: ${prompt}` },
            { inlineData: { mimeType: sourceMime, data: sourceBase64 } },
          ],
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Gemini API error (${response.status}): ${errBody.slice(0, 500)}`);
  }

  const result = await response.json();
  for (const candidate of result.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.data) {
        const outMime = part.inlineData.mimeType || 'image/png';
        const outExt = outMime.includes('jpeg') ? '.jpg' : outMime.includes('webp') ? '.webp' : '.png';
        const outPath = join(outputDir, `generated${outExt}`);
        await writeFile(outPath, Buffer.from(part.inlineData.data, 'base64'));
        return { filePath: outPath, metadata: { skill: 'gemini-direct', prompt } };
      }
    }
  }

  throw new Error('Gemini returned no image data in the response');
}

export async function generateVideo(
  sourcePath: string,
  prompt: string,
  outputDir: string,
  config?: Record<string, unknown>,
): Promise<DriverResult> {
  const skillDir = findSkillDir('klingai');
  if (!skillDir) {
    throw new Error('klingai skill is not installed. Install via: clawhub install klingai --force');
  }

  const scriptPath = join(skillDir, 'scripts', 'video.mjs');
  if (!existsSync(scriptPath)) {
    throw new Error(`klingai video script not found at ${scriptPath}`);
  }

  const credPath = join(homedir(), '.config', 'kling', '.credentials');
  if (!existsSync(credPath)) {
    throw new Error(
      'Kling AI credentials not configured. '
      + 'Create ~/.config/kling/.credentials with access_key_id and secret_access_key',
    );
  }

  mkdirSync(outputDir, { recursive: true });
  const configEnv = loadConfigEnv();
  const duration = String(config?.duration ?? 5);
  const aspectRatio = String(config?.aspectRatio ?? '16:9');

  const { stdout } = await spawnScript('node', scriptPath, [
    '--prompt', prompt,
    '--image', sourcePath,
    '--output_dir', outputDir,
    '--duration', duration,
    '--aspect_ratio', aspectRatio,
    '--mode', 'pro',
  ], {
    cwd: outputDir,
    env: {
      ...configEnv,
      HOME: homedir(),
      KLING_ALLOW_ABSOLUTE_PATHS: '1',
      KLING_MEDIA_ROOTS: [dirname(sourcePath), outputDir].join(','),
    },
    timeoutMs: 300_000,
  });

  const doneMatch = stdout.match(/(?:Done|Saved|完成|已保存):\s*(.+\.mp4)/m);
  let videoPath = doneMatch ? doneMatch[1].trim() : '';

  if (!videoPath || !existsSync(videoPath)) {
    const files = readdirSync(outputDir).filter(f => f.endsWith('.mp4')).sort().reverse();
    if (files.length) videoPath = join(outputDir, files[0]);
  }

  if (!videoPath || !existsSync(videoPath)) {
    throw new Error(`No generated video found. Script output: ${stdout.slice(0, 500)}`);
  }

  return { filePath: videoPath, metadata: { skill: 'klingai', prompt } };
}

/* ------------------------------------------------------------------ */
/*  Text-to-image generation (no source image required)               */
/* ------------------------------------------------------------------ */

export async function generateImageFromPrompt(
  prompt: string,
  outputDir: string,
  config?: Record<string, unknown>,
): Promise<DriverResult> {
  const configEnv = loadConfigEnv();
  if (!configEnv.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Set it in ~/.config/openclaw/env');
  }

  mkdirSync(outputDir, { recursive: true });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${configEnv.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `Generate this image: ${prompt}` },
          ],
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Gemini API error (${response.status}): ${errBody.slice(0, 500)}`);
  }

  const result = await response.json();
  for (const candidate of result.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.data) {
        const outMime = part.inlineData.mimeType || 'image/png';
        const outExt = outMime.includes('jpeg') ? '.jpg' : outMime.includes('webp') ? '.webp' : '.png';
        const outPath = join(outputDir, `generated${outExt}`);
        await writeFile(outPath, Buffer.from(part.inlineData.data, 'base64'));
        return { filePath: outPath, metadata: { skill: 'gemini-text-to-image', prompt } };
      }
    }
  }

  throw new Error('Gemini returned no image data in the response');
}
