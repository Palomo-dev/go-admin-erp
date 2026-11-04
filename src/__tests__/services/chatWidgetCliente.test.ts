/**
 * @jest-environment jsdom
 *
 * Widget de chat — el script que se pega en cualquier página
 * (`supabase/functions/chat-widget/cliente.ts`). Se prueba la función que la
 * Edge Function sirve con `toString()`, con un `fetch` falso.
 */
import { iniciarWidgetGoChat } from '../../../supabase/functions/chat-widget/cliente';
import { codigoDelWidget, urlDelWidget } from '@/lib/chat/codigoWidget';

type Respuesta = { status: number; cuerpo: Record<string, unknown> };

const CLAVE = 'pk_' + 'A'.repeat(32);
const CONFIG = {
  titulo: 'Tienda demo',
  bienvenida: '¡Hola!',
  avatar: null,
  posicion: { lado: 'right', vertical: 'bottom', x: 20, y: 20 },
  estilo: { colorPrincipal: '#0F766E', colorIcono: '#FFFFFF', icono: 'chat', iconoRelleno: false, iconoUrl: null, tamano: 56, radio: 28, borde: 0, colorBorde: '#FFFFFF', sombra: 'medium' },
  vistaInicial: 'chat',
  acciones: [{ etiqueta: 'Horarios', accion: '¿Horario?', url: null }],
  fueraDeHorario: { mensaje: 'Cerrado', pedirDatos: true },
  campos: { nombre: { pedir: false, obligatorio: false }, correo: { pedir: false, obligatorio: false }, telefono: { pedir: false, obligatorio: false }, empresa: { pedir: false, obligatorio: false } },
  enLinea: null,
  ia: false,
  moneda: 'COP',
  zonaHoraria: 'America/Bogota',
  negocio: 'Demo',
};

let llamadas: { accion: string; cuerpo: Record<string, unknown> }[] = [];
let responder: (accion: string, cuerpo: Record<string, unknown>) => Respuesta;

const esperar = () => new Promise((r) => setTimeout(r, 0));
async function drenar() { for (let i = 0; i < 8; i++) await esperar(); }

function raiz(): ShadowRoot {
  const host = document.querySelector('[data-gochat-widget]') as HTMLElement;
  expect(host).not.toBeNull();
  return host.shadowRoot as ShadowRoot;
}

