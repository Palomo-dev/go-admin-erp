/**
 * «Configuración del sitio» (Figma B/12-01…12-06): contratos y lógica pura que
 * comparten el route handler (`/api/sitio-web/configuracion`), el hook
 * `useConfiguracionSitio` y los tests. Sin dependencias de ejecución.
 *
 * Qué vive dónde (B/12-05 y la decisión de arquitectura):
 * - Nombre, logo y favicon → identidad del BORRADOR V2 (`useSitioV2`): se ven al
 *   publicar, igual que en Diseño › Logo y favicon (mismo dato, mismo componente).
 * - Correo, teléfono y WhatsApp del sitio, chat, idioma, mantenimiento y código a
 *   medida → `website_settings` por `update_website_settings` (efecto inmediato).
 * - Redes sociales → SEO y redes; píxeles → Analítica; horario y dirección → la
 *   sucursal (solo lectura). Aquí no se editan.
 */
import { z } from 'zod';

/** Secciones del formulario, en el orden del índice lateral (B/12-01). */
export const SECCIONES_CONFIGURACION = ['datos', 'legales', 'codigo', 'chat', 'idioma', 'mantenimiento', 'peligro'] as const;
export type SeccionConfiguracion = (typeof SECCIONES_CONFIGURACION)[number];

/** Idiomas que el sitio público sabe pintar (CHECK `website_settings_site_locale_valido`). */
export const IDIOMAS_SITIO = ['es-CO', 'en', 'fr', 'pt'] as const;
export type IdiomaSitio = (typeof IDIOMAS_SITIO)[number];

/** Columnas de la migración pendiente 20261008150000 que esta pantalla necesita. */
export const FUNCIONES_PENDIENTES = ['contacto', 'idioma', 'mantenimiento', 'codigo', 'eliminar'] as const;
export type FuncionPendiente = (typeof FUNCIONES_PENDIENTES)[number];

export type PosicionCodigo = 'head' | 'body';

/** Un bloque de código a medida (B/12-01 «Código y píxeles»). Autor y fecha los sella el servidor. */
export interface CodigoMedida {
  /** `null` = nuevo (aún sin guardar). */
  id: string | null;
  nombre: string;
  /** `todas` o una ruta («/gracias»). */
  alcance: string;
  posicion: PosicionCodigo;
  activo: boolean;
  codigo: string;
  autor: string | null;
  creadoEn: string | null;
  /** Viene de `custom_scripts` (texto libre anterior): solo lectura. */
  legado?: boolean;
}

/** Los documentos legales que pide la ley colombiana (Ley 1480 y 1581), en el orden de B/12-01. */
export const DOCUMENTOS_LEGALES = [
  { clave: 'terminos', slug: 'terminos', titulo: 'Términos y condiciones', slugs: ['terminos', 'terminos-y-condiciones'], obligatorio: true },
  { clave: 'privacidad', slug: 'privacidad', titulo: 'Política de privacidad', slugs: ['privacidad', 'politica-de-privacidad', 'politica-privacidad'], obligatorio: true },
  {
    clave: 'tratamiento',
    slug: 'tratamiento-de-datos',
    titulo: 'Política de tratamiento de datos (Ley 1581)',
    slugs: ['tratamiento-de-datos', 'politica-tratamiento-datos', 'politica-de-tratamiento-de-datos'],
    obligatorio: true,
  },
  { clave: 'cookies', slug: 'cookies', titulo: 'Política de cookies', slugs: ['cookies', 'politica-de-cookies'], obligatorio: false },
  { clave: 'devoluciones', slug: 'cambios-y-devoluciones', titulo: 'Cambios y devoluciones', slugs: ['cambios-y-devoluciones', 'devoluciones'], obligatorio: false },
] as const;
export type ClaveLegal = (typeof DOCUMENTOS_LEGALES)[number]['clave'];

/** Lo mínimo de una fila de Páginas para decidir el estado de un documento legal. */
export interface PaginaLegalFila {
  id: string;
  slug: string;
  titulo: string;
  publicada: boolean;
  /** `publicado` | `cambios` | `sin_publicar` (vistaPaginas). */
  estado: 'publicado' | 'cambios' | 'sin_publicar';
  actualizadaEn: string | null;
}

export type EstadoLegal = 'publicado' | 'borrador' | 'falta';

