/**
 * Contrato de la página «Contacto v2 editable» (Figma «16 Sitio web», sección 3104:84056; nota
 * 3104:84059; editor 3108:85760, Canales 3108:86969, Sedes 3112:86965, Redes 3112:87143).
 *
 * Lo nuevo:
 * - Tipo `contact_channels` («Canales de contacto»): tarjetas WhatsApp, Teléfono, Correo, Dirección
 *   y canales propios. Cada canal toma el dato de la organización o un texto propio.
 * - Tipo `social_networks` («Redes sociales»): las redes guardadas del sitio (`social_links`).
 * - `contact_form` · `card_hours` («Tarjeta con horario al lado») y, en todas las variantes, campos
 *   con «Mostrar», «Obligatorio», etiqueta, Asunto como desplegable y la casilla de datos.
 * - `hero` · `page_header` («Encabezado de página»): migas «Inicio › Contacto» e imagen opcional.
 * - `hours_location`: sede que se abre primero y botón de WhatsApp por sede.
 *
 * Este archivo es la única definición y lo leen los dos lados: el editor del ERP y el sitio
 * público (goadmin-websites, `lib/website/v2/contrato/paginaContacto.ts`, copia idéntica que
 * revisa `npm run verify:copias`). Todo vive en el `content` de las secciones: sin columnas nuevas.
 *
 * Reglas:
 * - Lo guardado antes se lee igual: sin `form_fields` las variantes viejas pintan sus campos de
 *   siempre; sin `channels`, los cuatro canales por defecto.
 * - Nombre y correo siempre se piden (el CRM los necesita para crear el cliente potencial).
 * - La casilla de datos, si se muestra, siempre es obligatoria.
 * - Sin WhatsApp en Configuración, el teléfono de contacto hace de WhatsApp si es un celular
 *   (`whatsappDeTienda`); la tarjeta Teléfono con ese número no se repite (`canalesConDato`).
 *
 * Código puro: sin imports, sin React ni Supabase.
 */

// ─── Tipos y variantes ───────────────────────────────────────────────────────────────────────

export const TIPO_CANALES_CONTACTO = 'contact_channels' as const;
export const TIPO_REDES_SOCIALES = 'social_networks' as const;
export const VARIANTE_CANALES_TARJETAS = 'cards' as const;
export const VARIANTE_REDES_FILA = 'row' as const;
export const VARIANTE_FORMULARIO_TARJETA = 'card_hours' as const;
export const VARIANTE_ENCABEZADO_PAGINA = 'page_header' as const;

/**
 * Id del formulario de la página Contacto armada por la tienda cuando la organización no tiene
 * esa página por secciones (tiendas viejas). El servidor lo reconoce y manda la copia al correo
 * de contacto del sitio (antes ese formulario no avisaba a nadie).
 */
export const ID_FORMULARIO_RESPALDO = 'contacto-respaldo';

// ─── Canales de contacto ─────────────────────────────────────────────────────────────────────

export type TipoCanal = 'whatsapp' | 'phone' | 'email' | 'address' | 'custom';
export type FuenteCanal = 'org' | 'own';

/** Canal tal como se guarda en `content.channels`. */
export interface CanalContacto {
  id: string;
  type: TipoCanal;
  visible: boolean;
  /** `org`: el dato de la organización o del sitio. `own`: `value` (solo cambia esta sección). */
  source: FuenteCanal;
  value: string;
  label: string;
  help: string;
  button_text: string;
  /** WhatsApp: mensaje que queda escrito en el chat del cliente. */
  message: string;
  /** Canal propio: a dónde lleva el botón (https, tel:, mailto: o una ruta del sitio). */
  url: string;
}

export const TIPOS_CANAL: readonly TipoCanal[] = ['whatsapp', 'phone', 'email', 'address', 'custom'];

const TEXTOS_CANAL: Record<TipoCanal, { label: string; help: string; button_text: string }> = {
  whatsapp: { label: 'WhatsApp', help: 'La forma más rápida de hablar con nosotros', button_text: 'Escribir por WhatsApp' },
  phone: { label: 'Teléfono', help: 'En nuestro horario de atención', button_text: 'Llamar' },
  email: { label: 'Correo', help: 'Para cotizaciones y facturas', button_text: 'Escribir correo' },
  address: { label: 'Dirección', help: 'Sede principal', button_text: 'Cómo llegar' },
  custom: { label: 'Otro canal', help: '', button_text: 'Abrir' },
};

