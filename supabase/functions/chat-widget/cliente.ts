/**
 * Cliente del widget de chat: el script que se pega en cualquier página.
 *
 * La Edge Function lo sirve como texto con `iniciarWidgetGoChat.toString()`,
 * así que esta función tiene que ser AUTOCONTENIDA: nada de imports ni de
 * referencias a variables de fuera. Sin dependencias, sin frameworks.
 *
 * Aislamiento: todo se pinta dentro de un Shadow DOM con `:host { all: initial }`,
 * así que el CSS de la página no entra y el del widget no sale. Lo único que se
 * toca de la página es el `overflow` del documento mientras el chat ocupa la
 * pantalla completa en un celular, y se restaura al cerrar.
 *
 * Formas de cargarlo (todas funcionan pegadas en cualquier página):
 *   1. `<script>goChat('init','pk_…')</script>` después del `<script src>` (código antiguo del ERP).
 *   2. Cola previa: `goChat.q` o `GOChatWidget.q.push(['init','pk_…'])` (sitios GO Admin).
 *   3. `<script src=".../chat-widget" data-key="pk_…" async></script>`.
 * Comandos: init, open, close, toggle, destroy.
 *
 * Seguridad: el texto se pinta SIEMPRE con nodos de texto (nunca innerHTML con
 * datos), los enlaces solo si son http(s) y con rel="noopener noreferrer".
 */
