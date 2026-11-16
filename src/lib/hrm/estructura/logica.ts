/**
 * Reglas puras de Recursos humanos › Estructura (áreas, cargos y plazas).
 * Sin React ni Supabase: las prueba `__tests__/estructuraLogica.test.ts`.
 * Los números salen del servidor; aquí solo se agregan por el árbol, se
 * clasifican y se validan los formularios antes de enviarlos.
 */
import { normalizarBusqueda } from '@/components/kit/arbol';
import type {
  AreaApi,
  CargoDetalle,
  CargoFila,
  Competencia,
  DatosCargo,
  FilaEscalaForm,
  FilaPlaza,
  PlazaSede,
} from './tipos';

/** Niveles del cargo: 1 operativo … 5 dirección. */
export const NIVELES_CARGO = [1, 2, 3, 4, 5] as const;
/** Clases de riesgo ARL (Decreto 1295 de 1994): I a V. */
export const CLASES_ARL = [1, 2, 3, 4, 5] as const;
export const NIVELES_COMPETENCIA = [1, 2, 3, 4] as const;

/**
 * Documentos que un cargo puede exigir: las categorías del expediente
 * (`hr_documents.category`) que entiende la ficha del empleado.
 */
export const DOCUMENTOS_CARGO = [
  'documento_identidad',
  'hoja_vida',
  'contrato_trabajo',
  'afiliacion_eps',
  'afiliacion_afp',
  'afiliacion_arl',
  'afiliacion_ccf',
  'afiliacion_cesantias',
  'certificado_bancario',
  'concepto_aptitud',
  'certificacion',
] as const;
/** Lista base cuando el cargo no tiene la suya (`fn_hr_documentos_exigidos`). */
export const DOCUMENTOS_BASE = [
  'afiliacion_afp',
  'afiliacion_eps',
  'certificado_bancario',
  'contrato_trabajo',
  'documento_identidad',
  'hoja_vida',
] as const;
/** Los que van con un grupo sensible distinto de identificación (candado en el perfil). */
export const DOCUMENTOS_SENSIBLES = new Set(['concepto_aptitud']);

const RE_ROMANO = ['I', 'II', 'III', 'IV', 'V'];
export function romano(n: number): string {
  return RE_ROMANO[n - 1] ?? String(n);
}

// ── Plazas ─────────────────────────────────────────────────────────────────────

export type EstadoPlaza =
  | { tipo: 'sinPresupuesto' }
  | { tipo: 'completa' }
  | { tipo: 'vacantes'; n: number }
  | { tipo: 'sobre'; n: number };

/** Aprobadas frente a ocupadas. Sin presupuesto no hay contra qué comparar (no es «sobre lo aprobado»). */
export function estadoPlaza(aprobadas: number | null | undefined, ocupadas: number): EstadoPlaza {
  if (aprobadas === null || aprobadas === undefined || aprobadas <= 0) return { tipo: 'sinPresupuesto' };
  if (ocupadas > aprobadas) return { tipo: 'sobre', n: ocupadas - aprobadas };
  if (ocupadas < aprobadas) return { tipo: 'vacantes', n: aprobadas - ocupadas };
  return { tipo: 'completa' };
}

export function vacantesDe(plazas: readonly PlazaSede[]): number {
  return plazas.reduce((s, p) => {
    const e = estadoPlaza(p.aprobadas, p.ocupadas);
    return s + (e.tipo === 'vacantes' ? e.n : 0);
  }, 0);
}

export interface ResumenPlazas {
  aprobadas: number;
  ocupadas: number;
  vacantes: number;
  sobre: number;
  sedesConPresupuesto: number;
  /** % de lo aprobado que está ocupado (solo filas con presupuesto). */
  porcentaje: number | null;
  filasVacantes: FilaPlaza[];
  filasSobre: FilaPlaza[];
}

export function resumenPlazas(filas: readonly FilaPlaza[]): ResumenPlazas {
  let aprobadas = 0;
  let ocupadasConPresupuesto = 0;
  let ocupadas = 0;
  let vacantes = 0;
  let sobre = 0;
  const sedes = new Set<number>();
  const filasVacantes: FilaPlaza[] = [];
  const filasSobre: FilaPlaza[] = [];
  for (const f of filas) {
    ocupadas += f.ocupadas;
    const e = estadoPlaza(f.aprobadas, f.ocupadas);
    if (e.tipo === 'sinPresupuesto') continue;
    aprobadas += f.aprobadas;
    ocupadasConPresupuesto += f.ocupadas;
    sedes.add(f.sede_id);
    if (e.tipo === 'vacantes') {
      vacantes += e.n;
      filasVacantes.push(f);
    } else if (e.tipo === 'sobre') {
      sobre += e.n;
      filasSobre.push(f);
    }
  }
  return {
    aprobadas,
    ocupadas,
    vacantes,
    sobre,
    sedesConPresupuesto: sedes.size,
    porcentaje: aprobadas > 0 ? Math.round((ocupadasConPresupuesto / aprobadas) * 100) : null,
    filasVacantes,
    filasSobre,
  };
}

