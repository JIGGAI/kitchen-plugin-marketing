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

export function loadConfigEnv(): Record<string, string> {
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

export function normalizeGenerationError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('"code":1102')
    || /Account balance not enough/i.test(message)
    || /balance not enough/i.test(message)
  ) {
    const requestId = message.match(/"request_id"\s*:\s*"([^"]+)"/)?.[1];
    const suffix = requestId ? ` Kling request id: ${requestId}.` : '';
    return new Error(`Kling AI account balance is too low to create this video. Add Kling credits or switch to a non-Kling video provider, then try again.${suffix}`);
  }

  return error instanceof Error ? error : new Error(message);
}

export async function generateImage(
  sourcePath: string,
  prompt: string,
  outputDir: string,
  config?: Record<string, unknown>,
): Promise<DriverResult> {
  const configEnv = loadConfigEnv();

  mkdirSync(outputDir, { recursive: true });

  // Try nano-banana-pro skill first — image edit via Gemini 3 Pro Image.
  const banana = await tryNanoBananaPro({
    prompt,
    outputDir,
    configEnv,
    config,
    sourcePaths: [sourcePath],
  });
  if (banana) return banana;

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

  const attempt = async () => callGeminiImageEdit(prompt, sourceMime, sourceBase64, configEnv.GEMINI_API_KEY!, outputDir);
  try {
    return await attempt();
  } catch (e: any) {
    if (isTransientGeminiFailure(e)) return await attempt();
    throw e;
  }
}

async function callGeminiImageEdit(
  prompt: string,
  sourceMime: string,
  sourceBase64: string,
  apiKey: string,
  outputDir: string,
): Promise<DriverResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
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

  let stdout = '';
  try {
    ({ stdout } = await spawnScript('node', scriptPath, [
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
    }));
  } catch (error) {
    throw normalizeGenerationError(error);
  }

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
/*  Text-to-video generation (no source image required)               */
/* ------------------------------------------------------------------ */

export async function generateVideoFromPrompt(
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

  let stdout = '';
  try {
    ({ stdout } = await spawnScript('node', scriptPath, [
      '--prompt', prompt,
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
        KLING_MEDIA_ROOTS: outputDir,
      },
      timeoutMs: 300_000,
    }));
  } catch (error) {
    throw normalizeGenerationError(error);
  }

  const doneMatch = stdout.match(/(?:Done|Saved|完成|已保存):\s*(.+\.mp4)/m);
  let videoPath = doneMatch ? doneMatch[1].trim() : '';

  if (!videoPath || !existsSync(videoPath)) {
    const files = readdirSync(outputDir).filter(f => f.endsWith('.mp4')).sort().reverse();
    if (files.length) videoPath = join(outputDir, files[0]);
  }

  if (!videoPath || !existsSync(videoPath)) {
    throw new Error(`No generated video found. Script output: ${stdout.slice(0, 500)}`);
  }

  return { filePath: videoPath, metadata: { skill: 'klingai', mode: 'text-to-video', prompt } };
}

/* ------------------------------------------------------------------ */
/*  Nano Banana Pro (Gemini 3 Pro Image) — shared runner              */
/*                                                                    */
/*  The skill ships a PEP 723 script that declares its own Python     */
/*  deps inline, so we run it via `uv run` (which installs deps on    */
/*  first use into a hidden cache). If uv isn't available we skip     */
/*  the skill and let the caller fall back to the direct Gemini path. */
/*  Handles both text-to-image (no --image) and image-edit (one or    */
/*  more --image args). Multi-image composition is limited to 14 by   */
/*  the underlying script.                                            */
/* ------------------------------------------------------------------ */

