/**
 * «Carta» del sitio de un restaurante (Figma B/13-01…13-08): contratos y lógica
 * pura que comparten los route handlers de `/api/sitio-web/carta/**`, el hook
 * `useCarta` y los tests.
 *
 * La carta NO tiene precios propios: productos, precios, fotos y modificadores
 * vienen de Inventario (B/13-07 nota 1). Aquí solo se decide qué categorías
 * salen, en qué orden y cuándo, y las excepciones por producto (destacado,
 * oculto en esta carta, orden).
 *
 * La VIGENCIA («Visible ahora», «Ahora tus clientes ven…») no se calcula aquí:
 * sale de la RPC `get_public_menu`, la misma que usa el sitio público. Este
 * archivo solo resume el horario para mostrarlo.
 */
import { z } from 'zod';

/** Día ISO como clave del horario: 1 = lunes … 7 = domingo. */
export const DIAS_ISO = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type DiaIso = (typeof DIAS_ISO)[number];

export interface FranjaHorario {
  from: string;
  to: string;
}
export type HorarioCarta = Partial<Record<DiaIso, FranjaHorario[]>>;

export const ICONOS_CARTA = ['desayuno', 'almuerzo', 'cena', 'principal', 'bar', 'postres', 'general'] as const;
export type IconoCarta = (typeof ICONOS_CARTA)[number];

/** Id de la carta implícita mientras la migración 20261008150100 no esté aplicada. */
export const ID_CARTA_PRINCIPAL_IMPLICITA = 'principal';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const esquemaFranja = z.object({ from: z.string().regex(HORA), to: z.string().regex(HORA) }).strict();
export const esquemaHorario = z.record(z.enum(DIAS_ISO), z.array(esquemaFranja).max(4));

/** Cuerpo de `POST /api/sitio-web/carta` (diálogo «Nueva carta»). */
export const esquemaNuevaCarta = z
  .object({
    nombre: z.string().trim().min(1).max(80),
    icono: z.enum(ICONOS_CARTA).nullable().optional(),
    duplicarDe: z.string().uuid().nullable().optional(),
    todasLasCategorias: z.boolean().optional(),
  })
  .strict();

/** Cuerpo de `PATCH /api/sitio-web/carta/orden`. */
export const esquemaOrdenCartas = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).strict();

/** Cuerpo de `PUT /api/sitio-web/carta/[menuId]`: todo el detalle en un lote. */
export const esquemaGuardarCarta = z
  .object({
    nombre: z.string().trim().min(1).max(80).optional(),
    icono: z.enum(ICONOS_CARTA).nullable().optional(),
    horario: esquemaHorario.optional(),
    /** `null` = todas las sedes. */
    sedes: z.array(z.number().int().positive()).max(200).nullable().optional(),
    pdfUrl: z.string().url().max(1000).nullable().optional(),
    activa: z.boolean().optional(),
    categorias: z.array(z.number().int().positive()).max(200).optional(),
    excepciones: z
      .array(
        z
          .object({
            productoId: z.number().int().positive(),
            destacado: z.boolean(),
            oculto: z.boolean(),
            orden: z.number().int().min(0).max(100000).nullable(),
            /** Variantes (productos hijos) que NO se muestran en esta carta. */
            variantesOcultas: z.array(z.number().int().positive()).max(200).optional(),
            /** Grupos de extras (modificadores) que NO se muestran en esta carta. */
            extrasOcultos: z.array(z.number().int().positive()).max(200).optional(),
          })
          .strict(),
      )
      .max(5000)
      .optional(),
    /**
     * Pestaña «Por sede» (F-flujos/1): los cambios de `website_branch_products`
     * de los productos de esta carta, en el MISMO lote que el resto del detalle.
     * Cada `cambios` se valida en el servidor con el esquema de Carta por sede
     * (`escrituraCartaSedeSchema`), que es su única definición.
     */
    porSede: z
      .array(
        z
          .object({
            branch_id: z.number().int().positive(),
            cambios: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
          })
          .strict(),
      )
      .max(200)
      .optional(),
  })
  .strict();
export type GuardarCarta = z.output<typeof esquemaGuardarCarta>;

