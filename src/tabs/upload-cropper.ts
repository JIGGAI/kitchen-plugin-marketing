type CropPreset = 'original' | 'square' | 'portrait' | 'landscape' | 'story';

const PRESET_RATIOS: Record<Exclude<CropPreset, 'original'>, { width: number; height: number }> = {
  square: { width: 1, height: 1 },
  portrait: { width: 4, height: 5 },
  landscape: { width: 191, height: 100 },
  story: { width: 9, height: 16 },
};

const TARGET_LONG_SIDE = 2048;

function isCropPreset(value: string): value is Exclude<CropPreset, 'original'> {
  return value === 'square' || value === 'portrait' || value === 'landscape' || value === 'story';
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function outputSize(preset: Exclude<CropPreset, 'original'>): { width: number; height: number } {
  const ratio = PRESET_RATIOS[preset].width / PRESET_RATIOS[preset].height;
  if (ratio >= 1) return { width: TARGET_LONG_SIDE, height: Math.round(TARGET_LONG_SIDE / ratio) };
  return { width: Math.round(TARGET_LONG_SIDE * ratio), height: TARGET_LONG_SIDE };
}

async function cropToDataUrl(
  sourceUrl: string,
  preset: Exclude<CropPreset, 'original'>,
  focal: { x: number; y: number },
  zoom: number,
): Promise<string> {
  const img = await loadImage(sourceUrl);
  const ratio = PRESET_RATIOS[preset].width / PRESET_RATIOS[preset].height;
  let cropWidth = img.naturalWidth;
  let cropHeight = cropWidth / ratio;
  if (cropHeight > img.naturalHeight) {
    cropHeight = img.naturalHeight;
    cropWidth = cropHeight * ratio;
  }
  cropWidth = cropWidth / Math.max(1, zoom);
  cropHeight = cropHeight / Math.max(1, zoom);

  const centerX = focal.x * img.naturalWidth;
  const centerY = focal.y * img.naturalHeight;
  const sx = clamp(centerX - cropWidth / 2, 0, img.naturalWidth - cropWidth);
  const sy = clamp(centerY - cropHeight / 2, 0, img.naturalHeight - cropHeight);
  const out = outputSize(preset);
  const canvas = document.createElement('canvas');
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare crop canvas');
  ctx.drawImage(img, sx, sy, cropWidth, cropHeight, 0, 0, out.width, out.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

function croppedFilename(file: File): string {
  return file.name.replace(/\.[^.]+$/, '') + '-crop.jpg';
}

export function useUploadCropper(options: {
  React: any;
  h: any;
  apiBase: string;
  teamId: string;
  cropPreset: CropPreset | string;
  setUploading: (value: boolean) => void;
  setError: (message: string | null) => void;
  onUploaded: (item: any) => void;
  afterUpload: () => Promise<void>;
  fileInputRef?: { current: HTMLInputElement | null };
  buttonStyle: Record<string, unknown>;
  inputStyle: Record<string, unknown>;
}) {
  const { React: R, h } = options;
  const useState = R.useState as typeof R.useState;
  const useEffect = R.useEffect as typeof R.useEffect;
  const useRef = R.useRef as typeof R.useRef;

  const [queue, setQueue] = useState<File[]>([]);
  const [current, setCurrent] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [focal, setFocal] = useState({ x: 0.5, y: 0.5 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const preset = isCropPreset(String(options.cropPreset)) ? String(options.cropPreset) as Exclude<CropPreset, 'original'> : null;

  async function uploadDataUrl(dataUrl: string, file: File, cropPreset: CropPreset | string = 'original', forceJpeg = false) {
    const res = await fetch(`${options.apiBase}/media?team=${encodeURIComponent(options.teamId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: dataUrl,
        filename: forceJpeg ? croppedFilename(file) : file.name,
        mimeType: forceJpeg ? 'image/jpeg' : file.type,
        cropPreset,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Upload failed (${res.status})`);
    }
    options.onUploaded(await res.json());
  }

  async function uploadOriginals(files: File[], cropPreset: CropPreset | string = options.cropPreset) {
    if (!files.length) return;
    options.setUploading(true);
    options.setError(null);
    try {
      for (const file of files) {
        await uploadDataUrl(await readFileDataUrl(file), file, cropPreset);
      }
      await options.afterUpload();
    } catch (e: any) {
      options.setError(e?.message || 'Upload failed');
    } finally {
      options.setUploading(false);
      if (options.fileInputRef?.current) options.fileInputRef.current.value = '';
    }
  }

  function openNext(files: File[]) {
    const [next, ...rest] = files;
    setQueue(rest);
    setCurrent(next || null);
    setFocal({ x: 0.5, y: 0.5 });
    setZoom(1);
  }

  async function start(files: FileList | null) {
    if (!files || files.length === 0) return;
    const items = Array.from(files);
    if (!preset) {
      await uploadOriginals(items, 'original');
      return;
    }
    const cropItems = items.filter((file) => file.type.startsWith('image/'));
    const passthrough = items.filter((file) => !file.type.startsWith('image/'));
    if (passthrough.length) await uploadOriginals(passthrough, 'original');
    if (cropItems.length) openNext(cropItems);
  }

  async function finish(useCrop: boolean) {
    if (!current) return;
    setBusy(true);
    options.setUploading(true);
    options.setError(null);
    try {
      if (useCrop && preset) {
        const dataUrl = await cropToDataUrl(previewUrl, preset, focal, zoom);
        await uploadDataUrl(dataUrl, current, 'original', true);
      } else {
        await uploadDataUrl(await readFileDataUrl(current), current, 'original');
      }
      if (queue.length) {
        openNext(queue);
      } else {
        setCurrent(null);
        setPreviewUrl('');
        await options.afterUpload();
        if (options.fileInputRef?.current) options.fileInputRef.current.value = '';
      }
    } catch (e: any) {
      options.setError(e?.message || 'Upload failed');
    } finally {
      setBusy(false);
      options.setUploading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!current) return;
    readFileDataUrl(current).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    }).catch((e) => options.setError(e?.message || 'Could not preview image'));
    return () => { cancelled = true; };
  }, [current]);

  const ratio = preset ? PRESET_RATIOS[preset].width / PRESET_RATIOS[preset].height : 1;
  const frameWidth = ratio >= 1 ? 360 : Math.round(360 * ratio);
  const frameHeight = ratio >= 1 ? Math.round(360 / ratio) : 360;

  const modal = current && preset ? h('div', {
    style: {
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.68)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    },
  },
    h('div', {
      style: {
        width: 'min(520px, 100%)',
        background: 'var(--ck-surface, #151515)',
        border: '1px solid var(--ck-border-subtle)',
        borderRadius: '8px',
        padding: '1rem',
        color: 'var(--ck-text-primary)',
      },
    },
      h('div', { style: { fontWeight: 700, marginBottom: '0.75rem' } }, `Crop ${current.name}`),
      h('div', {
        style: {
          width: `${frameWidth}px`,
          maxWidth: '100%',
          height: `${frameHeight}px`,
          margin: '0 auto',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.28)',
          background: 'rgba(0,0,0,0.4)',
          cursor: 'grab',
          touchAction: 'none',
        },
        onPointerDown: (e: PointerEvent) => {
          dragRef.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        },
        onPointerMove: (e: PointerEvent) => {
          if (!dragRef.current) return;
          const dx = e.clientX - dragRef.current.x;
          const dy = e.clientY - dragRef.current.y;
          dragRef.current = { x: e.clientX, y: e.clientY };
          setFocal((prev) => ({
            x: clamp(prev.x - dx / frameWidth / zoom, 0, 1),
            y: clamp(prev.y - dy / frameHeight / zoom, 0, 1),
          }));
        },
        onPointerUp: () => { dragRef.current = null; },
        onPointerCancel: () => { dragRef.current = null; },
      },
        previewUrl && h('img', {
          src: previewUrl,
          draggable: false,
          style: {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${focal.x * 100}% ${focal.y * 100}%`,
            transform: `scale(${zoom})`,
            transformOrigin: `${focal.x * 100}% ${focal.y * 100}%`,
            userSelect: 'none',
          },
        }),
      ),
      h('input', {
        type: 'range',
        min: 1,
        max: 2.5,
        step: 0.05,
        value: zoom,
        onChange: (e: any) => setZoom(Number(e.target.value)),
        style: { width: '100%', marginTop: '0.85rem' },
      }),
      h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' } },
        h('button', {
          type: 'button',
          style: options.buttonStyle,
          disabled: busy,
          onClick: () => {
            setCurrent(null);
            setQueue([]);
            setPreviewUrl('');
            if (options.fileInputRef?.current) options.fileInputRef.current.value = '';
          },
        }, 'Cancel'),
        h('button', { type: 'button', style: options.buttonStyle, disabled: busy, onClick: () => void finish(false) }, 'Use Original'),
        h('button', { type: 'button', style: options.buttonStyle, disabled: busy || !previewUrl, onClick: () => void finish(true) }, busy ? 'Uploading...' : 'Apply Crop'),
      ),
    ),
  ) : null;

  return { start, modal };
}
