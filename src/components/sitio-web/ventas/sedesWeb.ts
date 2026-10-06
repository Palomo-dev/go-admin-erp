/**
 * «Sedes en la web» (Figma B/11-01…11-05): reglas puras que comparten el
 * servidor (`sedesWeb.server.ts`) y la pantalla. Sin React ni Supabase.
 *
 * - Dirección de una sede: `<host del sitio>/<slug>` (B/11-04 nota 3: el
 *   comodín *.goadmin.io es de un nivel; nada de sub-subdominios).
 * - Publicar una sede es un interruptor explícito; poner un dominio no la
 *   publica (B/11-04 nota 2). Publicar exige dirección (slug).
 * - El horario es de la sucursal y se LEE (B/11-04 nota 1): aquí solo se
 *   resume («Lun–Sáb 8–20 · Dom 9–14») y se calcula «Abierto hasta …» en la
 *   zona horaria de la sede.
 */

export const MODOS_SEDES = ['selector', 'per_branch'] as const;
export type ModoSedes = (typeof MODOS_SEDES)[number];

export const DIAS_SEMANA = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

export interface SegmentoHorario {
  desde: DiaSemana;
  hasta: DiaSemana;
  /** «08:00»; `null` = cerrado. */
  abre: string | null;
  cierra: string | null;
}

export interface EstadoApertura {
  abierto: boolean;
  /** Hora de cierre de hoy («20:00») si está abierto. */
  hasta: string | null;
}

export interface SedeWebFila {
  id: number;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  principal: boolean;
  publicada: boolean;
  slug: string | null;
  /** Sugerencia desde el nombre para cuando se publique sin dirección. */
  slugSugerido: string;
  fuenteStock: boolean;
  dominioPropio: { host: string; estado: string | null } | null;
  horario: SegmentoHorario[];
  apertura: EstadoApertura | null;
  latitud: number | null;
  longitud: number | null;
}

export interface RespuestaSedesWeb {
  /** `una_sede`: vacío «Tienes una sola sucursal» (B/11-03). */
  estado: 'listo' | 'una_sede';
  modo: ModoSedes;
  /** `multi_outlet_mode` aún no existe: el modo se ve pero no se guarda. */
  modoPendienteMigracion: boolean;
  host: string | null;
  sedes: SedeWebFila[];
  sedePrincipal: string | null;
  permisos: { editar: boolean; publicar: boolean };
}

export interface CambioSede {
  id: number;
  publicada: boolean;
  slug: string | null;
  fuenteStock: boolean;
}

export interface CambiosSedes {
  modo?: ModoSedes;
  sedes: CambioSede[];
}

// ─── Dirección ───────────────────────────────────────────────────────────────

const PATRON_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG = 60;

/**
 * Rutas que el sitio público ya usa: una sede con esa dirección las taparía.
 * (El resolvedor de goadmin-websites debe respetar la misma lista.)
 */
export const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  'api', 'admin', 'checkout', 'carrito', 'cart', 'producto', 'productos', 'categoria', 'categorias', 'tienda',
  'tracking', 'rastreo', 'cuenta', 'account', 'buscar', 'search', 'pedido', 'pedidos', 'reservar', 'reservas',
  'carta', 'menu', 'blog', 'contacto', 'legal', 'terminos', 'privacidad', 'sitemap.xml', 'robots.txt',
]);

/** «Sede Centro» → «centro»; «Bodega Sur 2» → «bodega-sur-2». */
export function slugDesdeNombre(nombre: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
  const sinPrefijo = base.replace(/^(sede|sucursal)-(?=.)/, '');
  return sinPrefijo || 'sede';
}

export function slugValido(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG && PATRON_SLUG.test(slug) && !SLUGS_RESERVADOS.has(slug);
}

/** Dirección de la sede en el sitio: «tumarca.com/centro». */
export function direccionSede(host: string | null, slug: string | null): string | null {
  if (!host || !slug) return null;
  return `${host}/${slug}`;
}

// ─── Horario ─────────────────────────────────────────────────────────────────

interface DiaCrudo {
  open?: unknown;
  close?: unknown;
  closed?: unknown;
}

function horaValida(v: unknown): string | null {
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null;
}

/** `{open, close}` del día o null si está cerrado o no hay dato. */
export function franjaDelDia(horario: unknown, dia: DiaSemana): { abre: string; cierra: string } | null {
  if (!horario || typeof horario !== 'object' || Array.isArray(horario)) return null;
  const d = (horario as Record<string, DiaCrudo | undefined>)[dia];
  if (!d || d.closed === true) return null;
  const abre = horaValida(d.open);
  const cierra = horaValida(d.close);
  return abre && cierra ? { abre, cierra } : null;
}

/** Agrupa días seguidos con la misma franja: «Lun–Sáb 08:00–20:00 · Dom cerrado». */
export function resumirHorario(horario: unknown): SegmentoHorario[] {
  if (!horario || typeof horario !== 'object' || Array.isArray(horario)) return [];
  if (!DIAS_SEMANA.some((d) => (horario as Record<string, unknown>)[d] !== undefined)) return [];
  const segmentos: SegmentoHorario[] = [];
  for (const dia of DIAS_SEMANA) {
    const f = franjaDelDia(horario, dia);
    const abre = f?.abre ?? null;
    const cierra = f?.cierra ?? null;
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.abre === abre && ultimo.cierra === cierra) ultimo.hasta = dia;
    else segmentos.push({ desde: dia, hasta: dia, abre, cierra });
  }
  return segmentos;
}