export const MENSAJE_WHATSAPP_CONTACTO = 'Hola, vengo de la página de contacto';

export function canalPorDefecto(type: TipoCanal, id?: string): CanalContacto {
  const t = TEXTOS_CANAL[type];
  return {
    id: id ?? type,
    type,
    visible: true,
    source: type === 'custom' ? 'own' : 'org',
    value: '',
    label: t.label,
    help: t.help,
    button_text: t.button_text,
    message: type === 'whatsapp' ? MENSAJE_WHATSAPP_CONTACTO : '',
    url: '',
  };
}

export const CANALES_POR_DEFECTO: readonly CanalContacto[] = (['whatsapp', 'phone', 'email', 'address'] as const).map((t) => canalPorDefecto(t));

export const MAX_CANALES = 8;

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** `content.channels` → canales. Ausente o vacío: los cuatro por defecto. */
export function leerCanales(valor: unknown): CanalContacto[] {
  if (!Array.isArray(valor) || valor.length === 0) return CANALES_POR_DEFECTO.map((c) => ({ ...c }));
  const vistos = new Set<string>();
  const out: CanalContacto[] = [];
  for (const item of valor) {
    if (out.length >= MAX_CANALES) break;
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const type = TIPOS_CANAL.includes(it.type as TipoCanal) ? (it.type as TipoCanal) : null;
    if (!type) continue;
    const base = canalPorDefecto(type);
    let id = texto(it.id, 40) || type;
    while (vistos.has(id)) id = `${id}-${out.length}`;
    vistos.add(id);
    out.push({
      id,
      type,
      visible: it.visible !== false,
      source: type === 'custom' ? 'own' : it.source === 'own' ? 'own' : 'org',
      value: texto(it.value, 200),
      label: typeof it.label === 'string' ? texto(it.label, 60) : base.label,
      help: typeof it.help === 'string' ? texto(it.help, 160) : base.help,
      button_text: typeof it.button_text === 'string' ? texto(it.button_text, 40) : base.button_text,
      message: typeof it.message === 'string' ? texto(it.message, 300) : base.message,
      url: texto(it.url, 400),
    });
  }
  return out;
}

/** Datos de contacto de la organización y del sitio, ya leídos por quien llama. */
export interface DatosContactoSitio {
  /** `website_settings.whatsapp_number`. */
  whatsapp?: string | null;
  /** `website_settings.contact_phone` o, si no hay, `organizations.phone`. */
  telefono?: string | null;
  /** `website_settings.contact_email` o, si no hay, `organizations.email`. */
  correo?: string | null;
  /** `organizations.address` (+ ciudad). */
  direccion?: string | null;
}