export interface DocumentoLegalVista {
  clave: ClaveLegal;
  titulo: string;
  slug: string;
  estado: EstadoLegal;
  paginaId: string | null;
  fecha: string | null;
}

/** Estado de cada documento legal a partir de las páginas del sitio (fuente única: Páginas). */
export function documentosLegales(paginas: readonly PaginaLegalFila[]): DocumentoLegalVista[] {
  return DOCUMENTOS_LEGALES.map((d) => {
    const pagina = paginas.find((p) => (d.slugs as readonly string[]).includes(p.slug));
    if (!pagina) return { clave: d.clave, titulo: d.titulo, slug: d.slug, estado: 'falta', paginaId: null, fecha: null };
    const estado: EstadoLegal = pagina.publicada && pagina.estado === 'publicado' ? 'publicado' : 'borrador';
    return { clave: d.clave, titulo: d.titulo, slug: d.slug, estado, paginaId: pagina.id, fecha: pagina.actualizadaEn };
  });
}

/** La política de tratamiento de datos (Ley 1581) es requisito del agente de voz y de los formularios del CRM. */
export function faltaTratamientoDatos(docs: readonly DocumentoLegalVista[]): boolean {
  return docs.some((d) => d.clave === 'tratamiento' && d.estado !== 'publicado');
}

/** Respuesta de `GET /api/sitio-web/configuracion`. */
export interface RespuestaConfiguracion {
  permisos: { editar: boolean; publicar: boolean };
  host: string | null;
  subdominio: string | null;
  /** Datos de Organización › Información para «Usar datos de la organización». */
  organizacion: { nombre: string; logoUrl: string | null; correo: string | null; telefono: string | null };
  ajustes: {
    correo: string | null;
    telefono: string | null;
    whatsapp: string | null;
    saludoWhatsapp: string | null;
    chatActivo: boolean;
    idioma: IdiomaSitio;
    mantenimiento: boolean;
    mensajeMantenimiento: string | null;
    codigo: CodigoMedida[];
    publicado: boolean;
    publicadoEn: string | null;
  };
  /** Módulo Chat contratado y activo (`organization_modules`). */
  moduloChat: boolean;
  /** Giro restaurante (mismo criterio que la Carta): muestra el enlace a Reservas web. */
  esRestaurante?: boolean;
  /** Moneda base (`organization_currencies.is_base`) y las demás de la organización, solo lectura. */
  monedas: { base: string | null; todas: string[] };
  /** Lo que aún no se puede editar porque falta la migración 20261008150000. */
  pendientes: FuncionPendiente[];
}

/** Lo editable del formulario (un solo estado sucio para toda la página). */
export interface FormularioConfiguracion {
  nombre: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  correo: string;
  telefono: string;
  whatsapp: string;
  saludoWhatsapp: string;
  chatActivo: boolean;
  idioma: IdiomaSitio;
  mantenimiento: boolean;
  codigo: CodigoMedida[];
}

const IDENTIDAD = ['nombre', 'logoUrl', 'faviconUrl'] as const;
const AJUSTES = ['correo', 'telefono', 'whatsapp', 'saludoWhatsapp', 'chatActivo', 'idioma', 'mantenimiento', 'codigo'] as const;

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Campos que cambiaron (para el contador «3 cambios» de la SettingsSaveBar). */
export function camposCambiados(original: FormularioConfiguracion, actual: FormularioConfiguracion): (keyof FormularioConfiguracion)[] {
  return ([...IDENTIDAD, ...AJUSTES] as (keyof FormularioConfiguracion)[]).filter((k) => !igual(original[k], actual[k]));
}

/** Cuenta cada bloque de código como un cambio aparte (añadir, editar, quitar, interruptor). */
export function contarCambios(original: FormularioConfiguracion, actual: FormularioConfiguracion): number {
  let n = 0;
  for (const k of camposCambiados(original, actual)) {
    if (k !== 'codigo') {
      n += 1;
      continue;
    }
    const ids = new Set([...original.codigo, ...actual.codigo].map((c, i) => c.id ?? `nuevo-${i}`));
    for (const id of ids) {
      const a = original.codigo.find((c) => c.id === id);
      const b = actual.codigo.find((c) => c.id === id);
      if (!igual(a, b)) n += 1;
    }
    n += actual.codigo.filter((c) => c.id === null).length;
  }
  return n;
}

/** ¿Hay que escribir en el borrador V2 (identidad)? */
export function cambiaIdentidad(original: FormularioConfiguracion, actual: FormularioConfiguracion): boolean {
  return IDENTIDAD.some((k) => !igual(original[k], actual[k]));
}

