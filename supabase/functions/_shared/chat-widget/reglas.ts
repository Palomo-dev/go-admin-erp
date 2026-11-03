/**
 * Widget de chat del sitio web — reglas puras, sin dependencias.
 *
 * Lo usa la Edge Function `chat-widget` (importado CON extensión `.ts`, como
 * exige Deno) y lo prueba Jest (importado sin extensión), igual que
 * `_shared/ai-chat/*`. Aquí vive todo lo que se decide sin tocar la base:
 * qué configuración del canal ve el visitante, qué origen puede usar el canal,
 * cómo se limpia el texto que escribe y qué parte de un mensaje se le devuelve.
 *
 * Regla de seguridad: NADA de lo que sale de aquí hacia el navegador lleva
 * HTML. El cliente pinta todo con `textContent`; las URL se aceptan solo si son
 * http(s) y los colores solo si son hexadecimales.
 */

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export const MAXIMO_TEXTO_MENSAJE = 2000;

/**
 * Limpia texto libre del visitante o de la configuración: quita caracteres de
 * control (salvo salto de línea y tabulador), normaliza saltos, recorta
 * espacios y corta a `maximo` caracteres. No escapa HTML porque nunca se
 * interpreta como HTML (ni en el widget ni en la bandeja del ERP, que es React).
 */
export function limpiarTexto(valor: unknown, maximo: number): string {
  if (typeof valor !== 'string') return '';
  const sinControl = valor
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return Array.from(sinControl).slice(0, maximo).join('');
}

/** Texto de una sola línea (nombres, títulos, etiquetas). */
export function limpiarLinea(valor: unknown, maximo: number): string {
  return limpiarTexto(valor, maximo * 2).replace(/\s+/g, ' ').trim().slice(0, maximo);
}

// ---------------------------------------------------------------------------
// URL, colores y números
// ---------------------------------------------------------------------------