function limpio(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Datos de contacto con la precedencia de Configuración: lo del sitio (`website_settings`) primero
 * y, si falta, lo de la organización.
 */
export function datosContactoDe(
  organizacion: { phone?: unknown; email?: unknown; address?: unknown; city?: unknown } | null | undefined,
  ajustes: { whatsapp_number?: unknown; contact_phone?: unknown; contact_email?: unknown } | null | undefined,
): DatosContactoSitio {
  const direccion = limpio(organizacion?.address);
  const ciudad = limpio(organizacion?.city);
  return {
    whatsapp: limpio(ajustes?.whatsapp_number),
    telefono: limpio(ajustes?.contact_phone) ?? limpio(organizacion?.phone),
    correo: limpio(ajustes?.contact_email) ?? limpio(organizacion?.email),
    direccion: direccion ? (ciudad && !direccion.toLowerCase().includes(ciudad.toLowerCase()) ? `${direccion}, ${ciudad}` : direccion) : null,
  };
}

// ─── WhatsApp de la tienda ───────────────────────────────────────────────────────────────────

/**
 * ¿Es un celular de Colombia? 10 dígitos que empiezan por 3, con o sin el indicativo 57
 * («+57 310 395 7409», «3103957409», «573103957409»). Un fijo («(601) 745 0000») o un número con
 * otro indicativo no lo es. La regla va escrita aquí porque el contrato no importa nada (y la
 * utilidad de teléfonos, con los metadatos «min» de libphonenumber, no distingue celular de fijo).
 */
export function esCelularColombia(numero: string | null | undefined): boolean {
  if (typeof numero !== 'string') return false;
  const crudo = numero.trim();
  let d = crudo.replace(/\D/g, '');
  if (crudo.startsWith('00')) d = d.slice(2);
  const internacional = crudo.startsWith('+') || crudo.startsWith('00');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  else if (internacional) return false;
  return /^3\d{9}$/.test(d);
}

export interface WhatsappTienda {
  /** Número tal como está en Configuración (el de WhatsApp o el teléfono de contacto). */
  numero: string;
  /** `true` = no hay WhatsApp configurado y se usa el teléfono de contacto (es un celular). */
  delTelefono: boolean;
}

/**
 * WhatsApp de la tienda: el de Configuración › WhatsApp o, si no hay, el teléfono de contacto
 * cuando es un celular. `null` = no hay a dónde escribir. Es la única regla: la usan el canal
 * WhatsApp, el botón de WhatsApp por sede y «WhatsApp al terminar» del formulario.
 */
export function whatsappDeTienda(datos: DatosContactoSitio): WhatsappTienda | null {
  const propio = limpio(datos.whatsapp);
  if (propio) return { numero: propio, delTelefono: false };
  const telefono = limpio(datos.telefono);
  return telefono && esCelularColombia(telefono) ? { numero: telefono, delTelefono: true } : null;
}

/** El dato que muestra un canal: el propio o el de la organización. `null` = el canal no sale. */
export function valorDeCanal(canal: CanalContacto, datos: DatosContactoSitio): string | null {
  if (canal.source === 'own' || canal.type === 'custom') return canal.value.trim() || null;
  switch (canal.type) {
    case 'whatsapp':
      return whatsappDeTienda(datos)?.numero ?? null;
    case 'phone':
      return limpio(datos.telefono);
    case 'email':
      return limpio(datos.correo);
    case 'address':
      return limpio(datos.direccion);
    default:
      return null;
  }
}

export interface CanalConDato {
  canal: CanalContacto;
  valor: string;
}

/**
 * Canales que salen en la tienda, en su orden: los marcados «Mostrar» que tienen dato. Si el
 * WhatsApp sale con el teléfono de contacto (no hay WhatsApp configurado y el teléfono es un
 * celular), la tarjeta Teléfono con ese mismo número no se repite. Apagando el canal WhatsApp en
 * el editor, vuelve la tarjeta Teléfono con «Llamar».
 */
export function canalesConDato(canales: readonly CanalContacto[], datos: DatosContactoSitio): CanalConDato[] {
  const lista = canales
    .filter((c) => c.visible)
    .map((canal) => ({ canal, valor: valorDeCanal(canal, datos) }))
    .filter((x): x is CanalConDato => x.valor !== null);
  const whatsapp = whatsappDeTienda(datos);
  const whatsappConTelefono = whatsapp?.delTelefono === true && lista.some((x) => x.canal.type === 'whatsapp' && x.canal.source === 'org');
  return whatsappConTelefono ? lista.filter((x) => !(x.canal.type === 'phone' && x.canal.source === 'org')) : lista;
}

/** Enlace seguro de un canal propio: http(s), tel:, mailto:, wa.me o una ruta del sitio. */
export function enlaceCanalPropio(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/^(https?:\/\/|tel:|mailto:)/i.test(u)) return u;
  if (/^\/(?!\/)/.test(u)) return u;
  return null;
}

// ─── Redes sociales ──────────────────────────────────────────────────────────────────────────

export type IdRedSocial = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'x' | 'linkedin' | 'pinterest';

export const REDES_SOCIALES: readonly { id: IdRedSocial; nombre: string; claves: readonly string[]; base: string }[] = [
  { id: 'instagram', nombre: 'Instagram', claves: ['instagram'], base: 'https://instagram.com/' },
  { id: 'facebook', nombre: 'Facebook', claves: ['facebook'], base: 'https://facebook.com/' },
  { id: 'tiktok', nombre: 'TikTok', claves: ['tiktok'], base: 'https://www.tiktok.com/@' },
  { id: 'youtube', nombre: 'YouTube', claves: ['youtube'], base: 'https://www.youtube.com/@' },
  { id: 'x', nombre: 'X', claves: ['x', 'twitter'], base: 'https://x.com/' },
  { id: 'linkedin', nombre: 'LinkedIn', claves: ['linkedin'], base: 'https://www.linkedin.com/company/' },
  { id: 'pinterest', nombre: 'Pinterest', claves: ['pinterest'], base: 'https://www.pinterest.com/' },
];

export interface RedSocialSitio {
  id: IdRedSocial;
  nombre: string;
  href: string;
  /** «@tienda» o la ruta corta («/tienda»), para el editor y el modo «con nombre». */
  usuario: string;
}

/**
 * `website_settings.social_links` → redes con enlace. Acepta la URL completa o el usuario
 * («@tienda»). Lo que no es ninguno de los dos se descarta.
 */