/** Orden de la lista «Por área y sede»: por nombre de área y luego de sede. */
export function ordenarFilasPlaza(
  filas: readonly FilaPlaza[],
  nombreArea: (id: string) => string,
  nombreSede: (id: number) => string
): FilaPlaza[] {
  return [...filas].sort(
    (a, b) => nombreArea(a.area_id).localeCompare(nombreArea(b.area_id), 'es') || nombreSede(a.sede_id).localeCompare(nombreSede(b.sede_id), 'es')
  );
}

// ── Árbol de áreas ─────────────────────────────────────────────────────────────

export interface AreaArbol {
  area: AreaApi;
  nivel: number;
  hijos: AreaArbol[];
  /** Personas del área y de todas sus hijas. */
  personasTotal: number;
  /** Vacantes del área y de todas sus hijas. */
  vacantesTotal: number;
  /** Áreas descendientes (todas). */
  descendientes: number;
}

/**
 * Arma el organigrama. Un área cuyo padre no existe (archivado, de otra rama)
 * sube a la raíz; un ciclo se corta en el primer nodo repetido.
 */
export function construirOrganigrama(areas: readonly AreaApi[]): AreaArbol[] {
  const porId = new Map(areas.map((a) => [a.id, a]));
  const hijosDe = new Map<string | null, AreaApi[]>();
  for (const a of areas) {
    const padre = a.parent_id && porId.has(a.parent_id) && a.parent_id !== a.id ? a.parent_id : null;
    const lista = hijosDe.get(padre) ?? [];
    lista.push(a);
    hijosDe.set(padre, lista);
  }
  const visitados = new Set<string>();
  const armar = (a: AreaApi, nivel: number): AreaArbol => {
    visitados.add(a.id);
    const hijos = (hijosDe.get(a.id) ?? [])
      .filter((h) => !visitados.has(h.id))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
      .map((h) => armar(h, nivel + 1));
    return {
      area: a,
      nivel,
      hijos,
      personasTotal: a.personas + hijos.reduce((s, h) => s + h.personasTotal, 0),
      vacantesTotal: vacantesDe(a.plazas) + hijos.reduce((s, h) => s + h.vacantesTotal, 0),
      descendientes: hijos.reduce((s, h) => s + 1 + h.descendientes, 0),
    };
  };
  const raices = (hijosDe.get(null) ?? []).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')).map((a) => armar(a, 0));
  // Lo que quedó fuera (ciclos puros) también se muestra, como raíz.
  for (const a of areas) if (!visitados.has(a.id)) raices.push(armar(a, 0));
  return raices;
}

/** Un área opera en la sede si no tiene sedes marcadas (todas) o si la incluye. */
export function operaEnSede(a: AreaApi, sede: number | null): boolean {
  if (sede === null) return true;
  return a.sedes.length === 0 || a.sedes.includes(sede) || a.plazas.some((p) => p.sede_id === sede);
}

/**
 * Poda el organigrama a las áreas que coinciden con el texto (nombre o
 * responsable) y operan en la sede, conservando sus ancestros como contexto.
 */
export function filtrarOrganigrama(
  raices: readonly AreaArbol[],
  texto: string,
  sede: number | null,
  filtros: { vacantes: boolean; sinResponsable: boolean } = { vacantes: false, sinResponsable: false }
): { raices: AreaArbol[]; coincidencias: Set<string> } {
  const q = normalizarBusqueda(texto);
  const coincidencias = new Set<string>();
  const hayFiltros = filtros.vacantes || filtros.sinResponsable;
  if (!q && sede === null && !hayFiltros) return { raices: [...raices], coincidencias };
  const podar = (n: AreaArbol): AreaArbol | null => {
    const hijos = n.hijos.map(podar).filter((h): h is AreaArbol => h !== null);
    const porTexto =
      !q || normalizarBusqueda(n.area.nombre).includes(q) || normalizarBusqueda(n.area.responsable?.nombre ?? '').includes(q);
    const coincide =
      porTexto &&
      operaEnSede(n.area, sede) &&
      (!filtros.vacantes || vacantesDe(n.area.plazas) > 0) &&
      (!filtros.sinResponsable || !n.area.responsable);
    if (coincide && (q || hayFiltros)) coincidencias.add(n.area.id);
    if (!coincide && hijos.length === 0) return null;
    return { ...n, hijos };
  };
  return { raices: raices.map(podar).filter((r): r is AreaArbol => r !== null), coincidencias };
}

