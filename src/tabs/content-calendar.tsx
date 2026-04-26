/**
 * Content Calendar Tab — week/month view with post cards, create-post modal, preview/copy/delete
 * Self-registering browser bundle
 */
(function () {
  const R = (window as any).React;
  const RD = (window as any).ReactDOM;
  if (!R) return;
  const h = R.createElement;
  const useState = R.useState;
  const useEffect = R.useEffect;
  const useMemo = R.useMemo;
  const useCallback = R.useCallback;
  const useRef = R.useRef;
  // Portal helper — render modals at document.body to escape parent overflow/transform traps
  function Portal({ children }: { children: any }) {
    // Try to get ReactDOM (may be exposed late by host)
    const rd = RD || (typeof window !== 'undefined' && (window as any).ReactDOM);
    const [container] = useState(() => {
      if (typeof document === 'undefined') return null;
      const el = document.createElement('div');
      el.setAttribute('data-ck-portal', 'marketing');
      return el;
    });
    useEffect(() => {
      if (!container) return;
      document.body.appendChild(container);
      return () => { document.body.removeChild(container); };
    }, [container]);
    if (rd?.createPortal && container) return rd.createPortal(children, container);
    if (container) return rd?.createPortal ? rd.createPortal(children, container) : children;
    return children;
  }

  /* ================================================================
   * Styles — all using --ck-* CSS vars for dark-theme consistency
   * ================================================================ */
  const s = {
    // layout
    container: { color: 'var(--ck-text-primary)' },
    // top bar
    topBar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '1rem', flexWrap: 'wrap' as const, gap: '0.5rem',
    },
    navGroup: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
    navBtn: {
      background: 'rgba(255,255,255,0.06)', border: '1px solid var(--ck-border-subtle)',
      borderRadius: '8px', padding: '0.35rem 0.65rem', color: 'var(--ck-text-primary)',
      cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
    },
    navBtnActive: {
      background: 'rgba(127,90,240,0.25)', border: '1px solid rgba(127,90,240,0.5)',
      borderRadius: '8px', padding: '0.35rem 0.65rem', color: 'white',
      cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
    },
    dateLabel: { color: 'var(--ck-text-primary)', fontWeight: 600, fontSize: '0.9rem', minWidth: '200px', textAlign: 'center' as const },
    // Week grid
    weekGrid: { display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', gap: '0' },
    dayColHeader: {
      textAlign: 'center' as const, padding: '0.6rem 0.25rem', fontSize: '0.8rem',
      color: 'var(--ck-text-tertiary)', fontWeight: 600, borderBottom: '1px solid var(--ck-border-subtle)',
    },
    dayColHeaderToday: {
      textAlign: 'center' as const, padding: '0.6rem 0.25rem', fontSize: '0.8rem',
      color: 'rgba(248,113,113,1)', fontWeight: 700, borderBottom: '1px solid var(--ck-border-subtle)',
    },
    dayDate: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--ck-text-secondary)' },
    dayDateToday: { fontSize: '0.85rem', fontWeight: 700, color: 'rgba(248,113,113,1)' },
    timeLabel: {
      fontSize: '0.75rem', color: 'var(--ck-text-tertiary)', textAlign: 'right' as const,
      paddingRight: '0.5rem', paddingTop: '0.15rem',
      borderRight: '1px solid var(--ck-border-subtle)',
    },
    timeSlot: {
      borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)',
      minHeight: '60px', position: 'relative' as const, padding: '2px',
    },
    // Month grid
    monthGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' },
    monthDayHeader: {
      textAlign: 'center' as const, padding: '0.4rem', fontSize: '0.75rem',
      color: 'var(--ck-text-tertiary)', fontWeight: 600, textTransform: 'uppercase' as const,
    },
    monthCell: {
      border: '1px solid var(--ck-border-subtle)', borderRadius: '10px',
      minHeight: '90px', padding: '0.4rem', position: 'relative' as const,
      background: 'rgba(255,255,255,0.015)',
    },
    monthCellEmpty: { minHeight: '90px', opacity: 0.1 },
    monthDayNum: { fontSize: '0.8rem', fontWeight: 500, color: 'var(--ck-text-secondary)', marginBottom: '0.25rem' },
    monthDayNumToday: {
      fontSize: '0.8rem', fontWeight: 700, color: 'rgba(248,113,113,1)',
      background: 'rgba(248,113,113,0.12)', borderRadius: '50%',
      width: '1.6rem', height: '1.6rem', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', marginBottom: '0.25rem',
    },
    // Plus button
    plusBtn: {
      position: 'absolute' as const, bottom: '6px', right: '6px',
      background: 'rgba(127,90,240,0.85)', border: 'none', borderRadius: '8px',
      width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer',
      opacity: 0, transition: 'opacity 0.15s',
    },
    plusBtnVisible: { opacity: 1 },
    // Post card on calendar
    postCard: {
      background: 'rgba(127,90,240,0.55)', borderRadius: '6px',
      padding: '3px 6px', fontSize: '0.7rem', color: 'white',
      marginBottom: '2px', cursor: 'pointer', overflow: 'hidden' as const,
      whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' as const,
      position: 'relative' as const,
    },
    postCardFailed: { borderLeft: '3px solid rgba(248,113,113,0.9)' },
    postCardPublished: { borderLeft: '3px solid rgba(74,222,128,0.9)' },
    postCardDraft: { borderLeft: '3px solid rgba(167,139,250,0.7)' },
    postCardScheduled: { borderLeft: '3px solid rgba(251,191,36,0.7)' },
    // Post card hover actions
    cardActions: {
      position: 'absolute' as const, top: '-1px', right: '0', display: 'flex', gap: '2px',
      background: 'rgba(127,90,240,0.95)', borderRadius: '0 6px 6px 0', padding: '2px 4px',
    },
    cardActionBtn: {
      background: 'none', border: 'none', color: 'white', cursor: 'pointer',
      fontSize: '0.75rem', padding: '1px 3px', borderRadius: '3px',
    },
    // Modal — mirrors .modal / .modal-backdrop / .modal-card styling from
    // ~/Sites/hmx-dashboard/public/assets/app.css so kitchen + dashboard
    // share visual language.
    overlay: {
      position: 'fixed' as const,
      inset: '0',
      background: 'rgba(0,0,0,0.7)',
      display: 'flex' as const,
      alignItems: 'flex-start' as const,
      justifyContent: 'center' as const,
      padding: '16px',
      zIndex: 80,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    },
    modal: {
      // Use the same bluish card color the plugin tab pages use — kitchen
      // defines --ck-bg-soft (#121b29) for cards. Fallback hex matches.
      background: 'var(--ck-bg-soft, #121b29)',
      border: '1px solid var(--ck-border-subtle)',
      borderRadius: '16px',
      width: 'min(1600px, calc(100vw - 32px))',
      maxHeight: 'calc(100vh - 32px)',
      overflow: 'auto' as const,
      display: 'flex' as const,
      flexDirection: 'column' as const,
      boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
    },
    modalHeader: {
      display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
      padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
    },
    modalBody: { display: 'flex' as const, flex: 1, minHeight: 0 },
    modalLeft: {
      flex: 1, padding: '16px 20px', borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex' as const, flexDirection: 'column' as const, gap: '0.75rem',
      minWidth: 0,
    },
    // Mirrors dashboard's post-edit modal preview column width (660px).
    modalRight: { width: '660px', padding: '16px 20px', flexShrink: 0, minWidth: 0 },
    modalFooter: {
      display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
      padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)',
      flexWrap: 'wrap' as const, gap: '0.5rem',
    },
    closeBtn: {
      width: '32px', height: '32px',
      display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
      background: 'rgba(255,255,255,0.05)', border: '1px solid var(--ck-border-subtle)',
      borderRadius: '8px', color: 'var(--ck-text-secondary)',
      cursor: 'pointer' as const, fontSize: '1.1rem', lineHeight: 1, padding: 0,
    },
    textarea: {
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px', padding: '0.75rem', color: 'var(--ck-text-primary)',
      width: '100%', minHeight: '200px', resize: 'vertical' as const, fontFamily: 'inherit',
      fontSize: '0.9rem', outline: 'none',
      // Hard-force LTR to avoid any inherited RTL / bidi overrides in host app
      direction: 'ltr' as const,
      unicodeBidi: 'plaintext' as const,
      textAlign: 'left' as const,
    },
    input: {
      background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px', padding: '0.5rem 0.75rem', color: 'var(--ck-text-primary)',
      width: '100%', fontSize: '0.85rem', outline: 'none',
    },
    platformCircle: (active: boolean, connected: boolean) => ({
      width: '36px', height: '36px', borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.1rem', cursor: connected ? 'pointer' : 'default',
      border: active ? '2px solid rgba(127,90,240,0.8)' : '2px solid var(--ck-border-subtle)',
      background: active ? 'rgba(127,90,240,0.2)' : 'rgba(255,255,255,0.03)',
      opacity: connected ? 1 : 0.35,
      transition: 'all 0.15s',
    }),
    // Mirrors content-library.tsx t.pill / t.backendBadge so the post edit
    // modal uses the same account/platform pill UI as the library composer.
    pill: (active: boolean, connected: boolean) => ({
      background: active ? 'rgba(99,179,237,0.16)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? 'rgba(99,179,237,0.45)' : 'var(--ck-border-subtle)'}`,
      borderRadius: '999px',
      padding: '0.25rem 0.55rem',
      fontSize: '0.8rem',
      color: active ? 'rgba(210,235,255,0.95)' : connected ? 'var(--ck-text-secondary)' : 'var(--ck-text-tertiary)',
      cursor: connected ? 'pointer' as const : 'default' as const,
      userSelect: 'none' as const,
      opacity: connected ? 1 : 0.5,
      display: 'inline-flex' as const,
      alignItems: 'center' as const,
      gap: '0.3rem',
    }),
    backendBadge: (backend: string) => {
      const colors: Record<string, string> = {
        postiz: 'rgba(99,179,237,0.5)',
        gateway: 'rgba(134,239,172,0.5)',
        direct: 'rgba(251,191,36,0.5)',
      };
      return {
        display: 'inline-block' as const,
        background: colors[backend] || 'rgba(100,100,100,0.3)',
        borderRadius: '999px',
        padding: '0.05rem 0.35rem',
        fontSize: '0.6rem',
        fontWeight: 600,
        color: 'white',
      };
    },
    btnPrimary: {
      background: 'rgba(127,90,240,0.85)', border: 'none', borderRadius: '10px',
      padding: '0.55rem 1rem', color: 'white', fontWeight: 700, cursor: 'pointer',
      fontSize: '0.85rem',
    },
    btnGhost: {
      background: 'rgba(255,255,255,0.05)', border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px', padding: '0.55rem 1rem', color: 'var(--ck-text-primary)',
      fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
    },
    statusDot: (status: string) => {
      const c: Record<string, string> = {
        draft: 'rgba(167,139,250,0.8)', scheduled: 'rgba(251,191,36,0.8)',
        published: 'rgba(74,222,128,0.8)', failed: 'rgba(248,113,113,0.9)',
      };
      return {
        width: '8px', height: '8px', borderRadius: '50%',
        background: c[status] || 'rgba(100,100,100,0.5)', flexShrink: 0,
      };
    },
    previewPanel: {
      background: 'rgba(255,255,255,0.02)', border: '1px solid var(--ck-border-subtle)',
      borderRadius: '10px', padding: '0.75rem', minHeight: '120px',
    },
  };

  /* ================================================================
   * Date helpers
   * ================================================================ */
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function startOfWeek(d: Date): Date {
    const clone = new Date(d);
    const day = clone.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day; // Monday start
    clone.setDate(clone.getDate() + diff);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }
  function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
  function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function fmt(d: Date) { return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`; }
  function isFutureOrToday(d: Date) { const today = new Date(); today.setHours(0, 0, 0, 0); return d >= today; }

  type DriverInfo = {
    platform: string; label: string; icon: string;
    connected: boolean; backend: string; displayName: string;
    capabilities: { canPost: boolean; canSchedule: boolean; maxLength?: number };
  };
  type Post = {
    id: string; content: string; platforms: string[]; status: string;
    scheduledAt?: string; publishedAt?: string; createdAt: string;
  };

  /* ================================================================
   * MAIN COMPONENT
   * ================================================================ */
  function ContentCalendar(props: any) {
    const teamId = String(props?.teamId || 'default');
    const apiBase = '/api/plugins/marketing';
    const today = new Date();

    // State
    const [view, setView] = useState<'week' | 'month'>('week');
    const [anchor, setAnchor] = useState(() => startOfWeek(today));
    const [posts, setPosts] = useState<Post[]>([]);
    const [drivers, setDrivers] = useState<DriverInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoverDay, setHoverDay] = useState<string | null>(null);
    const [hoverPost, setHoverPost] = useState<string | null>(null);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalDate, setModalDate] = useState('');
    const [modalContent, setModalContent] = useState('');
    const [modalPlatforms, setModalPlatforms] = useState<string[]>([]);
    const [modalMediaUrl, setModalMediaUrl] = useState('');
    const [modalShowMedia, setModalShowMedia] = useState(false);
    const [modalUploading, setModalUploading] = useState(false);
    const [modalMediaLibrary, setModalMediaLibrary] = useState<any[]>([]);
    const [modalSelectedMediaIds, setModalSelectedMediaIds] = useState<string[]>([]);
    const modalFileInputRef = useRef<HTMLInputElement | null>(null);

    const [modalSaving, setModalSaving] = useState(false);
    const [modalPublishing, setModalPublishing] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [modalSuccess, setModalSuccess] = useState<string | null>(null);
    // Non-null = the modal is in edit mode for that post id; null = create mode.
    const [modalEditingId, setModalEditingId] = useState<string | null>(null);
    const [modalEditingStatus, setModalEditingStatus] = useState<string>('draft');
    // Cache of mediaId → playable data URL, fetched lazily when a video media
    // is selected so the preview pane can render <video controls> with it.
    const [modalMediaDataUrls, setModalMediaDataUrls] = useState<Record<string, string>>({});
    // Per-account selection — uses each driver's integrationId so two accounts
    // on the same platform (e.g. two Facebook pages) toggle independently.
    // modalPlatforms (above) stays as the deduped platform list we serialize
    // to the API on save.
    const [modalSelectedAccountIds, setModalSelectedAccountIds] = useState<string[]>([]);
    // Editable post fields beyond content/platforms/media
    const [modalEditTags, setModalEditTags] = useState<string>(''); // comma-separated UI
    const [modalEditCreatedAt, setModalEditCreatedAt] = useState<string>(''); // for status info bar in edit mode
    // Workflow:* tags from the original post that we preserve on save (the
    // user only edits human-friendly tags; machine tags must round-trip).
    const [modalEditMachineTags, setModalEditMachineTags] = useState<string[]>([]);

    // Posts list (below the calendar) — independent status filter from the
    // calendar grid (which only shows scheduled posts with a date).
    const [listFilter, setListFilter] = useState<'all' | 'draft' | 'scheduled' | 'published' | 'failed'>('all');

    const postizHeaders = useMemo(() => {
      try {
        const stored = localStorage.getItem(`ck-postiz-${teamId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.apiKey) return { 'x-postiz-api-key': parsed.apiKey, 'x-postiz-base-url': parsed.baseUrl || 'https://api.postiz.com/public/v1' };
        }
      } catch { /* */ }
      return {};
    }, [teamId]);

    const loadPosts = useCallback(async () => {
      try {
        const res = await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}&limit=200`);
        const json = await res.json();
        setPosts(Array.isArray(json.data) ? json.data : []);
      } catch { /* */ }
    }, [teamId]);

    const loadDrivers = useCallback(async () => {
      try {
        const res = await fetch(`${apiBase}/drivers?team=${encodeURIComponent(teamId)}`, { headers: postizHeaders });
        const json = await res.json();
        setDrivers(Array.isArray(json.drivers) ? json.drivers : []);
      } catch { /* */ }
    }, [teamId, postizHeaders]);

    const loadMedia = useCallback(async () => {
      try {
        const res = await fetch(`${apiBase}/media?team=${encodeURIComponent(teamId)}&limit=200`);
        const json = await res.json();
        setModalMediaLibrary(Array.isArray(json.data) ? json.data : []);
      } catch { /* */ }
    }, [teamId]);

    const handleModalFileUpload = useCallback(async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setModalUploading(true);
      setModalError(null);
      try {
        for (const file of Array.from(files)) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const up = await fetch(`${apiBase}/media?team=${encodeURIComponent(teamId)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ data: base64, filename: file.name, mimeType: file.type }),
          });
          if (!up.ok) {
            const err = await up.json().catch(() => ({}));
            throw new Error(err?.message || `Upload failed (${up.status})`);
          }
          const item = await up.json().catch(() => null);
          if (item?.id) {
            setModalSelectedMediaIds((prev: string[]) => (prev.includes(item.id) ? prev : [...prev, item.id]));
          }
        }
        await loadMedia();
      } catch (e: any) {
        setModalError(e?.message || 'Upload failed');
      } finally {
        setModalUploading(false);
        if (modalFileInputRef.current) modalFileInputRef.current.value = '';
      }
    }, [teamId, loadMedia]);

    const toggleModalMedia = (id: string) => {
      setModalSelectedMediaIds((prev: string[]) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    };

    useEffect(() => {
      setLoading(true);
      Promise.all([loadPosts(), loadDrivers()]).finally(() => setLoading(false));
    }, [loadPosts, loadDrivers]);

    // Fetch playable data URLs for any selected video so the preview pane can
    // render <video controls>. Images use thumbnailDataUrl directly so this
    // only fires for video items missing a cached dataUrl.
    useEffect(() => {
      let cancelled = false;
      (async () => {
        for (const id of modalSelectedMediaIds) {
          if (modalMediaDataUrls[id]) continue;
          const item = modalMediaLibrary.find((m: any) => m.id === id);
          if (!item || !String(item.mimeType || '').startsWith('video/')) continue;
          try {
            const res = await fetch(`${apiBase}/media/${id}/file?team=${encodeURIComponent(teamId)}`);
            const json = await res.json();
            if (cancelled) return;
            if (json?.dataUrl) {
              setModalMediaDataUrls((prev: Record<string, string>) => ({ ...prev, [id]: String(json.dataUrl) }));
            }
          } catch {
            // ignore — preview falls back to poster image
          }
        }
      })();
      return () => { cancelled = true; };
    }, [modalSelectedMediaIds, modalMediaLibrary, modalMediaDataUrls, apiBase, teamId]);

    // Navigation
    const goToday = () => setAnchor(startOfWeek(today));
    const goPrev = () => setAnchor(view === 'week' ? addDays(anchor, -7) : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
    const goNext = () => setAnchor(view === 'week' ? addDays(anchor, 7) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));

    // Get posts for a given day. Calendar shows ONLY posts that are
    // scheduled AND have a scheduledAt — drafts, published, and failed
    // posts don't appear on the calendar regardless of any date.
    const postsForDay = useCallback((day: Date) => {
      return posts.filter((p) => {
        if (p.status !== 'scheduled' || !p.scheduledAt) return false;
        return isSameDay(new Date(p.scheduledAt), day);
      });
    }, [posts]);

    // Open create modal for a specific date
    // Convert an ISO/UTC date to the YYYY-MM-DDTHH:MM local-time string the
    // browser's <input type=datetime-local> expects.
    const toLocalDatetimeInputValue = (d: Date): string => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    // Stable per-account key for selection state. Falls back to platform when
    // a driver has no integrationId (e.g. an unconnected platform driver).
    const accountKey = (d: { integrationId?: string; platform: string }) =>
      String(d.integrationId || d.platform);

    const openCreateModal = (dateStr?: string, postToEdit?: Post) => {
      if (postToEdit) {
        // Edit mode: populate every field from the post.
        const sourceDate = postToEdit.scheduledAt
          ? new Date(postToEdit.scheduledAt)
          : new Date(postToEdit.createdAt);
        setModalDate(toLocalDatetimeInputValue(sourceDate));
        setModalContent(String(postToEdit.content || ''));
        const editPlatforms = Array.isArray(postToEdit.platforms) ? [...postToEdit.platforms] : [];
        setModalPlatforms(editPlatforms);
        // Edit mode: pre-select every connected account on each platform the
        // post targets. The API only stores platform strings today, so we
        // can't restore which specific accounts the post was published to —
        // start from "all connected accounts on these platforms" and let the
        // user uncheck any they don't want.
        setModalSelectedAccountIds(
          drivers
            .filter((d: any) => d.connected && editPlatforms.includes(d.platform))
            .map((d: any) => accountKey(d))
        );
        const ids = Array.isArray((postToEdit as any).mediaIds) ? [...(postToEdit as any).mediaIds] : [];
        setModalSelectedMediaIds(ids);
        setModalMediaUrl('');
        setModalShowMedia(false);
        // Pre-fetch media library so any attached media renders in the preview.
        if (ids.length > 0) void loadMedia();
        setModalEditingId(postToEdit.id);
        setModalEditingStatus(String(postToEdit.status || 'draft'));
        const allTags = Array.isArray((postToEdit as any).tags) ? (postToEdit as any).tags as string[] : [];
        // Split out workflow-machine tags so they round-trip on save.
        const machineTags = allTags.filter((t: string) => String(t).startsWith('workflow:'));
        const humanTags = allTags.filter((t: string) => !String(t).startsWith('workflow:'));
        setModalEditMachineTags(machineTags);
        setModalEditTags(humanTags.join(', '));
        setModalEditCreatedAt(String(postToEdit.createdAt || ''));
      } else {
        const d = dateStr || new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0).toISOString().slice(0, 16);
        setModalDate(d);
        setModalContent('');
        setModalPlatforms([]);
        setModalSelectedAccountIds([]);
        setModalMediaUrl('');
        setModalShowMedia(false);
        setModalSelectedMediaIds([]);
        setModalMediaLibrary([]);
        setModalEditingId(null);
        setModalEditingStatus('draft');
        setModalEditTags('');
        setModalEditCreatedAt('');
        setModalEditMachineTags([]);
      }
      setModalError(null);
      setModalSuccess(null);
      setModalOpen(true);
    };

    // Delete post
    const deletePost = async (id: string) => {
      try {
        await fetch(`${apiBase}/posts/${id}?team=${encodeURIComponent(teamId)}`, { method: 'DELETE' });
        setPosts((prev: Post[]) => prev.filter((p) => p.id !== id));
        if (previewPost?.id === id) setPreviewPost(null);
      } catch { /* */ }
    };

    // Copy post content
    const copyPost = (content: string) => {
      try { navigator.clipboard.writeText(content); } catch { /* */ }
    };

    // Save from modal — POSTs a new post in create mode, PATCHes the post in
    // edit mode so the user can update an existing scheduled post inline.
    const modalSaveDraft = async () => {
      if (!modalContent.trim()) return;
      setModalSaving(true);
      setModalError(null);
      try {
        const desiredStatus = modalEditingId
          ? modalEditingStatus
          : (modalDate ? 'scheduled' : 'draft');
        // Tags input is comma-separated. Trim and drop empties.
        const editedTags = modalEditTags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        // Derive the post's platform list from the selected account IDs. The
        // post API still stores platforms (not accounts) so multiple accounts
        // on the same platform collapse into one platform string. The pill UI
        // remains per-account so future per-account publishing has the data.
        const derivedPlatforms = Array.from(new Set(
          modalSelectedAccountIds
            .map((id: string) => drivers.find((d) => accountKey(d) === id))
            .filter((d): d is any => Boolean(d))
            .map((d) => d.platform)
        ));
        // Fall back to the current modalPlatforms array if derivation produced
        // nothing (covers the legacy state where pills weren't selected).
        const platformsToSend = derivedPlatforms.length > 0
          ? derivedPlatforms
          : (modalPlatforms.length > 0 ? modalPlatforms : ['draft']);
        const body: Record<string, unknown> = {
          content: modalContent,
          platforms: platformsToSend,
          status: desiredStatus,
          scheduledAt: modalDate || undefined,
          mediaIds: modalSelectedMediaIds,
        };
        if (modalEditingId) body.tags = [...modalEditMachineTags, ...editedTags]; // preserve workflow:* on edit, add human tags
        const url = modalEditingId
          ? `${apiBase}/posts/${modalEditingId}?team=${encodeURIComponent(teamId)}`
          : `${apiBase}/posts?team=${encodeURIComponent(teamId)}`;
        const res = await fetch(url, {
          method: modalEditingId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        setModalSuccess(modalEditingId ? 'Updated!' : 'Saved!');
        await loadPosts();
        // Reset all fields so the modal is clean for next post
        setModalContent('');
        setModalPlatforms([]);
        setModalSelectedAccountIds([]);
        setModalMediaUrl('');
        setModalShowMedia(false);
        setModalSelectedMediaIds([]);
        setModalMediaLibrary([]);
        setModalEditingId(null);
        setModalEditingStatus('draft');
        setTimeout(() => { setModalOpen(false); setModalSuccess(null); }, 800);
      } catch (e: any) {
        setModalError(e?.message || 'Failed to save');
      } finally {
        setModalSaving(false);
      }
    };

    // Publish from modal
    const modalPublish = async () => {
      if (!modalContent.trim() || modalPlatforms.length === 0) return;
      setModalPublishing(true);
      setModalError(null);
      try {
        const res = await fetch(`${apiBase}/publish?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...postizHeaders },
          body: JSON.stringify({
            content: modalContent,
            platforms: modalPlatforms,
            scheduledAt: modalDate || undefined,
            // NOTE: Postiz expects publicly reachable URLs; uploaded library media is local-only for now.
            mediaUrls: modalMediaUrl ? [modalMediaUrl] : undefined,
          }),
        });
        const json = await res.json();
        if (json.results) {
          const failed = json.results.filter((r: any) => !r.success);
          if (failed.length > 0 && json.results.every((r: any) => !r.success)) {
            throw new Error(failed.map((f: any) => `${f.platform}: ${f.error}`).join('; '));
          }
        }
        // Also save local record
        await fetch(`${apiBase}/posts?team=${encodeURIComponent(teamId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content: modalContent, platforms: modalPlatforms,
            status: modalDate ? 'scheduled' : 'published',
            scheduledAt: modalDate || undefined,
            mediaIds: modalSelectedMediaIds,
          }),
        }).catch(() => {});
        setModalSuccess(modalDate ? 'Scheduled!' : 'Published!');
        await loadPosts();
        // Reset all fields
        setModalContent('');
        setModalPlatforms([]);
        setModalMediaUrl('');
        setModalShowMedia(false);
        setModalSelectedMediaIds([]);
        setModalMediaLibrary([]);
        setTimeout(() => { setModalOpen(false); setModalSuccess(null); }, 1000);
      } catch (e: any) {
        setModalError(e?.message || 'Publish failed');
      } finally {
        setModalPublishing(false);
      }
    };

    const connectedDrivers = useMemo(() => drivers.filter((d) => d.connected), [drivers]);

    /* =================================================================
     * Post card component — used in both views
     * ================================================================= */
    function PostCard({ post, compact }: { post: Post; compact?: boolean }) {
      const isHover = hoverPost === post.id;
      const statusBorder = s[
        ('postCard' + post.status.charAt(0).toUpperCase() + post.status.slice(1)) as keyof typeof s
      ] || {};
      const driver = post.platforms?.[0] ? drivers.find((d) => d.platform === post.platforms[0]) : null;

      return h('div', {
        style: { ...s.postCard, ...statusBorder, ...(compact ? {} : { whiteSpace: 'normal' as const, maxHeight: '50px' }) },
        onMouseEnter: () => setHoverPost(post.id),
        onMouseLeave: () => setHoverPost(null),
        onClick: () => openCreateModal(undefined, post),
        title: post.content.slice(0, 150),
      },
        // Actions on hover
        isHover && h('div', { style: s.cardActions },
          h('button', {
            style: s.cardActionBtn, title: 'Edit',
            onClick: (e: any) => { e.stopPropagation(); openCreateModal(undefined, post); },
          }, '✎'),
          h('button', {
            style: s.cardActionBtn, title: 'Copy',
            onClick: (e: any) => { e.stopPropagation(); copyPost(post.content); },
          }, '📋'),
          h('button', {
            style: s.cardActionBtn, title: 'Delete',
            onClick: (e: any) => { e.stopPropagation(); deletePost(post.id); },
          }, '🗑'),
        ),
        // Platform icon + snippet
        driver && h('span', { style: { marginRight: '3px' } }, driver.icon),
        post.content.slice(0, compact ? 25 : 40),
      );
    }

    /* =================================================================
     * WEEK VIEW
     * ================================================================= */
    function WeekView() {
      const weekStart = anchor;
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      const hours = Array.from({ length: 24 }, (_, i) => i); // 0 (12 AM) – 23 (11 PM)

      return h('div', null,
        // Column headers
        h('div', { style: { ...s.weekGrid } },
          h('div', null), // empty corner
          ...days.map((d, i) => {
            const isToday2 = isSameDay(d, today);
            return h('div', { key: i, style: isToday2 ? s.dayColHeaderToday : s.dayColHeader },
              h('div', null, DAY_NAMES[i]),
              h('div', { style: isToday2 ? s.dayDateToday : s.dayDate },
                isToday2 && h('span', { style: { marginRight: '4px' } }, '●'),
                fmt(d),
              ),
            );
          }),
        ),
        // Time grid
        h('div', { style: { ...s.weekGrid, maxHeight: '600px', overflowY: 'auto' as const } },
          ...hours.flatMap((hr) => [
            // Time label
            h('div', { key: `t${hr}`, style: s.timeLabel },
              `${hr > 12 ? hr - 12 : hr}:00 ${hr >= 12 ? 'PM' : 'AM'}`
            ),
            // 7 day cells for this hour
            ...days.map((day, di) => {
              const dayKey = day.toISOString().slice(0, 10);
              const dayPosts = postsForDay(day).filter((p) => {
                const pd = p.scheduledAt ? new Date(p.scheduledAt) : new Date(p.createdAt);
                return pd.getHours() === hr;
              });
              const isFuture = isFutureOrToday(day);
              const hovering = hoverDay === `${dayKey}-${hr}`;

              return h('div', {
                key: `${di}-${hr}`,
                style: s.timeSlot,
                onMouseEnter: () => setHoverDay(`${dayKey}-${hr}`),
                onMouseLeave: () => setHoverDay(null),
              },
                ...dayPosts.map((p) => h(PostCard, { key: p.id, post: p, compact: true })),
                // Plus button for future cells
                isFuture && h('button', {
                  style: { ...s.plusBtn, ...(hovering ? s.plusBtnVisible : {}) },
                  onClick: () => {
                    const d2 = new Date(day);
                    d2.setHours(hr, 0, 0, 0);
                    openCreateModal(d2.toISOString().slice(0, 16));
                  },
                  title: 'Create post',
                }, '+'),
              );
            }),
          ]),
        ),
      );
    }

    /* =================================================================
     * MONTH VIEW
     * ================================================================= */
    function MonthView() {
      const year = anchor.getFullYear();
      const month = anchor.getMonth();
      const firstOfMonth = new Date(year, month, 1);
      let firstDow = firstOfMonth.getDay() - 1; // Mon=0
      if (firstDow < 0) firstDow = 6;
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const cells: (Date | null)[] = [];
      for (let i = 0; i < firstDow; i++) cells.push(null);
      for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
      while (cells.length % 7 !== 0) cells.push(null);

      return h('div', null,
        // Day headers
        h('div', { style: s.monthGrid },
          ...DAY_NAMES_SHORT.map((n) => h('div', { key: n, style: s.monthDayHeader }, n)),
        ),
        // Day cells
        h('div', { style: s.monthGrid },
          ...cells.map((day, i) => {
            if (!day) return h('div', { key: `e${i}`, style: s.monthCellEmpty });
            const isToday2 = isSameDay(day, today);
            const dayPosts = postsForDay(day);
            const isFuture = isFutureOrToday(day);
            const dayKey = day.toISOString().slice(0, 10);
            const hovering = hoverDay === dayKey;

            return h('div', {
              key: i,
              style: s.monthCell,
              onMouseEnter: () => setHoverDay(dayKey),
              onMouseLeave: () => setHoverDay(null),
            },
              h('div', { style: isToday2 ? s.monthDayNumToday : s.monthDayNum }, day.getDate()),
              ...dayPosts.slice(0, 3).map((p) => h(PostCard, { key: p.id, post: p, compact: true })),
              dayPosts.length > 3 && h('div', {
                style: { fontSize: '0.65rem', color: 'var(--ck-text-tertiary)', textAlign: 'center' },
              }, `+${dayPosts.length - 3} more`),
              // Plus button
              isFuture && h('button', {
                style: { ...s.plusBtn, ...(hovering ? s.plusBtnVisible : {}) },
                onClick: () => {
                  const d2 = new Date(day);
                  d2.setHours(17, 0, 0, 0);
                  openCreateModal(d2.toISOString().slice(0, 16));
                },
                title: 'Create post',
              }, '+'),
            );
          }),
        ),
      );
    }

    /* =================================================================
     * PREVIEW MODAL — dashboard layout (topbar + two-column),
     * kitchen design tokens.
     * ================================================================= */
    function PreviewModal() {
      if (!previewPost) return null;
      const p = previewPost;
      const created = new Date(p.createdAt);
      const scheduled = p.scheduledAt ? new Date(p.scheduledAt) : null;
      const published = p.publishedAt ? new Date(p.publishedAt) : null;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const visibleTags = tags.filter((t: string) => !String(t).startsWith('workflow:'));
      const mediaIds = Array.isArray(p.mediaIds) ? p.mediaIds : [];

      const sectionKicker = {
        fontSize: '0.7rem',
        color: 'var(--ck-text-tertiary)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
        marginBottom: '0.4rem',
      };
      const metaCard = {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--ck-border-subtle)',
        borderRadius: '12px',
        padding: '14px',
      };

      return h(Portal, null,
        h('div', { style: s.overlay, onClick: () => setPreviewPost(null) },
          h('div', {
            style: s.modal,
            onClick: (e: any) => e.stopPropagation(),
          },
            h('button', {
              style: { ...s.closeBtn, position: 'absolute' as const, top: '12px', right: '12px' },
              onClick: () => setPreviewPost(null),
              'aria-label': 'Close',
            }, '×'),
            // Topbar
            h('div', {
              style: {
                display: 'grid' as const,
                gridTemplateColumns: 'minmax(0, 1fr) 360px',
                gap: '24px',
                padding: '14px 56px 14px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              },
            },
              h('div', { style: { fontSize: '1rem', fontWeight: 700, color: 'var(--ck-text-primary)' } }, 'Post Preview'),
              h('div', { style: { fontSize: '1rem', fontWeight: 600, color: 'var(--ck-text-primary)' } }, 'Details'),
            ),
            // Two columns
            h('div', {
              style: {
                display: 'grid' as const,
                gridTemplateColumns: 'minmax(0, 1fr) 360px',
                gap: '20px',
                padding: '20px',
              },
            },
              // LEFT — content
              h('div', { style: { minWidth: 0 } },
                h('div', { style: sectionKicker }, 'Content'),
                h('div', {
                  style: {
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--ck-border-subtle)',
                    borderRadius: '12px',
                    padding: '14px',
                    whiteSpace: 'pre-wrap' as const,
                    fontSize: '0.95rem',
                    color: 'var(--ck-text-primary)',
                    lineHeight: 1.55,
                    minHeight: '160px',
                  },
                }, p.content || h('span', { style: { color: 'var(--ck-text-tertiary)' } }, '(empty)')),
                visibleTags.length > 0 && h('div', { style: { marginTop: '14px' } },
                  h('div', { style: sectionKicker }, 'Tags'),
                  h('div', { style: { display: 'flex' as const, flexWrap: 'wrap' as const, gap: '0.35rem' } },
                    ...visibleTags.map((tag: string) => h('span', {
                      key: tag,
                      style: {
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--ck-border-subtle)',
                        borderRadius: '999px',
                        padding: '0.15rem 0.55rem',
                        fontSize: '0.7rem',
                        color: 'var(--ck-text-secondary)',
                      },
                    }, tag)),
                  ),
                ),
                // Actions
                h('div', { style: { display: 'flex' as const, gap: '0.5rem', marginTop: '20px', flexWrap: 'wrap' as const } },
                  h('button', {
                    style: s.btnGhost,
                    onClick: () => copyPost(p.content),
                  }, '📋 Copy content'),
                  h('button', {
                    style: { ...s.btnGhost, color: 'rgba(248,113,113,0.9)', borderColor: 'rgba(248,113,113,0.3)' },
                    onClick: () => { void deletePost(p.id); setPreviewPost(null); },
                  }, '🗑 Delete'),
                ),
              ),
              // RIGHT — meta
              h('div', { style: { display: 'flex' as const, flexDirection: 'column' as const, gap: '12px' } },
                h('div', { style: metaCard },
                  h('div', { style: sectionKicker }, 'Status'),
                  h('div', { style: { display: 'flex' as const, alignItems: 'center' as const, gap: '0.4rem' } },
                    h('div', { style: s.statusDot(p.status) }),
                    h('span', { style: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--ck-text-primary)', textTransform: 'capitalize' as const } }, p.status),
                  ),
                  h('div', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', marginTop: '0.5rem', display: 'grid' as const, gap: '0.25rem' } },
                    h('div', null, `Created: ${created.toLocaleString()}`),
                    scheduled && h('div', null, `Scheduled: ${scheduled.toLocaleString()}`),
                    published && h('div', null, `Published: ${published.toLocaleString()}`),
                    h('div', null, `ID: ${String(p.id).slice(0, 8)}…`),
                  ),
                ),
                p.platforms?.length > 0 && h('div', { style: metaCard },
                  h('div', { style: sectionKicker }, 'Platforms'),
                  h('div', { style: { display: 'flex' as const, gap: '0.35rem', flexWrap: 'wrap' as const } },
                    ...p.platforms.map((pl: string) => {
                      const drv = drivers.find((x) => x.platform === pl);
                      return h('span', {
                        key: pl,
                        style: {
                          background: 'rgba(127,90,240,0.15)',
                          border: '1px solid rgba(127,90,240,0.3)',
                          borderRadius: '999px',
                          padding: '0.2rem 0.55rem',
                          fontSize: '0.75rem',
                          color: 'var(--ck-text-secondary)',
                        },
                      }, drv ? `${drv.icon} ${drv.label}` : pl);
                    }),
                  ),
                ),
                mediaIds.length > 0 && h('div', { style: metaCard },
                  h('div', { style: sectionKicker }, `Linked media (${mediaIds.length})`),
                  h('div', { style: { fontSize: '0.75rem', color: 'var(--ck-text-tertiary)' } },
                    `${mediaIds.length} attached asset${mediaIds.length === 1 ? '' : 's'}`),
                ),
              ),
            ),
          ),
        ),
      );
    }

    /* =================================================================
     * CREATE POST MODAL
     * ================================================================= */
    function CreateModal() {
      if (!modalOpen) return null;
      // NOTE: This is a render helper (not a React component) to avoid remounting on every keystroke.
      // Nested component identities change on each render and can cause textarea focus loss.
      let charLimit: number | undefined = undefined;
      if (modalPlatforms.length > 0) {
        const limits = modalPlatforms
          .map((p: string) => drivers.find((d) => d.platform === p)?.capabilities?.maxLength)
          .filter((l): l is number => l !== undefined);
        if (limits.length > 0) charLimit = Math.min(...limits);
      }

      return h(Portal, null,
        h('div', { style: s.overlay, onClick: () => setModalOpen(false) },
        h('div', {
          style: s.modal,
          onClick: (e: any) => e.stopPropagation(),
        },
          // Header
          h('div', { style: s.modalHeader },
            h('div', { style: { fontWeight: 700, fontSize: '1.1rem', color: 'var(--ck-text-primary)' } }, modalEditingId ? 'Edit Post' : 'Create Post'),
            h('button', { style: s.closeBtn, onClick: () => setModalOpen(false) }, '×'),
          ),

          // Body — two columns
          h('div', { style: s.modalBody },
            // Left — compose (dashboard layout: status bar, labeled sections)
            h('div', { style: s.modalLeft },
              // Status info bar (edit mode only)
              modalEditingId && h('div', {
                style: {
                  display: 'flex' as const,
                  flexWrap: 'wrap' as const,
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '0.78rem',
                  color: 'var(--ck-text-secondary)',
                },
              },
                h('span', null, h('strong', { style: { color: 'var(--ck-text-primary)' } }, 'Status: '), modalEditingStatus),
                modalEditCreatedAt && h('span', null, h('strong', { style: { color: 'var(--ck-text-primary)' } }, 'Created: '), new Date(modalEditCreatedAt).toLocaleDateString()),
                modalDate && h('span', null, h('strong', { style: { color: 'var(--ck-text-primary)' } }, 'Scheduled: '), new Date(modalDate).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })),
                h('span', null, h('strong', { style: { color: 'var(--ck-text-primary)' } }, 'Media: '), `${modalSelectedMediaIds.length} asset${modalSelectedMediaIds.length === 1 ? '' : 's'}`),
                h('span', null, h('strong', { style: { color: 'var(--ck-text-primary)' } }, 'ID: '), String(modalEditingId).slice(0, 8)),
              ),
              // POST CONTENT label
              h('div', {
                style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginTop: modalEditingId ? '4px' : 0 },
              }, 'Post Content'),
              h('textarea', {
                style: s.textarea,
                dir: 'ltr',
                value: modalContent,
                onChange: (e: any) => setModalContent(e.target.value),
                placeholder: 'Write something …',
                autoFocus: true,
              }),
              // ACCOUNTS — same pill UI as the content-library composer
              h('div', {
                style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
              }, 'Accounts'),
              connectedDrivers.length > 0
                ? h('div', { style: { display: 'flex' as const, flexWrap: 'wrap' as const, gap: '0.5rem' } },
                    ...connectedDrivers.map((d: any) => {
                      const key = accountKey(d);
                      const active = modalSelectedAccountIds.includes(key);
                      const accountLabel = d.username
                        ? `@${String(d.username).replace(/^@/, '')}`
                        : (d.displayName || d.label);
                      return h('span', {
                        key,
                        onClick: () => setModalSelectedAccountIds((prev: string[]) =>
                          prev.includes(key) ? prev.filter((x: string) => x !== key) : [...prev, key]
                        ),
                        style: s.pill(active, true),
                        role: 'button',
                        tabIndex: 0,
                        title: `${d.displayName || d.label}${d.username ? ` (@${d.username})` : ''} via ${d.backend}`,
                      },
                        `${d.icon} ${d.label} ${accountLabel}`,
                        h('span', { style: s.backendBadge(d.backend) }, d.backend),
                      );
                    }),
                    ...drivers.filter((d) => !d.connected).map((d) =>
                      h('span', {
                        key: accountKey(d),
                        style: s.pill(false, false),
                        title: `${d.label} — not connected`,
                      }, `${d.icon} ${d.label}`)
                    ),
                  )
                : h('div', { style: { display: 'flex' as const, flexWrap: 'wrap' as const, gap: '0.5rem' } },
                    ...drivers.map((d) =>
                      h('span', { key: accountKey(d), style: s.pill(false, false), title: 'Not connected' },
                        `${d.icon} ${d.label}`
                      )
                    ),
                    h('div', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)' } },
                      'No platforms connected. Open the Accounts tab to set up Postiz or add accounts.'
                    ),
                  ),
              h('div', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)' } },
                'Tap a pill to publish/un-publish that account.'),
              // STATUS + SCHEDULED AT row
              h('div', { style: { display: 'grid' as const, gridTemplateColumns: '1fr 1fr', gap: '12px' } },
                h('label', { style: { display: 'flex' as const, flexDirection: 'column' as const, gap: '4px' } },
                  h('span', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' } }, 'Status'),
                  h('select', {
                    value: modalEditingId ? modalEditingStatus : (modalDate ? 'scheduled' : 'draft'),
                    onChange: (e: any) => setModalEditingStatus(e.target.value),
                    disabled: !modalEditingId,
                    style: { ...s.input, appearance: 'auto' as const, padding: '0.55rem 0.65rem' },
                  },
                    h('option', { value: 'draft' }, 'Draft'),
                    h('option', { value: 'scheduled' }, 'Scheduled'),
                    h('option', { value: 'published' }, 'Published'),
                    h('option', { value: 'failed' }, 'Failed'),
                  ),
                ),
                h('label', { style: { display: 'flex' as const, flexDirection: 'column' as const, gap: '4px' } },
                  h('span', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' } }, 'Scheduled at'),
                  h('input', {
                    type: 'datetime-local',
                    value: modalDate,
                    onChange: (e: any) => setModalDate(e.target.value),
                    style: s.input,
                  }),
                ),
              ),
              // TAGS
              h('label', { style: { display: 'flex' as const, flexDirection: 'column' as const, gap: '4px' } },
                h('span', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' } }, 'Tags'),
                h('input', {
                  type: 'text',
                  value: modalEditTags,
                  onChange: (e: any) => setModalEditTags(e.target.value),
                  placeholder: 'promo, haircut, spring',
                  style: s.input,
                }),
              ),
              // LINKED MEDIA — always visible thumbnails of attached media
              h('div', null,
                h('div', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '6px' } }, 'Linked Media'),
                modalSelectedMediaIds.length > 0 && h('div', {
                  style: {
                    display: 'grid' as const,
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '8px',
                    marginBottom: '8px',
                  },
                },
                  ...modalSelectedMediaIds.map((id: string) => {
                    const item = modalMediaLibrary.find((m: any) => m.id === id);
                    const thumb = item?.thumbnailDataUrl || '';
                    const isVideo = String(item?.mimeType || '').startsWith('video/');
                    return h('div', {
                      key: id,
                      style: {
                        position: 'relative' as const,
                        aspectRatio: '1',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--ck-border-subtle)',
                        borderRadius: '12px',
                        overflow: 'hidden' as const,
                        display: 'flex' as const,
                        alignItems: 'center' as const,
                        justifyContent: 'center' as const,
                      },
                    },
                      thumb
                        ? h('img', { src: thumb, style: { width: '100%', height: '100%', objectFit: 'cover' as const } })
                        : h('div', { style: { color: 'var(--ck-text-tertiary)', fontSize: '0.7rem' } }, isVideo ? '🎬' : '🖼'),
                      isVideo && h('div', {
                        style: {
                          position: 'absolute' as const, inset: 0,
                          display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
                          color: 'white', fontSize: '1.5rem', textShadow: '0 0 8px rgba(0,0,0,0.6)', pointerEvents: 'none' as const,
                        },
                      }, '▶'),
                      h('button', {
                        type: 'button',
                        title: 'Remove',
                        onClick: (e: any) => { e.stopPropagation(); setModalSelectedMediaIds((prev: string[]) => prev.filter((x: string) => x !== id)); },
                        style: {
                          position: 'absolute' as const, top: '4px', right: '4px',
                          width: '20px', height: '20px',
                          background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                          color: 'white', cursor: 'pointer' as const, fontSize: '0.7rem', lineHeight: 1, padding: 0,
                        },
                      }, '×'),
                    );
                  }),
                ),
                // Action buttons (kitchen tokens)
                h('div', { style: { display: 'flex' as const, gap: '0.5rem', alignItems: 'center' as const, flexWrap: 'wrap' as const } },
                  h('button', {
                    type: 'button',
                    style: { ...s.btnGhost, padding: '0.3rem 0.6rem', fontSize: '0.75rem' },
                    onClick: async () => {
                      const next = !modalShowMedia;
                      setModalShowMedia(next);
                      if (next) await loadMedia();
                    },
                  }, modalShowMedia ? 'Hide library' : 'Add from library'),
                  h('button', {
                    type: 'button',
                    style: { ...s.btnGhost, padding: '0.3rem 0.6rem', fontSize: '0.75rem', opacity: modalUploading ? 0.7 : 1 },
                    onClick: () => modalFileInputRef.current?.click(),
                    disabled: modalUploading,
                  }, modalUploading ? 'Uploading…' : 'Upload new'),
                  charLimit && h('span', {
                    style: {
                      fontSize: '0.75rem', marginLeft: 'auto',
                      color: modalContent.length > charLimit ? 'rgba(248,113,113,0.95)' : 'var(--ck-text-tertiary)',
                    },
                  }, `${modalContent.length}/${charLimit}`),
                ),
              ),
              // Media panel (upload + library + URL)
              modalShowMedia && h('div', {
                style: {
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--ck-border-subtle)',
                  borderRadius: '10px',
                  padding: '0.75rem',
                },
              },
                h('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' as const } },
                  h('input', {
                    ref: modalFileInputRef,
                    type: 'file',
                    accept: 'image/*,video/*',
                    multiple: true,
                    style: { display: 'none' },
                    onChange: (e: any) => void handleModalFileUpload(e.target.files),
                  }),
                  h('button', {
                    type: 'button',
                    style: { ...s.btnGhost, padding: '0.35rem 0.6rem', fontSize: '0.75rem', opacity: modalUploading ? 0.7 : 1 },
                    onClick: () => modalFileInputRef.current?.click(),
                    disabled: modalUploading,
                  }, modalUploading ? '⏳ Uploading…' : '📁 Upload'),
                  h('button', {
                    type: 'button',
                    style: { ...s.btnGhost, padding: '0.35rem 0.6rem', fontSize: '0.75rem' },
                    onClick: () => setModalShowMedia(false),
                  }, 'Done'),
                ),

                h('input', {
                  style: s.input,
                  type: 'url',
                  value: modalMediaUrl,
                  onChange: (e: any) => setModalMediaUrl(e.target.value),
                  placeholder: 'Paste a public image/video URL (needed for Postiz)…',
                }),

                // Selected media strip
                modalSelectedMediaIds.length > 0 && h('div', { style: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem', marginTop: '0.65rem' } },
                  ...modalSelectedMediaIds.map((id: string) => {
                    const item = modalMediaLibrary.find((m: any) => m.id === id);
                    if (!item) return null;
                    return h('div', {
                      key: id,
                      style: {
                        position: 'relative' as const,
                        width: '64px', height: '64px',
                        borderRadius: '8px', overflow: 'hidden',
                        border: '2px solid rgba(127,90,240,0.55)',
                      },
                    },
                      item.mimeType?.startsWith('video/')
                        ? h('div', {
                            style: { width: '100%', height: '100%', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' },
                          }, '🎥')
                        : h('img', { src: item.thumbnailDataUrl, style: { width: '100%', height: '100%', objectFit: 'cover' as const } }),
                      h('button', {
                        type: 'button',
                        onClick: () => toggleModalMedia(id),
                        style: {
                          position: 'absolute' as const, top: '2px', right: '2px',
                          background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                          width: '18px', height: '18px', color: 'white', fontSize: '0.65rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        },
                      }, '✕'),
                    );
                  }),
                ),

                // Library grid
                h('div', { style: { marginTop: '0.65rem' } },
                  h('div', { style: { fontSize: '0.75rem', fontWeight: 600, color: 'var(--ck-text-secondary)', marginBottom: '0.4rem' } }, 'Media Library'),
                  modalMediaLibrary.length === 0
                    ? h('div', { style: { fontSize: '0.75rem', color: 'var(--ck-text-tertiary)', padding: '0.5rem 0' } }, 'No media yet — upload something.')
                    : h('div', {
                        style: {
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))',
                          gap: '0.5rem',
                          maxHeight: '220px',
                          overflowY: 'auto' as const,
                          paddingRight: '4px',
                        },
                      },
                        ...modalMediaLibrary.map((item: any) => {
                          const selected = modalSelectedMediaIds.includes(item.id);
                          const thumb = item.thumbnailDataUrl;
                          return h('div', {
                            key: item.id,
                            onClick: () => toggleModalMedia(item.id),
                            style: {
                              position: 'relative' as const,
                              width: '100%', paddingTop: '100%',
                              borderRadius: '10px', overflow: 'hidden',
                              cursor: 'pointer',
                              border: selected ? '2px solid rgba(127,90,240,0.75)' : '1px solid var(--ck-border-subtle)',
                              boxShadow: selected ? '0 0 10px rgba(127,90,240,0.25)' : 'none',
                              background: 'rgba(0,0,0,0.25)',
                            },
                          },
                            item.mimeType?.startsWith('video/')
                              ? h('div', {
                                  style: { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.4rem' },
                                }, '🎥')
                              : h('img', {
                                  src: thumb,
                                  style: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const },
                                }),
                            selected && h('div', {
                              style: {
                                position: 'absolute' as const, top: '6px', right: '6px',
                                width: '20px', height: '20px', borderRadius: '50%',
                                background: 'rgba(127,90,240,0.9)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: '0.75rem', fontWeight: 800,
                              },
                            }, '✓'),
                          );
                        }),
                      ),
                ),
              ),
            ),
            // Right — social-post-style preview
            h('div', { style: s.modalRight },
              h('div', { style: { fontWeight: 600, fontSize: '0.85rem', color: 'var(--ck-text-secondary)', marginBottom: '0.75rem' } }, 'Post Preview'),
              h('div', {
                style: {
                  background: 'rgba(22,22,28,0.95)', borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
                },
              },
                // Header
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.85rem 1rem 0' } },
                  h('div', {
                    style: {
                      width: '40px', height: '40px', borderRadius: '50%',
                      background: 'rgba(127,90,240,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.1rem', color: 'rgba(127,90,240,0.9)', flexShrink: 0,
                    },
                  }, '\ud83d\udc64'),
                  h('div', null,
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.3rem' } },
                      h('span', { style: { fontWeight: 700, fontSize: '0.9rem', color: 'var(--ck-text-primary)' } }, 'Your Brand'),
                      h('span', { style: { color: 'rgba(99,179,237,0.9)', fontSize: '0.85rem' } }, '\u2713'),
                    ),
                    h('div', { style: { fontSize: '0.75rem', color: 'var(--ck-text-tertiary)' } },
                      modalDate ? new Date(modalDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'),
                  ),
                ),
                // Body
                h('div', { style: { padding: '0.65rem 1rem 0.75rem' } },
                  modalContent.trim()
                    ? h('div', {
                        style: {
                          whiteSpace: 'pre-wrap' as const, fontSize: '0.9rem',
                          color: 'var(--ck-text-primary)', lineHeight: '1.5',
                          maxHeight: '300px', overflowY: 'auto' as const,
                          wordBreak: 'break-word' as const,
                        },
                      }, modalContent)
                    : h('div', {
                        style: { color: 'var(--ck-text-tertiary)', fontSize: '0.85rem', fontStyle: 'italic' as const, padding: '1.5rem 0', textAlign: 'center' as const },
                      }, 'Start writing to see a preview'),
                ),
                // Media preview (selected library media first, then URL).
                // Videos render <video controls> with the lazily-fetched data
                // URL; images use the inline thumbnailDataUrl directly.
                (modalSelectedMediaIds.length > 0 || modalMediaUrl) && h('div', null,
                  ...modalSelectedMediaIds.slice(0, 1).map((id: string) => {
                    const item = modalMediaLibrary.find((m: any) => m.id === id);
                    if (!item) return null;
                    const isVideo = String(item.mimeType || '').startsWith('video/');
                    if (isVideo) {
                      const videoSrc = modalMediaDataUrls[id];
                      if (!videoSrc) {
                        return h('div', {
                          key: id,
                          style: {
                            position: 'relative' as const,
                            background: '#000',
                            width: '100%',
                            aspectRatio: '16/9',
                            display: 'flex' as const,
                            alignItems: 'center' as const,
                            justifyContent: 'center' as const,
                          },
                        },
                          item.thumbnailDataUrl && h('img', {
                            src: item.thumbnailDataUrl,
                            style: {
                              position: 'absolute' as const,
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover' as const,
                              opacity: 0.6,
                            },
                          }),
                          h('div', {
                            style: { position: 'relative' as const, color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem' },
                          }, 'Loading video…'),
                        );
                      }
                      return h('video', {
                        key: id,
                        src: videoSrc,
                        controls: true,
                        poster: item.thumbnailDataUrl || undefined,
                        style: { width: '100%', display: 'block', background: '#000' },
                      });
                    }
                    return h('img', { key: id, src: item.thumbnailDataUrl, style: { width: '100%', display: 'block' } });
                  }),
                  modalMediaUrl && h('img', {
                    src: modalMediaUrl,
                    style: { width: '100%', display: 'block' },
                    onError: (e: any) => { e.target.style.display = 'none'; },
                  }),
                ),
                // Engagement bar
                h('div', {
                  style: {
                    display: 'flex', justifyContent: 'space-around',
                    padding: '0.6rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)',
                    fontSize: '0.8rem', color: 'var(--ck-text-tertiary)',
                  },
                },
                  h('span', null, '\u2764\ufe0f 0'),
                  h('span', null, '\ud83d\udcac 0'),
                  h('span', null, '\ud83d\udd01 0'),
                  h('span', null, '\ud83d\udcca 0'),
                ),
              ),
              // Platform pills
              modalPlatforms.length > 0 && h('div', {
                style: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.35rem', marginTop: '0.65rem' },
              },
                ...modalPlatforms.map((pl: string) => h('span', {
                  key: pl,
                  style: {
                    background: 'rgba(127,90,240,0.12)', border: '1px solid rgba(127,90,240,0.25)',
                    borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: '0.7rem',
                    color: 'var(--ck-text-secondary)',
                  },
                }, pl)),
              ),
            ),
          ),

          // Footer
          h('div', { style: s.modalFooter },
            // Left — date
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
              h('span', { style: { fontSize: '0.8rem', color: 'var(--ck-text-tertiary)' } }, '📅'),
              h('input', {
                style: { ...s.input, width: '220px' },
                type: 'datetime-local',
                value: modalDate,
                onChange: (e: any) => setModalDate(e.target.value),
              }),
            ),
            // Right — buttons
            h('div', { style: { display: 'flex', gap: '0.5rem' } },
              h('button', {
                style: { ...s.btnGhost, opacity: modalSaving ? 0.6 : 1 },
                onClick: () => void modalSaveDraft(),
                disabled: modalSaving || !modalContent.trim(),
              }, modalSaving ? 'Saving…' : modalEditingId ? 'Save changes' : 'Save as draft'),
              connectedDrivers.length > 0 && modalPlatforms.length > 0 && h('button', {
                style: { ...s.btnPrimary, opacity: modalPublishing ? 0.6 : 1 },
                onClick: () => void modalPublish(),
                disabled: modalPublishing || !modalContent.trim(),
              }, modalPublishing ? 'Publishing…' : (modalDate ? '⏱ Schedule' : '📤 Publish')),
            ),
          ),
          // Error / success
          (modalError || modalSuccess) && h('div', {
            style: {
              padding: '0.5rem 1.25rem', fontSize: '0.8rem',
              color: modalError ? 'rgba(248,113,113,0.95)' : 'rgba(74,222,128,0.9)',
            },
          }, modalError || modalSuccess),
        ),
      ));
    }

    /* =================================================================
     * DATE RANGE LABEL
     * ================================================================= */
    const dateRangeLabel = useMemo(() => {
      if (view === 'week') {
        const end = addDays(anchor, 6);
        return `${fmt(anchor)} – ${fmt(end)}`;
      }
      return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    }, [view, anchor]);

    /* =================================================================
     * RENDER
     * ================================================================= */
    return h('div', { style: s.container },
      // Top bar
      h('div', { style: s.topBar },
        h('div', { style: s.navGroup },
          h('button', { style: s.navBtn, onClick: goPrev }, '‹'),
          h('span', { style: s.dateLabel }, dateRangeLabel),
          h('button', { style: s.navBtn, onClick: goNext }, '›'),
          h('button', { style: s.navBtn, onClick: goToday }, 'Today'),
        ),
        h('div', { style: s.navGroup },
          h('button', { style: view === 'week' ? s.navBtnActive : s.navBtn, onClick: () => { setView('week'); setAnchor(startOfWeek(today)); } }, 'Week'),
          h('button', { style: view === 'month' ? s.navBtnActive : s.navBtn, onClick: () => { setView('month'); setAnchor(new Date(today.getFullYear(), today.getMonth(), 1)); } }, 'Month'),
          h('button', { style: s.btnPrimary, onClick: () => openCreateModal() }, '+ New Post'),
        ),
      ),

      loading
        ? h('div', { style: { textAlign: 'center', padding: '3rem', color: 'var(--ck-text-tertiary)' } }, 'Loading calendar…')
        // Render helpers (not nested React components) to prevent remount/focus loss
        : view === 'week' ? WeekView() : MonthView(),

      // Posts list (below the calendar). Filterable by status; calendar above
      // only shows scheduled posts with a date.
      !loading && h('div', { style: { ...s.card, marginTop: '1.5rem' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' } },
          h('div', { style: { fontWeight: 600, color: 'var(--ck-text-primary)' } }, `Posts (${posts.length})`),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' as const } },
            ...(['all', 'draft', 'scheduled', 'published', 'failed'] as const).map((s2) =>
              h('button', {
                key: s2,
                type: 'button',
                onClick: () => setListFilter(s2),
                style: {
                  ...s.btnGhost,
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.7rem',
                  background: listFilter === s2 ? 'rgba(99,179,237,0.12)' : undefined,
                  borderColor: listFilter === s2 ? 'rgba(99,179,237,0.35)' : undefined,
                },
              }, s2)
            ),
            h('button', {
              type: 'button',
              onClick: () => void loadPosts(),
              title: 'Refresh',
              style: { ...s.btnGhost, padding: '0.2rem 0.5rem', fontSize: '0.7rem' },
            }, '↻'),
          ),
        ),
        (() => {
          const filtered = listFilter === 'all'
            ? posts
            : posts.filter((p) => p.status === listFilter);
          if (filtered.length === 0) {
            return h('div', { style: { textAlign: 'center' as const, padding: '1.5rem', color: 'var(--ck-text-tertiary)', fontSize: '0.85rem' } },
              listFilter === 'all' ? 'No posts yet.' : `No ${listFilter} posts.`,
            );
          }
          return h('div', { style: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' } },
            ...filtered.map((p) =>
              h('div', {
                key: p.id,
                onClick: () => openCreateModal(undefined, p),
                style: {
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--ck-border-subtle)',
                  borderRadius: '8px',
                  padding: '0.65rem 0.85rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                },
                onMouseEnter: (e: any) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; },
                onMouseLeave: (e: any) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; },
              },
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: '0.4rem' } },
                    h('div', { style: s.statusDot(p.status) }),
                    h('span', { style: { fontSize: '0.75rem', fontWeight: 600, color: 'var(--ck-text-secondary)', textTransform: 'capitalize' as const } }, p.status),
                    h('span', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)' } }, new Date(p.createdAt).toLocaleString()),
                  ),
                  p.scheduledAt && h('span', { style: { fontSize: '0.7rem', color: 'var(--ck-text-tertiary)' } },
                    `⏱ ${new Date(p.scheduledAt).toLocaleString()}`),
                ),
                h('div', {
                  style: {
                    fontSize: '0.85rem',
                    color: 'var(--ck-text-primary)',
                    whiteSpace: 'pre-wrap' as const,
                    maxHeight: '4.5rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.4,
                  },
                }, p.content),
                p.platforms?.length > 0 && h('div', { style: { display: 'flex', gap: '0.3rem', marginTop: '0.4rem', flexWrap: 'wrap' as const } },
                  ...p.platforms.map((pl: string) => {
                    const drv = drivers.find((d) => d.platform === pl);
                    return h('span', {
                      key: pl,
                      style: {
                        background: 'rgba(127,90,240,0.12)',
                        border: '1px solid rgba(127,90,240,0.25)',
                        borderRadius: '999px',
                        padding: '0.1rem 0.45rem',
                        fontSize: '0.7rem',
                        color: 'var(--ck-text-secondary)',
                      },
                    }, drv ? `${drv.icon} ${pl}` : pl);
                  }),
                ),
              )
            ),
          );
        })(),
      ),

      CreateModal(),
    );
  }

  (window as any).KitchenPlugin.registerTab('marketing', 'content-calendar', ContentCalendar);
})();