/** Parche de `website_settings` (claves de la lista blanca de `update_website_settings`). */
export function parcheAjustes(original: FormularioConfiguracion, actual: FormularioConfiguracion): CambiosConfiguracion {
  const p: CambiosConfiguracion = {};
  if (original.correo !== actual.correo) p.correo = actual.correo.trim();
  if (original.telefono !== actual.telefono) p.telefono = actual.telefono.trim();
  if (original.whatsapp !== actual.whatsapp) p.whatsapp = actual.whatsapp.trim();
  if (original.saludoWhatsapp !== actual.saludoWhatsapp) p.saludoWhatsapp = actual.saludoWhatsapp.trim();
  if (original.chatActivo !== actual.chatActivo) p.chatActivo = actual.chatActivo;
  if (original.idioma !== actual.idioma) p.idioma = actual.idioma;
  if (original.mantenimiento !== actual.mantenimiento) p.mantenimiento = actual.mantenimiento;
  if (!igual(original.codigo, actual.codigo)) {
    p.codigo = actual.codigo
      .filter((c) => !c.legado)
      .map((c) => ({ id: c.id, nombre: c.nombre, alcance: c.alcance, posicion: c.posicion, activo: c.activo, codigo: c.codigo }));
  }
  return p;
}

const textoContacto = (max: number) => z.string().trim().max(max);