/** Lista con sangría (celular y vista «Lista»): respeta las ramas abiertas. */
export function aplanarOrganigrama(raices: readonly AreaArbol[], abiertas: ReadonlySet<string>, forzarAbiertas = false): AreaArbol[] {
  const out: AreaArbol[] = [];
  const recorrer = (n: AreaArbol) => {
    out.push(n);
    if (forzarAbiertas || abiertas.has(n.area.id)) n.hijos.forEach(recorrer);
  };
  raices.forEach(recorrer);
  return out;
}

/** Ramas abiertas al entrar: los dos primeros niveles. */
export function abiertasIniciales(raices: readonly AreaArbol[]): Set<string> {
  const s = new Set<string>();
  for (const r of raices) {
    if (r.hijos.length) s.add(r.area.id);
    for (const h of r.hijos) if (h.hijos.length && r.hijos.length <= 4) s.add(h.area.id);
  }
  return s;
}

/** Ids del área y de sus descendientes (no se puede elegir como área superior). */
export function subarbolIds(areas: readonly AreaApi[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const a of areas) {
      if (a.parent_id && ids.has(a.parent_id) && !ids.has(a.id)) {
        ids.add(a.id);
        cambio = true;
      }
    }
  }
  return ids;
}

/** Ruta legible del área: «Operaciones › Cocina». */
export function rutaArea(areas: readonly AreaApi[], id: string): string[] {
  const porId = new Map(areas.map((a) => [a.id, a]));
  const ruta: string[] = [];
  const vistos = new Set<string>();
  let actual = porId.get(id);
  while (actual && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    ruta.unshift(actual.nombre);
    actual = actual.parent_id ? porId.get(actual.parent_id) : undefined;
  }
  return ruta;
}

// ── Cargos ─────────────────────────────────────────────────────────────────────

export interface FiltrosCargos {
  texto: string;
  area: string | null;
  nivel: number | null;
  /** Solo cargos con plazas aprobadas sin ocupar. */
  vacantes: boolean;
  /** Solo cargos sin personas. */
  sinPersonas: boolean;
}

export const FILTROS_CARGOS: FiltrosCargos = { texto: '', area: null, nivel: null, vacantes: false, sinPersonas: false };

export function filtrarCargos(cargos: readonly CargoFila[], f: FiltrosCargos, direccion: 'asc' | 'desc' = 'asc'): CargoFila[] {
  const q = normalizarBusqueda(f.texto);
  return cargos
    .filter(
      (c) =>
        (!q || normalizarBusqueda(c.nombre).includes(q) || normalizarBusqueda(c.area ?? '').includes(q)) &&
        (!f.area || c.area_id === f.area) &&
        (f.nivel === null || c.nivel === f.nivel) &&
        (!f.vacantes || estadoPlaza(c.plazas, c.personas).tipo === 'vacantes') &&
        (!f.sinPersonas || c.personas === 0)
    )
    .sort((a, b) => (direccion === 'asc' ? 1 : -1) * a.nombre.localeCompare(b.nombre, 'es'));
}

export function conteoFiltrosCargos(f: FiltrosCargos): number {
  return (f.area ? 1 : 0) + (f.nivel !== null ? 1 : 0) + (f.vacantes ? 1 : 0) + (f.sinPersonas ? 1 : 0);
}

/** Un cargo se puede eliminar (queda inactivo) si nadie lo ocupa y no tiene plazas aprobadas. */
export function motivoNoEliminarCargo(c: Pick<CargoFila, 'personas' | 'plazas'>): 'personas' | 'plazas' | null {
  if (c.personas > 0) return 'personas';
  if ((c.plazas ?? 0) > 0) return 'plazas';
  return null;
}

export interface FiltrosAreas {
  vacantes: boolean;
  sinResponsable: boolean;
}

export const FILTROS_AREAS: FiltrosAreas = { vacantes: false, sinResponsable: false };