export function redesDelSitio(socialLinks: unknown): RedSocialSitio[] {
  if (!socialLinks || typeof socialLinks !== 'object' || Array.isArray(socialLinks)) return [];
  const o = socialLinks as Record<string, unknown>;
  const out: RedSocialSitio[] = [];
  for (const red of REDES_SOCIALES) {
    const crudo = red.claves.map((k) => limpio(o[k])).find((v): v is string => v !== null);
    if (!crudo) continue;
    if (/^https?:\/\//i.test(crudo)) {
      let usuario = crudo;
      try {
        const u = new URL(crudo);
        const ruta = u.pathname.replace(/\/+$/, '');
        usuario = ruta && ruta !== '/' ? (ruta.startsWith('/@') ? ruta.slice(1) : ruta) : u.hostname;
      } catch {
        continue;
      }
      out.push({ id: red.id, nombre: red.nombre, href: crudo, usuario });
    } else {
      const handle = crudo.replace(/^@/, '');
      if (!/^[A-Za-z0-9._-]{1,60}$/.test(handle)) continue;
      out.push({ id: red.id, nombre: red.nombre, href: `${red.base}${handle}`, usuario: `@${handle}` });
    }
  }
  return out;
}

/** Redes que muestra la sección: las de `content.networks` (en ese orden) o todas las del sitio. */
export function redesDeSeccion(socialLinks: unknown, networks: unknown): RedSocialSitio[] {
  const todas = redesDelSitio(socialLinks);
  if (!Array.isArray(networks)) return todas;
  const elegidas = networks.filter((n): n is string => typeof n === 'string');
  return elegidas.map((id) => todas.find((r) => r.id === id)).filter((r): r is RedSocialSitio => !!r);
}

export type FormaRedes = 'name' | 'icon';

export function formaRedes(valor: unknown): FormaRedes {
  return valor === 'icon' ? 'icon' : 'name';
}

// ─── Formulario de contacto ──────────────────────────────────────────────────────────────────

export type TipoCampoContacto = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'consent';
export type CampoEstandar = 'name' | 'email' | 'phone' | 'subject' | 'company' | 'message';

export interface CampoContacto {
  name: string;
  label: string;
  type: TipoCampoContacto;
  required: boolean;
  options: string[];
  /** Columna estándar del CRM, o null si es un campo propio (o la casilla de datos). */
  estandar: CampoEstandar | null;
  /** «Mostrar». Nombre y correo siempre se muestran. */
  visible: boolean;
  placeholder: string;
  /** Casilla de datos: enlace a la política y su texto. */
  link_url: string;
  link_label: string;
}

const ALIAS: Record<string, CampoEstandar> = {
  name: 'name', nombre: 'name', email: 'email', correo: 'email', phone: 'phone', telefono: 'phone', 'teléfono': 'phone', celular: 'phone',
  subject: 'subject', asunto: 'subject', company: 'company', empresa: 'company', message: 'message', mensaje: 'message',
};
const TIPOS_CAMPO: readonly TipoCampoContacto[] = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'consent'];

export const NOMBRE_CASILLA_DATOS = 'consent';

/** Campos con que nace el formulario de la página Contacto (y la variante «Tarjeta con horario»). */
export const CAMPOS_CONTACTO_POR_DEFECTO: readonly Record<string, unknown>[] = [
  { name: 'name', label: 'Nombre', type: 'text', required: true, visible: true, placeholder: 'Tu nombre y apellido' },
  { name: 'email', label: 'Correo', type: 'email', required: true, visible: true, placeholder: 'tucorreo@ejemplo.com' },
  { name: 'phone', label: 'Teléfono', type: 'tel', required: false, visible: true, placeholder: '300 000 0000' },
  { name: 'subject', label: 'Asunto', type: 'select', required: false, visible: true, options: ['Un pedido', 'Garantía', 'Ventas al por mayor', 'Otro'], placeholder: 'Elige un tema' },
  { name: 'message', label: 'Mensaje', type: 'textarea', required: true, visible: true, placeholder: 'Cuéntanos en qué te podemos ayudar' },
  { name: 'company', label: 'Empresa', type: 'text', required: false, visible: false },
  { name: NOMBRE_CASILLA_DATOS, label: 'Acepto el tratamiento de mis datos según la', type: 'consent', required: true, visible: true, link_label: 'Política de privacidad', link_url: '' },
];