/** El parche de la RPC `guardar_carta` (nombres de columna). */
export function parcheGuardarCarta(c: GuardarCarta): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (c.nombre !== undefined) p.name = c.nombre;
  if (c.icono !== undefined) p.icon = c.icono;
  if (c.horario !== undefined) p.schedule = c.horario;
  if (c.sedes !== undefined) p.branch_ids = c.sedes;
  if (c.pdfUrl !== undefined) p.pdf_url = c.pdfUrl;
  if (c.activa !== undefined) p.is_active = c.activa;
  if (c.categorias !== undefined) p.secciones = c.categorias.map((id, i) => ({ category_id: id, sort_order: i }));
  if (c.excepciones !== undefined) {
    // Solo se guardan las filas que se apartan de lo normal (sin precio: B/13-08).
    // Las variantes y extras ocultos van en la misma fila (migración 20261008150200).
    p.items = c.excepciones
      .filter((e) => e.destacado || e.oculto || e.orden !== null || (e.variantesOcultas?.length ?? 0) > 0 || (e.extrasOcultos?.length ?? 0) > 0)
      .map((e) => ({
        product_id: e.productoId,
        is_featured: e.destacado,
        is_hidden: e.oculto,
        sort_order: e.orden,
        hidden_variant_ids: e.variantesOcultas ?? [],
        hidden_modifier_group_ids: e.extrasOcultos ?? [],
      }));
  }
  return p;
}

// ---------------------------------------------------------------------------
// Respuestas de la API
// ---------------------------------------------------------------------------

export interface SedeCarta {
  id: number;
  nombre: string;
}

export interface CartaResumen {
  id: string;
  nombre: string;
  icono: IconoCarta | null;
  horario: HorarioCarta;
  /** `null` = todas las sedes. */
  sedes: number[] | null;
  pdfUrl: string | null;
  activa: boolean;
  categorias: number;
  productos: number;
  /** Sedes donde se ve AHORA (de `get_public_menu`); `null` si no se pudo calcular. */
  vigenteEn: number[] | null;
  /** Carta implícita (sin la migración): todas las categorías, todo el día, todas las sedes. */
  implicita?: boolean;
}

export interface VigenteSede {
  sedeId: number;
  sede: string;
  cartas: string[];
}

export interface RespuestaCartas {
  /** `false` = la migración de cartas aún no está aplicada (se muestra la carta implícita). */
  disponible: boolean;
  permisos: { editar: boolean };
  esRestaurante: boolean;
  host: string | null;
  sedes: SedeCarta[];
  cartas: CartaResumen[];
  /** Instante local de la organización con el que se calculó «Visible ahora». */
  ahora: { dia: number; hora: string } | null;
  vigentes: VigenteSede[];
}

export interface EtiquetaProductoCarta {
  nombre: string;
  tipo: 'dieta' | 'alergeno' | 'picante';
}

/** Una variante (producto hijo) o un grupo de extras de un producto de la carta. */
export interface OpcionCarta {
  id: number;
  nombre: string;
  /** Extras: cuántas opciones tiene el grupo («3 opciones»). */
  opciones?: number;
  /** No se muestra en esta carta. */
  oculta: boolean;
}

export interface ProductoCarta {
  id: number;
  nombre: string;
  precio: number | null;
  etiquetas: EtiquetaProductoCarta[];
  destacado: boolean;
  oculto: boolean;
  orden: number | null;
  /** Variantes del producto (Inventario); se elige cuáles se muestran (B/13-02, «Variantes y extras»). */
  variantes?: OpcionCarta[];
  /** Grupos de extras (modificadores) del producto; se elige cuáles se muestran. */
  extras?: OpcionCarta[];
}

export interface CategoriaCarta {
  id: number;
  nombre: string;
  productos: ProductoCarta[];
  /** Solo en el navegador: añadida y aún sin guardar (sus productos llegan al guardar). */
  nueva?: boolean;
}

export interface DetalleCarta {
  disponible: boolean;
  permisos: { editar: boolean };
  carta: CartaResumen;
  categorias: CategoriaCarta[];
  /** Categorías raíz del inventario que aún no están en la carta («Añadir categoría»). */
  disponibles: { id: number; nombre: string }[];
  sedes: SedeCarta[];
  moneda: string;
  /**
   * `false` mientras la migración 20261008150200 (variantes y extras ocultos
   * por carta) no esté aplicada: la pestaña lista las opciones pero no deja
   * cambiarlas.
   */
  opcionesDisponibles?: boolean;
}