const DIA_INGLES: Record<string, DiaSemana> = {
  Monday: 'monday',
  Tuesday: 'tuesday',
  Wednesday: 'wednesday',
  Thursday: 'thursday',
  Friday: 'friday',
  Saturday: 'saturday',
  Sunday: 'sunday',
};

/** Día de la semana y hora de pared «HH:MM» de un instante en una zona. */
export function relojEnZona(ahora: Date, zona: string): { dia: DiaSemana; hora: string } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const valor = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return { dia: DIA_INGLES[valor('weekday')] ?? 'monday', hora: `${valor('hour')}:${valor('minute')}` };
}

/** «Abierto hasta 20:00» o «Cerrado ahora» con el horario y la zona de la sede. */
export function estadoApertura(horario: unknown, zona: string, ahora: Date = new Date()): EstadoApertura | null {
  if (resumirHorario(horario).length === 0) return null;
  const { dia, hora } = relojEnZona(ahora, zona);
  const f = franjaDelDia(horario, dia);
  if (!f) return { abierto: false, hasta: null };
  // Franja que cruza la medianoche (22:00–02:00): abierta desde la apertura.
  const cruza = f.cierra <= f.abre;
  const abierto = cruza ? hora >= f.abre || hora < f.cierra : hora >= f.abre && hora < f.cierra;
  return { abierto, hasta: abierto ? f.cierra : null };
}

// ─── Validación del PUT ──────────────────────────────────────────────────────

export type ErrorSedes =
  | { campo: string; motivo: 'formato' }
  | { campo: string; motivo: 'slug_invalido'; id: number }
  | { campo: string; motivo: 'slug_repetido'; id: number }
  | { campo: string; motivo: 'publicar_sin_slug'; id: number };

/** Valida forma y reglas locales (sin la base). La unicidad contra otras sedes la revisa el servidor. */
export function validarCambiosSedes(raw: unknown): { ok: true; cambios: CambiosSedes } | { ok: false; errores: ErrorSedes[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errores: [{ campo: 'cuerpo', motivo: 'formato' }] };
  const b = raw as Record<string, unknown>;
  const errores: ErrorSedes[] = [];
  const cambios: CambiosSedes = { sedes: [] };
  for (const k of Object.keys(b)) if (k !== 'modo' && k !== 'sedes') errores.push({ campo: k, motivo: 'formato' });
  if ('modo' in b) {
    if ((MODOS_SEDES as readonly unknown[]).includes(b.modo)) cambios.modo = b.modo as ModoSedes;
    else errores.push({ campo: 'modo', motivo: 'formato' });
  }
  if (!Array.isArray(b.sedes) || b.sedes.length > 500) {
    errores.push({ campo: 'sedes', motivo: 'formato' });
    return { ok: false, errores };
  }
  const vistos = new Map<string, number>();
  for (const s of b.sedes as unknown[]) {
    const f = s as Record<string, unknown> | null;
    if (
      !f ||
      typeof f !== 'object' ||
      typeof f.id !== 'number' ||
      !Number.isInteger(f.id) ||
      f.id <= 0 ||
      typeof f.publicada !== 'boolean' ||
      typeof f.fuenteStock !== 'boolean' ||
      !(f.slug === null || typeof f.slug === 'string') ||
      Object.keys(f).some((k) => !['id', 'publicada', 'slug', 'fuenteStock'].includes(k))
    ) {
      errores.push({ campo: 'sedes', motivo: 'formato' });
      continue;
    }
    const slug = typeof f.slug === 'string' && f.slug.trim() !== '' ? f.slug.trim().toLowerCase() : null;
    if (slug !== null && !slugValido(slug)) errores.push({ campo: 'slug', motivo: 'slug_invalido', id: f.id });
    else if (slug !== null && vistos.has(slug)) errores.push({ campo: 'slug', motivo: 'slug_repetido', id: f.id });
    if (f.publicada && slug === null) errores.push({ campo: 'slug', motivo: 'publicar_sin_slug', id: f.id });
    if (slug) vistos.set(slug, f.id);
    cambios.sedes.push({ id: f.id, publicada: f.publicada, slug, fuenteStock: f.fuenteStock });
  }
  return errores.length > 0 ? { ok: false, errores } : { ok: true, cambios };
}

/** Cuántos cambios hay entre lo leído y lo editado (barra «Tienes cambios sin guardar»). */
export function contarCambiosSedes(original: RespuestaSedesWeb, modo: ModoSedes, sedes: readonly SedeWebFila[]): number {
  let n = modo !== original.modo ? 1 : 0;
  const porId = new Map(original.sedes.map((s) => [s.id, s]));
  for (const s of sedes) {
    const o = porId.get(s.id);
    if (!o) continue;
    if (o.publicada !== s.publicada) n += 1;
    if ((o.slug ?? null) !== (s.slug ?? null)) n += 1;
    if (o.fuenteStock !== s.fuenteStock) n += 1;
  }
  return n;
}
