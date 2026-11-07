/**
 * Libro diario de trabajo («Asientos»): reglas de presentación y del alta
 * manual, sin React ni Supabase. Contabilidad v2 §4.3 y §4.4.
 *
 * Las validaciones del alta son las mismas que tenía `AsientosPage` antes de
 * la ronda 3 (cuenta de título, mínimo dos líneas, cuadre, centro de costo
 * obligatorio y aviso de tercero). La base las vuelve a exigir en
 * `fn_asiento_manual_crear`: aquí solo evitan un viaje inútil.
 */
import { cuadreDe, type Cuadre } from './cuadre';
import { grupoOrigen, fuentesDeGrupo, type GrupoOrigen } from './origenAsiento';

// ── Alta manual ────────────────────────────────────────────────────────────

export interface LineaFormulario {
  /** Clave estable de la fila en pantalla (no es id de la base). */
  clave: string;
  account_code: string;
  description: string;
  debit: number | null;
  credit: number | null;
  tercero_nit: string;
  tercero_nombre: string;
  cost_center_id: string;
  distribucion_id: string;
}

let siguienteClave = 0;
export function lineaVacia(): LineaFormulario {
  siguienteClave += 1;
  return {
    clave: `l${siguienteClave}`,
    account_code: '',
    description: '',
    debit: null,
    credit: null,
    tercero_nit: '',
    tercero_nombre: '',
    cost_center_id: '',
    distribucion_id: '',
  };
}

/** Escribir en Débito limpia Crédito y al revés (Figma «Nuevo asiento»). */
export function cambiarImporte(linea: LineaFormulario, campo: 'debit' | 'credit', valor: number | null): LineaFormulario {
  const otro = campo === 'debit' ? 'credit' : 'debit';
  const limpia = valor !== null && valor > 0;
  return { ...linea, [campo]: valor, ...(limpia ? { [otro]: null } : {}) };
}

export type ModoCentro = 'obligatorio' | 'opcional' | 'no_aplica';

export interface CuentaAlta {
  account_code: string;
  name?: string;
  centro_costo_modo?: string | null;
  requiere_centro_costo?: boolean | null;
  requiere_tercero?: boolean | null;
}

export function modoCentro(cuenta: CuentaAlta | undefined): ModoCentro {
  const modo = cuenta?.centro_costo_modo ?? (cuenta?.requiere_centro_costo ? 'obligatorio' : 'no_aplica');
  return modo === 'obligatorio' || modo === 'opcional' ? modo : 'no_aplica';
}

/**
 * Al elegir cuenta: si no admite centro se limpian centro y distribución; si
 * lo admite y la línea no tiene, se pone el centro por defecto de la sucursal.
 */
export function cambiarCuenta(linea: LineaFormulario, cuenta: CuentaAlta | undefined, centroDefecto: string): LineaFormulario {
  const nueva = { ...linea, account_code: cuenta?.account_code ?? '' };
  if (modoCentro(cuenta) === 'no_aplica') return { ...nueva, cost_center_id: '', distribucion_id: '' };
  if (!nueva.cost_center_id && !nueva.distribucion_id && centroDefecto) return { ...nueva, cost_center_id: centroDefecto };
  return nueva;
}

/** Centro y distribución se excluyen: elegir uno limpia el otro. */
export function cambiarCentro(linea: LineaFormulario, campo: 'cost_center_id' | 'distribucion_id', valor: string): LineaFormulario {
  const otro = campo === 'cost_center_id' ? 'distribucion_id' : 'cost_center_id';
  return { ...linea, [campo]: valor, ...(valor ? { [otro]: '' } : {}) };
}

export function lineaConImporte(l: LineaFormulario): boolean {
  return !!l.account_code && ((l.debit ?? 0) > 0 || (l.credit ?? 0) > 0);
}

export function cuadreFormulario(lineas: readonly LineaFormulario[]): Cuadre {
  return cuadreDe(lineas.map((l) => ({ debit: l.debit, credit: l.credit })));
}

export type ErrorAlta =
  | { codigo: 'fechaRequerida' }
  | { codigo: 'sucursalRequerida' }
  | { codigo: 'descripcionRequerida' }
  | { codigo: 'minimoLineas' }
  | { codigo: 'cuentaTitulo'; cuenta: string }
  | { codigo: 'noCuadra' }
  | { codigo: 'centroObligatorio'; cuenta: string }
  | { codigo: 'periodoCerrado' };

export interface EntradaValidacion {
  fecha: string;
  sucursalId: number | null;
  descripcion: string;
  lineas: readonly LineaFormulario[];
  cuentas: readonly CuentaAlta[];
  /** Hay centros de costo en la organización (sin centros no se exige). */
  hayCentros: boolean;
  esTitulo: (codigo: string) => boolean;
  /** `lineasSinTerceroParaContabilizar` del servicio: códigos de cuenta sin tercero. */
  sinTercero: (lineas: { account_code: string; tercero_nit: string; tercero_nombre: string }[]) => string[];
  /** null = aún no se sabe. */
  periodoAbierto: boolean | null;
}

export interface ResultadoValidacion {
  error: ErrorAlta | null;
  lineasValidas: LineaFormulario[];
  /** Cuentas a las que les falta tercero: no impide el borrador, sí publicar. */
  faltaTercero: string[];
  cuadre: Cuadre;
}