export interface MesaQr {
  id: string;
  nombre: string;
  zona: string | null;
  url: string | null;
}

export interface RespuestaQr {
  host: string | null;
  sedes: SedeCarta[];
  sedeId: number | null;
  mesas: MesaQr[];
  /** URL general de la carta (sin mesa). */
  urlGeneral: string | null;
}

export interface CartaPublica {
  id: string;
  nombre: string;
  icono: string | null;
  pdfUrl: string | null;
  secciones: {
    categoriaId: number;
    nombre: string;
    productos: {
      id: number;
      nombre: string;
      descripcion: string | null;
      precio: number | null;
      destacado: boolean;
      agotado: boolean;
      etiquetas: { nombre: string; tipo: 'dieta' | 'alergeno' | 'picante'; color: string | null }[];
    }[];
  }[];
}

export interface RespuestaVistaPrevia {
  disponible: boolean;
  host: string | null;
  sede: SedeCarta | null;
  sedes: SedeCarta[];
  zonaHoraria: string;
  dia: number;
  hora: string;
  cartas: CartaPublica[];
  moneda: string;
}

// ---------------------------------------------------------------------------
// Horario (solo para mostrar; la vigencia es de la RPC)
// ---------------------------------------------------------------------------

/** Horario por defecto de una carta nueva: todos los días, todo el día (00:00 → 00:00). */
export function horarioTodoElDia(): HorarioCarta {
  return Object.fromEntries(DIAS_ISO.map((d) => [d, [{ from: '00:00', to: '00:00' }]])) as HorarioCarta;
}

export function esTodoElDia(f: FranjaHorario): boolean {
  return f.from === f.to;
}

/** Firma de las franjas de un día para agrupar días iguales. */
function firma(franjas: readonly FranjaHorario[] | undefined): string {
  return (franjas ?? []).map((f) => `${f.from}-${f.to}`).join('|');
}

export interface GrupoHorario {
  /** Días ISO consecutivos con las mismas franjas. */
  desde: DiaIso;
  hasta: DiaIso;
  franjas: FranjaHorario[];
}

/** Agrupa días consecutivos con las mismas franjas: «Lun–Vie 7:00 a. m. – 11:00 a. m.». */
export function agruparHorario(h: HorarioCarta): GrupoHorario[] {
  const grupos: GrupoHorario[] = [];
  for (const dia of DIAS_ISO) {
    const franjas = h[dia] ?? [];
    if (franjas.length === 0) continue;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && firma(ultimo.franjas) === firma(franjas) && Number(ultimo.hasta) + 1 === Number(dia)) {
      ultimo.hasta = dia;
    } else {
      grupos.push({ desde: dia, hasta: dia, franjas: [...franjas] });
    }
  }
  return grupos;
}

/** «7:00 a. m.» (12 h, como el diseño); «12:00 p. m.» al mediodía. */
export function horaCorta(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

/** Copia profunda del horario (el editor del detalle lo modifica). */
export function copiarHorario(h: HorarioCarta): HorarioCarta {
  return Object.fromEntries(Object.entries(h).map(([d, f]) => [d, (f ?? []).map((x) => ({ ...x }))])) as HorarioCarta;
}

/** Normaliza lo leído de `restaurant_menus.schedule` (jsonb libre) a un horario válido. */
export function horarioDeJson(valor: unknown): HorarioCarta {
  const r = esquemaHorario.safeParse(valor);
  return r.success ? (r.data as HorarioCarta) : {};
}

// ---------------------------------------------------------------------------
// Orden y excepciones (lógica del detalle)
// ---------------------------------------------------------------------------

/** Mueve un elemento de `desde` a la posición `hasta` (arrastrar o Alt+↑/↓). */
export function mover<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return [...lista];
  const copia = [...lista];
  const [x] = copia.splice(desde, 1);
  copia.splice(hasta, 0, x);
  return copia;
}