/** Devuelve la URL normalizada si es http(s) absoluta; si no, null. */
export function urlSegura(valor: unknown, soloHttps = false): string | null {
  if (typeof valor !== 'string' || valor.length > 2000) return null;
  try {
    const u = new URL(valor.trim());
    if (u.protocol !== 'https:' && (soloHttps || u.protocol !== 'http:')) return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function colorSeguro(valor: unknown, porDefecto: string): string {
  return typeof valor === 'string' && HEX.test(valor.trim()) ? valor.trim() : porDefecto;
}

export function numeroEntre(valor: unknown, min: number, max: number, porDefecto: number): number {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN;
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Origen permitido
// ---------------------------------------------------------------------------

/** Dominios de la plataforma donde viven los sitios GO Admin (`<sub>.goadmin.io`). */
export const DOMINIOS_PLATAFORMA = ['goadmin.io', 'goadmin.co.uk'] as const;

const HOST_VALIDO = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Normaliza lo que la organización escribió como dominio permitido:
 * `https://www.tienda.com/`, `*.tienda.com` o `Tienda.com:443` → `tienda.com`
 * (con `www.` se queda tal cual; `*.` se quita porque los subdominios ya se
 * aceptan). Devuelve null si no es un nombre de host válido.
 */
export function normalizarDominio(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^\*\./, '')
    .replace(/\.$/, '');
  if (!limpio || limpio.length > 253 || !HOST_VALIDO.test(limpio)) return null;
  return limpio;
}

/** Host de una cabecera `Origin`, o null si no es http(s). */
export function hostDeOrigen(origen: string | null | undefined): string | null {
  if (!origen || origen === 'null') return null;
  try {
    const u = new URL(origen);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * ¿Puede la página de `origen` usar este canal?
 *
 * - Sin dominios configurados en el canal: sí, desde cualquier página. Es el
 *   comportamiento histórico y lo que permite pegar el código en cualquier
 *   sitio sin configurar nada; la protección contra abuso es el límite de tasa.
 * - Con dominios configurados: solo esos dominios, sus subdominios y los sitios
 *   propios de la organización en GO Admin (`hostsPropios`). Una petición sin
 *   `Origin` (curl, servidor) se rechaza: un navegador siempre lo envía en un
 *   `fetch` entre orígenes.
 */
export function origenPermitido(
  origen: string | null | undefined,
  dominiosDelCanal: readonly unknown[] | null | undefined,
  hostsPropios: readonly string[] = [],
): boolean {
  const configurados = (dominiosDelCanal ?? []).map(normalizarDominio).filter((d): d is string => !!d);
  if (configurados.length === 0) return true;
  const host = hostDeOrigen(origen);
  if (!host) return false;
  const permitidos = new Set<string>([...configurados, ...hostsPropios.map(normalizarDominio).filter((d): d is string => !!d)]);
  for (const d of permitidos) {
    if (host === d || host.endsWith(`.${d}`)) return true;
  }
  return false;
}

/**
 * Hosts de la organización en GO Admin: los de `organization_domains` activos
 * y `<subdominio>.goadmin.io` (y `.co.uk`). Las sedes (`sede.<sub>.goadmin.io`)
 * quedan cubiertas porque se aceptan subdominios.
 */
export function hostsDeLaOrganizacion(subdominio: string | null | undefined, dominios: readonly unknown[]): string[] {
  const salida = new Set<string>();
  for (const d of dominios) {
    const n = normalizarDominio(d);
    if (n) salida.add(n);
  }
  const sub = typeof subdominio === 'string' ? subdominio.trim().toLowerCase() : '';
  if (sub && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) {
    for (const base of DOMINIOS_PLATAFORMA) salida.add(`${sub}.${base}`);
  }
  return [...salida];
}

// ---------------------------------------------------------------------------
// Horario
// ---------------------------------------------------------------------------

/**
 * Devuelve un `Date` cuyos campos UTC (`getUTCDay`, `getUTCHours`…) son la
 * hora de pared en `zona`. Sirve para reutilizar `dentroDeHorarioLaboral`
 * (de `_shared/ai-chat/politicaRespuesta`), que lee los campos UTC, con la
 * zona horaria de la organización en lugar de la del servidor.
 */
export function relojDeLaZona(ahora: Date, zona: string | null | undefined): Date {
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zona || 'America/Bogota',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(ahora);
  } catch {
    return relojDeLaZona(ahora, 'America/Bogota');
  }
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute')));
}

// ---------------------------------------------------------------------------
// Configuración pública del canal
// ---------------------------------------------------------------------------

export type TipoIcono = 'chat' | 'whatsapp' | 'message' | 'support' | 'custom';

export interface ConfiguracionPublica {
  titulo: string;
  bienvenida: string;
  avatar: string | null;
  posicion: { lado: 'right' | 'left'; vertical: 'bottom' | 'top'; x: number; y: number };
  estilo: {
    colorPrincipal: string;
    colorIcono: string;
    icono: TipoIcono;
    iconoRelleno: boolean;
    iconoUrl: string | null;
    tamano: number;
    radio: number;
    borde: number;
    colorBorde: string;
    sombra: 'none' | 'light' | 'medium' | 'strong';
  };
  vistaInicial: 'chat' | 'faq' | 'form';
  acciones: { etiqueta: string; accion: string; url: string | null }[];
  fueraDeHorario: { mensaje: string; pedirDatos: boolean };
  campos: {
    nombre: { pedir: boolean; obligatorio: boolean };
    correo: { pedir: boolean; obligatorio: boolean };
    telefono: { pedir: boolean; obligatorio: boolean };
    empresa: { pedir: boolean; obligatorio: boolean };
  };
}

type Objeto = Record<string, unknown>;
const obj = (v: unknown): Objeto => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : {});

export const VALORES_POR_DEFECTO = {
  colorPrincipal: '#3B82F6',
  titulo: 'Chat',
  bienvenida: '¡Hola! ¿En qué podemos ayudarte?',
  fueraDeHorario: 'No estamos disponibles en este momento. Déjanos tu mensaje y te responderemos pronto.',
} as const;

/**
 * Traduce `channel_website_settings` (las dos formas que ha guardado el ERP:
 * la antigua `{primary_color, position: 'bottom-right', logo_url}` y la actual
 * `{position:{…}, style:{…}, behavior:{…}}`) a la configuración que ve el
 * visitante. Mismos valores por defecto que las pantallas del ERP
 * (`WidgetStyleSection`, `WidgetPositionSection`, `WidgetBehaviorSection`).
 */
export function normalizarConfiguracion(
  brandConfig: unknown,
  mensajeBienvenida: unknown,
  collectIdentity: unknown,
  logoOrganizacion?: unknown,
): ConfiguracionPublica {
  const b = obj(brandConfig);
  const estilo = obj(b.style);
  const comp = obj(b.behavior);
  const identidad = obj(collectIdentity);
  const obligatorios = obj(identidad.required);

  // Posición: objeto nuevo o cadena antigua 'bottom-right'.
  let lado: 'right' | 'left' = 'right';
  let vertical: 'bottom' | 'top' = 'bottom';
  let x = 20;
  let y = 20;
  if (typeof b.position === 'string') {
    lado = b.position.includes('left') ? 'left' : 'right';
    vertical = b.position.startsWith('top') ? 'top' : 'bottom';
  } else {
    const p = obj(b.position);
    lado = p.side === 'left' ? 'left' : 'right';
    vertical = p.vertical === 'top' ? 'top' : 'bottom';
    x = numeroEntre(p.offsetX, 0, 200, 20);
    y = numeroEntre(p.offsetY, 0, 200, 20);
  }

  const iconos: TipoIcono[] = ['chat', 'whatsapp', 'message', 'support', 'custom'];
  const icono = iconos.includes(estilo.iconType as TipoIcono) ? (estilo.iconType as TipoIcono) : 'chat';
  const iconoUrl = urlSegura(estilo.iconUrl, true);
  const sombras = ['light', 'medium', 'strong'] as const;
  const sombra = estilo.shadowEnabled === false
    ? 'none'
    : (sombras as readonly string[]).includes(String(estilo.shadowStrength)) ? (estilo.shadowStrength as 'light' | 'medium' | 'strong') : 'medium';

  const acciones = (Array.isArray(comp.quickActions) ? comp.quickActions : [])
    .map((a) => obj(a))
    .map((a) => {
      const etiqueta = limpiarLinea(a.label, 40);
      const accion = limpiarTexto(a.action, 500);
      return { etiqueta, accion, url: urlSegura(accion) };
    })
    .filter((a) => a.etiqueta && a.accion)
    .slice(0, 6);

  const vistas = ['chat', 'faq', 'form'] as const;
  const campo = (clave: string) => ({
    pedir: identidad[clave] === true,
    obligatorio: identidad[clave] === true && obligatorios[clave] === true,
  });

  return {
    titulo: limpiarLinea(comp.title, 60) || VALORES_POR_DEFECTO.titulo,
    bienvenida:
      limpiarTexto(comp.welcomeMessage, 500) ||
      limpiarTexto(mensajeBienvenida, 500) ||
      VALORES_POR_DEFECTO.bienvenida,
    avatar: urlSegura(b.logo_url, true) ?? urlSegura(logoOrganizacion, true),
    posicion: { lado, vertical, x, y },
    estilo: {
      colorPrincipal: colorSeguro(estilo.primaryColor ?? b.primary_color, VALORES_POR_DEFECTO.colorPrincipal),
      colorIcono: colorSeguro(estilo.iconColor, '#FFFFFF'),
      icono: icono === 'custom' && !iconoUrl ? 'chat' : icono,
      iconoRelleno: estilo.iconStyle === 'filled',
      iconoUrl,
      tamano: numeroEntre(estilo.buttonSize, 40, 80, 56),
      radio: numeroEntre(estilo.borderRadius, 0, 40, 28),
      borde: numeroEntre(estilo.borderWidth, 0, 6, 0),
      colorBorde: colorSeguro(estilo.borderColor, '#FFFFFF'),
      sombra,
    },
    vistaInicial: (vistas as readonly string[]).includes(String(comp.openDefaultView)) ? (comp.openDefaultView as 'chat' | 'faq' | 'form') : 'chat',
    acciones: comp.showQuickActions === true ? acciones : [],
    fueraDeHorario: {
      mensaje: limpiarTexto(comp.offlineMessage, 500) || VALORES_POR_DEFECTO.fueraDeHorario,
      pedirDatos: comp.offlineCollectData !== false,
    },
    campos: {
      nombre: campo('name'),
      correo: campo('email'),
      telefono: campo('phone'),
      empresa: campo('company'),
    },
  };
}

// ---------------------------------------------------------------------------
// Datos del visitante
// ---------------------------------------------------------------------------

const CORREO = /^[^\s@<>()[\],;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export interface DatosVisitante {
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
}

/**
 * Valida el formulario previo al chat contra los campos que el canal pide.
 * Devuelve los datos limpios o la lista de campos con error.
 */
export function validarDatosVisitante(
  entrada: unknown,
  campos: ConfiguracionPublica['campos'],
): { ok: true; datos: DatosVisitante } | { ok: false; errores: string[] } {
  const e = obj(entrada);
  const nombre = limpiarLinea(e.nombre, 80) || null;
  const correoCrudo = limpiarLinea(e.correo, 120).toLowerCase();
  const correo = correoCrudo && CORREO.test(correoCrudo) && !correoCrudo.endsWith('@widget.local') ? correoCrudo : null;
  const digitos = limpiarLinea(e.telefono, 30).replace(/[^\d+]/g, '');
  const telefono = /^\+?\d{7,15}$/.test(digitos) ? digitos : null;
  const empresa = limpiarLinea(e.empresa, 120) || null;

  const errores: string[] = [];
  if (correoCrudo && !correo) errores.push('correo');
  if (digitos && !telefono) errores.push('telefono');
  if (campos.nombre.obligatorio && !nombre) errores.push('nombre');
  if (campos.correo.obligatorio && !correo && !errores.includes('correo')) errores.push('correo');
  if (campos.telefono.obligatorio && !telefono && !errores.includes('telefono')) errores.push('telefono');
  if (campos.empresa.obligatorio && !empresa) errores.push('empresa');
  if (errores.length > 0) return { ok: false, errores };
  return {
    ok: true,
    datos: {
      nombre: campos.nombre.pedir ? nombre : null,
      correo: campos.correo.pedir ? correo : null,
      telefono: campos.telefono.pedir ? telefono : null,
      empresa: campos.empresa.pedir ? empresa : null,
    },
  };
}

/** Separa un nombre completo en nombre y apellidos (para `customers`). */
export function partirNombre(nombre: string): { first_name: string; last_name: string } {
  const partes = nombre.trim().split(/\s+/);
  return { first_name: partes[0] ?? '', last_name: partes.slice(1).join(' ') };
}

// ---------------------------------------------------------------------------
// Mensajes que se devuelven al visitante
// ---------------------------------------------------------------------------

export interface FilaMensaje {
  id: string;
  role: string;
  direction: string;
  content_type: string | null;
  content: string | null;
  created_at: string;
  metadata: unknown;
}

export interface ProductoPublico {
  id: string;
  nombre: string;
  precio: number | null;
  precioAntes: number | null;
  imagen: string | null;
}

export interface MensajePublico {
  id: string;
  autor: 'visitante' | 'agente' | 'ia';
  tipo: 'text' | 'image' | 'file' | 'audio' | 'video';
  texto: string;
  url: string | null;
  nombreArchivo: string | null;
  creado: string;
  idCliente: string | null;
  productos: ProductoPublico[];
  pedido: { etiqueta: string; url: string } | null;
}

const AUTOR: Record<string, MensajePublico['autor']> = { customer: 'visitante', agent: 'agente', ai: 'ia' };
const TIPOS = ['text', 'image', 'file', 'audio', 'video'] as const;

function numeroONull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Lo que el visitante ve de un mensaje. Se omiten los mensajes de sistema y
 * las notas internas, y de `metadata` solo salen las tarjetas de producto y el
 * botón de pedido que arma `ai-auto-response` (con la URL del checkout del
 * sitio y el carrito en el formato que lee `CheckoutWizard`: `?cart=&customer=`).
 */
export function mensajeParaVisitante(m: FilaMensaje): MensajePublico | null {
  const autor = AUTOR[m.role];
  if (!autor) return null;
  const meta = obj(m.metadata);
  if (meta.internal === true || meta.is_internal === true || meta.private === true || meta.is_note === true) return null;
  if (autor === 'visitante' && m.direction !== 'inbound') return null;
  if (autor !== 'visitante' && m.direction !== 'outbound') return null;

  const tipo = (TIPOS as readonly string[]).includes(String(m.content_type)) ? (m.content_type as MensajePublico['tipo']) : 'text';
  const contenido = typeof m.content === 'string' ? m.content : '';
  const url = tipo === 'text' ? null : urlSegura(contenido, true);
  if (tipo !== 'text' && !url) return null;

  const productos: ProductoPublico[] = (Array.isArray(meta.products) ? meta.products : [])
    .map((p) => obj(p))
    .map((p) => ({
      id: limpiarLinea(String(p.id ?? ''), 40),
      nombre: limpiarLinea(p.name, 120),
      precio: numeroONull(p.price),
      precioAntes: numeroONull(p.comparePrice),
      imagen: urlSegura(p.imageUrl, true),
    }))
    .filter((p) => p.nombre)
    .slice(0, 6);

  let pedido: MensajePublico['pedido'] = null;
  const accion = obj(meta.order_action);
  const checkout = urlSegura(accion.checkoutUrl, true);
  if (accion.type === 'checkout_redirect' && checkout) {
    const carrito = (Array.isArray(accion.cartItems) ? accion.cartItems : []).slice(0, 30).map((i) => {
      const it = obj(i);
      return {
        productId: typeof it.productId === 'number' || typeof it.productId === 'string' ? it.productId : null,
        name: limpiarLinea(it.name, 120),
        price: numeroONull(it.price),
        comparePrice: numeroONull(it.comparePrice),
        imageUrl: urlSegura(it.imageUrl, true),
        quantity: numeroEntre(it.quantity, 1, 999, 1),
      };
    });
    const c = obj(accion.customerData);
    const cliente: Record<string, string> = {};
    for (const k of ['firstName', 'lastName', 'phone', 'email', 'address', 'city']) {
      const v = limpiarLinea(c[k], 200);
      if (v) cliente[k] = v;
    }
    const u = new URL(checkout);
    if (carrito.length > 0) u.searchParams.set('cart', JSON.stringify(carrito));
    if (Object.keys(cliente).length > 0) u.searchParams.set('customer', JSON.stringify(cliente));
    pedido = { etiqueta: limpiarLinea(accion.label, 40) || 'Completar pedido', url: u.toString() };
  }

  return {
    id: m.id,
    autor,
    tipo,
    texto: tipo === 'text' ? limpiarTexto(contenido, 8000) : '',
    url,
    nombreArchivo: tipo === 'text' ? null : limpiarLinea(meta.file_name, 120) || null,
    creado: m.created_at,
    idCliente: autor === 'visitante' ? limpiarLinea(meta.client_id, 64) || null : null,
    productos,
    pedido,
  };
}

/** Tipo de dispositivo admitido por el CHECK de `widget_sessions.device_type`. */
export function tipoDispositivo(valor: unknown): 'desktop' | 'mobile' | 'tablet' | null {
  return valor === 'desktop' || valor === 'mobile' || valor === 'tablet' ? valor : null;
}

/** Forma de una clave pública de canal (`pk_` + 32 alfanuméricos, ver `chatChannelsService`). */
export function clavePublicaValida(valor: unknown): valor is string {
  return typeof valor === 'string' && /^pk_[A-Za-z0-9]{16,64}$/.test(valor);
}

/** Token de sesión que guarda el navegador (base64url de 32 bytes). */
export function tokenValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(valor);
}