function opcionesDe(v: unknown): string[] {
  const lista = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : [];
  return lista
    .map((o) => (typeof o === 'string' ? o : o && typeof o === 'object' ? String((o as { label?: unknown; value?: unknown }).label ?? (o as { value?: unknown }).value ?? '') : ''))
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 30);
}

/**
 * `form_fields` → todos los campos (también los ocultos), en orden. `null` = sin campos propios
 * (la variante vieja pinta los de siempre). Nombre y correo: siempre obligatorios y visibles; si
 * faltan en la lista, van primero. La casilla de datos, si se muestra, es obligatoria.
 */
export function leerCamposContacto(valor: unknown): CampoContacto[] | null {
  if (!Array.isArray(valor)) return null;
  const vistos = new Set<string>();
  const campos: CampoContacto[] = [];
  for (const item of valor.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const label = typeof it.label === 'string' ? it.label.trim().slice(0, 80) : '';
    const name = (typeof it.name === 'string' && it.name.trim() ? it.name.trim() : label).toLowerCase().slice(0, 40);
    if (!name || vistos.has(name)) continue;
    const type = TIPOS_CAMPO.includes(it.type as TipoCampoContacto) ? (it.type as TipoCampoContacto) : 'text';
    const estandar = type === 'consent' ? null : ALIAS[name] ?? null;
    if (estandar && campos.some((c) => c.estandar === estandar)) continue;
    if (type === 'consent' && campos.some((c) => c.type === 'consent')) continue;
    vistos.add(name);
    const fija = estandar === 'name' || estandar === 'email';
    const visible = fija || it.visible !== false;
    campos.push({
      name,
      label: label || name,
      type,
      required: fija || (type === 'consent' ? visible : it.required === true),
      options: opcionesDe(it.options),
      estandar,
      visible,
      placeholder: typeof it.placeholder === 'string' ? it.placeholder.trim().slice(0, 120) : '',
      link_url: typeof it.link_url === 'string' ? it.link_url.trim().slice(0, 400) : '',
      link_label: typeof it.link_label === 'string' ? it.link_label.trim().slice(0, 80) : '',
    });
  }
  if (campos.length === 0) return null;
  const base = { options: [], visible: true, placeholder: '', link_url: '', link_label: '' };
  if (!campos.some((c) => c.estandar === 'email')) campos.unshift({ name: 'email', label: 'Email', type: 'email', required: true, estandar: 'email', ...base });
  if (!campos.some((c) => c.estandar === 'name')) campos.unshift({ name: 'name', label: 'Nombre', type: 'text', required: true, estandar: 'name', ...base });
  return campos;
}

/** Campos que se pintan: los marcados «Mostrar». */
export function camposVisibles(campos: readonly CampoContacto[]): CampoContacto[] {
  return campos.filter((c) => c.visible);
}

/**
 * Campos del formulario de una sección: los guardados o, en la variante «Tarjeta con horario»
 * sin `form_fields`, los de la página Contacto. `null` = la variante vieja con sus campos.
 */
export function camposDeSeccion(content: Record<string, unknown> | null | undefined, variante: string | null | undefined): CampoContacto[] | null {
  const guardados = leerCamposContacto(content?.form_fields);
  if (guardados) return guardados;
  return variante === VARIANTE_FORMULARIO_TARJETA ? leerCamposContacto(CAMPOS_CONTACTO_POR_DEFECTO) : null;
}

/** Lo que llega del formulario, para validar con la misma regla en el navegador y en el servidor. */
export interface ValoresContacto {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  company?: string;
  message?: string;
  /** Casilla de datos marcada. */
  consent?: boolean;
  /** Campos propios: nombre del campo → valor. */
  extra?: Record<string, string>;
}

export const CORREO_VALIDO = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/** Campos visibles obligatorios que faltan (por `name`), en el orden del formulario. */
export function camposFaltantes(campos: readonly CampoContacto[], v: ValoresContacto): string[] {
  const faltan: string[] = [];
  for (const c of camposVisibles(campos)) {
    if (!c.required) continue;
    if (c.type === 'consent') {
      if (v.consent !== true) faltan.push(c.name);
      continue;
    }
    const valor = c.estandar ? v[c.estandar] : v.extra?.[c.name];
    if (typeof valor !== 'string' || valor.trim() === '') faltan.push(c.name);
  }
  return faltan;
}

// ─── Mensaje de enviado ──────────────────────────────────────────────────────────────────────

export const TITULO_ENVIADO = '¡Mensaje enviado!';
export const TEXTO_ENVIADO = 'Gracias, {nombre}. Te respondemos a {correo} lo antes posible.';