/** Productos en el orden de la carta: primero los que tienen orden propio, luego por nombre. */
export function ordenarProductos(productos: readonly ProductoCarta[]): ProductoCarta[] {
  return [...productos].sort((a, b) => {
    if (a.orden !== null && b.orden !== null) return a.orden - b.orden;
    if (a.orden !== null) return -1;
    if (b.orden !== null) return 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

/** Excepciones a guardar a partir de las categorías del detalle. */
export function excepcionesDe(categorias: readonly CategoriaCarta[]): GuardarCarta['excepciones'] {
  return categorias.flatMap((c) =>
    c.productos.map((p) => {
      const e: NonNullable<GuardarCarta['excepciones']>[number] = { productoId: p.id, destacado: p.destacado, oculto: p.oculto, orden: p.orden };
      const variantes = ocultasDe(p.variantes);
      const extras = ocultasDe(p.extras);
      if (variantes.length > 0) e.variantesOcultas = variantes;
      if (extras.length > 0) e.extrasOcultos = extras;
      return e;
    }),
  );
}

/** Ids de las opciones ocultas, ordenados (para comparar el borrador sin falsos cambios). */
export function ocultasDe(opciones: readonly OpcionCarta[] | undefined): number[] {
  return (opciones ?? [])
    .filter((o) => o.oculta)
    .map((o) => o.id)
    .sort((a, b) => a - b);
}

/** Cambia si una variante o un grupo de extras se muestra en la carta (devuelve categorías nuevas). */
export function alternarOpcion(
  categorias: readonly CategoriaCarta[],
  productoId: number,
  tipo: 'variantes' | 'extras',
  opcionId: number,
  mostrar: boolean,
): CategoriaCarta[] {
  return categorias.map((c) =>
    c.productos.some((p) => p.id === productoId)
      ? {
          ...c,
          productos: c.productos.map((p) =>
            p.id === productoId ? { ...p, [tipo]: (p[tipo] ?? []).map((o) => (o.id === opcionId ? { ...o, oculta: !mostrar } : o)) } : p,
          ),
        }
      : c,
  );
}

/** Nombre de la etiqueta de dieta a partir de `product_tags.kind`. */
export function tipoEtiqueta(kind: string | null | undefined): EtiquetaProductoCarta['tipo'] | null {
  return kind === 'dieta' || kind === 'alergeno' || kind === 'picante' ? kind : null;
}

/** Resumen de la vigencia por sede para el banner: «Almuerzo en Sede Centro · Carta principal en Sede Norte». */
export function partesBanner(vigentes: readonly VigenteSede[]): { cartas: string; sede: string }[] {
  return vigentes.filter((v) => v.cartas.length > 0).map((v) => ({ cartas: v.cartas.join(', '), sede: v.sede }));
}

// ---------------------------------------------------------------------------
// Carta QR (B/13-03): qué códigos se imprimen. Lo usan la pantalla y el PDF.
// ---------------------------------------------------------------------------

export type QrPor = 'mesa' | 'zona';
/** `pedir`: el QR abre la carta con la mesa (pedir a la mesa); `ver`: solo la carta. */
export type QrModo = 'pedir' | 'ver';

export interface ElementoQr {
  clave: string;
  titulo: string;
  detalle: string;
  url: string;
}

/**
 * Un código por mesa (con `?mesa=`, el contrato de goadmin-websites) o uno por
 * zona. El sitio aún no recibe la zona en la URL: el QR de zona y el modo «Solo
 * ver la carta» abren la carta general de la sede.
 */
export function elementosQr(mesas: readonly MesaQr[], opciones: { por: QrPor; modo: QrModo; urlGeneral: string | null; sede: string; sinZona: string }): ElementoQr[] {
  if (!opciones.urlGeneral) return [];
  if (opciones.por === 'zona') {
    const zonas = [...new Set(mesas.map((m) => m.zona?.trim() || opciones.sinZona))];
    return zonas.map((z) => ({ clave: `zona:${z}`, titulo: z, detalle: opciones.sede, url: opciones.urlGeneral as string }));
  }
  return mesas.map((m) => ({
    clave: m.id,
    titulo: m.nombre,
    detalle: [m.zona?.trim() || opciones.sinZona, opciones.sede].join(' · '),
    url: opciones.modo === 'pedir' && m.url ? m.url : (opciones.urlGeneral as string),
  }));
}

/** «18 mesas en 3 zonas». */
export function contarZonas(mesas: readonly MesaQr[]): number {
  return new Set(mesas.map((m) => m.zona?.trim() || '')).size;
}