/** Cuerpo de `PUT /api/sitio-web/configuracion`. */
export const esquemaCambiosConfiguracion = z
  .object({
    correo: z.union([z.literal(''), z.string().trim().email().max(254)]).optional(),
    telefono: textoContacto(40).optional(),
    whatsapp: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+\d\s()-]*$/, 'whatsapp_invalido')
      .optional(),
    saludoWhatsapp: textoContacto(200).optional(),
    chatActivo: z.boolean().optional(),
    idioma: z.enum(IDIOMAS_SITIO).optional(),
    mantenimiento: z.boolean().optional(),
    codigo: z
      .array(
        z
          .object({
            id: z.string().uuid().nullable(),
            nombre: z.string().trim().min(1).max(80),
            alcance: z
              .string()
              .trim()
              .max(200)
              .regex(/^(todas|\/[\w\-/]*)$/, 'alcance_invalido'),
            posicion: z.enum(['head', 'body']),
            activo: z.boolean(),
            codigo: z.string().min(1).max(20000),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();
export type CambiosConfiguracion = z.input<typeof esquemaCambiosConfiguracion>;

/** Traduce el parche de la API a las columnas de `website_settings` (lista blanca de la RPC). */
export function columnasDeCambios(c: z.output<typeof esquemaCambiosConfiguracion>): Record<string, unknown> {
  const fila: Record<string, unknown> = {};
  if (c.correo !== undefined) fila.contact_email = c.correo || null;
  if (c.telefono !== undefined) fila.contact_phone = c.telefono || null;
  if (c.whatsapp !== undefined) fila.whatsapp_number = c.whatsapp || null;
  if (c.saludoWhatsapp !== undefined) fila.whatsapp_greeting = c.saludoWhatsapp || null;
  if (c.chatActivo !== undefined) fila.chat_widget_enabled = c.chatActivo;
  if (c.idioma !== undefined) fila.site_locale = c.idioma;
  if (c.mantenimiento !== undefined) fila.maintenance_mode = c.mantenimiento;
  if (c.codigo !== undefined) fila.custom_code = c.codigo;
  return fila;
}

/** Qué función pendiente necesita cada columna (para responder 409 con un motivo claro). */
export function funcionDeColumna(columna: string): FuncionPendiente | null {
  if (['contact_email', 'contact_phone', 'whatsapp_number', 'whatsapp_greeting'].includes(columna)) return 'contacto';
  if (columna === 'site_locale') return 'idioma';
  if (columna === 'maintenance_mode' || columna === 'maintenance_message') return 'mantenimiento';
  if (columna === 'custom_code') return 'codigo';
  return null;
}

/** Formulario inicial a partir del GET y de la identidad del borrador. */
export function formularioInicial(
  r: RespuestaConfiguracion,
  identidad: { nombre: string | null; logoUrl: string | null; faviconUrl: string | null },
): FormularioConfiguracion {
  return {
    nombre: identidad.nombre ?? '',
    logoUrl: identidad.logoUrl,
    faviconUrl: identidad.faviconUrl,
    correo: r.ajustes.correo ?? '',
    telefono: r.ajustes.telefono ?? '',
    whatsapp: r.ajustes.whatsapp ?? '',
    saludoWhatsapp: r.ajustes.saludoWhatsapp ?? '',
    chatActivo: r.ajustes.chatActivo,
    idioma: r.ajustes.idioma,
    mantenimiento: r.ajustes.mantenimiento,
    codigo: r.ajustes.codigo,
  };
}

/** «Primera vez» (B/12-04 vacío): sin nombre, sin logo y sin contacto propio. */
export function esPrimeraVez(f: FormularioConfiguracion): boolean {
  return !f.nombre.trim() && !f.logoUrl && !f.correo.trim() && !f.telefono.trim();
}

/** Precarga «Usar datos de la organización» SIN guardar (queda sucio hasta la barra). */
export function conDatosDeOrganizacion(f: FormularioConfiguracion, org: RespuestaConfiguracion['organizacion']): FormularioConfiguracion {
  return {
    ...f,
    nombre: f.nombre.trim() || org.nombre,
    logoUrl: f.logoUrl ?? org.logoUrl,
    correo: f.correo.trim() || (org.correo ?? ''),
    telefono: f.telefono.trim() || (org.telefono ?? ''),
  };
}

export interface ErroresFormulario {
  nombre?: 'requerido';
  correo?: 'invalido' | 'requerido';
  whatsapp?: 'invalido';
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validación local (la misma regla que el esquema del servidor). */
export function validarFormulario(f: FormularioConfiguracion, contactoDisponible: boolean): ErroresFormulario {
  const e: ErroresFormulario = {};
  if (!f.nombre.trim()) e.nombre = 'requerido';
  if (contactoDisponible) {
    if (!f.correo.trim()) e.correo = 'requerido';
    else if (!CORREO.test(f.correo.trim())) e.correo = 'invalido';
    if (f.whatsapp.trim() && !/^[+\d\s()-]+$/.test(f.whatsapp.trim())) e.whatsapp = 'invalido';
  }
  return e;
}

/** Resúmenes de cada fila en móvil (B/12-03). Devuelven datos; el texto lo arma la vista. */
export interface ResumenSeccion {
  seccion: SeccionConfiguracion;
  /** Clave de texto y valores para interpolar. */
  clave: string;
  valores?: Record<string, string | number>;
  /** «Falta» en rojo junto a Legales. */
  falta?: boolean;
}

export function resumenSecciones(
  f: FormularioConfiguracion,
  docs: readonly DocumentoLegalVista[] | null,
  extra: { publicado: boolean; moneda: string | null },
): ResumenSeccion[] {
  const faltan = docs ? docs.filter((d) => d.estado === 'falta').length : 0;
  const activos = f.codigo.filter((c) => c.activo).length;
  const datos = [f.nombre.trim(), f.correo.trim()].filter(Boolean).join(' · ');
  return [
    { seccion: 'datos', clave: datos ? 'movil.resumen.datos' : 'movil.resumen.datosVacio', valores: { datos } },
    docs === null
      ? { seccion: 'legales', clave: 'movil.resumen.legalesCargando' }
      : faltan > 0
        ? { seccion: 'legales', clave: faltan === 1 ? 'movil.resumen.legalesFalta' : 'movil.resumen.legalesFaltan', valores: { n: faltan }, falta: true }
        : { seccion: 'legales', clave: 'movil.resumen.legalesCompletos' },
    {
      seccion: 'codigo',
      clave: activos === 0 ? 'movil.resumen.codigoNinguno' : activos === 1 ? 'movil.resumen.codigoUno' : 'movil.resumen.codigoVarios',
      valores: { n: activos },
    },
    { seccion: 'chat', clave: f.chatActivo ? 'movil.resumen.activo' : 'movil.resumen.inactivo' },
    { seccion: 'idioma', clave: 'movil.resumen.idioma', valores: { idioma: f.idioma, moneda: extra.moneda ?? '' } },
    {
      seccion: 'mantenimiento',
      clave: f.mantenimiento ? 'movil.resumen.enConstruccion' : extra.publicado ? 'movil.resumen.publicado' : 'movil.resumen.noPublicado',
    },
    { seccion: 'peligro', clave: 'movil.resumen.peligro' },
  ];
}