async function tryNanoBananaPro(opts: {
  prompt: string;
  outputDir: string;
  configEnv: Record<string, string>;
  config?: Record<string, unknown>;
  sourcePaths?: string[];
}): Promise<DriverResult | null> {
  const skillDir = findSkillDir('nano-banana-pro');
  if (!skillDir) return null;
  const scriptPath = join(skillDir, 'scripts', 'generate_image.py');
  if (!existsSync(scriptPath)) return null;

  // The script is a PEP 723 module with inline deps — needs `uv run`.
  // If uv isn't on PATH, defer to caller's Gemini fallback.
  const uvPath = findExecutable('uv');
  if (!uvPath) return null;

  const filename = 'nano-banana.png';
  const resolution = String(opts.config?.resolution ?? '1K');
  // spawnScript calls execFile(runner, [scriptArg, ...args]), so with
  // runner='uv' + scriptArg='run' + args=[scriptPath, ...rest] the final
  // argv is `uv run <script> --prompt ... --filename ... --resolution ...`.
  const scriptArgs: string[] = [
    scriptPath,
    '--prompt', opts.prompt,
    '--filename', filename,
    '--resolution', resolution,
  ];
  for (const src of opts.sourcePaths || []) scriptArgs.push('-i', src);

  const env: Record<string, string> = {
    ...opts.configEnv,
    HOME: homedir(),
  };

  let stdout = '';
  try {
    const result = await spawnScript(uvPath, 'run', scriptArgs, {
      cwd: opts.outputDir,
      env,
      timeoutMs: 240_000,
    });
    stdout = result.stdout;
  } catch (e: any) {
    console.warn('[nano-banana-pro] uv run failed:', e?.message?.slice(0, 300));
    return null;
  }

  // The script prints its output path as "MEDIA: <abs-path>" on the last
  // line. Fall back to the requested filename or any image in outputDir
  // if we can't parse it.
  const mediaMatch = stdout.match(/^MEDIA:\s*(.+)$/m);
  if (mediaMatch && existsSync(mediaMatch[1].trim())) {
    return { filePath: mediaMatch[1].trim(), metadata: { skill: 'nano-banana-pro', prompt: opts.prompt } };
  }
  const direct = join(opts.outputDir, filename);
  if (existsSync(direct)) {
    return { filePath: direct, metadata: { skill: 'nano-banana-pro', prompt: opts.prompt } };
  }
  const anyImage = readdirSync(opts.outputDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));
  if (anyImage.length) {
    return { filePath: join(opts.outputDir, anyImage[0]), metadata: { skill: 'nano-banana-pro', prompt: opts.prompt } };
  }
  return null;
}

function findExecutable(name: string): string | null {
  const path = process.env.PATH || '';
  for (const dir of path.split(':')) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  // Homebrew's default paths might not be on the OpenClaw runner PATH.
  for (const abs of ['/opt/homebrew/bin/uv', '/usr/local/bin/uv']) {
    if (name === 'uv' && existsSync(abs)) return abs;
  }
  return null;
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

  mkdirSync(outputDir, { recursive: true });

  // Prefer nano-banana-pro (Gemini 3 Pro Image) when the skill is installed
  // and uv is available — better quality than the flash-image direct call.
  const banana = await tryNanoBananaPro({
    prompt,
    outputDir,
    configEnv,
    config,
    // No sourcePaths → text-to-image mode.
  });
  if (banana) return banana;

  if (!configEnv.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Set it in ~/.config/openclaw/env');
  }

  mkdirSync(outputDir, { recursive: true });

  // Gemini occasionally returns 200 OK with no inlineData part — the model
  // "answered" the prompt with text-only refusal or empty candidates. Both
  // are non-deterministic, so a single retry salvages most of them.
  const attempt = async () => callGeminiTextToImage(prompt, configEnv.GEMINI_API_KEY!, outputDir);
  try {
    return await attempt();
  } catch (e: any) {
    if (isTransientGeminiFailure(e)) return await attempt();
    throw e;
  }
}

async function callGeminiTextToImage(
  prompt: string,
  apiKey: string,
  outputDir: string,
): Promise<DriverResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
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

// Retry these categories exactly once. Both are known-flaky Gemini failure
// modes that resolve on a re-try in practice.
function isTransientGeminiFailure(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  if (/no image data in the response/i.test(message)) return true;
  if (/Gemini API error \((?:429|5\d\d)\)/.test(message)) return true;
  return false;
}