export function validarAlta(e: EntradaValidacion): ResultadoValidacion {
  const lineasValidas = e.lineas.filter(lineaConImporte);
  const cuadre = cuadreFormulario(lineasValidas);
  const faltaTercero = [...new Set(e.sinTercero(lineasValidas))];
  const fin = (error: ErrorAlta | null): ResultadoValidacion => ({ error, lineasValidas, faltaTercero, cuadre });

  if (!e.fecha) return fin({ codigo: 'fechaRequerida' });
  if (!e.sucursalId) return fin({ codigo: 'sucursalRequerida' });
  if (!e.descripcion.trim()) return fin({ codigo: 'descripcionRequerida' });
  if (lineasValidas.length < 2) return fin({ codigo: 'minimoLineas' });
  const titulo = lineasValidas.find((l) => e.esTitulo(l.account_code));
  if (titulo) return fin({ codigo: 'cuentaTitulo', cuenta: titulo.account_code });
  if (!cuadre.cuadra) return fin({ codigo: 'noCuadra' });
  if (e.hayCentros) {
    for (const l of lineasValidas) {
      const cuenta = e.cuentas.find((c) => c.account_code === l.account_code);
      if (modoCentro(cuenta) === 'obligatorio' && !l.cost_center_id && !l.distribucion_id) {
        return fin({ codigo: 'centroObligatorio', cuenta: l.account_code });
      }
    }
  }
  if (e.periodoAbierto === false) return fin({ codigo: 'periodoCerrado' });
  return fin(null);
}

/** Líneas listas para `ContabilidadService.crearAsiento`. */
export function lineasParaGuardar(lineas: readonly LineaFormulario[]) {
  return lineas.map((l) => ({
    account_code: l.account_code,
    description: l.description,
    debit: l.debit ?? 0,
    credit: l.credit ?? 0,
    tercero_nit: l.tercero_nit,
    tercero_nombre: l.tercero_nombre,
    cost_center_id: l.distribucion_id ? null : l.cost_center_id || null,
    distribucion_id: l.distribucion_id || null,
  }));
}

// ── Lista ──────────────────────────────────────────────────────────────────

export type EstadoFiltro = 'todos' | 'publicados' | 'borradores';

/** Grupos que se ofrecen como filtro: «otro» no tiene lista cerrada de fuentes. */
export const GRUPOS_FILTRO: readonly GrupoOrigen[] = [
  'venta',
  'factura',
  'cobro',
  'compra',
  'pago',
  'kardex',
  'caja',
  'banco',
  'comision',
  'nomina',
  'pms',
  'manual',
  'contraAsiento',
  'cierre',
];

export function fuentesDeGrupos(grupos: readonly GrupoOrigen[]): string[] {
  return [...new Set(grupos.flatMap((g) => fuentesDeGrupo(g)))];
}

/**
 * Texto de búsqueda seguro para un filtro `or()` de PostgREST: sin comas,
 * paréntesis, comodines ni barras, que cambiarían la expresión.
 */
export function textoBusquedaSeguro(texto: string): string {
  return texto.replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** «9.580» o «#9580» → 9580 si la búsqueda es un número de asiento. */
export function numeroBuscado(texto: string): number | null {
  const limpio = texto.replace(/^#/, '').replace(/[.\s]/g, '');
  return /^\d{1,9}$/.test(limpio) ? Number(limpio) : null;
}

export interface FiltrosLibro {
  estado: EstadoFiltro;
  grupos: GrupoOrigen[];
  cuenta: string | null;
  sucursalId: number | null;
  ocultarPares: boolean;
}

export const FILTROS_VACIOS: FiltrosLibro = { estado: 'todos', grupos: [], cuenta: null, sucursalId: null, ocultarPares: false };

export function conteoFiltros(f: FiltrosLibro): number {
  return (f.estado !== 'todos' ? 1 : 0) + (f.grupos.length ? 1 : 0) + (f.cuenta ? 1 : 0) + (f.sucursalId ? 1 : 0) + (f.ocultarPares ? 1 : 0);
}

// ── Acciones por tipo de asiento ───────────────────────────────────────────

export interface AsientoParaAcciones {
  posted: boolean;
  source: string | null;
}

export type TipoAsiento = 'borrador' | 'manual' | 'automatico' | 'contraAsiento';

export function tipoAsiento(a: AsientoParaAcciones): TipoAsiento {
  if (!a.posted) return 'borrador';
  const grupo = grupoOrigen(a.source);
  if (grupo === 'contraAsiento') return 'contraAsiento';
  return a.source === 'manual' || !a.source ? 'manual' : 'automatico';
}

export interface AccionesAsiento {
  publicar: boolean;
  descartar: boolean;
  /** Solo manuales (publicados o borradores): duplicar un automático duplicaría el hecho. */
  duplicar: boolean;
  /** Visible en manuales publicados; `revertirBloqueo` dice por qué no se puede. */
  revertir: boolean;
  imprimir: boolean;
}

export function accionesAsiento(a: AsientoParaAcciones): AccionesAsiento {
  const tipo = tipoAsiento(a);
  const esManual = a.source === 'manual' || !a.source;
  return {
    publicar: tipo === 'borrador',
    descartar: tipo === 'borrador',
    duplicar: esManual,
    revertir: tipo === 'manual',
    imprimir: true,
  };
}

export type BloqueoReversa = 'sinPermiso' | 'yaRevertido' | 'periodoCerrado' | null;

export function bloqueoReversa(o: { puedeRevertir: boolean; revertidoPor: number | null; periodoAsiento: boolean | null; periodoHoy: boolean | null }): BloqueoReversa {
  if (o.revertidoPor) return 'yaRevertido';
  if (!o.puedeRevertir) return 'sinPermiso';
  if (o.periodoAsiento === false && o.periodoHoy === false) return 'periodoCerrado';
  return null;
}

/** Fecha que tomará el contra-asiento (misma regla que `fn_revertir_asiento_manual`). */
export function fechaContraAsiento(periodoAsiento: boolean | null): 'original' | 'hoy' | 'desconocida' {
  if (periodoAsiento === null) return 'desconocida';
  return periodoAsiento ? 'original' : 'hoy';
}