export function iniciarWidgetGoChat(ventana: Window, api: string): void {
  type Dic = Record<string, unknown>;
  interface Campo { pedir: boolean; obligatorio: boolean }
  interface Producto { id: string; nombre: string; precio: number | null; precioAntes: number | null; imagen: string | null }
  interface Mensaje {
    id: string;
    autor: 'visitante' | 'agente' | 'ia' | 'negocio';
    tipo: string;
    texto: string;
    url: string | null;
    nombreArchivo: string | null;
    creado: string;
    idCliente: string | null;
    productos: Producto[];
    pedido: { etiqueta: string; url: string } | null;
    estado?: 'enviando' | 'error';
    error?: string;
  }
  interface Config {
    titulo: string;
    bienvenida: string;
    avatar: string | null;
    posicion: { lado: string; vertical: string; x: number; y: number };
    estilo: {
      colorPrincipal: string; colorIcono: string; icono: string; iconoRelleno: boolean; iconoUrl: string | null;
      tamano: number; radio: number; borde: number; colorBorde: string; sombra: string;
    };
    vistaInicial: string;
    acciones: { etiqueta: string; accion: string; url: string | null }[];
    fueraDeHorario: { mensaje: string; pedirDatos: boolean };
    campos: { nombre: Campo; correo: Campo; telefono: Campo; empresa: Campo };
    enLinea: boolean | null;
    ia: boolean;
    moneda: string | null;
    zonaHoraria: string;
    negocio: string;
  }

  const w = ventana as unknown as Dic & Window;
  const d = ventana.document;
  const VERSION = 2;

  // ------------------------------------------------------------------ cola --
  const pendientes: unknown[][] = [];
  const tomarCola = (c: unknown) => {
    const q = c && (c as Dic).q;
    if (q && typeof (q as ArrayLike<unknown>).length === 'number') {
      for (let i = 0; i < (q as ArrayLike<unknown>).length; i++) {
        pendientes.push(Array.prototype.slice.call((q as ArrayLike<ArrayLike<unknown>>)[i]));
      }
    }
  };
  const previo = w.__goChat as { version?: number; ejecutar?: (a: unknown[]) => void } | undefined;
  if (previo && previo.version === VERSION && previo.ejecutar) {
    // Script cargado dos veces (navegación de una SPA): se reaprovecha la instancia.
    return;
  }
  const alias = typeof w.GOChatWidget === 'string' ? (w.GOChatWidget as string) : null;
  tomarCola(w.goChat);
  if (alias && alias !== 'goChat') tomarCola(w[alias]);
  if (!alias) tomarCola(w.GOChatWidget);
  const etiquetas = d.querySelectorAll('script[data-key],script[data-public-key]');
  for (let i = 0; i < etiquetas.length; i++) {
    const s = etiquetas[i] as HTMLScriptElement;
    if ((s.src || '').indexOf('/chat-widget') === -1) continue;
    const k = s.getAttribute('data-key') || s.getAttribute('data-public-key');
    if (k) pendientes.push(['init', k]);
  }

  const comando = function (...args: unknown[]) { ejecutar(args); };
  w.goChat = comando;
  if (alias && alias !== 'goChat') w[alias] = comando;
  w.GOChatWidget = {
    q: { push: (a: ArrayLike<unknown>) => ejecutar(Array.prototype.slice.call(a)) },
    open: () => ejecutar(['open']),
    close: () => ejecutar(['close']),
    toggle: () => ejecutar(['toggle']),
    destroy: () => ejecutar(['destroy']),
  };
  w.__goChat = { version: VERSION, ejecutar: (a: unknown[]) => ejecutar(a) };

  // ---------------------------------------------------------------- estado --
  let clave: string | null = null;
  let cfg: Config | null = null;
  let token: string | null = null;
  let hayConversacion = false;
  let identificado = false;
  let abierto = false;
  let escribiendo = false;
  let noLeidos = 0;
  let ultimo: string | null = null;
  let ultimaActividad = 0;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let sondeando = false;
  let esperaIa: ReturnType<typeof setTimeout> | null = null;
  let host: HTMLElement | null = null;
  let raiz: ShadowRoot | null = null;
  const mensajes: Mensaje[] = [];
  const nodos: Record<string, HTMLElement> = {};
  let desbloquear: (() => void) | null = null;

  const guardado = (): Dic => {
    try { return JSON.parse(w.localStorage.getItem('gochat:v2:' + clave) || '{}') || {}; } catch { return {}; }
  };
  const guardar = (datos: Dic) => {
    try { w.localStorage.setItem('gochat:v2:' + clave, JSON.stringify(Object.assign(guardado(), datos))); } catch { /* sin almacenamiento */ }
  };

  function llamar(accion: string, datos: Dic): Promise<{ status: number; cuerpo: Dic }> {
    // text/plain evita la petición previa de CORS (una ida y vuelta menos).
    return fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(Object.assign({ accion, clave }, datos)),
      credentials: 'omit',
      mode: 'cors',
    }).then((r) => r.json().catch(() => ({})).then((cuerpo: Dic) => ({ status: r.status, cuerpo })),
      () => ({ status: 0, cuerpo: {} }));
  }

  // ---------------------------------------------------------------- utilidades DOM --
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase?: string, texto?: string): HTMLElementTagNameMap[K] {
    const n = d.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }
  const SVG = 'http://www.w3.org/2000/svg';
  function icono(caminos: string[], relleno = false, tam = 24): SVGSVGElement {
    const s = d.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', String(tam));
    s.setAttribute('height', String(tam));
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.setAttribute('fill', relleno ? 'currentColor' : 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    for (const c of caminos) {
      const p = d.createElementNS(SVG, 'path');
      p.setAttribute('d', c);
      s.appendChild(p);
    }
    return s;
  }
  const ICONOS: Record<string, string[]> = {
    chat: ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
    message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    support: ['M3 18v-6a9 9 0 0 1 18 0v6', 'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z'],
    // Mismo dibujo que la vista previa del ERP para «Estilo WhatsApp».
    whatsapp: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
    cerrar: ['M18 6 6 18', 'M6 6l12 12'],
    enviar: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
    clip: ['M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  };

  function contraste(hex: string): string {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const [r, g, b] = [0, 2, 4].map((i) => {
      const v = parseInt(h.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return l > 0.45 ? '#111827' : '#FFFFFF';
  }

  const esMovil = () => (w.matchMedia ? w.matchMedia('(max-width: 520px)').matches : ventana.innerWidth <= 520);

  function hora(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: cfg ? cfg.zonaHoraria : undefined }).format(new Date(iso));
    } catch { return ''; }
  }
  function precio(n: number | null): string {
    if (n === null) return '';
    try {
      if (cfg && cfg.moneda) return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cfg.moneda, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
    } catch { /* moneda desconocida */ }
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n);
  }
  const aleatorio = () => {
    const a = new Uint8Array(12);
    (ventana.crypto || (w.msCrypto as Crypto)).getRandomValues(a);
    return Array.prototype.map.call(a, (b: number) => ('0' + b.toString(16)).slice(-2)).join('');
  };

  /**
   * Texto → nodos: saltos de línea, **negrita**, enlaces http(s) y las imágenes
   * `[IMG:https://…]` que escribe `ai-auto-response`. Sin innerHTML.
   */
  function pintarTexto(destino: HTMLElement, texto: string) {
    const trozos = texto.split(/(\*\*[^*\n]{1,200}\*\*|\[IMG:[^\]\s]{1,1000}\])/g);
    for (const t of trozos) {
      const img = /^\[IMG:(https:\/\/[^\]\s]+)\]$/.exec(t);
      if (img) {
        const i = el('img');
        i.src = img[1];
        i.alt = 'Imagen del producto';
        i.loading = 'lazy';
        destino.appendChild(i);
        continue;
      }
      if (/^\[IMG:/.test(t)) continue;
      if (/^\*\*[^*\n]+\*\*$/.test(t)) {
        destino.appendChild(el('strong', undefined, t.slice(2, -2)));
        continue;
      }
      const re = /\bhttps?:\/\/[^\s<>"']+/g;
      let desde = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        let url = m[0];
        const sobra = /[.,;:!?)\]]+$/.exec(url);
        if (sobra) url = url.slice(0, -sobra[0].length);
        destino.appendChild(d.createTextNode(t.slice(desde, m.index)));
        const a = el('a', undefined, url);
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer nofollow';
        destino.appendChild(a);
        desde = m.index + url.length;
        re.lastIndex = desde;
      }
      destino.appendChild(d.createTextNode(t.slice(desde)));
    }
  }

  // ---------------------------------------------------------------- estilos --
  function css(c: Config): string {
    const e = c.estilo;
    const p = c.posicion;
    const sombra = { none: 'none', light: '0 2px 8px rgba(0,0,0,.15)', medium: '0 4px 16px rgba(0,0,0,.2)', strong: '0 8px 32px rgba(0,0,0,.3)' } as Record<string, string>;
    const lado = p.lado === 'left' ? 'left' : 'right';
    const vert = p.vertical === 'top' ? 'top' : 'bottom';
    const texto = contraste(e.colorPrincipal);
    return `
:host{all:initial}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.gc{--c:${e.colorPrincipal};--ct:${texto};font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:15px;line-height:1.45;color:#111827;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
/* :where() deja la especificidad en 0: los colores propios de cada botón ganan. */
:where(.gc) button,:where(.gc) input,:where(.gc) textarea{font:inherit;color:inherit;margin:0}
:where(.gc) button{cursor:pointer}
.gc :focus-visible{outline:3px solid var(--c);outline-offset:2px}
.gc-oculto{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.gc-lanzador{position:fixed;z-index:2147483000;${lado}:calc(${p.x}px + env(safe-area-inset-${lado},0px));${vert}:calc(${p.y}px + env(safe-area-inset-${vert},0px));width:${e.tamano}px;height:${e.tamano}px;border-radius:${e.radio}px;border:${e.borde}px solid ${e.colorBorde};background:var(--c);color:${e.colorIcono};box-shadow:${sombra[e.sombra] || sombra.medium};display:flex;align-items:center;justify-content:center;padding:0;transition:transform .15s ease}
.gc-lanzador:hover{transform:scale(1.05)}
.gc-lanzador img{width:60%;height:60%;object-fit:contain}
.gc-lanzador svg{width:45%;height:45%}
.gc-insignia{position:absolute;top:-4px;${lado === 'right' ? 'left' : 'right'}:-4px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#DC2626;color:#fff;font-size:12px;font-weight:700;line-height:20px;text-align:center;box-shadow:0 0 0 2px #fff}
.gc-panel{position:fixed;z-index:2147483001;${lado}:calc(${p.x}px + env(safe-area-inset-${lado},0px));${vert}:calc(${p.y + e.tamano + 14}px + env(safe-area-inset-${vert},0px));width:380px;max-width:calc(100vw - ${p.x * 2}px);height:min(620px,calc(100vh - ${p.y + e.tamano + 40}px));min-height:320px;display:flex;flex-direction:column;background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.22);overflow:hidden;animation:gc-entra .18s ease-out}
@keyframes gc-entra{from{opacity:0;transform:translateY(${vert === 'bottom' ? '8px' : '-8px'})}to{opacity:1;transform:none}}
.gc-cab{display:flex;align-items:center;gap:10px;padding:14px 12px 14px 16px;background:var(--c);color:var(--ct);flex:none}
.gc-avatar{width:38px;height:38px;border-radius:50%;flex:none;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden}
.gc-avatar img{width:100%;height:100%;object-fit:cover;background:#fff}
.gc-cab-txt{flex:1;min-width:0}
.gc-titulo{margin:0;font-size:16px;font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-estado{margin:2px 0 0;font-size:12.5px;opacity:.9;display:flex;align-items:center;gap:6px}
.gc-punto{width:8px;height:8px;border-radius:50%;background:#22C55E;box-shadow:0 0 0 2px rgba(255,255,255,.5)}
.gc-punto.gc-off{background:#9CA3AF}
.gc-cerrar{width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:inherit;display:flex;align-items:center;justify-content:center;flex:none}
.gc-cerrar:hover{background:rgba(255,255,255,.18)}
.gc-aviso{margin:0;padding:10px 16px;background:#FEF3C7;color:#78350F;font-size:13.5px;flex:none}
.gc-cuerpo{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px 12px 8px;background:#F9FAFB}
.gc-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.gc-msg{display:flex;flex-direction:column;max-width:85%;align-self:flex-start}
.gc-msg.gc-visitante{align-self:flex-end;align-items:flex-end}
.gc-burbuja{padding:9px 13px;border-radius:16px 16px 16px 4px;background:#fff;border:1px solid #E5E7EB;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.gc-visitante .gc-burbuja{background:var(--c);color:var(--ct);border-color:transparent;border-radius:16px 16px 4px 16px}
.gc-burbuja a{color:inherit;text-decoration:underline}
.gc-burbuja img{display:block;max-width:100%;max-height:260px;border-radius:10px}
.gc-burbuja audio,.gc-burbuja video{max-width:100%}
.gc-pie-msg{font-size:11.5px;color:#6B7280;margin-top:3px;padding:0 4px}
.gc-err{color:#B91C1C}
.gc-reintentar{border:0;background:none;color:#B91C1C;text-decoration:underline;padding:0;font-size:11.5px}
.gc-productos{display:flex;gap:8px;overflow-x:auto;padding:6px 2px 2px;max-width:100%;scroll-snap-type:x mandatory}
.gc-prod{flex:none;width:136px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;scroll-snap-align:start}
.gc-prod img{display:block;width:100%;height:100px;object-fit:cover;background:#F3F4F6}
.gc-prod p{margin:0;padding:6px 8px 0;font-size:13px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gc-prod strong{display:block;padding:2px 8px 8px;font-size:13px}
.gc-prod s{color:#6B7280;font-weight:400;margin-left:4px;font-size:12px}
.gc-boton{display:inline-flex;align-items:center;justify-content:center;min-height:40px;margin-top:6px;padding:8px 16px;border-radius:10px;background:var(--c);color:var(--ct);text-decoration:none;font-weight:600;border:0}
.gc-escribiendo{display:flex;width:max-content;gap:4px;margin-top:8px;padding:12px 14px;background:#fff;border:1px solid #E5E7EB;border-radius:16px 16px 16px 4px}
.gc-escribiendo span{width:7px;height:7px;border-radius:50%;background:#9CA3AF;animation:gc-salta 1.2s infinite ease-in-out}
.gc-escribiendo span:nth-child(2){animation-delay:.15s}.gc-escribiendo span:nth-child(3){animation-delay:.3s}
@keyframes gc-salta{0%,60%,100%{transform:none;opacity:.5}30%{transform:translateY(-4px);opacity:1}}
.gc-acciones{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 0;background:#F9FAFB;flex:none}
.gc-acciones.gc-faq{flex-direction:column}
.gc-chip{border:1px solid var(--c);background:#fff;color:#111827;border-radius:999px;padding:7px 14px;font-size:13.5px;min-height:36px;text-align:left}
.gc-faq .gc-chip{border-radius:10px}
.gc-chip:hover{background:#F3F4F6}
.gc-pie{display:flex;align-items:flex-end;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid #E5E7EB;background:#fff;flex:none}
.gc-pie textarea{flex:1;min-height:44px;max-height:132px;resize:none;border:1px solid #D1D5DB;border-radius:12px;padding:10px 12px;font-size:16px;line-height:1.4;background:#fff;outline:none}
.gc-pie textarea:focus{border-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 25%,transparent)}
.gc .gc-pie textarea:focus-visible{outline:none}
.gc-enviar{width:44px;height:44px;flex:none;border:0;border-radius:12px;background:var(--c);color:var(--ct);display:flex;align-items:center;justify-content:center}
.gc-enviar:disabled{opacity:.5;cursor:default}
.gc-datos{display:flex;flex-direction:column;gap:12px;padding:4px 4px 12px}
.gc-datos p{margin:0;color:#374151}
.gc-datos label{display:flex;flex-direction:column;gap:4px;font-size:13.5px;font-weight:600;color:#374151}
.gc-datos input{border:1px solid #D1D5DB;border-radius:10px;padding:10px 12px;font-size:16px;font-weight:400;background:#fff;min-height:44px}
.gc-datos input[aria-invalid=true]{border-color:#DC2626}
.gc-datos .gc-boton{width:100%;margin-top:4px}
.gc-omitir{border:0;background:none;color:#4B5563;text-decoration:underline;padding:6px;align-self:center}
.gc-alerta{margin:0;padding:8px 14px;background:#FEE2E2;color:#991B1B;font-size:13px;flex:none}
@media (max-width:520px){
  .gc-panel{inset:0;top:var(--gc-arriba,0px);left:0;right:0;bottom:auto;width:100%;max-width:none;height:var(--gc-alto,100vh);min-height:0;border-radius:0;animation:none}
  .gc-cab{padding-top:calc(12px + env(safe-area-inset-top,0px));padding-left:calc(16px + env(safe-area-inset-left,0px));padding-right:calc(12px + env(safe-area-inset-right,0px))}
  .gc-pie{padding-left:calc(12px + env(safe-area-inset-left,0px));padding-right:calc(12px + env(safe-area-inset-right,0px))}
  .gc-abierto .gc-lanzador{display:none}
}
@media (prefers-reduced-motion:reduce){.gc *{animation:none!important;transition:none!important}}
`;
  }

  // ---------------------------------------------------------------- montaje --
  function montar(c: Config) {
    host = d.createElement('div');
    host.setAttribute('data-gochat-widget', '');
    host.style.cssText = 'all:initial;position:static;';
    if (!host.attachShadow) { console.warn('[GO Chat] Este navegador no admite Shadow DOM.'); host = null; return; }
    raiz = host.attachShadow({ mode: 'open' });
    const estilo = el('style');
    estilo.textContent = css(c);
    raiz.appendChild(estilo);

    const cont = el('div', 'gc');
    nodos.cont = cont;

    // Lanzador
    const lanz = el('button', 'gc-lanzador');
    lanz.type = 'button';
    lanz.setAttribute('aria-label', 'Abrir chat: ' + c.titulo);
    lanz.setAttribute('aria-expanded', 'false');
    lanz.setAttribute('aria-controls', 'gc-panel');
    if (c.estilo.icono === 'custom' && c.estilo.iconoUrl) {
      const img = el('img');
      img.src = c.estilo.iconoUrl;
      img.alt = '';
      lanz.appendChild(img);
    } else {
      lanz.appendChild(icono(ICONOS[c.estilo.icono] || ICONOS.chat, c.estilo.iconoRelleno && c.estilo.icono !== 'support'));
    }
    const insignia = el('span', 'gc-insignia');
    insignia.hidden = true;
    insignia.setAttribute('aria-hidden', 'true');
    lanz.appendChild(insignia);
    lanz.addEventListener('click', () => (abierto ? cerrar() : abrir()));
    nodos.lanzador = lanz;
    nodos.insignia = insignia;

    // Panel
    const panel = el('div', 'gc-panel');
    panel.id = 'gc-panel';
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'gc-titulo');
    nodos.panel = panel;

    const cab = el('div', 'gc-cab');
    const av = el('div', 'gc-avatar');
    av.setAttribute('aria-hidden', 'true');
    if (c.avatar) {
      const img = el('img');
      img.src = c.avatar;
      img.alt = '';
      img.addEventListener('error', () => { av.textContent = (c.negocio || c.titulo).charAt(0).toUpperCase(); });
      av.appendChild(img);
    } else {
      av.textContent = (c.negocio || c.titulo).charAt(0).toUpperCase();
    }
    const txt = el('div', 'gc-cab-txt');
    const h = el('h2', 'gc-titulo', c.titulo);
    h.id = 'gc-titulo';
    const est = el('p', 'gc-estado');
    const punto = el('span', 'gc-punto' + (c.enLinea === false ? ' gc-off' : ''));
    punto.setAttribute('aria-hidden', 'true');
    est.appendChild(punto);
    est.appendChild(d.createTextNode(c.enLinea === false ? 'Fuera de horario' : c.ia ? 'En línea · responde al instante' : 'En línea'));
    txt.appendChild(h);
    txt.appendChild(est);
    const x = el('button', 'gc-cerrar');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar chat');
    x.appendChild(icono(ICONOS.cerrar));
    x.addEventListener('click', () => cerrar());
    cab.appendChild(av);
    cab.appendChild(txt);
    cab.appendChild(x);
    panel.appendChild(cab);

    if (c.enLinea === false) {
      const aviso = el('p', 'gc-aviso', c.fueraDeHorario.mensaje);
      panel.appendChild(aviso);
    }

    const cuerpo = el('div', 'gc-cuerpo');
    const lista = el('ol', 'gc-lista');
    lista.setAttribute('role', 'log');
    lista.setAttribute('aria-live', 'polite');
    lista.setAttribute('aria-label', 'Mensajes de la conversación');
    cuerpo.appendChild(lista);
    const typing = el('div', 'gc-escribiendo');
    typing.hidden = true;
    typing.setAttribute('role', 'status');
    typing.appendChild(el('span'));
    typing.appendChild(el('span'));
    typing.appendChild(el('span'));
    typing.appendChild(el('span', 'gc-oculto', 'Escribiendo…'));
    cuerpo.appendChild(typing);
    panel.appendChild(cuerpo);
    nodos.cuerpo = cuerpo;
    nodos.lista = lista;
    nodos.escribiendo = typing;

    const acciones = el('div', 'gc-acciones' + (c.vistaInicial === 'faq' ? ' gc-faq' : ''));
    acciones.hidden = c.acciones.length === 0;
    for (const a of c.acciones) {
      const b = el('button', 'gc-chip', a.etiqueta);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (a.url) { ventana.open(a.url, '_blank', 'noopener,noreferrer'); return; }
        void enviar(a.accion);
      });
      acciones.appendChild(b);
    }
    panel.appendChild(acciones);
    nodos.acciones = acciones;

    const alerta = el('p', 'gc-alerta');
    alerta.setAttribute('role', 'alert');
    alerta.hidden = true;
    panel.appendChild(alerta);
    nodos.alerta = alerta;

    const pie = el('form', 'gc-pie');
    pie.noValidate = true;
    const lbl = el('label', 'gc-oculto', 'Escribe tu mensaje');
    lbl.htmlFor = 'gc-texto';
    const ta = el('textarea');
    ta.id = 'gc-texto';
    ta.rows = 1;
    ta.maxLength = 2000;
    ta.placeholder = 'Escribe tu mensaje…';
    ta.setAttribute('enterkeyhint', 'send');
    ta.setAttribute('autocomplete', 'off');
    const env = el('button', 'gc-enviar');
    env.type = 'submit';
    env.setAttribute('aria-label', 'Enviar mensaje');
    env.disabled = true;
    env.appendChild(icono(ICONOS.enviar, false, 20));
    const ajustar = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight + 2, 132) + 'px';
      env.disabled = !ta.value.trim();
    };
    ta.addEventListener('input', ajustar);
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && !esMovil()) {
        ev.preventDefault();
        if (pie.requestSubmit) pie.requestSubmit();
        else pie.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
    pie.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = ta.value;
      if (!t.trim()) return;
      ta.value = '';
      ajustar();
      void enviar(t);
      ta.focus();
    });
    pie.appendChild(lbl);
    pie.appendChild(ta);
    pie.appendChild(env);
    panel.appendChild(pie);
    nodos.pie = pie;
    nodos.texto = ta;

    panel.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); return; }
      if (ev.key === 'Tab' && panel.getAttribute('aria-modal') === 'true') atraparFoco(ev);
    });

    cont.appendChild(panel);
    cont.appendChild(lanz);
    raiz.appendChild(cont);
    (d.body || d.documentElement).appendChild(host);

    pintarBienvenida();
  }

  function atraparFoco(ev: KeyboardEvent) {
    if (!raiz || !nodos.panel) return;
    const f = Array.prototype.filter.call(
      nodos.panel.querySelectorAll('button,a[href],input,textarea,[tabindex]:not([tabindex="-1"])'),
      (n: HTMLElement) => !n.hidden && !(n as HTMLButtonElement).disabled && n.offsetParent !== null,
    ) as HTMLElement[];
    if (f.length === 0) return;
    const activo = raiz.activeElement;
    if (ev.shiftKey && (activo === f[0] || activo === nodos.panel)) { ev.preventDefault(); f[f.length - 1].focus(); }
    else if (!ev.shiftKey && activo === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
  }

  // ---------------------------------------------------------------- mensajes --
  function pintarBienvenida() {
    if (!cfg || !nodos.lista) return;
    agregar({
      id: 'bienvenida', autor: 'negocio', tipo: 'text', texto: cfg.bienvenida, url: null, nombreArchivo: null,
      creado: '', idCliente: null, productos: [], pedido: null,
    }, false);
  }

  function nodoMensaje(m: Mensaje): HTMLElement {
    const li = el('li', 'gc-msg gc-' + (m.autor === 'visitante' ? 'visitante' : 'negocio'));
    li.setAttribute('data-id', m.id);
    li.appendChild(el('span', 'gc-oculto', m.autor === 'visitante' ? 'Tú dijiste:' : (cfg ? cfg.titulo : 'Chat') + ' dijo:'));
    const b = el('div', 'gc-burbuja');
    if (m.tipo === 'image' && m.url) {
      const a = el('a');
      a.href = m.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      const img = el('img');
      img.src = m.url; img.alt = m.nombreArchivo || 'Imagen'; img.loading = 'lazy';
      a.appendChild(img);
      b.appendChild(a);
    } else if ((m.tipo === 'audio' || m.tipo === 'video') && m.url) {
      const media = el(m.tipo === 'audio' ? 'audio' : 'video');
      media.controls = true; media.src = m.url; media.preload = 'none';
      b.appendChild(media);
    } else if (m.tipo === 'file' && m.url) {
      const a = el('a', undefined, '📎 ' + (m.nombreArchivo || 'Archivo adjunto'));
      a.href = m.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      b.appendChild(a);
    } else {
      pintarTexto(b, m.texto);
    }
    li.appendChild(b);

    if (m.productos && m.productos.length) {
      const fila = el('div', 'gc-productos');
      fila.setAttribute('role', 'list');
      fila.setAttribute('aria-label', 'Productos sugeridos');
      for (const p of m.productos) {
        const t = el('div', 'gc-prod');
        t.setAttribute('role', 'listitem');
        if (p.imagen) { const im = el('img'); im.src = p.imagen; im.alt = ''; im.loading = 'lazy'; t.appendChild(im); }
        t.appendChild(el('p', undefined, p.nombre));
        const pr = el('strong', undefined, precio(p.precio));
        if (p.precioAntes && p.precio !== null && p.precioAntes > p.precio) pr.appendChild(el('s', undefined, precio(p.precioAntes)));
        t.appendChild(pr);
        fila.appendChild(t);
      }
      li.appendChild(fila);
    }
    if (m.pedido) {
      const a = el('a', 'gc-boton', m.pedido.etiqueta);
      a.href = m.pedido.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.appendChild(a);
    }
    const pie = el('div', 'gc-pie-msg');
    if (m.estado === 'enviando') pie.textContent = 'Enviando…';
    else if (m.estado === 'error') {
      pie.className = 'gc-pie-msg gc-err';
      pie.textContent = (m.error || 'No se envió.') + ' ';
      if (m.error !== 'limite') {
        const r = el('button', 'gc-reintentar', 'Reintentar');
        r.type = 'button';
        r.addEventListener('click', () => { quitar(m.id); void enviar(m.texto); });
        pie.appendChild(r);
      }
    } else if (m.creado) {
      const t = el('time', undefined, hora(m.creado));
      t.dateTime = m.creado;
      pie.appendChild(t);
    }
    if (pie.childNodes.length || pie.textContent) li.appendChild(pie);
    return li;
  }

  function quitar(id: string) {
    const i = mensajes.findIndex((m) => m.id === id);
    if (i >= 0) mensajes.splice(i, 1);
    const n = nodos.lista && nodos.lista.querySelector('[data-id="' + id.replace(/"/g, '') + '"]');
    if (n) n.remove();
  }

  function alFondo() {
    const c = nodos.cuerpo;
    if (c) c.scrollTop = c.scrollHeight;
  }

  /** Agrega o reemplaza un mensaje. Devuelve true si era nuevo. */
  function agregar(m: Mensaje, contar = true): boolean {
    // El eco del servidor de un mensaje propio reemplaza al temporal.
    if (m.idCliente) {
      const tmp = mensajes.find((x) => x.id === 'tmp-' + m.idCliente);
      if (tmp) quitar(tmp.id);
    }
    if (mensajes.some((x) => x.id === m.id)) return false;
    mensajes.push(m);
    if (m.creado && (!ultimo || m.creado > ultimo)) ultimo = m.creado;
    if (nodos.lista) {
      nodos.lista.appendChild(nodoMensaje(m));
      alFondo();
    }
    if (contar && m.autor !== 'visitante' && m.autor !== 'negocio') {
      ultimaActividad = Date.now();
      ponerEscribiendo(false);
      if (!abierto) { noLeidos++; pintarInsignia(); }
    }
    return true;
  }

  function pintarInsignia() {
    if (!nodos.insignia || !nodos.lanzador || !cfg) return;
    nodos.insignia.hidden = noLeidos === 0;
    nodos.insignia.textContent = noLeidos > 9 ? '9+' : String(noLeidos);
    nodos.lanzador.setAttribute('aria-label', 'Abrir chat: ' + cfg.titulo + (noLeidos ? ' (' + noLeidos + ' mensajes nuevos)' : ''));
  }

  function ponerEscribiendo(si: boolean) {
    escribiendo = si;
    if (nodos.escribiendo) nodos.escribiendo.hidden = !si;
    if (esperaIa) { clearTimeout(esperaIa); esperaIa = null; }
    if (si) esperaIa = setTimeout(() => ponerEscribiendo(false), 30000);
    if (si) alFondo();
  }

  function alertar(texto: string | null) {
    if (!nodos.alerta) return;
    nodos.alerta.textContent = texto || '';
    nodos.alerta.hidden = !texto;
  }

  // ---------------------------------------------------------------- formulario previo --
  function necesitaDatos(): boolean {
    if (!cfg || identificado) return false;
    const c = cfg.campos;
    const alguno = c.nombre.pedir || c.correo.pedir || c.telefono.pedir || c.empresa.pedir;
    return alguno;
  }

  function pintarFormularioDatos() {
    if (!cfg || !nodos.cuerpo || nodos.datos) return;
    const c = cfg.campos;
    const f = el('form', 'gc-datos');
    f.noValidate = true;
    f.setAttribute('aria-label', 'Tus datos');
    f.appendChild(el('p', undefined, cfg.enLinea === false && cfg.fueraDeHorario.pedirDatos
      ? 'Déjanos tus datos y te contactamos apenas estemos disponibles.'
      : 'Antes de empezar, cuéntanos quién eres.'));
    const entradas: Record<string, HTMLInputElement> = {};
    const def: [keyof Config['campos'], string, string, string][] = [
      ['nombre', 'Nombre', 'text', 'name'],
      ['correo', 'Correo electrónico', 'email', 'email'],
      ['telefono', 'Teléfono', 'tel', 'tel'],
      ['empresa', 'Empresa', 'text', 'organization'],
    ];
    let obligatorio = false;
    for (const [k, etiqueta, tipo, auto] of def) {
      if (!c[k].pedir) continue;
      const l = el('label', undefined, etiqueta + (c[k].obligatorio ? ' *' : ' (opcional)'));
      const i = el('input');
      i.type = tipo; i.name = k; i.setAttribute('autocomplete', auto); i.maxLength = k === 'correo' ? 120 : 80;
      if (tipo === 'tel') i.inputMode = 'tel';
      if (c[k].obligatorio) { i.required = true; i.setAttribute('aria-required', 'true'); obligatorio = true; }
      l.appendChild(i);
      f.appendChild(l);
      entradas[k] = i;
    }
    const b = el('button', 'gc-boton', 'Empezar a chatear');
    b.type = 'submit';
    f.appendChild(b);
    if (!obligatorio) {
      const o = el('button', 'gc-omitir', 'Prefiero no darlos');
      o.type = 'button';
      o.addEventListener('click', () => { identificado = true; guardar({ o: 1 }); quitarFormulario(); });
      f.appendChild(o);
    }
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const datos: Dic = {};
      let falta: HTMLInputElement | null = null;
      for (const k of Object.keys(entradas)) {
        const i = entradas[k];
        datos[k] = i.value;
        const mal = (i.required && !i.value.trim()) || (i.type === 'email' && i.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.value));
        i.setAttribute('aria-invalid', mal ? 'true' : 'false');
        if (mal && !falta) falta = i;
      }
      if (falta) { alertar('Revisa los campos marcados.'); (falta as HTMLInputElement).focus(); return; }
      b.disabled = true;
      void asegurarSesion().then((ok) => {
        if (!ok) { b.disabled = false; return null; }
        return llamar('identificar', Object.assign({ token }, datos)).then((r) => {
          b.disabled = false;
          if (r.status === 200) {
            identificado = true;
            guardar({ i: 1 });
            alertar(null);
            quitarFormulario();
          } else if (r.status === 422) {
            const errores = (r.cuerpo.errores as string[]) || [];
            for (const k of errores) if (entradas[k]) entradas[k].setAttribute('aria-invalid', 'true');
            alertar('Revisa los campos marcados.');
            const primero = errores.length ? entradas[errores[0]] : null;
            if (primero) primero.focus();
          } else {
            alertar('No pudimos guardar tus datos. Intenta de nuevo.');
          }
        });
      });
    });
    nodos.datos = f;
    nodos.cuerpo.appendChild(f);
    if (nodos.pie) nodos.pie.hidden = true;
    if (nodos.acciones) nodos.acciones.hidden = true;
  }

  function quitarFormulario() {
    if (nodos.datos) { nodos.datos.remove(); delete nodos.datos; }
    if (nodos.pie) nodos.pie.hidden = false;
    if (nodos.acciones && cfg) nodos.acciones.hidden = cfg.acciones.length === 0;
    if (nodos.texto && abierto) nodos.texto.focus();
  }

  // ---------------------------------------------------------------- servidor --
  let sesionEnCurso: Promise<boolean> | null = null;
  function asegurarSesion(): Promise<boolean> {
    if (token) return Promise.resolve(true);
    if (sesionEnCurso) return sesionEnCurso;
    const g = guardado();
    const ancho = ventana.innerWidth || 1024;
    sesionEnCurso = llamar('sesion', {
      token: typeof g.t === 'string' ? g.t : null,
      pagina: ventana.location.href,
      referente: d.referrer || null,
      dispositivo: ancho <= 520 ? 'mobile' : ancho <= 1024 && 'ontouchstart' in ventana ? 'tablet' : 'desktop',
    }).then((r) => {
      sesionEnCurso = null;
      if (r.status !== 200 || typeof r.cuerpo.token !== 'string') {
        if (r.status === 429) alertar('Demasiados intentos desde esta conexión. Intenta en unos minutos.');
        else alertar('No pudimos conectar el chat. Revisa tu conexión.');
        return false;
      }
      alertar(null);
      token = r.cuerpo.token as string;
      guardar({ t: token });
      identificado = identificado || r.cuerpo.identificado === true || g.i === 1 || g.o === 1;
      hayConversacion = r.cuerpo.conversacion === true;
      const lista = (r.cuerpo.mensajes as Mensaje[]) || [];
      for (const m of lista) agregar(m, false);
      if (lista.length) ultimaActividad = Date.parse(lista[lista.length - 1].creado) || 0;
      if (r.cuerpo.escribiendo === true) ponerEscribiendo(true);
      programarSondeo();
      return true;
    });
    return sesionEnCurso;
  }

  async function enviar(textoCrudo: string) {
    const texto = textoCrudo.replace(/\s+$/, '').slice(0, 2000);
    if (!texto.trim() || !cfg) return;
    const idCliente = aleatorio();
    const tmp: Mensaje = {
      id: 'tmp-' + idCliente, autor: 'visitante', tipo: 'text', texto, url: null, nombreArchivo: null,
      creado: '', idCliente: null, productos: [], pedido: null, estado: 'enviando',
    };
    agregar(tmp, false);
    const ok = await asegurarSesion();
    const r = ok ? await llamar('enviar', { token, texto, idCliente }) : { status: 0, cuerpo: {} as Dic };
    if (r.status === 200 && r.cuerpo.mensaje) {
      quitar(tmp.id);
      agregar(r.cuerpo.mensaje as Mensaje, false);
      hayConversacion = true;
      ultimaActividad = Date.now();
      if (cfg.ia) ponerEscribiendo(true);
      programarSondeo(1200);
      return;
    }
    if (r.status === 401) { token = null; guardar({ t: null }); }
    quitar(tmp.id);
    tmp.estado = 'error';
    tmp.error = r.status === 429 ? 'Estás enviando muchos mensajes. Espera un momento e inténtalo de nuevo.' : 'No se envió.';
    agregar(tmp, false);
  }

  function programarSondeo(ms?: number) {
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    if (!token || !hayConversacion || d.hidden) return;
    const quieto = Date.now() - ultimaActividad;
    let espera = ms || 0;
    if (!espera) {
      if (abierto) espera = escribiendo || quieto < 60000 ? 2000 : quieto < 300000 ? 5000 : 15000;
      else espera = quieto < 600000 ? 15000 : 0; // cerrado e inactivo: no se sondea
    }
    if (espera > 0) temporizador = setTimeout(sondear, espera);
  }

  function sondear() {
    if (sondeando || !token) return;
    sondeando = true;
    void llamar('sondear', { token, despues: ultimo }).then((r) => {
      sondeando = false;
      if (r.status === 401) { token = null; hayConversacion = false; guardar({ t: null }); return; }
      if (r.status === 200) {
        for (const m of (r.cuerpo.mensajes as Mensaje[]) || []) agregar(m, true);
        if (r.cuerpo.escribiendo === true && !escribiendo) ponerEscribiendo(true);
      }
      programarSondeo();
    });
  }

  // ---------------------------------------------------------------- abrir / cerrar --
  function ajustarAlTeclado() {
    const vv = ventana.visualViewport;
    if (!nodos.panel) return;
    if (vv && esMovil()) {
      nodos.panel.style.setProperty('--gc-alto', vv.height + 'px');
      nodos.panel.style.setProperty('--gc-arriba', vv.offsetTop + 'px');
    } else {
      nodos.panel.style.removeProperty('--gc-alto');
      nodos.panel.style.removeProperty('--gc-arriba');
    }
    nodos.panel.setAttribute('aria-modal', esMovil() ? 'true' : 'false');
  }

  function bloquearScroll() {
    if (!esMovil() || desbloquear) return;
    const html = d.documentElement;
    const body = d.body;
    const antes = [html.style.overflow, body ? body.style.overflow : ''];
    html.style.overflow = 'hidden';
    if (body) body.style.overflow = 'hidden';
    desbloquear = () => {
      html.style.overflow = antes[0];
      if (body) body.style.overflow = antes[1];
      desbloquear = null;
    };
  }

  function abrir() {
    if (!cfg || !nodos.panel || abierto) return;
    abierto = true;
    noLeidos = 0;
    pintarInsignia();
    nodos.panel.hidden = false;
    if (nodos.cont) nodos.cont.classList.add('gc-abierto');
    if (nodos.lanzador) nodos.lanzador.setAttribute('aria-expanded', 'true');
    ajustarAlTeclado();
    bloquearScroll();
    if (necesitaDatos() && (cfg.vistaInicial === 'form' || hayAlgunObligatorio() || (cfg.enLinea === false && cfg.fueraDeHorario.pedirDatos) || !hayConversacion)) {
      pintarFormularioDatos();
    }
    alFondo();
    // En el celular no se abre el teclado solo: el foco va al diálogo.
    if (esMovil()) nodos.panel.focus();
    else {
      const primero = nodos.datos ? (nodos.datos.querySelector('input') as HTMLElement | null) : nodos.texto;
      (primero || nodos.panel).focus();
    }
    void asegurarSesion().then(() => programarSondeo(token && hayConversacion ? 300 : undefined));
  }

  function hayAlgunObligatorio(): boolean {
    if (!cfg) return false;
    const c = cfg.campos;
    return c.nombre.obligatorio || c.correo.obligatorio || c.telefono.obligatorio || c.empresa.obligatorio;
  }

  function cerrar() {
    if (!abierto || !nodos.panel) return;
    abierto = false;
    nodos.panel.hidden = true;
    if (nodos.cont) nodos.cont.classList.remove('gc-abierto');
    if (nodos.lanzador) { nodos.lanzador.setAttribute('aria-expanded', 'false'); nodos.lanzador.focus(); }
    if (desbloquear) desbloquear();
    programarSondeo();
  }

  function destruir() {
    cerrar();
    if (temporizador) clearTimeout(temporizador);
    if (host) host.remove();
    host = null; raiz = null; cfg = null; token = null; clave = null;
    mensajes.length = 0;
    for (const k of Object.keys(nodos)) delete nodos[k];
  }

  function iniciar(k: string) {
    if (!/^pk_[A-Za-z0-9]{16,64}$/.test(k)) { console.warn('[GO Chat] Clave pública inválida.'); return; }
    if (clave === k) return;
    if (clave) destruir();
    clave = k;
    void llamar('config', { pagina: ventana.location.href }).then((r) => {
      if (clave !== k) return;
      if (r.status !== 200 || !r.cuerpo.config) {
        console.warn('[GO Chat] El chat no está disponible en esta página (' + (r.cuerpo.error || r.status) + ').');
        clave = null;
        return;
      }
      cfg = r.cuerpo.config as Config;
      const listo = () => {
        montar(cfg as Config);
        const g = guardado();
        if (g.i === 1 || g.o === 1) identificado = true;
        // Visitante que vuelve: se recupera la conversación (y los no leídos) sin crear filas nuevas.
        if (typeof g.t === 'string') void asegurarSesion();
      };
      if (d.body) listo(); else d.addEventListener('DOMContentLoaded', listo, { once: true });
    });
  }

  function ejecutar(args: unknown[]) {
    const c = args[0];
    if (c === 'init' && typeof args[1] === 'string') iniciar(args[1]);
    else if (c === 'open') { if (cfg) abrir(); }
    else if (c === 'close') cerrar();
    else if (c === 'toggle') { if (abierto) cerrar(); else abrir(); }
    else if (c === 'destroy') destruir();
  }

  d.addEventListener('visibilitychange', () => { if (!d.hidden) programarSondeo(abierto ? 300 : undefined); });
  if (ventana.visualViewport) {
    ventana.visualViewport.addEventListener('resize', () => { if (abierto) { ajustarAlTeclado(); alFondo(); } });
    ventana.visualViewport.addEventListener('scroll', () => { if (abierto) ajustarAlTeclado(); });
  }
  ventana.addEventListener('resize', () => {
    if (!abierto) return;
    ajustarAlTeclado();
    if (esMovil()) bloquearScroll(); else if (desbloquear) desbloquear();
  });

  for (const a of pendientes) ejecutar(a);
}