export type ErrorEscala = 'requerido' | 'mayorQueCero' | 'medioMenorQueMinimo' | 'maximoMenorQueMedio';
export type ErroresEscala = Partial<Record<'minimo' | 'medio' | 'maximo', ErrorEscala>>;

/** Valida una fila de la escala: mínimo > 0 y mínimo ≤ medio ≤ máximo. */
export function validarFilaEscala(f: FilaEscalaForm): ErroresEscala {
  const e: ErroresEscala = {};
  if (f.minimo === null) e.minimo = 'requerido';
  else if (f.minimo <= 0) e.minimo = 'mayorQueCero';
  if (f.medio === null) e.medio = 'requerido';
  else if (f.minimo !== null && f.medio < f.minimo) e.medio = 'medioMenorQueMinimo';
  if (f.maximo === null) e.maximo = 'requerido';
  else if (f.medio !== null && f.maximo < f.medio) e.maximo = 'maximoMenorQueMedio';
  return e;
}

/** Punto medio sugerido al escribir mínimo y máximo. */
export function medioSugerido(minimo: number | null, maximo: number | null): number | null {
  if (minimo === null || maximo === null || maximo < minimo) return null;
  return Math.round((minimo + maximo) / 2);
}

/** Una fila de escala está vacía (no se envía). */
export function filaEscalaVacia(f: FilaEscalaForm): boolean {
  return f.minimo === null && f.medio === null && f.maximo === null;
}

/** ¿La fila cambió frente a la escala vigente? */
export function filaEscalaCambio(f: FilaEscalaForm, vigente: { minimo: number; medio: number; maximo: number } | undefined): boolean {
  if (filaEscalaVacia(f)) return false;
  if (!vigente) return true;
  return f.minimo !== vigente.minimo || f.medio !== vigente.medio || f.maximo !== vigente.maximo;
}

export interface ErroresCargo {
  nombre?: 'requerido';
  area_id?: 'requerido';
  nivel?: 'requerido';
  competencias?: 'nombre';
  escalaFecha?: 'requerido' | 'noPosterior';
  escalaMotivo?: 'requerido';
  escala: Record<string, ErroresEscala>;
}

export function claveSede(sede: number | null): string {
  return sede === null ? 'todas' : String(sede);
}

/**
 * Valida el formulario del cargo. `ultimaVigencia` es la fecha de la escala
 * más reciente (vigente o programada): la nueva debe empezar después.
 */
export function validarCargo(d: DatosCargo, ultimaVigencia: string | null): ErroresCargo {
  const e: ErroresCargo = { escala: {} };
  if (d.nombre.trim().length < 2) e.nombre = 'requerido';
  if (!d.area_id) e.area_id = 'requerido';
  if (!d.nivel) e.nivel = 'requerido';
  if (d.competencias.some((c) => c.nombre.trim().length < 2)) e.competencias = 'nombre';
  if (d.escala) {
    if (!d.escala.desde) e.escalaFecha = 'requerido';
    else if (ultimaVigencia && d.escala.desde <= ultimaVigencia) e.escalaFecha = 'noPosterior';
    if (!d.escala.motivo.trim()) e.escalaMotivo = 'requerido';
    for (const f of d.escala.filas) {
      if (filaEscalaVacia(f)) continue;
      const fe = validarFilaEscala(f);
      if (Object.keys(fe).length) e.escala[claveSede(f.sede_id)] = fe;
    }
  }
  return e;
}

export function cuentaErroresCargo(e: ErroresCargo): number {
  const base = (['nombre', 'area_id', 'nivel', 'competencias', 'escalaFecha', 'escalaMotivo'] as const).filter((k) => e[k]).length;
  return base + Object.values(e.escala).reduce((s, x) => s + Object.keys(x).length, 0);
}

export type CambioCargo =
  | { tipo: 'datos' }
  | { tipo: 'escala'; sedes: (number | null)[]; desde: string }
  | { tipo: 'funcionesNuevas'; n: number }
  | { tipo: 'funcionesQuitadas'; n: number }
  | { tipo: 'competencias' }
  | { tipo: 'documentoNuevo'; categoria: string }
  | { tipo: 'documentoQuitado'; categoria: string };

