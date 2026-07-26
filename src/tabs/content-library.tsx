/**
 * Content Library Tab — compose, save drafts, publish via driver system
 */
(function () {
  const R = (window as any).React;
  if (!R) return;
  const h = R.createElement;
  const useEffect = R.useEffect as typeof R.useEffect;
  const useMemo = R.useMemo as typeof R.useMemo;
  const useState = R.useState as typeof R.useState;
  const useCallback = R.useCallback as typeof R.useCallback;
  const useRef = R.useRef as typeof R.useRef;

  const t = {
    text: { color: 'var(--ck-text-primary)' },
    muted: { color: 'var(--ck-text-secondary)' },
    faint: { color: 'var(--ck-text-tertiary)' },
    card: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px',
      padding: '1rem',
    },
    input: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px',
      padding: '0.6rem 0.75rem',
      color: 'var(--ck-text-primary)',
      width: '100%',
    },
    btnPrimary: {
      background: 'var(--ck-accent-red)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '0.6rem 0.85rem',
      color: 'white',
      fontWeight: 700,
      cursor: 'pointer',
    },
    btnGhost: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px',
      padding: '0.6rem 0.85rem',
      color: 'var(--ck-text-primary)',
      fontWeight: 600,
      cursor: 'pointer',
    },
    btnPublish: {
      background: 'rgba(99,179,237,0.2)',
      border: '1px solid rgba(99,179,237,0.4)',
      borderRadius: '10px',
      padding: '0.6rem 0.85rem',
      color: 'rgba(210,235,255,0.95)',
      fontWeight: 700,
      cursor: 'pointer',
    },
    pill: (active: boolean, connected: boolean) => ({
      background: active ? 'rgba(99,179,237,0.16)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? 'rgba(99,179,237,0.45)' : 'var(--ck-border-subtle)'}`,
      borderRadius: '999px',
      padding: '0.25rem 0.55rem',
      fontSize: '0.8rem',
      color: active ? 'rgba(210,235,255,0.95)' : connected ? 'var(--ck-text-secondary)' : 'var(--ck-text-tertiary)',
      cursor: connected ? 'pointer' : 'default',
      userSelect: 'none' as const,
      opacity: connected ? 1 : 0.5,
    }),
    statusBadge: (status: string) => {
      const colors: Record<string, string> = {
        draft: 'rgba(167,139,250,0.7)',
        scheduled: 'rgba(251,191,36,0.7)',
        published: 'rgba(74,222,128,0.7)',
        failed: 'rgba(248,113,113,0.7)',
      };
      return {
        display: 'inline-block',
        background: colors[status] || 'rgba(100,100,100,0.5)',
        borderRadius: '999px',
        padding: '0.1rem 0.45rem',
        fontSize: '0.7rem',
        fontWeight: 600,
        color: 'white',
      };
    },
    backendBadge: (backend: string) => {
      const colors: Record<string, string> = {
        postiz: 'rgba(99,179,237,0.5)',
        gateway: 'rgba(134,239,172,0.5)',
        direct: 'rgba(251,191,36,0.5)',
      };
      return {
        display: 'inline-block',
        background: colors[backend] || 'rgba(100,100,100,0.3)',
        borderRadius: '999px',
        padding: '0.05rem 0.35rem',
        fontSize: '0.6rem',
        fontWeight: 600,
        color: 'white',
        marginLeft: '0.25rem',
      };
    },
    charWarn: (pct: number) => ({
      color: pct > 100 ? 'rgba(248,113,113,0.95)' : pct > 90 ? 'rgba(251,191,36,0.9)' : 'var(--ck-text-tertiary)',
      fontSize: '0.75rem',
    }),
    // Modal — uses kitchen design tokens (matches s.overlay / s.modal in
    // content-calendar.tsx) but follows dashboard's topbar + two-column
    // layout pattern for content.
    modalOverlay: {
      position: 'fixed' as const,
      inset: '0',
      background: 'rgba(0,0,0,0.65)',
      display: 'flex' as const,
      alignItems: 'flex-start' as const,
      justifyContent: 'center' as const,
      padding: '16px',
      zIndex: 9999,
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
    },
    modalCard: {
      position: 'relative' as const,
      // Match plugin tab page card color (kitchen --ck-bg-soft, #121b29).
      background: 'var(--ck-bg-soft, #121b29)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '14px',
      width: '96vw',
      maxWidth: '1200px',
      maxHeight: '92vh',
      overflow: 'auto' as const,
      padding: '20px',
    },
    modalCloseBtn: {
      position: 'absolute' as const,
      top: '12px',
      right: '12px',
      background: 'none',
      border: 'none',
      color: 'var(--ck-text-tertiary)',
      cursor: 'pointer' as const,
      fontSize: '1.4rem',
      padding: '0.25rem 0.5rem',
      lineHeight: 1,
    },
    modalTopbar: {
      display: 'grid' as const,
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: '24px',
      paddingRight: '40px',
      paddingBottom: '14px',
      marginBottom: '16px',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    },
    modalTopbarTitle: {
      fontSize: '1rem',
      fontWeight: 700,
      color: 'var(--ck-text-primary)',
    },
    modalTopbarLabel: {
      fontSize: '1rem',
      fontWeight: 600,
      color: 'var(--ck-text-primary)',
    },
    modalTwoCol: {
      display: 'grid' as const,
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      gap: '20px',
    },
  };

  type DriverInfo = {
    platform: string;
    label: string;
    icon: string;
    connected: boolean;
    backend: string;
    displayName: string;
    username?: string;
    avatar?: string;
    integrationId?: string;
    capabilities: {
      canPost: boolean;
      canSchedule: boolean;
      canDelete: boolean;
      canUploadMedia: boolean;
      maxLength?: number;
    };
  };

  type Post = {
    id: string;
    content: string;
    platforms: string[];
    status: string;
    scheduledAt?: string;
    publishedAt?: string;
    createdAt: string;
  };

  function ContentLibrary(props: any) {
    const teamId = String(props?.teamId || 'default');
    const apiBase = useMemo(() => `/api/plugins/marketing`, []);

    const [drivers, setDrivers] = useState<DriverInfo[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('all');

    const [content, setContent] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
    const [scheduledAt, setScheduledAt] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [showMedia, setShowMedia] = useState(false);
    const [mediaLibrary, setMediaLibrary] = useState<any[]>([]);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Media library paging
    const MEDIA_PAGE_SIZE = 24;
    const [mediaPage, setMediaPage] = useState(0);
    const [mediaTotal, setMediaTotal] = useState(0);
    const [mediaHasMore, setMediaHasMore] = useState(false);

    // Media-detail modal state
    const [mediaModalItem, setMediaModalItem] = useState<any | null>(null);
    const [mediaModalUrl, setMediaModalUrl] = useState<string>('');
    const [mediaEditName, setMediaEditName] = useState('');
    const [mediaEditAlt, setMediaEditAlt] = useState('');
    const [mediaEditTagsInput, setMediaEditTagsInput] = useState(''); // comma-separated UI
    const [mediaSaving, setMediaSaving] = useState(false);
    const [mediaDeleting, setMediaDeleting] = useState(false);
    const [mediaModalError, setMediaModalError] = useState<string | null>(null);

    // Generate Media modal state
    const [generateOpen, setGenerateOpen] = useState(false);
    const [generateType, setGenerateType] = useState<'image' | 'video'>('image');
    const [generatePrompt, setGeneratePrompt] = useState('');
    const [generateIncludeBrand, setGenerateIncludeBrand] = useState<boolean>(() => {
      // Persist per-team; default ON so new users get brand-consistent output.
      try {
        const stored = localStorage.getItem(`ck-generate-brand-${teamId}`);
        return stored === null ? true : stored === '1';
      } catch { return true; }
    });
    const [generateSeedId, setGenerateSeedId] = useState<string | null>(null);
    const [generateSeedPickerOpen, setGenerateSeedPickerOpen] = useState(false);
    const [generateSeedItems, setGenerateSeedItems] = useState<any[]>([]);
    const [generateStatus, setGenerateStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [generateStatusText, setGenerateStatusText] = useState('');
    const [generateJobId, setGenerateJobId] = useState<string | null>(null);
    const [generateResultItem, setGenerateResultItem] = useState<any | null>(null);
    const [generateResultUrl, setGenerateResultUrl] = useState<string>('');
    const [generateError, setGenerateError] = useState<string | null>(null);
    const generatePollRef = useRef<any>(null);

    const successTimeout = useRef<any>(null);

    const postizHeaders = useMemo(() => {
      try {
        const stored = localStorage.getItem(`ck-postiz-${teamId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.apiKey) {
            return {
              'x-postiz-api-key': parsed.apiKey,
              'x-postiz-base-url': parsed.baseUrl || 'https://api.postiz.com/public/v1',
            };
          }
        }
      } catch { /* ignore */ }
      return {};
    }, [teamId]);

    const loadDrivers = useCallback(async () => {
      try {
        const res = await fetch(`${apiBase}/drivers?team=${encodeURIComponent(teamId)}`, { headers: postizHeaders });
        const json = await res.json();
        setDrivers(Array.isArray(json.drivers) ? json.drivers : []);
      } catch { /* ignore */ }
    }, [apiBase, teamId, postizHeaders]);

    const loadPosts = useCallback(async () => {
      try {
        const url = `${apiBase}/posts?team=${encodeURIComponent(teamId)}&limit=50`;
        const res = await fetch(url);
        const json = await res.json();
        setPosts(Array.isArray(json.data) ? json.data : []);
      } catch { /* ignore */ }
    }, [apiBase, teamId]);

    const loadMedia = useCallback(async () => {
      try {
        const offset = mediaPage * MEDIA_PAGE_SIZE;
        const res = await fetch(`${apiBase}/media?team=${encodeURIComponent(teamId)}&limit=${MEDIA_PAGE_SIZE}&offset=${offset}`);
        const json = await res.json();
        setMediaLibrary(Array.isArray(json.data) ? json.data : []);
        setMediaTotal(typeof json.total === 'number' ? json.total : 0);
        setMediaHasMore(Boolean(json.hasMore));
      } catch { /* ignore */ }
    }, [apiBase, teamId, mediaPage]);

    const handleFileUpload = useCallback(async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const res = await fetch(`${apiBase}/media?team=${encodeURIComponent(teamId)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ data: base64, filename: file.name, mimeType: file.type }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `Upload failed (${res.status})`);
          }
          const item = await res.json();
          // Auto-select newly uploaded item
          setSelectedMediaIds((prev) => [...prev, item.id]);
        }
        await loadMedia();
        showSuccess(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`);
      } catch (e: any) {
        setError(e?.message || 'Upload failed');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }, [apiBase, teamId, loadMedia]);

    const deleteMedia = useCallback(async (id: string) => {
      try {
        await fetch(`${apiBase}/media/${id}?team=${encodeURIComponent(teamId)}`, { method: 'DELETE' });
        setSelectedMediaIds((prev) => prev.filter((x) => x !== id));
        await loadMedia();
      } catch { /* ignore */ }
    }, [apiBase, teamId, loadMedia]);

    const toggleMediaSelect = (id: string) => {
      setSelectedMediaIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    };

    const openMediaModal = useCallback(async (item: any) => {
      setMediaModalItem(item);
      setMediaModalUrl('');
      setMediaModalError(null);
      setMediaEditName(String(item.originalName || item.filename || ''));
      setMediaEditAlt(String(item.alt || ''));
      const tags = Array.isArray(item.tags) ? item.tags : [];
      setMediaEditTagsInput(tags.join(', '));
      // Fetch the dataUrl for inline preview / playback
      try {
        const res = await fetch(`${apiBase}/media/${item.id}/file?team=${encodeURIComponent(teamId)}`);
        const json = await res.json();
        if (json?.dataUrl) setMediaModalUrl(String(json.dataUrl));
      } catch {
        // Fall back to item.url; not all media exposes a viewable URL
        if (item.url) setMediaModalUrl(String(item.url));
      }
    }, [apiBase, teamId]);

    const closeMediaModal = useCallback(() => {
      setMediaModalItem(null);
      setMediaModalUrl('');
      setMediaModalError(null);
    }, []);

    const saveMediaModal = useCallback(async () => {
      if (!mediaModalItem) return;
      setMediaSaving(true);
      setMediaModalError(null);
      try {
        const tags = mediaEditTagsInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const body = {
          originalName: mediaEditName.trim() || undefined,
          alt: mediaEditAlt,
          tags,
        };
        const res = await fetch(`${apiBase}/media/${mediaModalItem.id}?team=${encodeURIComponent(teamId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err && (err.error || err.message)) || `Save failed (HTTP ${res.status})`);
        }
        await loadMedia();
        closeMediaModal();
      } catch (e: any) {
        setMediaModalError(String(e?.message || e));
      } finally {
        setMediaSaving(false);
      }
    }, [apiBase, teamId, mediaModalItem, mediaEditName, mediaEditAlt, mediaEditTagsInput, loadMedia, closeMediaModal]);

    const deleteMediaModal = useCallback(async () => {
      if (!mediaModalItem) return;
      if (!window.confirm(`Delete "${mediaModalItem.originalName || mediaModalItem.filename}"? This cannot be undone.`)) return;
      setMediaDeleting(true);
      setMediaModalError(null);
      try {
        await deleteMedia(mediaModalItem.id);
        closeMediaModal();
      } catch (e: any) {
        setMediaModalError(String(e?.message || e));
      } finally {
        setMediaDeleting(false);
      }
    }, [mediaModalItem, deleteMedia, closeMediaModal]);

    // ---- Generate Media modal handlers ----

    const resetGenerateModal = useCallback(() => {
      setGenerateType('image');
      setGeneratePrompt('');
      setGenerateSeedId(null);
      setGenerateSeedPickerOpen(false);
      setGenerateStatus('idle');
      setGenerateStatusText('');
      setGenerateJobId(null);
      setGenerateResultItem(null);
      setGenerateResultUrl('');
      setGenerateError(null);
      if (generatePollRef.current) {
        clearTimeout(generatePollRef.current);
        generatePollRef.current = null;
      }
    }, []);

    const openGenerateModal = useCallback((type: 'image' | 'video') => {
      resetGenerateModal();
      setGenerateType(type);
      setGenerateOpen(true);
    }, [resetGenerateModal]);

    // Best-effort delete of a pending-save item on the server. Ignores
    // errors — the pending-save filter keeps the row out of the library
    // anyway; a stale row won't confuse users.
    const discardPending = useCallback(async (id: string | null | undefined) => {
      if (!id) return;
      try {
        await fetch(`${apiBase}/media/${id}?team=${encodeURIComponent(teamId)}`, { method: 'DELETE' });
      } catch { /* best-effort */ }
    }, [apiBase, teamId]);

    const closeGenerateModal = useCallback(() => {
      // If the user leaves via the overlay / × while sitting on an unsaved
      // preview, discard the pending-save row server-side.
      if (generateStatus === 'completed' && generateResultItem?.id) {
        void discardPending(generateResultItem.id);
      }
      setGenerateOpen(false);
      resetGenerateModal();
    }, [generateStatus, generateResultItem, discardPending, resetGenerateModal]);

    const openGenerateSeedPicker = useCallback(async () => {
      setGenerateSeedPickerOpen(true);
      try {
        // Fetch a large page of media, filter to images only for the picker.
        const res = await fetch(`${apiBase}/media?team=${encodeURIComponent(teamId)}&limit=200`);
        const json = await res.json();
        const items = Array.isArray(json.data) ? json.data : [];
        setGenerateSeedItems(items.filter((m: any) => String(m.mimeType || '').startsWith('image/')));
      } catch {
        setGenerateSeedItems([]);
      }
    }, [apiBase, teamId]);

    const pickGenerateSeed = useCallback((item: any) => {
      setGenerateSeedId(item.id);
      setGenerateSeedPickerOpen(false);
    }, []);

    const clearGenerateSeed = useCallback(() => {
      setGenerateSeedId(null);
    }, []);

    const fetchGeneratedPreview = useCallback(async (mediaId: string) => {
      try {
        const res = await fetch(`${apiBase}/media/${mediaId}/file?team=${encodeURIComponent(teamId)}`);
        const json = await res.json();
        if (json?.dataUrl) setGenerateResultUrl(String(json.dataUrl));
      } catch {
        // Preview will show as placeholder; item is still in library.
      }
    }, [apiBase, teamId]);

    const pollGenerateJob = useCallback(async (jobId: string) => {
      const startedAt = Date.now();
      const CEILING_MS = 6 * 60 * 1000; // 6 minutes
      const step = async () => {
        if (Date.now() - startedAt > CEILING_MS) {
          setGenerateStatus('failed');
          setGenerateError('Generation timed out. The job may still finish — check the library shortly.');
          return;
        }
        try {
          const res = await fetch(`${apiBase}/jobs/${jobId}?team=${encodeURIComponent(teamId)}`);
          const json = await res.json();
          const job = json?.job;
          if (!job) throw new Error('Job not found');
          if (job.status === 'completed' && job.generatedMediaId) {
            setGenerateStatus('completed');
            // Don't refresh the library here — the new row is tagged
            // "pending-save" and filtered from /media until the user
            // clicks Save media. A refresh right now would show nothing
            // and only muddle expectations.
            const mediaRes = await fetch(`${apiBase}/media/${job.generatedMediaId}?team=${encodeURIComponent(teamId)}&includePending=1`);
            const mediaJson = await mediaRes.json().catch(() => ({}));
            setGenerateResultItem((mediaJson && (mediaJson.data || mediaJson)) || { id: job.generatedMediaId });
            await fetchGeneratedPreview(job.generatedMediaId);
            return;
          }
          if (job.status === 'failed') {
            setGenerateStatus('failed');
            setGenerateError(String(job.error || 'Generation failed'));
            return;
          }
          setGenerateStatusText(
            generateType === 'video'
              ? 'Generating video (this can take 1–3 minutes)…'
              : 'Generating image…'
          );
        } catch (e: any) {
          setGenerateStatus('failed');
          setGenerateError(String(e?.message || e));
          return;
        }
        generatePollRef.current = setTimeout(step, 4000);
      };
      await step();
    }, [apiBase, teamId, generateType, loadMedia, fetchGeneratedPreview]);

    const submitGenerate = useCallback(async () => {
      const prompt = generatePrompt.trim();
      if (!prompt) {
        setGenerateError('Please enter a prompt.');
        return;
      }
      setGenerateError(null);
      setGenerateStatus('running');
      setGenerateStatusText(
        generateType === 'video'
          ? 'Generating video (this can take 1–3 minutes)…'
          : 'Generating image…'
      );
      try {
        const url = generateSeedId
          ? `${apiBase}/media/${generateSeedId}/generate?team=${encodeURIComponent(teamId)}`
          : `${apiBase}/media/generate?team=${encodeURIComponent(teamId)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, type: generateType, includeBrand: generateIncludeBrand }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(String(json?.message || json?.error || `Generation failed (HTTP ${res.status})`));
        }
        const jobId = json?.job?.id;
        if (!jobId) throw new Error('Generation did not return a job id');
        setGenerateJobId(jobId);
        await pollGenerateJob(jobId);
      } catch (e: any) {
        setGenerateStatus('failed');
        setGenerateError(String(e?.message || e));
      }
    }, [apiBase, teamId, generatePrompt, generateType, generateSeedId, generateIncludeBrand, pollGenerateJob]);

    // Persist the "Use brand style" toggle per team so the user's preference
    // survives across sessions. Kept out of any Effect that depends on the
    // modal being open — the write is cheap and keeps the storage in sync.
    useEffect(() => {
      try { localStorage.setItem(`ck-generate-brand-${teamId}`, generateIncludeBrand ? '1' : '0'); }
      catch { /* localStorage unavailable — fine */ }
    }, [teamId, generateIncludeBrand]);

    const [generateSaving, setGenerateSaving] = useState<'saving' | 'discarding' | null>(null);

    const regenerateGenerate = useCallback(() => {
      // Return to form state; keep prompt/type/seed so the user can tweak.
      // Discard the previous pending preview so it doesn't linger.
      const previous = generateResultItem;
      setGenerateStatus('idle');
      setGenerateStatusText('');
      setGenerateJobId(null);
      setGenerateResultItem(null);
      setGenerateResultUrl('');
      setGenerateError(null);
      if (previous?.id) void discardPending(previous.id);
    }, [generateResultItem, discardPending]);

    const saveGenerateResult = useCallback(async () => {
      if (!generateResultItem?.id || generateSaving) return;
      setGenerateSaving('saving');
      try {
        const res = await fetch(
          `${apiBase}/media/${generateResultItem.id}/save?team=${encodeURIComponent(teamId)}`,
          { method: 'POST' },
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(String((j as any)?.message || (j as any)?.error || `HTTP ${res.status}`));
        }
        await loadMedia();
        setGenerateOpen(false);
        setGenerateSaving(null);
      } catch (e: any) {
        setGenerateSaving(null);
        setGenerateStatus('failed');
        setGenerateError(String(e?.message || e));
      }
    }, [apiBase, teamId, generateResultItem, generateSaving, loadMedia]);

    const discardGenerateResult = useCallback(async () => {
      if (generateSaving) return;
      const id = generateResultItem?.id || null;
      setGenerateSaving('discarding');
      await discardPending(id);
      setGenerateSaving(null);
      setGenerateOpen(false);
      resetGenerateModal();
    }, [generateResultItem, generateSaving, discardPending, resetGenerateModal]);

    useEffect(() => {
      return () => {
        if (generatePollRef.current) clearTimeout(generatePollRef.current);
      };
    }, []);

    useEffect(() => {
      setLoading(true);
      Promise.all([loadDrivers(), loadPosts()]).finally(() => setLoading(false));
    }, [loadDrivers, loadPosts]);

    // loadMedia identity changes when mediaPage changes, so this effect both
    // does the initial load and re-fires whenever the user clicks Prev/Next.
    useEffect(() => {
      void loadMedia();
    }, [loadMedia]);

    const connectedDrivers = useMemo(() => drivers.filter((d) => d.connected), [drivers]);
    const disconnectedDrivers = useMemo(() => drivers.filter((d) => !d.connected), [drivers]);

    const togglePlatform = (platform: string) => {
      const driver = drivers.find((d) => d.platform === platform);
      if (!driver?.connected) return;
      setSelectedPlatforms((prev: string[]) =>
        prev.includes(platform) ? prev.filter((x) => x !== platform) : [...prev, platform]
      );
    };

    // Character limit — show strictest of selected platforms
    const charLimit = useMemo(() => {
      if (selectedPlatforms.length === 0) return undefined;
      const limits = selectedPlatforms
        .map((p) => drivers.find((d) => d.platform === p)?.capabilities?.maxLength)
        .filter((l): l is number => l !== undefined);
      return limits.length > 0 ? Math.min(...limits) : undefined;
    }, [selectedPlatforms, drivers]);

    const canSchedule = useMemo(() => {
      return selectedPlatforms.some((p) => drivers.find((d) => d.platform === p)?.capabilities?.canSchedule);
    }, [selectedPlatforms, drivers]);

    const showSuccess = (msg: string) => {
      setSuccess(msg);
      if (successTimeout.current) clearTimeout(successTimeout.current);
      successTimeout.current = setTimeout(() => setSuccess(null), 5000);
    };

    // Save as local draft
    const onSaveDraft = async () => {
      if (!content.trim()) return;
      setSaving(true);
      setError(null);
      try {
        const platforms = selectedPlatforms.length > 0 ? selectedPlatforms : ['draft'];
        const res = await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content,
            platforms,
            status: scheduledAt ? 'scheduled' : 'draft',
            scheduledAt: scheduledAt || undefined,
          }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        setContent('');
        setScheduledAt('');
        setSelectedPlatforms([]);
        setMediaUrl('');
        showSuccess('Draft saved!');
        await loadPosts();
      } catch (e: any) {
        setError(e?.message || 'Failed to save');
      } finally {
        setSaving(false);
      }
    };

    // Publish via unified driver system
    const onPublish = async () => {
      if (!content.trim() || selectedPlatforms.length === 0) return;
      setPublishing(true);
      setError(null);
      setSuccess(null);

      try {
        const res = await fetch(`${apiBase}/publish?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...postizHeaders },
          body: JSON.stringify({
            content,
            platforms: selectedPlatforms,
            scheduledAt: scheduledAt || undefined,
            mediaUrls: mediaUrl ? [mediaUrl] : undefined,
          }),
        });
        const json = await res.json();

        if (json.results) {
          const succeeded = json.results.filter((r: any) => r.success);
          const failed = json.results.filter((r: any) => !r.success);

          if (failed.length > 0 && succeeded.length === 0) {
            throw new Error(failed.map((f: any) => `${f.platform}: ${f.error}`).join('; '));
          }

          const parts: string[] = [];
          if (succeeded.length > 0) {
            parts.push(`${scheduledAt ? 'Scheduled' : 'Published'} to ${succeeded.map((s: any) => s.platform).join(', ')}`);
          }
          if (failed.length > 0) {
            parts.push(`Failed: ${failed.map((f: any) => `${f.platform} (${f.error})`).join(', ')}`);
          }
          showSuccess(parts.join(' · '));
        } else {
          showSuccess(scheduledAt ? 'Scheduled!' : 'Published!');
        }

        // Also save as local record
        await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content,
            platforms: selectedPlatforms,
            status: scheduledAt ? 'scheduled' : 'published',
            scheduledAt: scheduledAt || undefined,
          }),
        }).catch(() => {});

        setContent('');
        setScheduledAt('');
        setSelectedPlatforms([]);
        setMediaUrl('');
        await loadPosts();
      } catch (e: any) {
        setError(e?.message || 'Publish failed');
      } finally {
        setPublishing(false);
      }
    };

    const hasConnected = connectedDrivers.length > 0;
    const hasSelection = selectedPlatforms.length > 0;

    const filteredPosts = useMemo(() => {
      if (filterStatus === 'all') return posts;
      return posts.filter((p) => p.status === filterStatus);
    }, [posts, filterStatus]);

    return h('div', { className: 'space-y-3' },

      // ---- Composer (two-column: compose left, preview right) ----
      h('div', { style: t.card },
        h('div', { className: 'text-sm font-medium mb-3', style: t.text }, 'Compose'),
        h('div', { style: { display: 'flex', gap: '1rem' } },

          // LEFT — compose pane
          h('div', { style: { flex: 1, minWidth: 0 }, className: 'space-y-3' },

            h('textarea', {
              value: content,
              onChange: (e: any) => setContent(e.target.value),
              placeholder: 'Write your post…',
              rows: 5,
              style: { ...t.input, resize: 'vertical' as const, minHeight: '160px', fontFamily: 'inherit' },
            }),

            // Character count
            charLimit && content.length > 0 && h('div', { style: t.charWarn((content.length / charLimit) * 100) },
              `${content.length} / ${charLimit} characters`,
              content.length > charLimit && ' ⚠ over limit'
            ),
            !charLimit && content.length > 0 && h('div', { className: 'text-xs', style: t.faint }, `${content.length} chars`),

            // Platform selector — connected
            h('div', null,
              h('div', { className: 'text-xs font-medium mb-2', style: t.faint }, 'Publish to'),
              connectedDrivers.length > 0
                ? h('div', { className: 'flex flex-wrap gap-2' },
                    ...connectedDrivers.map((d) =>
                      h('span', {
                        key: d.platform,
                        onClick: () => togglePlatform(d.platform),
                        style: t.pill(selectedPlatforms.includes(d.platform), true),
                        role: 'button',
                        tabIndex: 0,
                        title: `${d.displayName} via ${d.backend}`,
                      },
                        `${d.icon} ${d.label}`,
                        h('span', { style: t.backendBadge(d.backend) }, d.backend),
                      )
                    ),
                    // Show disconnected as disabled
                    ...disconnectedDrivers.map((d) =>
                      h('span', {
                        key: d.platform,
                        style: t.pill(false, false),
                        title: `${d.label} — not connected`,
                      }, `${d.icon} ${d.label}`)
                    ),
                  )
                : h('div', { className: 'flex flex-wrap gap-2' },
                    ...drivers.map((d) =>
                      h('span', { key: d.platform, style: t.pill(false, false), title: 'Not connected' },
                        `${d.icon} ${d.label}`
                      )
                    ),
                    h('div', { className: 'text-xs mt-1', style: t.faint },
                      'No platforms connected. Go to Accounts tab to set up Postiz or add accounts.'
                    ),
                  ),
            ),

            // Media (upload, URL, or library picker)
            h('div', null,
              h('button', {
                type: 'button',
                onClick: () => setShowMedia(!showMedia),
                style: { ...t.btnGhost, padding: '0.3rem 0.55rem', fontSize: '0.8rem' },
              }, showMedia ? '− Media' : '+ Media'),
              showMedia && h('div', { className: 'mt-2 space-y-2' },

                // Upload + URL row
                h('div', { className: 'flex gap-2 items-center' },
                  h('input', {
                    ref: fileInputRef,
                    type: 'file',
                    accept: 'image/*,video/*',
                    multiple: true,
                    style: { display: 'none' },
                    onChange: (e: any) => handleFileUpload(e.target.files),
                  }),
                  h('button', {
                    type: 'button',
                    onClick: () => fileInputRef.current?.click(),
                    style: { ...t.btnGhost, padding: '0.35rem 0.7rem', fontSize: '0.8rem', whiteSpace: 'nowrap' as const },
                    disabled: uploading,
                  }, uploading ? '⏳ Uploading…' : '📁 Upload'),
                  h('button', {
                    type: 'button',
                    onClick: () => { loadMedia(); setShowMediaPicker(!showMediaPicker); },
                    style: { ...t.btnGhost, padding: '0.35rem 0.7rem', fontSize: '0.8rem', whiteSpace: 'nowrap' as const },
                  }, showMediaPicker ? 'Hide Library' : '🖼️ Library'),
                  h('input', {
                    type: 'url',
                    value: mediaUrl,
                    onChange: (e: any) => setMediaUrl(e.target.value),
                    placeholder: '…or paste a URL',
                    style: { ...t.input, flex: 1 },
                  }),
                ),

                // Selected media thumbnails
                selectedMediaIds.length > 0 && h('div', { className: 'flex flex-wrap gap-2' },
                  ...selectedMediaIds.map((id: string) => {
                    const item = mediaLibrary.find((m: any) => m.id === id);
                    if (!item) return null;
                    return h('div', {
                      key: id,
                      style: {
                        position: 'relative' as const, width: '72px', height: '72px',
                        borderRadius: '8px', overflow: 'hidden',
                        border: '2px solid rgba(127,90,240,0.5)',
                      },
                    },
                      item.mimeType?.startsWith('video/')
                        ? h('div', {
                            style: {
                              width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: '1.2rem',
                            },
                          }, '🎥')
                        : h('img', {
                            src: item.thumbnailDataUrl || item.url,
                            style: { width: '100%', height: '100%', objectFit: 'cover' as const },
                          }),
                      h('button', {
                        type: 'button',
                        onClick: () => toggleMediaSelect(id),
                        style: {
                          position: 'absolute' as const, top: '2px', right: '2px',
                          background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                          width: '18px', height: '18px', color: 'white', fontSize: '0.65rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          lineHeight: '1',
                        },
                      }, '✕'),
                    );
                  }),
                ),

                // Media library picker grid
                showMediaPicker && h('div', {
                  style: {
                    background: 'rgba(255,255,255,0.02)', border: '1px solid var(--ck-border-subtle)',
                    borderRadius: '10px', padding: '0.75rem', maxHeight: '260px', overflowY: 'auto' as const,
                  },
                },
                  h('div', { className: 'text-xs font-medium mb-2', style: t.faint },
                    `Media Library (${mediaLibrary.length} items)`
                  ),
                  mediaLibrary.length === 0
                    ? h('div', { className: 'text-xs py-4 text-center', style: t.faint }, 'No media yet. Upload some files!')
                    : h('div', {
                        style: {
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                          gap: '0.5rem',
                        },
                      },
                        ...mediaLibrary.map((item: any) => {
                          const isSelected = selectedMediaIds.includes(item.id);
                          return h('div', {
                            key: item.id,
                            onClick: () => toggleMediaSelect(item.id),
                            style: {
                              position: 'relative' as const, cursor: 'pointer',
                              width: '100%', paddingTop: '100%', borderRadius: '8px',
                              overflow: 'hidden',
                              border: isSelected ? '2px solid rgba(127,90,240,0.7)' : '1px solid var(--ck-border-subtle)',
                              boxShadow: isSelected ? '0 0 8px rgba(127,90,240,0.3)' : 'none',
                            },
                          },
                            item.mimeType?.startsWith('video/')
                              ? h('div', {
                                  style: {
                                    position: 'absolute' as const, inset: '0',
                                    background: 'rgba(0,0,0,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: '1.5rem',
                                  },
                                }, '🎥')
                              : h('img', {
                                  src: item.thumbnailDataUrl || item.url,
                                  style: {
                                    position: 'absolute' as const, inset: '0',
                                    width: '100%', height: '100%', objectFit: 'cover' as const,
                                  },
                                }),
                            isSelected && h('div', {
                              style: {
                                position: 'absolute' as const, top: '4px', right: '4px',
                                background: 'rgba(127,90,240,0.85)', borderRadius: '50%',
                                width: '20px', height: '20px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: '0.7rem', fontWeight: '700',
                              },
                            }, '✓'),
                            h('button', {
                              type: 'button',
                              onClick: (e: any) => { e.stopPropagation(); deleteMedia(item.id); },
                              style: {
                                position: 'absolute' as const, bottom: '4px', right: '4px',
                                background: 'rgba(220,38,38,0.7)', border: 'none', borderRadius: '50%',
                                width: '18px', height: '18px', color: 'white', fontSize: '0.6rem',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: '0.6', lineHeight: '1',
                              },
                              title: 'Delete from library',
                            }, '🗑'),
                            h('div', {
                              style: {
                                position: 'absolute' as const, bottom: '0', left: '0', right: '0',
                                background: 'rgba(0,0,0,0.6)', padding: '2px 4px',
                                fontSize: '0.55rem', color: 'rgba(255,255,255,0.8)',
                                whiteSpace: 'nowrap' as const, overflow: 'hidden',
                                textOverflow: 'ellipsis' as const,
                              },
                            }, item.filename),
                          );
                        }),
                      ),
                ),
              ),
            ),

            // Schedule (only if any selected platform supports it)
            (canSchedule || !hasSelection) && h('div', { className: 'grid grid-cols-1 gap-2 sm:grid-cols-2' },
              h('div', null,
                h('div', { className: 'text-xs font-medium mb-1', style: t.faint },
                  canSchedule ? 'Schedule (optional)' : 'Schedule (connect Postiz for scheduling)'
                ),
                h('input', {
                  type: 'datetime-local',
                  value: scheduledAt,
                  onChange: (e: any) => setScheduledAt(e.target.value),
                  style: { ...t.input, opacity: canSchedule || !hasSelection ? 1 : 0.5 },
                  disabled: hasSelection && !canSchedule,
                }),
              ),
            ),

            // Actions
            h('div', { className: 'flex flex-wrap gap-2 items-center' },
              h('button', {
                type: 'button',
                onClick: () => void onSaveDraft(),
                style: { ...t.btnGhost, opacity: saving ? 0.7 : 1 },
                disabled: saving || !content.trim(),
              }, saving ? 'Saving…' : 'Save draft'),

              hasConnected && hasSelection && h('button', {
                type: 'button',
                onClick: () => void onPublish(),
                style: { ...t.btnPublish, opacity: publishing ? 0.7 : 1 },
                disabled: publishing || !content.trim(),
              }, publishing ? 'Publishing…' : (scheduledAt ? '⏱ Schedule' : '📤 Publish now')),
            ),

            error && h('div', { className: 'text-xs', style: { color: 'rgba(248,113,113,0.95)' } }, error),
            success && h('div', { className: 'text-xs', style: { color: 'rgba(74,222,128,0.9)' } }, success),
          ),

          // RIGHT — social-post-style preview
          h('div', {
            style: {
              width: '380px', flexShrink: 0,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--ck-border-subtle)',
              borderRadius: '16px', padding: '1.25rem',
              display: 'flex', flexDirection: 'column' as const,
              alignSelf: 'flex-start',
            },
          },
            h('div', {
              style: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--ck-text-secondary)', marginBottom: '1rem' },
            }, 'Post Preview'),

            // Social post card
            h('div', {
              style: {
                background: 'rgba(22,22,28,0.95)', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
              },
            },
              // Post header (avatar + name + handle)
              h('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: '0.65rem',
                  padding: '0.85rem 1rem 0',
                },
              },
                // Avatar circle
                h('div', {
                  style: {
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: 'rgba(127,90,240,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', color: 'rgba(127,90,240,0.9)',
                    flexShrink: 0,
                  },
                }, '👤'),
                h('div', null,
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.3rem' } },
                    h('span', {
                      style: { fontWeight: 700, fontSize: '0.9rem', color: 'var(--ck-text-primary)' },
                    }, 'Your Brand'),
                    h('span', { style: { color: 'rgba(99,179,237,0.9)', fontSize: '0.85rem' } }, '✓'),
                  ),
                  h('div', {
                    style: { fontSize: '0.75rem', color: 'var(--ck-text-tertiary)' },
                  }, scheduledAt
                    ? `Scheduled · ${new Date(scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : 'Just now'),
                ),
              ),

              // Post body
              h('div', { style: { padding: '0.65rem 1rem 0.75rem' } },
                content.trim()
                  ? h('div', {
                      style: {
                        whiteSpace: 'pre-wrap' as const, fontSize: '0.9rem',
                        color: 'var(--ck-text-primary)', lineHeight: '1.5',
                        maxHeight: '260px', overflowY: 'auto' as const,
                        wordBreak: 'break-word' as const,
                      },
                    }, content)
                  : h('div', {
                      style: {
                        color: 'var(--ck-text-tertiary)', fontSize: '0.85rem',
                        fontStyle: 'italic' as const, padding: '1.5rem 0',
                        textAlign: 'center' as const,
                      },
                    }, 'Start writing to see a preview'),
              ),

              // Media preview
              (selectedMediaIds.length > 0 || (mediaUrl && showMedia)) && h('div', {
                style: { padding: '0 0 0' },
              },
                ...selectedMediaIds.map((id: string) => {
                  const item = mediaLibrary.find((m: any) => m.id === id);
                  if (!item) return null;
                  return item.mimeType?.startsWith('video/')
                    ? h('div', {
                        key: id,
                        style: {
                          background: 'rgba(0,0,0,0.4)',
                          padding: '1.5rem', textAlign: 'center' as const,
                          color: 'var(--ck-text-secondary)', fontSize: '0.85rem',
                        },
                      }, `\ud83c\udfa5 ${item.filename}`)
                    : h('img', {
                        key: id,
                        src: item.thumbnailDataUrl || item.url,
                        style: { width: '100%', display: 'block' },
                      });
                }),
                mediaUrl && showMedia && h('img', {
                  src: mediaUrl,
                  style: { width: '100%', display: 'block' },
                  onError: (e: any) => { e.target.style.display = 'none'; },
                }),
              ),

              // Engagement bar (fake social actions)
              h('div', {
                style: {
                  display: 'flex', justifyContent: 'space-around',
                  padding: '0.6rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '0.8rem', color: 'var(--ck-text-tertiary)',
                },
              },
                h('span', null, '❤\ufe0f 0'),
                h('span', null, '\ud83d\udcac 0'),
                h('span', null, '\ud83d\udd01 0'),
                h('span', null, '\ud83d\udcca 0'),
              ),
            ),

            // Platform pills below card
            selectedPlatforms.length > 0 && h('div', {
              style: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.35rem', marginTop: '0.75rem' },
            },
              ...selectedPlatforms.map((pl) => {
                const drv = drivers.find((d) => d.platform === pl);
                return h('span', {
                  key: pl,
                  style: {
                    background: 'rgba(127,90,240,0.12)', border: '1px solid rgba(127,90,240,0.25)',
                    borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: '0.7rem',
                    color: 'var(--ck-text-secondary)',
                  },
                }, drv ? `${drv.icon} ${drv.label}` : pl);
              }),
            ),

            // Character limit bar
            charLimit && content.length > 0 && h('div', { style: { marginTop: '0.75rem' } },
              h('div', { style: { height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' } },
                h('div', {
                  style: {
                    height: '100%', borderRadius: '2px',
                    width: `${Math.min((content.length / charLimit) * 100, 100)}%`,
                    background: content.length > charLimit ? 'rgba(248,113,113,0.8)'
                      : content.length > charLimit * 0.9 ? 'rgba(251,191,36,0.8)'
                      : 'rgba(127,90,240,0.6)',
                    transition: 'width 0.2s, background 0.2s',
                  },
                }),
              ),
              h('div', {
                style: {
                  fontSize: '0.7rem', marginTop: '0.2rem', textAlign: 'right' as const,
                  color: content.length > charLimit ? 'rgba(248,113,113,0.9)' : 'var(--ck-text-tertiary)',
                },
              }, `${content.length} / ${charLimit}`),
            ),
          ),
        ),
      ),

      // ---- Media library grid ----
      (() => {
        const totalPages = Math.max(1, Math.ceil(mediaTotal / MEDIA_PAGE_SIZE));
        const currentPageDisplay = mediaPage + 1;
        const startIdx = mediaTotal === 0 ? 0 : mediaPage * MEDIA_PAGE_SIZE + 1;
        const endIdx = Math.min(mediaTotal, mediaPage * MEDIA_PAGE_SIZE + mediaLibrary.length);
        return h('div', { style: t.card },
          h('div', { className: 'flex items-center justify-between mb-3' },
            h('div', { className: 'text-sm font-medium', style: t.text },
              mediaTotal > 0 ? `Media (${startIdx}-${endIdx} of ${mediaTotal})` : `Media (${mediaTotal})`
            ),
            h('div', { className: 'flex items-center gap-2' },
              h('button', {
                type: 'button',
                onClick: () => openGenerateModal('image'),
                style: { ...t.btnGhost, padding: '0.3rem 0.6rem', fontSize: '0.75rem' },
                title: 'Generate a new image from a text prompt',
              }, '+ Image'),
              h('button', {
                type: 'button',
                onClick: () => openGenerateModal('video'),
                style: { ...t.btnGhost, padding: '0.3rem 0.6rem', fontSize: '0.75rem' },
                title: 'Generate a new video from a text prompt',
              }, '+ Video'),
              h('button', {
                type: 'button',
                onClick: () => fileInputRef.current?.click(),
                style: { ...t.btnGhost, padding: '0.3rem 0.6rem', fontSize: '0.75rem' },
              }, '+ Upload'),
              h('button', {
                type: 'button',
                onClick: () => void loadMedia(),
                title: 'Refresh',
                style: { ...t.btnGhost, padding: '0.3rem 0.6rem', fontSize: '0.75rem' },
              }, '↻'),
            ),
          ),
        loading
          ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'Loading…')
          : mediaLibrary.length === 0
            ? h('div', { className: 'py-6 text-center text-sm', style: t.faint }, 'No media yet. Upload images or videos above.')
            : h('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '0.65rem',
                },
              },
              ...mediaLibrary.map((item: any) => {
                const isVideo = String(item.mimeType || '').startsWith('video/');
                // The API returns a base64 data URL on item.thumbnailDataUrl for
                // both images and (poster-frame) videos. item.url points at the
                // /file endpoint which returns a JSON envelope, not raw bytes,
                // so it can't be used directly as <img src>.
                const thumb = String(item.thumbnailDataUrl || item.thumbnailUrl || '');
                return h('div', {
                  key: item.id,
                  onClick: () => void openMediaModal(item),
                  style: {
                    position: 'relative' as const,
                    aspectRatio: '1',
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid var(--ck-border-subtle)',
                    borderRadius: '10px',
                    overflow: 'hidden' as const,
                    cursor: 'pointer' as const,
                    display: 'flex' as const,
                    alignItems: 'center' as const,
                    justifyContent: 'center' as const,
                  },
                },
                  thumb
                    ? h('img', {
                        src: thumb,
                        alt: item.originalName || '',
                        style: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' },
                      })
                    : h('div', {
                        style: { color: 'var(--ck-text-tertiary)', fontSize: '0.7rem', textAlign: 'center' as const, padding: '0.5rem' },
                      }, isVideo ? '🎬' : '🖼'),
                  isVideo && h('div', {
                    style: {
                      position: 'absolute' as const,
                      inset: 0,
                      display: 'flex' as const,
                      alignItems: 'center' as const,
                      justifyContent: 'center' as const,
                      background: 'rgba(0,0,0,0.25)',
                      color: 'white',
                      fontSize: '2rem',
                      pointerEvents: 'none' as const,
                    },
                  }, '▶'),
                  h('div', {
                    style: {
                      position: 'absolute' as const,
                      left: 0, right: 0, bottom: 0,
                      padding: '0.35rem 0.5rem',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
                      color: 'white',
                      fontSize: '0.7rem',
                      whiteSpace: 'nowrap' as const,
                      overflow: 'hidden' as const,
                      textOverflow: 'ellipsis',
                    },
                  }, item.originalName || item.filename),
                );
              })
            ),
          // Pager
          totalPages > 1 && h('div', {
            style: {
              display: 'flex' as const,
              alignItems: 'center' as const,
              justifyContent: 'space-between' as const,
              gap: '0.5rem',
              marginTop: '0.85rem',
              paddingTop: '0.65rem',
              borderTop: '1px solid var(--ck-border-subtle)',
            },
          },
            h('button', {
              type: 'button',
              onClick: () => setMediaPage((p: number) => Math.max(0, p - 1)),
              disabled: mediaPage === 0,
              style: {
                ...t.btnGhost,
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                opacity: mediaPage === 0 ? 0.4 : 1,
                cursor: mediaPage === 0 ? 'not-allowed' as const : 'pointer' as const,
              },
            }, '← Prev'),
            h('span', {
              style: { fontSize: '0.75rem', color: 'var(--ck-text-secondary)' },
            }, `Page ${currentPageDisplay} of ${totalPages}`),
            h('button', {
              type: 'button',
              onClick: () => setMediaPage((p: number) => p + 1),
              disabled: !mediaHasMore,
              style: {
                ...t.btnGhost,
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                opacity: !mediaHasMore ? 0.4 : 1,
                cursor: !mediaHasMore ? 'not-allowed' as const : 'pointer' as const,
              },
            }, 'Next →'),
          ),
        );
      })(),

      // ---- Media detail modal — dashboard layout (topbar + two-column),
      // kitchen design tokens. ----
      mediaModalItem && h('div', { style: t.modalOverlay, onClick: closeMediaModal },
        h('div', { style: t.modalCard, onClick: (e: any) => e.stopPropagation() },
          h('button', { type: 'button', onClick: closeMediaModal, style: t.modalCloseBtn, 'aria-label': 'Close' }, '×'),
          // Topbar: title left, "Details" label right
          h('div', { style: t.modalTopbar },
            h('div', { style: t.modalTopbarTitle }, 'Media Asset'),
            h('div', { style: t.modalTopbarLabel }, 'Details'),
          ),
          // Two columns
          h('div', { style: t.modalTwoCol },
            // LEFT — preview
            h('div', null,
              h('div', {
                style: {
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--ck-border-subtle)',
                  borderRadius: '12px',
                  padding: '0.5rem',
                  minHeight: '280px',
                  display: 'flex' as const,
                  alignItems: 'center' as const,
                  justifyContent: 'center' as const,
                },
              },
                !mediaModalUrl
                  ? h('div', { style: { color: 'var(--ck-text-tertiary)', fontSize: '0.85rem' } }, 'Loading preview…')
                  : String(mediaModalItem.mimeType || '').startsWith('video/')
                    ? h('video', {
                        src: mediaModalUrl,
                        controls: true,
                        style: { maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px' },
                      })
                    : h('img', {
                        src: mediaModalUrl,
                        alt: mediaModalItem.alt || mediaModalItem.originalName || '',
                        style: { maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px', objectFit: 'contain' as const, display: 'block' },
                      }),
              ),
              mediaModalItem.prompt && h('div', { style: { marginTop: '12px' } },
                h('div', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.35rem' } }, 'Generation prompt'),
                h('div', {
                  style: {
                    ...t.input,
                    fontSize: '0.8rem',
                    color: 'var(--ck-text-secondary)',
                    whiteSpace: 'pre-wrap' as const,
                    maxHeight: '8rem',
                    overflow: 'auto' as const,
                    cursor: 'default' as const,
                  },
                }, String(mediaModalItem.prompt)),
              ),
            ),
            // RIGHT — meta + edit form
            h('div', null,
              // Heading: filename
              h('h2', {
                style: {
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--ck-text-primary)',
                  marginTop: 0,
                  marginBottom: '0.5rem',
                  wordBreak: 'break-word' as const,
                },
              }, mediaModalItem.originalName || mediaModalItem.filename || 'Untitled media'),
              // Meta line: type · size · dimensions
              h('div', {
                style: {
                  fontSize: '0.75rem',
                  color: 'var(--ck-text-tertiary)',
                  display: 'flex' as const,
                  flexWrap: 'wrap' as const,
                  gap: '0.4rem',
                  marginBottom: '1rem',
                },
              },
                h('span', null, mediaModalItem.mimeType || 'Unknown type'),
                mediaModalItem.size && h('span', null, `· ${(Number(mediaModalItem.size) / 1024 / 1024).toFixed(2)} MB`),
                mediaModalItem.width && mediaModalItem.height && h('span', null, `· ${mediaModalItem.width}×${mediaModalItem.height}`),
                mediaModalItem.createdAt && h('span', null, `· Created ${new Date(mediaModalItem.createdAt).toLocaleDateString()}`),
              ),
              // Section: Edit asset
              h('div', {
                style: {
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--ck-border-subtle)',
                  borderRadius: '12px',
                  padding: '14px',
                },
              },
                h('div', {
                  style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.65rem' },
                }, 'Edit asset'),
                h('div', { style: { display: 'grid', gap: '0.6rem' } },
                  h('label', { style: { display: 'block' } },
                    h('span', { style: { display: 'block', fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.25rem' } }, 'Name'),
                    h('input', {
                      type: 'text',
                      value: mediaEditName,
                      onChange: (e: any) => setMediaEditName(e.target.value),
                      style: t.input,
                    }),
                  ),
                  h('label', { style: { display: 'block' } },
                    h('span', { style: { display: 'block', fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.25rem' } }, 'Alt text'),
                    h('input', {
                      type: 'text',
                      value: mediaEditAlt,
                      onChange: (e: any) => setMediaEditAlt(e.target.value),
                      placeholder: 'Accessible description',
                      style: t.input,
                    }),
                  ),
                  h('label', { style: { display: 'block' } },
                    h('span', { style: { display: 'block', fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.25rem' } }, 'Tags'),
                    h('input', {
                      type: 'text',
                      value: mediaEditTagsInput,
                      onChange: (e: any) => setMediaEditTagsInput(e.target.value),
                      placeholder: 'promo, haircut, spring',
                      style: t.input,
                    }),
                  ),
                  mediaModalError && h('div', {
                    style: { color: 'rgba(248,113,113,0.95)', fontSize: '0.8rem' },
                  }, mediaModalError),
                  h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'space-between', marginTop: '0.5rem', flexWrap: 'wrap' as const } },
                    h('button', {
                      type: 'button',
                      onClick: () => void saveMediaModal(),
                      disabled: mediaSaving || mediaDeleting,
                      style: { ...t.btnPrimary, opacity: (mediaSaving || mediaDeleting) ? 0.6 : 1 },
                    }, mediaSaving ? 'Saving…' : 'Save changes'),
                    h('button', {
                      type: 'button',
                      onClick: () => void deleteMediaModal(),
                      disabled: mediaSaving || mediaDeleting,
                      style: {
                        ...t.btnGhost,
                        color: 'rgba(248,113,113,0.9)',
                        borderColor: 'rgba(248,113,113,0.3)',
                        opacity: (mediaSaving || mediaDeleting) ? 0.6 : 1,
                      },
                    }, mediaDeleting ? 'Deleting…' : 'Delete asset'),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),

      // ---- Generate Media modal ----
      generateOpen && h('div', { style: t.modalOverlay, onClick: closeGenerateModal },
        h('div', {
          style: { ...t.modalCard, maxWidth: '780px' },
          onClick: (e: any) => e.stopPropagation(),
        },
          h('button', { type: 'button', onClick: closeGenerateModal, style: t.modalCloseBtn, 'aria-label': 'Close' }, '×'),
          h('div', { style: t.modalTopbar },
            h('div', { style: t.modalTopbarTitle }, 'Generate Media'),
            h('div', { style: t.modalTopbarLabel },
              generateStatus === 'idle' ? 'Prompt' :
              generateStatus === 'running' ? 'Working…' :
              generateStatus === 'completed' ? 'Result' : 'Error'
            ),
          ),

          // FORM state
          generateStatus === 'idle' && h('div', { style: { display: 'grid', gap: '18px' } },
            // Type toggle
            h('div', null,
              h('div', { style: { fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.4rem' } }, 'Type'),
              h('div', { style: { display: 'flex', gap: '0.5rem' } },
                (['image', 'video'] as const).map((tp) =>
                  h('button', {
                    key: tp,
                    type: 'button',
                    onClick: () => setGenerateType(tp),
                    style: {
                      ...t.btnGhost,
                      padding: '0.5rem 1rem',
                      background: generateType === tp ? 'rgba(99,179,237,0.16)' : t.btnGhost.background,
                      borderColor: generateType === tp ? 'rgba(99,179,237,0.45)' : t.btnGhost.border,
                      color: generateType === tp ? 'rgba(210,235,255,0.95)' : t.btnGhost.color,
                    },
                  }, tp === 'image' ? 'Image' : 'Video'),
                ),
              ),
            ),

            // Brand style toggle — augments the prompt server-side with the
            // Hair Mechanix brand visual guidelines (from BRAND.md §17 / §19).
            h('label', {
              style: {
                display: 'flex' as const,
                alignItems: 'center' as const,
                gap: '0.5rem',
                fontSize: '0.85rem',
                color: 'var(--ck-text-primary)',
                cursor: 'pointer' as const,
              },
            },
              h('input', {
                type: 'checkbox',
                checked: generateIncludeBrand,
                onChange: (e: any) => setGenerateIncludeBrand(Boolean(e.target.checked)),
                style: { accentColor: 'var(--ck-accent-red)' },
              }),
              h('span', null,
                'Use Hair Mechanix brand style ',
                h('span', { style: { opacity: 0.65 } }, '(seeds the prompt with BRAND.md + brand-voice.md)'),
              ),
            ),

            // Seed picker
            h('div', null,
              h('div', { style: { fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.4rem' } }, 'Seed image (optional)'),
              (() => {
                const seedItem = generateSeedId
                  ? mediaLibrary.find((m) => m.id === generateSeedId) || generateSeedItems.find((m) => m.id === generateSeedId)
                  : null;
                if (seedItem) {
                  const thumb = String(seedItem.thumbnailDataUrl || seedItem.thumbnailUrl || '');
                  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' } },
                    thumb && h('img', {
                      src: thumb,
                      alt: seedItem.originalName || '',
                      style: { width: '80px', height: '80px', objectFit: 'cover' as const, borderRadius: '10px', border: '1px solid var(--ck-border-subtle)' },
                    }),
                    h('div', { style: { fontSize: '0.85rem', color: 'var(--ck-text-primary)', flex: 1 } },
                      seedItem.originalName || seedItem.filename || 'Seed image',
                    ),
                    h('button', {
                      type: 'button',
                      onClick: clearGenerateSeed,
                      style: { ...t.btnGhost, padding: '0.4rem 0.7rem', fontSize: '0.8rem' },
                    }, '× Remove'),
                  );
                }
                return h('div', null,
                  h('button', {
                    type: 'button',
                    onClick: () => void openGenerateSeedPicker(),
                    style: { ...t.btnGhost, padding: '0.5rem 0.85rem' },
                  }, 'Pick from library →'),
                );
              })(),
            ),

            // Prompt
            h('div', null,
              h('div', { style: { fontSize: '0.75rem', color: 'var(--ck-text-secondary)', marginBottom: '0.4rem' } }, 'Prompt'),
              h('textarea', {
                value: generatePrompt,
                onChange: (e: any) => setGeneratePrompt(e.target.value),
                placeholder: generateType === 'video'
                  ? 'Describe the video you want — camera motion, subject, style…'
                  : 'Describe the image you want…',
                rows: 5,
                style: { ...t.input, resize: 'vertical' as const, fontFamily: 'inherit' },
              }),
            ),

            generateError && h('div', {
              style: { color: 'rgba(248,113,113,0.95)', fontSize: '0.85rem' },
            }, generateError),

            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' } },
              h('button', {
                type: 'button',
                onClick: closeGenerateModal,
                style: t.btnGhost,
              }, 'Cancel'),
              h('button', {
                type: 'button',
                onClick: () => void submitGenerate(),
                disabled: !generatePrompt.trim(),
                style: {
                  ...t.btnPrimary,
                  opacity: !generatePrompt.trim() ? 0.5 : 1,
                  cursor: !generatePrompt.trim() ? 'not-allowed' as const : 'pointer' as const,
                },
              }, 'Generate'),
            ),
          ),

          // LOADING state
          generateStatus === 'running' && h('div', {
            style: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' as const, gap: '1rem', padding: '3rem 1rem', textAlign: 'center' as const },
          },
            h('div', {
              style: {
                width: '48px',
                height: '48px',
                border: '4px solid rgba(255,255,255,0.1)',
                borderTopColor: 'var(--ck-accent-red)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              },
            }),
            h('div', { style: { color: 'var(--ck-text-secondary)', fontSize: '0.95rem' } }, generateStatusText || 'Working…'),
            h('style', null, '@keyframes spin { to { transform: rotate(360deg); } }'),
          ),

          // COMPLETED state — preview + Regenerate/Done
          generateStatus === 'completed' && h('div', { style: { display: 'grid', gap: '18px' } },
            h('div', {
              style: {
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid var(--ck-border-subtle)',
                borderRadius: '12px',
                padding: '0.5rem',
                minHeight: '240px',
                display: 'flex' as const,
                alignItems: 'center' as const,
                justifyContent: 'center' as const,
              },
            },
              !generateResultUrl
                ? h('div', { style: { color: 'var(--ck-text-tertiary)', fontSize: '0.9rem' } }, 'Loading preview…')
                : generateType === 'video'
                  ? h('video', { src: generateResultUrl, controls: true, style: { maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px' } })
                  : h('img', { src: generateResultUrl, alt: 'Generated result', style: { maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px', objectFit: 'contain' as const, display: 'block' } }),
            ),
            h('div', {
              style: { color: 'rgba(251,191,36,0.9)', fontSize: '0.85rem' },
            }, generateResultItem?.originalName
              ? `Preview — not yet saved · ${generateResultItem.originalName}`
              : 'Preview — click "Save media" to add to your library.'),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' as const } },
              h('button', {
                type: 'button',
                onClick: () => void discardGenerateResult(),
                disabled: !!generateSaving,
                style: { ...t.btnGhost, opacity: generateSaving ? 0.6 : 1 },
              }, generateSaving === 'discarding' ? 'Discarding…' : 'Discard'),
              h('button', {
                type: 'button',
                onClick: regenerateGenerate,
                disabled: !!generateSaving,
                style: { ...t.btnGhost, opacity: generateSaving ? 0.6 : 1 },
              }, 'Regenerate'),
              h('button', {
                type: 'button',
                onClick: () => void saveGenerateResult(),
                disabled: !!generateSaving,
                style: { ...t.btnPrimary, opacity: generateSaving ? 0.6 : 1 },
              }, generateSaving === 'saving' ? 'Saving…' : 'Save media'),
            ),
          ),

          // ERROR state
          generateStatus === 'failed' && h('div', { style: { display: 'grid', gap: '18px' } },
            h('div', {
              style: {
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.35)',
                borderRadius: '10px',
                padding: '1rem',
                color: 'rgba(248,113,113,0.95)',
                fontSize: '0.9rem',
              },
            }, generateError || 'Generation failed'),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' } },
              h('button', { type: 'button', onClick: closeGenerateModal, style: t.btnGhost }, 'Close'),
              h('button', { type: 'button', onClick: regenerateGenerate, style: t.btnPrimary }, 'Try again'),
            ),
          ),
        ),
      ),

      // ---- Seed picker sub-modal ----
      generateOpen && generateSeedPickerOpen && h('div', {
        style: { ...t.modalOverlay, zIndex: 10000 },
        onClick: () => setGenerateSeedPickerOpen(false),
      },
        h('div', {
          style: { ...t.modalCard, maxWidth: '1100px' },
          onClick: (e: any) => e.stopPropagation(),
        },
          h('button', { type: 'button', onClick: () => setGenerateSeedPickerOpen(false), style: t.modalCloseBtn, 'aria-label': 'Close' }, '×'),
          h('div', { style: t.modalTopbar },
            h('div', { style: t.modalTopbarTitle }, 'Pick a seed image'),
            h('div', { style: t.modalTopbarLabel }, `${generateSeedItems.length} image${generateSeedItems.length === 1 ? '' : 's'}`),
          ),
          generateSeedItems.length === 0
            ? h('div', { style: { padding: '3rem 1rem', textAlign: 'center' as const, color: 'var(--ck-text-tertiary)' } }, 'No images in the library yet.')
            : h('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '1rem',
                },
              },
              ...generateSeedItems.map((item: any) => {
                const thumb = String(item.thumbnailDataUrl || item.thumbnailUrl || '');
                return h('div', {
                  key: item.id,
                  onClick: () => pickGenerateSeed(item),
                  style: {
                    aspectRatio: '1',
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid var(--ck-border-subtle)',
                    borderRadius: '12px',
                    overflow: 'hidden' as const,
                    cursor: 'pointer' as const,
                    display: 'flex' as const,
                    alignItems: 'center' as const,
                    justifyContent: 'center' as const,
                    position: 'relative' as const,
                  },
                  title: item.originalName || item.filename || '',
                },
                  thumb
                    ? h('img', { src: thumb, alt: item.originalName || '', style: { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' } })
                    : h('div', { style: { color: 'var(--ck-text-tertiary)', fontSize: '0.85rem', padding: '0.5rem' } }, '🖼'),
                );
              }),
            ),
        ),
      ),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-library', ContentLibrary);
})();
