/**
 * Textos legales deterministas y la validación de lo que devuelva la IA.
 * Sin red ni base: si falta un dato, se omite la frase que lo usa.
 */
import type { ClaveLegal } from '@/lib/website/configuracionSitio';

export const VERSION_PLANTILLA_LEGAL = '2026-10-22';
export const MIN_TEXTO_LEGAL = 80;

export interface DatosLegales {
  legalName: string | null;
  name: string | null;
  nit: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  dominio: string | null;
  envioTarifa: string | null;
  envioGratisDesde: string | null;
  envioActivo: boolean;
  tiposEntrega: string[];
  vigencia: string;
}

export interface ResultadoPlantilla {
  body: string;
  origen: 'ia' | 'plantilla';
  faltantes: string[];
  plantillaVersion: string;
  hashGenerado: string;
}

const ETIQUETAS = new Set(['h2', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br']);

export function datosVacios(vigencia = '2026-10-22'): DatosLegales {
  return {
    legalName: null,
    name: null,
    nit: null,
    address: null,
    city: null,
    state: null,
    country: 'Colombia',
    email: null,
    phone: null,
    whatsapp: null,
    dominio: null,
    envioTarifa: null,
    envioGratisDesde: null,
    envioActivo: false,
    tiposEntrega: [],
    vigencia,
  };
}

export function nombreDe(d: DatosLegales): string | null {
  const n = (d.legalName || d.name || '').trim();
  return n || null;
}

export function hashTexto(texto: string): string {
  let h = 2166136261;
  for (const c of texto.normalize('NFC').trim()) {
    const cp = c.codePointAt(0) ?? 0;
    h ^= cp;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function textoPlano(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function caracteresLegales(contenido: Record<string, unknown> | null | undefined): number {
  if (!contenido) return 0;
  const html = String(contenido.body ?? contenido.content ?? '');
  return textoPlano(html).length;
}

/** Quita lo que no sea HTML simple. No inventa texto. */
export function sanitizarHtmlLegal(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (todo, tag: string, attrs: string | undefined) => {
    const nombre = tag.toLowerCase();
    if (!ETIQUETAS.has(nombre)) return '';
    const cierre = todo.startsWith('</');
    if (cierre || nombre === 'br') return nombre === 'br' ? '<br>' : `<${cierre ? '/' : ''}${nombre}>`;
    if (nombre === 'a') {
      const href = /href\s*=\s*"(https?:\/\/[^"]+|mailto:[^"]+)"/i.exec(attrs ?? '');
      return href ? `<a href="${href[1]}">` : '<a>';
    }
    return `<${nombre}>`;
  });
  return s.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
}

const MENCIONES: Record<ClaveLegal, RegExp[]> = {
  terminos: [/t[eé]rminos/i, /condiciones/i],
  privacidad: [/privacidad/i, /datos/i],
  tratamiento: [/1581/, /1377/, /10\)?\s*d[ií]as/i, /15\)?\s*d[ií]as/i],
  envios: [/env[ií]o/i, /entrega/i],
  devoluciones: [/1480/, /retracto|art[ií]culo\s*47/i, /reversi[oó]n|587|art[ií]culo\s*51/i],
  cookies: [/cookie/i],
};

export function salidaValida(clave: ClaveLegal, html: string): boolean {
  const plano = textoPlano(html);
  if (plano.length < MIN_TEXTO_LEGAL) return false;
  if (html.includes('{{') || /\bundefined\b/.test(html)) return false;
  return MENCIONES[clave].every((r) => r.test(plano));
}

function presente(k: keyof DatosLegales, datos: DatosLegales): boolean {
  if (k === 'legalName' || k === 'name') return nombreDe(datos) !== null;
  const v = datos[k];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return v;
  return v != null && String(v).trim() !== '';
}

type Trozo = { html: string; requiere?: (keyof DatosLegales)[]; omitirSi?: (keyof DatosLegales)[] };

function juntar(trozos: Trozo[], datos: DatosLegales): { body: string; faltantes: string[] } {
  const faltantes = new Set<string>();
  const partes: string[] = [];
  for (const t of trozos) {
    if ((t.omitirSi ?? []).some((k) => presente(k, datos))) continue;
    const falta = (t.requiere ?? []).filter((k) => !presente(k, datos));
    if (falta.length) {
      falta.forEach((k) => faltantes.add(k));
      continue;
    }
    let html = t.html;
    const mapa: Record<string, string> = {
      nombre: nombreDe(datos) ?? '',
      nit: datos.nit ?? '',
      direccion: [datos.address, datos.city, datos.state].filter(Boolean).join(', '),
      correo: datos.email ?? '',
      telefono: datos.phone ?? '',
      whatsapp: datos.whatsapp ?? '',
      dominio: datos.dominio ?? '',
      tarifa: datos.envioTarifa ?? '',
      gratis: datos.envioGratisDesde ?? '',
      tipos: datos.tiposEntrega.join(', '),
      vigencia: datos.vigencia,
      pais: datos.country || 'Colombia',
    };
    for (const [k, v] of Object.entries(mapa)) html = html.replaceAll(`{${k}}`, v);
    if (html.includes('{') || html.includes('undefined')) continue;
    partes.push(html);
  }
  return { body: sanitizarHtmlLegal(partes.join('')), faltantes: [...faltantes] };
}

function comun(titulo: string, datos: DatosLegales): Trozo[] {
  // El dato viaja en los trozos (`requiere`); aquí solo se nombra para el tipo.
  if (datos.vigencia.length < 0) return [];
  return [
    { html: `<h2>${titulo}</h2>` },
    { html: '<p>Responsable: {nombre}, identificado con NIT {nit}.</p>', requiere: ['name', 'nit'] },
    { html: '<p>Responsable: {nombre}.</p>', requiere: ['name'], omitirSi: ['nit'] },
    { html: '<p>Domicilio: {direccion}, {pais}.</p>', requiere: ['address'] },
    { html: '<p>Canal de contacto: {correo}.</p>', requiere: ['email'] },
    { html: '<p>Teléfono: {telefono}.</p>', requiere: ['phone'] },
    { html: '<p>WhatsApp: {whatsapp}.</p>', requiere: ['whatsapp'] },
    { html: '<p>Sitio: {dominio}.</p>', requiere: ['dominio'] },
    { html: '<p>Vigencia desde el {vigencia}. Esta política se actualiza cuando cambian los datos del negocio o la ley aplicable en Colombia.</p>' },
  ];
}

function trozosDe(clave: ClaveLegal, datos: DatosLegales): Trozo[] {
  if (clave === 'tratamiento') {
    return [
      ...comun('Política de tratamiento de datos personales', datos),
      { html: '<p>Esta política se expide en cumplimiento de la Ley 1581 de 2012 y del Decreto 1377 de 2013. El responsable del tratamiento es quien figura arriba, o el titular del sitio si aún no registró su razón social.</p>' },
      { html: '<p>Finalidades: gestionar la compra o la reserva, el pago, el envío o la prestación del servicio, la atención de peticiones y el envío de información comercial solo con autorización previa.</p>' },
      { html: '<p>Derechos del titular: conocer, actualizar, rectificar y suprimir sus datos, y revocar la autorización, salvo que exista un deber legal o contractual de conservarlos.</p>' },
      { html: '<p>Las consultas se atienden en un máximo de diez (10) días hábiles y los reclamos en un máximo de quince (15) días hábiles, contados desde el día siguiente al recibo por el canal de contacto.</p>' },
      { html: '<p>No se venden datos personales. Solo se comparten con encargados que prestan pago, mensajería o soporte, y con autoridades cuando la ley lo exige.</p>' },
    ];
  }
  if (clave === 'devoluciones') {
    return [
      ...comun('Cambios, devoluciones y garantías', datos),
      { html: '<p>Se aplica la Ley 1480 de 2011 (Estatuto del Consumidor). La garantía legal de los artículos 7 y 8 cubre la idoneidad y la calidad del producto o servicio.</p>' },
      { html: '<p>En ventas a distancia o por internet, el retracto del artículo 47 puede ejercerse dentro de los cinco (5) días hábiles siguientes a la entrega, cuando la ley lo permita y el bien no sea de los exceptuados.</p>' },
      { html: '<p>La reversión del pago del artículo 51, reglamentada por el Decreto 587 de 2016, procede cuando se cumplen los supuestos de la norma y se presenta la queja por el canal indicado.</p>' },
      { html: '<p>Para iniciar un cambio o una devolución escribe al canal de contacto con el número del pedido y el motivo.</p>' },
    ];
  }
  if (clave === 'envios') {
    return [
      ...comun('Política de envíos', datos),
      { html: '<p>Tipos de entrega disponibles: {tipos}.</p>', requiere: ['tiposEntrega'] },
      { html: '<p>El costo fijo de envío es {tarifa}, salvo promociones vigentes.</p>', requiere: ['envioTarifa'] },
      { html: '<p>El envío es gratis a partir de {gratis}.</p>', requiere: ['envioGratisDesde'] },
      { html: '<p>Los plazos dependen del destino y del transportador. El pedido sale cuando el pago queda confirmado.</p>' },
      { html: '<p>Si el envío no está habilitado en la tienda, la entrega se acuerda por el canal de contacto.</p>', omitirSi: ['envioActivo'] },
    ];
  }
  if (clave === 'privacidad') {
    return [
      ...comun('Política de privacidad', datos),
      { html: '<p>Recogemos los datos que nos das al comprar, reservar o escribirnos: identificación de contacto, dirección de entrega y el detalle del pedido.</p>' },
      { html: '<p>Los usamos para prestar el servicio, cobrar, entregar y atender reclamos. La política de tratamiento de datos (Ley 1581 de 2012) complementa este texto.</p>' },
      { html: '<p>Puedes pedir acceso, corrección o supresión por el canal de contacto. Conservamos la información el tiempo que exijan la contabilidad y la ley.</p>' },
    ];
  }
  if (clave === 'cookies') {
    return [
      ...comun('Política de cookies', datos),
      { html: '<p>El sitio usa cookies técnicas necesarias para el carrito, la sesión y la seguridad. No son opcionales si quieres comprar.</p>' },
      { html: '<p>Las cookies de medición o publicidad solo se activan si el negocio configuró un píxel y tú no las bloqueas en el navegador.</p>' },
      { html: '<p>Puedes borrar las cookies desde la configuración de tu navegador. El sitio sigue funcionando, aunque el carrito puede vaciarse.</p>' },
    ];
  }
  return [
    ...comun('Términos y condiciones', datos),
    { html: '<p>Estos términos regulan el uso del sitio y la compra o reserva de productos y servicios. Al pagar, aceptas el precio, la disponibilidad y estas condiciones.</p>' },
    { html: '<p>Los precios se muestran en la moneda de la tienda e incluyen los impuestos que la ley obliga a discriminar. El pedido se confirma cuando el pago es aceptado.</p>' },
    { html: '<p>La garantía, el retracto y la reversión del pago se rigen por la Ley 1480 de 2011 y por la página de cambios y devoluciones.</p>' },
    { html: '<p>El tratamiento de datos personales se rige por la Ley 1581 de 2012 y por la política de tratamiento publicada en este sitio.</p>' },
  ];
}

export function plantillaLegal(clave: ClaveLegal, datos: DatosLegales): ResultadoPlantilla {
  const { body, faltantes } = juntar(trozosDe(clave, datos), datos);
  const seguro = salidaValida(clave, body) ? body : sanitizarHtmlLegal(body);
  return {
    body: seguro,
    origen: 'plantilla',
    faltantes,
    plantillaVersion: VERSION_PLANTILLA_LEGAL,
    hashGenerado: hashTexto(seguro),
  };
}

/**
 * Aplica un HTML ya decidido (el que vio la persona en el diff) sin volver a
 * llamar a la IA. Si no pasa el sanitizador, queda la plantilla.
 */
export function aplicarHtml(clave: ClaveLegal, datos: DatosLegales, html: string | null, origen: 'ia' | 'plantilla'): ResultadoPlantilla {
  const base = plantillaLegal(clave, datos);
  if (!html) return base;
  const limpio = sanitizarHtmlLegal(html);
  if (!salidaValida(clave, limpio)) return base;
  return { ...base, body: limpio, origen, hashGenerado: hashTexto(limpio) };
}

/** IA si el HTML pasa el sanitizador y las menciones; si no, la plantilla. */
export function elegirDocumento(clave: ClaveLegal, datos: DatosLegales, htmlIa: string | null): ResultadoPlantilla {
  const base = plantillaLegal(clave, datos);
  if (!htmlIa) return base;
  const limpio = sanitizarHtmlLegal(htmlIa);
  if (!salidaValida(clave, limpio)) return base;
  return { ...base, body: limpio, origen: 'ia', hashGenerado: hashTexto(limpio) };
}

export function metaLegal(clave: ClaveLegal, resultado: ResultadoPlantilla, ahoraIso: string) {
  return {
    clave,
    origen: resultado.origen,
    plantillaVersion: resultado.plantillaVersion,
    hashGenerado: resultado.hashGenerado,
    generadoEn: ahoraIso,
    editadoEn: null as string | null,
  };
}

const ETIQUETA_DATO: Record<string, string> = {
  name: 'Razón social',
  nit: 'NIT',
  address: 'Dirección',
  email: 'Correo',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
  dominio: 'Dominio del sitio',
  envioTarifa: 'Costo de envío',
  envioGratisDesde: 'Envío gratis desde',
  tiposEntrega: 'Tipos de entrega',
};

/** Lo que el diálogo enseña: datos con valor y los que faltan, con nombre legible. */
export function vistaDeDatos(datos: DatosLegales): { usados: { etiqueta: string; valor: string }[]; faltantes: string[] } {
  const filas: { clave: string; valor: string | null }[] = [
    { clave: 'name', valor: nombreDe(datos) },
    { clave: 'nit', valor: datos.nit },
    { clave: 'address', valor: [datos.address, datos.city, datos.state].filter(Boolean).join(', ') || null },
    { clave: 'email', valor: datos.email },
    { clave: 'phone', valor: datos.phone },
    { clave: 'whatsapp', valor: datos.whatsapp },
    { clave: 'dominio', valor: datos.dominio },
    { clave: 'envioTarifa', valor: datos.envioTarifa },
    { clave: 'envioGratisDesde', valor: datos.envioGratisDesde },
    { clave: 'tiposEntrega', valor: datos.tiposEntrega.length ? datos.tiposEntrega.join(', ') : null },
  ];
  return {
    usados: filas.filter((f) => f.valor).map((f) => ({ etiqueta: ETIQUETA_DATO[f.clave] ?? f.clave, valor: f.valor as string })),
    faltantes: filas.filter((f) => !f.valor).map((f) => ETIQUETA_DATO[f.clave] ?? f.clave),
  };
}

export function fueEditado(contenido: Record<string, unknown> | null | undefined): boolean {
  const plano = textoPlano(String(contenido?.body ?? contenido?.content ?? ''));
  const legal = contenido?.legal;
  if (!legal || typeof legal !== 'object') return plano.length >= MIN_TEXTO_LEGAL;
  const hash = (legal as { hashGenerado?: unknown }).hashGenerado;
  const editado = (legal as { editadoEn?: unknown }).editadoEn;
  if (typeof editado === 'string' && editado) return true;
  if (typeof hash !== 'string') return plano.length >= MIN_TEXTO_LEGAL;
  return hashTexto(String(contenido?.body ?? contenido?.content ?? '')) !== hash;
}