/** Resumen «Cambios sin guardar» frente a lo guardado. */
export function cambiosCargo(original: CargoDetalle | null, d: DatosCargo, vigentes: readonly { sede_id: number | null; minimo: number; medio: number; maximo: number }[]): CambioCargo[] {
  const out: CambioCargo[] = [];
  const o = original;
  const datosCambian =
    !o ||
    o.nombre !== d.nombre.trim() ||
    o.area_id !== d.area_id ||
    o.nivel !== d.nivel ||
    (o.reporta_a?.id ?? null) !== d.reporta_a_id ||
    (o.proposito ?? '') !== (d.proposito ?? '').trim() ||
    (o.educacion ?? '') !== (d.educacion ?? '').trim() ||
    (o.experiencia ?? '') !== (d.experiencia ?? '').trim() ||
    (d.clase_arl !== undefined && (o.clase_arl ?? null) !== d.clase_arl);
  if (datosCambian && o) out.push({ tipo: 'datos' });
  if (d.escala) {
    const sedes = d.escala.filas
      .filter((f) => filaEscalaCambio(f, vigentes.find((v) => v.sede_id === f.sede_id)))
      .map((f) => f.sede_id);
    if (sedes.length) out.push({ tipo: 'escala', sedes, desde: d.escala.desde });
  }
  const antes = new Set((o?.funciones ?? []).map((x) => x.trim()));
  const ahora = d.funciones.map((x) => x.trim()).filter(Boolean);
  const nuevas = ahora.filter((x) => !antes.has(x)).length;
  const quitadas = [...antes].filter((x) => !ahora.includes(x)).length;
  if (nuevas) out.push({ tipo: 'funcionesNuevas', n: nuevas });
  if (quitadas) out.push({ tipo: 'funcionesQuitadas', n: quitadas });
  const comp = (c: readonly Competencia[]) => c.map((x) => `${x.nombre.trim()}|${x.tipo}|${x.nivel}`).join('§');
  if (comp(o?.competencias ?? []) !== comp(d.competencias)) out.push({ tipo: 'competencias' });
  const docsAntes = new Set(o?.documentos ?? []);
  for (const c of d.documentos) if (!docsAntes.has(c)) out.push({ tipo: 'documentoNuevo', categoria: c });
  for (const c of docsAntes) if (!d.documentos.includes(c)) out.push({ tipo: 'documentoQuitado', categoria: c });
  return out;
}

/** Estado inicial del formulario a partir del cargo guardado (o vacío). */
export function datosCargoIniciales(c: CargoDetalle | null, areaPorDefecto: string | null = null): DatosCargo {
  return {
    nombre: c?.nombre ?? '',
    area_id: c?.area_id ?? areaPorDefecto,
    nivel: c?.nivel ?? null,
    reporta_a_id: c?.reporta_a?.id ?? null,
    proposito: c?.proposito ?? '',
    funciones: c?.funciones?.length ? [...c.funciones] : [],
    educacion: c?.educacion ?? '',
    experiencia: c?.experiencia ?? '',
    competencias: (c?.competencias ?? []).map((x) => ({ ...x })),
    documentos: c ? [...c.documentos] : [...DOCUMENTOS_BASE],
    clase_arl: c?.clase_arl ?? null,
  };
}

/**
 * Lo que se envía: solo los campos que la RPC entiende; la escala solo si
 * alguna fila cambió (si no, no se toca el dato sensible ni queda registro).
 */
export function payloadCargo(
  d: DatosCargo,
  vigentes: readonly { sede_id: number | null; minimo: number; medio: number; maximo: number }[],
  incluirArl: boolean
): Record<string, unknown> {
  const p: Record<string, unknown> = {
    nombre: d.nombre.trim(),
    area_id: d.area_id,
    nivel: d.nivel,
    reporta_a_id: d.reporta_a_id,
    proposito: d.proposito?.trim() || null,
    funciones: d.funciones.map((f) => f.trim()).filter(Boolean),
    educacion: d.educacion?.trim() || null,
    experiencia: d.experiencia?.trim() || null,
    competencias: d.competencias.map((c) => ({ nombre: c.nombre.trim(), tipo: c.tipo, nivel: c.nivel })),
    documentos: d.documentos,
  };
  if (incluirArl) p.clase_arl = d.clase_arl ?? null;
  if (d.escala) {
    const filas = d.escala.filas.filter((f) => filaEscalaCambio(f, vigentes.find((v) => v.sede_id === f.sede_id)));
    if (filas.length) p.escala = { desde: d.escala.desde, motivo: d.escala.motivo.trim(), filas };
  }
  return p;
}

/** Rango de un salario frente a la escala (lo usará la ficha del empleado). */
export function posicionEnEscala(salario: number, escala: { minimo: number; maximo: number }): 'debajo' | 'dentro' | 'encima' {
  if (salario < escala.minimo) return 'debajo';
  if (salario > escala.maximo) return 'encima';
  return 'dentro';
}
