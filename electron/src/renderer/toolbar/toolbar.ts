/**
 * Lógica de la barra de aplicación de GO Admin Desktop.
 *
 * Es un script clásico (sin import/export): tsc lo compila a
 * dist/renderer/toolbar/toolbar.js y lo carga index.html con CSP
 * `script-src 'self'`. Todo va dentro de una IIFE para no ensuciar el ámbito
 * global del programa TypeScript. Habla con main solo a través de
 * `window.goAdminToolbar` (preload/toolbar.ts).
 */
(() => {
  interface NavState {
    canGoBack: boolean;
    canGoForward: boolean;
    loading: boolean;
    title: string;
    offline: boolean;
  }

  interface UpdateState {
    status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'none' | 'error';
    version?: string;
    percent?: number;
    message?: string;
  }

  interface ThemeColors {
    dark: boolean;
    background: string;
    bar: string;
    symbol: string;
  }

  interface InitState {
    nav: NavState;
    online: boolean;
    update: UpdateState;
    theme: ThemeColors;
    version: string;
    platform: string;
  }

  interface ToolbarBridge {
    init: () => Promise<InitState | null>;
    navigate: (action: 'back' | 'forward' | 'reload' | 'home') => Promise<boolean | null>;
    getNavState: () => Promise<NavState | null>;
    onNavState: (cb: (state: NavState) => void) => () => void;
    openMenu: (x?: number, y?: number) => Promise<boolean | null>;
    checkConnectivity: () => Promise<boolean | null>;
    onConnectivity: (cb: (online: boolean) => void) => () => void;
    onUpdateState: (cb: (state: UpdateState) => void) => () => void;
    installUpdate: () => Promise<boolean>;
    onTheme: (cb: (theme: ThemeColors) => void) => () => void;
  }

  const bridge = (window as unknown as { goAdminToolbar?: ToolbarBridge }).goAdminToolbar;
  if (!bridge) {
    console.error('[toolbar] window.goAdminToolbar no está disponible: ¿falta el preload?');
    return;
  }

  const $ = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`[toolbar] Falta #${id}`);
    return el as T;
  };

  const btnBack = $<HTMLButtonElement>('btn-back');
  const btnForward = $<HTMLButtonElement>('btn-forward');
  const btnReload = $<HTMLButtonElement>('btn-reload');
  const btnHome = $<HTMLButtonElement>('btn-home');
  const btnMenu = $<HTMLButtonElement>('btn-menu');
  const title = $<HTMLDivElement>('title');
  const conn = $<HTMLButtonElement>('conn');
  const connText = $<HTMLSpanElement>('conn-text');
  const update = $<HTMLDivElement>('update');
  const updateText = $<HTMLSpanElement>('update-text');
  const updateInstall = $<HTMLButtonElement>('update-install');
  const progress = $<HTMLDivElement>('progress');

  // ── Tema ──
  function applyTheme(theme: ThemeColors): void {
    document.documentElement.dataset.theme = theme.dark ? 'dark' : 'light';
  }

  // ── Navegación ──
  function renderNav(nav: NavState): void {
    btnBack.disabled = !nav.canGoBack;
    btnForward.disabled = !nav.canGoForward;
    progress.hidden = !nav.loading;
    btnReload.classList.toggle('spinning', nav.loading);
    btnReload.title = nav.loading ? 'Cargando…' : 'Recargar (F5)';
    title.textContent = nav.title || '';
    title.title = nav.title || '';
  }

  btnBack.addEventListener('click', () => void bridge.navigate('back'));
  btnForward.addEventListener('click', () => void bridge.navigate('forward'));
  btnReload.addEventListener('click', () => void bridge.navigate('reload'));
  btnHome.addEventListener('click', () => void bridge.navigate('home'));
  btnMenu.addEventListener('click', () => {
    const r = btnMenu.getBoundingClientRect();
    void bridge.openMenu(Math.round(r.left), Math.round(r.bottom));
  });

  // ── Conectividad ──
  let online = true;
  let checking = false;

  function renderConn(): void {
    conn.classList.toggle('online', online && !checking);
    conn.classList.toggle('offline', !online && !checking);
    conn.classList.toggle('checking', checking);
    connText.textContent = checking ? 'Comprobando…' : online ? 'En línea' : 'Sin conexión';
    conn.title = online
      ? 'Conectado con el servidor. Clic para comprobar ahora.'
      : 'Sin conexión con el servidor: se reintenta cada 15 s. Clic para comprobar ahora.';
  }

  conn.addEventListener('click', async () => {
    if (checking) return;
    checking = true;
    renderConn();
    try {
      const result = await bridge.checkConnectivity();
      if (typeof result === 'boolean') online = result;
    } finally {
      // Mantener «Comprobando…» un instante para que el clic tenga respuesta visible.
      setTimeout(() => {
        checking = false;
        renderConn();
      }, 400);
    }
  });

  // ── Actualizaciones ──
  function renderUpdate(state: UpdateState): void {
    update.classList.remove('ready');
    updateInstall.hidden = true;
    switch (state.status) {
      case 'available':
        update.hidden = false;
        updateText.textContent = `Descargando versión ${state.version ?? ''}…`;
        break;
      case 'downloading':
        update.hidden = false;
        updateText.textContent = `Descargando actualización ${state.percent ?? 0} %`;
        break;
      case 'downloaded':
        update.hidden = false;
        update.classList.add('ready');
        updateText.textContent = `Versión ${state.version ?? ''} lista`;
        updateInstall.hidden = false;
        break;
      default:
        // idle / checking / none / error: no molestar. El menú «Ayuda» informa.
        update.hidden = true;
        updateText.textContent = '';
    }
  }

  updateInstall.addEventListener('click', () => {
    updateInstall.disabled = true;
    updateInstall.textContent = 'Reiniciando…';
    void bridge.installUpdate();
  });

  // ── Suscripciones ──
  bridge.onNavState(renderNav);
  bridge.onConnectivity((value) => {
    online = value;
    renderConn();
  });
  bridge.onUpdateState(renderUpdate);
  bridge.onTheme(applyTheme);

  // ── Estado inicial ──
  bridge
    .init()
    .then((state) => {
      if (!state) return;
      applyTheme(state.theme);
      renderNav(state.nav);
      online = state.online;
      renderConn();
      renderUpdate(state.update);
      btnMenu.title = `Menú · GO Admin Desktop ${state.version}`;
    })
    .catch((err) => console.error('[toolbar] init falló:', err));

  renderConn();
})();