beforeEach(() => {
  document.body.innerHTML = '<p>página del cliente</p>';
  const w = window as unknown as Record<string, unknown>;
  for (const k of ['goChat', 'GOChatWidget', '__goChat']) delete w[k];
  try { window.localStorage.clear(); } catch { /* sin almacenamiento */ }
  llamadas = [];
  responder = (accion) => {
    if (accion === 'config') return { status: 200, cuerpo: { config: CONFIG } };
    if (accion === 'sesion') return { status: 200, cuerpo: { token: 't'.repeat(43), identificado: false, conversacion: false, mensajes: [] } };
    if (accion === 'enviar') return { status: 200, cuerpo: { mensaje: { id: 'srv-1', autor: 'visitante', tipo: 'text', texto: 'x', url: null, nombreArchivo: null, creado: '2026-11-03T15:00:00Z', idCliente: null, productos: [], pedido: null } } };
    return { status: 200, cuerpo: { mensajes: [] } };
  };
  (window as unknown as { fetch: unknown }).fetch = jest.fn(async (_url: string, init: { body: string }) => {
    const cuerpo = JSON.parse(init.body);
    llamadas.push({ accion: cuerpo.accion, cuerpo });
    const r = responder(cuerpo.accion, cuerpo);
    return { status: r.status, json: async () => r.cuerpo };
  });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

describe('chat-widget · carga en cualquier página', () => {
  it('acepta la cola de los sitios GO Admin (GOChatWidget.q)', async () => {
    (window as unknown as Record<string, unknown>).GOChatWidget = { q: [['init', CLAVE]] };
    iniciarWidgetGoChat(window, 'https://x.supabase.co/functions/v1/chat-widget');
    await drenar();
    expect(llamadas[0]).toMatchObject({ accion: 'config', cuerpo: { clave: CLAVE } });
    expect(raiz().querySelector('.gc-lanzador')).not.toBeNull();
  });

  it('acepta el código antiguo del ERP: goChat(\'init\') después del script', async () => {
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    (window as unknown as { goChat: (...a: unknown[]) => void }).goChat('init', CLAVE);
    await drenar();
    expect(llamadas.map((l) => l.accion)).toEqual(['config']);
  });

  it('acepta el fragmento asíncrono con alias (GOChatWidget = \'goChat\')', async () => {
    const w = window as unknown as Record<string, unknown>;
    const stub = function () { /* cola */ } as unknown as { q: unknown[] };
    stub.q = [['init', CLAVE]];
    w.GOChatWidget = 'goChat';
    w.goChat = stub;
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    await drenar();
    expect(llamadas[0]?.accion).toBe('config');
  });

  it('no se monta si el canal no está disponible y no crea sesión al cargar', async () => {
    responder = () => ({ status: 404, cuerpo: { error: 'canal_no_disponible' } });
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    (window as unknown as { goChat: (...a: unknown[]) => void }).goChat('init', CLAVE);
    await drenar();
    expect(document.querySelector('[data-gochat-widget]')).toBeNull();
    expect(llamadas.map((l) => l.accion)).toEqual(['config']);
    aviso.mockRestore();
  });

  it('rechaza una clave con forma inválida sin llamar al servidor', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    (window as unknown as { goChat: (...a: unknown[]) => void }).goChat('init', "x');alert(1)//");
    await drenar();
    expect(llamadas).toEqual([]);
    aviso.mockRestore();
  });
});

describe('chat-widget · accesibilidad y aislamiento', () => {
  async function montado() {
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    (window as unknown as { goChat: (...a: unknown[]) => void }).goChat('init', CLAVE);
    await drenar();
    return raiz();
  }

  it('vive en un Shadow DOM: no añade estilos ni nodos al documento salvo el host', async () => {
    const r = await montado();
    expect(document.head.querySelectorAll('style').length).toBe(0);
    expect(document.body.children.length).toBe(2);
    expect(r.querySelector('style')?.textContent).toContain(':host{all:initial}');
  });

  it('abre con el lanzador (aria-expanded), Esc cierra y devuelve el foco', async () => {
    const r = await montado();
    const lanz = r.querySelector('.gc-lanzador') as HTMLButtonElement;
    const panel = r.querySelector('.gc-panel') as HTMLElement;
    expect(lanz.getAttribute('aria-expanded')).toBe('false');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-labelledby')).toBe('gc-titulo');
    lanz.click();
    await drenar();
    expect(panel.hidden).toBe(false);
    expect(lanz.getAttribute('aria-expanded')).toBe('true');
    expect(r.activeElement).toBe(r.querySelector('textarea'));
    expect(llamadas.map((l) => l.accion)).toContain('sesion');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(r.activeElement).toBe(lanz);
  });

  it('la lista de mensajes es un log anunciable y muestra la bienvenida', async () => {
    const r = await montado();
    const lista = r.querySelector('.gc-lista') as HTMLElement;
    expect(lista.getAttribute('role')).toBe('log');
    expect(lista.getAttribute('aria-live')).toBe('polite');
    expect(lista.textContent).toContain('¡Hola!');
  });
});

describe('chat-widget · enviar y recibir', () => {
  it('envía el texto y pinta HTML como texto, nunca como marcado', async () => {
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    (window as unknown as { goChat: (...a: unknown[]) => void }).goChat('init', CLAVE);
    await drenar();
    const r = raiz();
    (r.querySelector('.gc-lanzador') as HTMLButtonElement).click();
    await drenar();
    const malicioso = '<img src=x onerror="window.__xss=1">';
    responder = (accion, cuerpo) => accion === 'enviar'
      ? { status: 200, cuerpo: { mensaje: { id: 'srv-2', autor: 'visitante', tipo: 'text', texto: cuerpo.texto, url: null, nombreArchivo: null, creado: '2026-11-03T15:00:00Z', idCliente: cuerpo.idCliente, productos: [], pedido: null } } }
      : { status: 200, cuerpo: { mensajes: [] } };
    const ta = r.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = malicioso;
    ta.dispatchEvent(new Event('input'));
    (r.querySelector('.gc-pie') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await drenar();
    const enviado = llamadas.find((l) => l.accion === 'enviar');
    expect(enviado?.cuerpo).toMatchObject({ clave: CLAVE, texto: malicioso, token: 't'.repeat(43) });
    expect(enviado?.cuerpo).not.toHaveProperty('organizationId');
    const burbujas = r.querySelectorAll('.gc-visitante .gc-burbuja');
    expect(burbujas[burbujas.length - 1].textContent).toBe(malicioso);
    expect(r.querySelector('.gc-lista img')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('un 429 se explica al visitante y no se reintenta solo', async () => {
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    (window as unknown as { goChat: (...a: unknown[]) => void }).goChat('init', CLAVE);
    await drenar();
    const r = raiz();
    (r.querySelector('.gc-lanzador') as HTMLButtonElement).click();
    await drenar();
    responder = (accion) => (accion === 'enviar' ? { status: 429, cuerpo: { error: 'limite' } } : { status: 200, cuerpo: { mensajes: [] } });
    const ta = r.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'hola';
    (r.querySelector('.gc-pie') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await drenar();
    expect(r.querySelector('.gc-err')?.textContent).toContain('muchos mensajes');
  });

  it('los enlaces solo son http(s) y abren con rel=noopener', async () => {
    responder = (accion) => {
      if (accion === 'config') return { status: 200, cuerpo: { config: CONFIG } };
      if (accion === 'sesion') return { status: 200, cuerpo: { token: 't'.repeat(43), conversacion: true, mensajes: [{ id: 'a1', autor: 'agente', tipo: 'text', texto: 'Mira https://tienda.com/x. y javascript:alert(1) **ya**', url: null, nombreArchivo: null, creado: '2026-11-03T15:00:00Z', idCliente: null, productos: [], pedido: null }] } };
      return { status: 200, cuerpo: { mensajes: [] } };
    };
    window.localStorage.setItem('gochat:v2:' + CLAVE, JSON.stringify({ t: 't'.repeat(43) }));
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    (window as unknown as { goChat: (...a: unknown[]) => void }).goChat('init', CLAVE);
    await drenar();
    const r = raiz();
    const enlaces = r.querySelectorAll('.gc-burbuja a');
    expect(enlaces.length).toBe(1);
    expect((enlaces[0] as HTMLAnchorElement).href).toBe('https://tienda.com/x');
    expect((enlaces[0] as HTMLAnchorElement).rel).toContain('noopener');
    expect(r.querySelector('.gc-burbuja strong')?.textContent).toBe('ya');
  });
});

describe('chat-widget · tarjetas de producto arman el pedido', () => {
  const PRODUCTOS = [
    { id: '1', nombre: 'Minibar 94 L', precio: 119980, precioAntes: 999900, imagen: 'https://img.test/a.png' },
    { id: '2', nombre: 'Nevecon 541 L', precio: 535980, precioAntes: null, imagen: null },
  ];

  async function conTarjetas() {
    responder = (accion) => {
      if (accion === 'config') return { status: 200, cuerpo: { config: CONFIG } };
      if (accion === 'sesion') return { status: 200, cuerpo: { token: 't'.repeat(43), conversacion: true, mensajes: [{ id: 'p1', autor: 'ia', tipo: 'text', texto: 'Estas son las neveras:', url: null, nombreArchivo: null, creado: '2026-11-04T05:08:00Z', idCliente: null, productos: PRODUCTOS, pedido: null }] } };
      return { status: 200, cuerpo: { mensajes: [] } };
    };
    window.localStorage.setItem('gochat:v2:' + CLAVE, JSON.stringify({ t: 't'.repeat(43) }));
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    (window as unknown as { goChat: (...a: unknown[]) => void }).goChat('init', CLAVE);
    await drenar();
    const r = raiz();
    (r.querySelector('.gc-lanzador') as HTMLButtonElement).click();
    await drenar();
    return r;
  }

  it('cada tarjeta es un botón con nombre accesible y la lista conserva su rol', async () => {
    const r = await conTarjetas();
    const fila = r.querySelector('.gc-productos') as HTMLElement;
    expect(fila.getAttribute('role')).toBe('list');
    expect(fila.querySelectorAll('[role=listitem]').length).toBe(2);
    const botones = r.querySelectorAll('button.gc-prod');
    expect(botones.length).toBe(2);
    expect(botones[0].getAttribute('aria-label')).toBe('Agregar Minibar 94 L al pedido');
    expect(botones[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('tocar tarjetas agrega los productos al mensaje separados por comas, sin repetirlos', async () => {
    const r = await conTarjetas();
    const ta = r.querySelector('textarea') as HTMLTextAreaElement;
    const [a, b] = Array.from(r.querySelectorAll('button.gc-prod')) as HTMLButtonElement[];
    a.click();
    expect(ta.value).toBe('Minibar 94 L');
    b.click();
    expect(ta.value).toBe('Minibar 94 L, Nevecon 541 L');
    a.click();
    expect(ta.value).toBe('Minibar 94 L, Nevecon 541 L');
    expect(a.getAttribute('aria-pressed')).toBe('true');
    expect(b.querySelector('.gc-prod-accion')?.textContent).toBe('✓ Agregado');
    expect((r.querySelector('.gc-enviar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('respeta lo que el visitante ya escribió y al enviar las tarjetas vuelven a «Agregar»', async () => {
    const r = await conTarjetas();
    const ta = r.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'Quiero 2 de';
    ta.dispatchEvent(new Event('input'));
    (r.querySelectorAll('button.gc-prod')[1] as HTMLButtonElement).click();
    expect(ta.value).toBe('Quiero 2 de, Nevecon 541 L');
    (r.querySelector('.gc-pie') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await drenar();
    expect(llamadas.find((l) => l.accion === 'enviar')?.cuerpo).toMatchObject({ texto: 'Quiero 2 de, Nevecon 541 L' });
    expect(ta.value).toBe('');
    expect(r.querySelectorAll('button.gc-prod[aria-pressed=true]').length).toBe(0);
  });
});

describe('chat-widget · código que genera el ERP (Chat › Canales › Sitio web)', () => {
  it('pegado en una página cualquiera, el script lo recoge de la cola y arranca', async () => {
    const codigo = codigoDelWidget(CLAVE, 'https://x.supabase.co/');
    expect(codigo).toContain('<script src="https://x.supabase.co/functions/v1/chat-widget" async></script>');
    // Se ejecuta el <script> en línea del fragmento, como lo haría el navegador…
    const enLinea = /<script>([\s\S]*?)<\/script>/.exec(codigo)![1];
    new Function(enLinea)();
    // …y luego llega el script asíncrono.
    iniciarWidgetGoChat(window, 'https://x/functions/v1/chat-widget');
    await drenar();
    expect(llamadas[0]).toMatchObject({ accion: 'config', cuerpo: { clave: CLAVE } });
    expect(raiz().querySelector('.gc-lanzador')).not.toBeNull();
  });

  it('no genera código con una clave mal formada (nada que inyectar en la página)', () => {
    expect(codigoDelWidget("pk_x');alert(1);//")).toBe('');
    expect(codigoDelWidget(null)).toBe('');
    expect(urlDelWidget('https://a.supabase.co')).toBe('https://a.supabase.co/functions/v1/chat-widget');
  });
});