/** Cambia {nombre} y {correo} por los datos del cliente (el primer nombre). */
export function textoConDatos(plantilla: string, datos: { nombre?: string | null; correo?: string | null }): string {
  const primerNombre = (datos.nombre ?? '').trim().split(/\s+/)[0] ?? '';
  return plantilla.replace(/\{nombre\}/g, primerNombre).replace(/\{correo\}/g, (datos.correo ?? '').trim());
}

/** «Origen en el CRM» de la sección (queda en el cliente potencial). Vacío = el de la variante. */
export function origenCrm(valor: unknown): string | null {
  const t = texto(valor, 60).replace(/[\u0000-\u001f]/g, '');
  return t || null;
}

// ─── Página Contacto por defecto ─────────────────────────────────────────────────────────────

export interface SeccionPorDefecto {
  section_type: string;
  section_variant: string;
  content: Record<string, unknown>;
}

/**
 * Secciones de la página Contacto (mismo orden que el diseño). Las usan la plantilla de página del
 * editor y la tienda cuando la organización no tiene la página por secciones. `conPreguntas` suma
 * «Preguntas frecuentes» con preguntas de ejemplo para editar (solo en el editor: la tienda no
 * publica respuestas que el dueño no escribió).
 */
export function seccionesContactoPorDefecto(opciones: { conPreguntas?: boolean } = {}): SeccionPorDefecto[] {
  const secciones: SeccionPorDefecto[] = [
    {
      section_type: 'hero',
      section_variant: VARIANTE_ENCABEZADO_PAGINA,
      content: { title: 'Hablemos', subtitle: 'Escríbenos por el canal que prefieras. Te respondemos lo antes posible.', show_breadcrumb: true },
    },
    {
      section_type: TIPO_CANALES_CONTACTO,
      section_variant: VARIANTE_CANALES_TARJETAS,
      content: { title: 'Elige cómo hablar con nosotros', subtitle: 'Todos los canales llegan al mismo equipo.' },
    },
    {
      section_type: 'contact_form',
      section_variant: VARIANTE_FORMULARIO_TARJETA,
      content: { title: 'Envíanos un mensaje', subtitle: 'Déjanos tus datos y te respondemos al correo o por WhatsApp.', anchor_id: 'formulario' },
    },
    {
      section_type: 'hours_location',
      section_variant: 'hours_map',
      content: { eyebrow: '', title: 'Nuestras sedes', show_whatsapp: true, show_reserve: false, show_order: false },
    },
  ];
  if (opciones.conPreguntas) {
    secciones.push({
      section_type: 'faq',
      section_variant: 'two_columns',
      content: {
        title: 'Preguntas frecuentes',
        subtitle: '¿No encuentras tu respuesta? Escríbenos por WhatsApp o con el formulario.',
        items: [
          { question: '¿Cuánto tardan en responder?', answer: 'Respondemos los mensajes del formulario y de WhatsApp en nuestro horario de atención.' },
          { question: '¿Puedo recoger mi pedido en una sede?', answer: 'Escríbenos y te contamos en qué sedes puedes recogerlo.' },
        ],
      },
    });
  }
  secciones.push({
    section_type: TIPO_REDES_SOCIALES,
    section_variant: VARIANTE_REDES_FILA,
    content: { title: 'Síguenos en redes', subtitle: '' },
  });
  return secciones;
}

// ─── Claves (contrato editor ↔ sitio) ────────────────────────────────────────────────────────

export const CLAVES_CANALES = ['title', 'subtitle', 'channels', 'show_help', 'whatsapp_primary'] as const;
export const CLAVES_REDES = ['title', 'subtitle', 'networks', 'display'] as const;
/** Claves nuevas de `contact_form` (las de antes siguen donde estaban). */
export const CLAVES_FORMULARIO_V2 = [
  'button_text', 'show_privacy_note', 'success_title', 'success_text', 'whatsapp_after', 'show_hours',
  'show_order_card', 'show_contact_info', 'two_columns', 'title_align', 'form_in_card', 'anchor_id', 'crm_source',
] as const;
/** Claves nuevas de `hero` · `page_header`. */
export const CLAVES_ENCABEZADO_PAGINA = ['show_breadcrumb', 'badges', 'image_url', 'title', 'subtitle'] as const;
/** Claves nuevas de `hours_location`. */
export const CLAVES_SEDES_V2 = ['featured_branch_id', 'show_whatsapp'] as const;
