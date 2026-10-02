/**
 * Pantalla Leads (CRM ola 3A, Figma 765:446571 y los 17 frames 765–768), sin
 * React: filtros → parámetros de `GET /api/crm/leads`, estado de la pantalla,
 * filas del kit, selección y exportación.
 *
 * D2: un lead es un cliente con `lifecycle_stage='lead'`. La lista pagina en
 * el servidor (25 por página; ~35 000 leads: nunca se carga todo). Las fechas
 * de captura se eligen como días de la organización y viajan como instantes.
 */
import { addPlainDays, nextPlainDay, plainDateToInstant } from '@/lib/utils/dateDisplay';
import { inicioDeMes, type RangoFechas } from '@/components/kit/rangoFechas';
import { origenValido, type LeadFila, type OrigenLead } from '@/components/crm/kit/leadRowLogica';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';

export const TAMANO_PAGINA_LEADS = 25;

const UUID_LEAD = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?lead=` del aviso. Solo un uuid; cualquier otro valor se ignora. */
export function idLeadDeQuery(valor: string | null | undefined): string | null {
  if (!valor || !UUID_LEAD.test(valor)) return null;
  return valor;
}

/** Fila de `GET /api/crm/leads` (columnas de `customers`). */
export interface LeadApi {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  doc_type?: string | null;
  doc_number?: string | null;
  company_name?: string | null;
  customer_type?: string | null;
  lead_source: string | null;
  owner_id: string | null;
  lead_score: number | null;
  icp_band?: string | null;
  last_contact_at: string | null;
  lead_discarded_at?: string | null;
  tags: string[] | null;
  created_at: string | null;
  do_not_call?: boolean | null;
  avatar_url?: string | null;
  city?: string | null;
}

export interface FiltrosLeads {
  q: string;
  origen: OrigenLead | '';
  /** Días de captura en la zona de la organización. */
  rango: RangoFechas | null;
  /** '' todos · 'ninguno' sin responsable · uuid. */
  responsable: string;
  /** Chip «Estado: Sin colocar» del `CaptureBanner` (formulario web sin embudo). */
  sinColocar: boolean;
  descartados: boolean;
}

export function filtrosLeadsVacios(): FiltrosLeads {
  return { q: '', origen: '', rango: null, responsable: '', sinColocar: false, descartados: false };
}

/** Filtros del panel (sin la búsqueda): el número del botón «Filtros». */
export function contarFiltrosLeads(f: FiltrosLeads): number {
  return [f.origen || f.sinColocar, f.rango, f.responsable, f.descartados].filter(Boolean).length;
}

export function hayFiltrosLeads(f: FiltrosLeads): boolean {
  return !!f.q.trim() || contarFiltrosLeads(f) > 0;
}

/** Query string de `GET /api/crm/leads`. */
export function parametrosLeads(f: FiltrosLeads, pagina: number, tamano: number, zona: string): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  const origen = f.sinColocar ? 'web_form' : f.origen;
  if (origen) p.set('origen', origen);
  if (f.responsable) p.set('owner_id', f.responsable);
  if (f.descartados) p.set('descartados', '1');
  if (f.rango) {
    const [desde, hasta] = f.rango.desde <= f.rango.hasta ? [f.rango.desde, f.rango.hasta] : [f.rango.hasta, f.rango.desde];
    p.set('creado_desde', plainDateToInstant(desde, zona));
    p.set('creado_hasta', plainDateToInstant(nextPlainDay(hasta), zona));
  }
  p.set('page', String(Math.max(1, pagina)));
  p.set('limit', String(tamano));
  return p.toString();
}

/** Query de `GET /api/crm/leads/resumen`: inicio del mes y hace 7 días, en la zona. */
export function parametrosResumenLeads(hoy: string, zona: string): string {
  const p = new URLSearchParams();
  p.set('mes_desde', plainDateToInstant(inicioDeMes(hoy), zona));
  p.set('siete_desde', plainDateToInstant(addPlainDays(hoy, -6), zona));
  return p.toString();
}

export interface ResumenLeads {
  total: number;
  nuevos_mes: number;
  sin_responsable: number;
  contactados_7d: number;
  calificados_mes: number;
  hay_embudo_ventas: boolean;
  sin_colocar: number;
}

/** «0,9 %» del total contactado en 7 días (una decimal; 0 sin leads). */
export function porcentajeContactados(r: Pick<ResumenLeads, 'contactados_7d' | 'total'>): number {
  if (!r.total) return 0;
  return Math.round((r.contactados_7d / r.total) * 1000) / 10;
}

export type EstadoPantallaLeads = 'cargando' | 'sinPermiso' | 'error' | 'vacio' | 'sinResultados' | 'listo';

export function estadoPantallaLeads(o: { cargando: boolean; errorStatus: number | null; hayError: boolean; total: number | null; filtros: FiltrosLeads }): EstadoPantallaLeads {
  if (o.errorStatus === 403) return 'sinPermiso';
  if (o.hayError) return 'error';
  if (o.cargando && o.total === null) return 'cargando';
  if (!o.total) return hayFiltrosLeads(o.filtros) ? 'sinResultados' : 'vacio';
  return 'listo';
}

/** Fila de la API → fila del kit (`LeadRow`), con el nombre del responsable. */
export function aLeadFila(r: LeadApi, usuarios: readonly OpcionUsuario[]): LeadFila & { documento: string | null } {
  const responsable = r.owner_id ? usuarios.find((u) => u.id === r.owner_id) : undefined;
  const documento = [r.doc_type, r.doc_number].filter(Boolean).join(' ') || null;
  return {
    id: r.id,
    full_name: r.full_name,
    customer_type: r.customer_type ?? null,
    // Empresas: el Figma pinta «NIT … · correo»; el kit une correo y teléfono.
    email: r.customer_type === 'company' && documento ? [documento, r.email].filter(Boolean).join(' · ') : r.email,
    phone: r.customer_type === 'company' && documento && r.email ? null : r.phone,
    lead_source: origenValido(r.lead_source),
    lead_score: r.lead_score,
    tags: r.tags ?? [],
    last_contact_at: r.last_contact_at,
    avatar_url: r.avatar_url ?? null,
    responsable: r.owner_id ? { id: r.owner_id, nombre: responsable?.nombre ?? '—' } : null,
    documento,
  };
}

// ─── Selección ──────────────────────────────────────────────────────────────

export function alternar(sel: ReadonlySet<string>, id: string, marcado: boolean): Set<string> {
  const s = new Set(sel);
  if (marcado) s.add(id);
  else s.delete(id);
  return s;
}

/** Casilla del encabezado: todos, ninguno o mixto, sobre la página visible. */
export function estadoCasillaPagina(sel: ReadonlySet<string>, ids: readonly string[]): boolean | 'indeterminate' {
  const marcados = ids.filter((id) => sel.has(id)).length;
  if (marcados === 0) return false;
  return marcados === ids.length ? true : 'indeterminate';
}

/** Lista móvil: la página siguiente se agrega sin repetir. */
export function acumular<T extends { id: string }>(previas: readonly T[], nuevas: readonly T[], pagina: number): T[] {
  if (pagina <= 1) return [...nuevas];
  const vistos = new Set(previas.map((x) => x.id));
  return [...previas, ...nuevas.filter((x) => !vistos.has(x.id))];
}

// ─── Exportar ───────────────────────────────────────────────────────────────

const celda = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Evita fórmulas al abrir en hojas de cálculo (=, +, -, @).
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

/** CSV de los leads seleccionados (lo ya cargado; nada se pide de nuevo). */
export function csvLeads(filas: readonly LeadApi[], usuarios: readonly OpcionUsuario[], encabezados: readonly string[]): string {
  const lineas = filas.map((r) =>
    [r.full_name, [r.doc_type, r.doc_number].filter(Boolean).join(' '), r.email, r.phone, r.lead_source, usuarios.find((u) => u.id === r.owner_id)?.nombre ?? '', r.lead_score, (r.tags ?? []).join(' | '), r.created_at, r.last_contact_at]
      .map(celda)
      .join(','),
  );
  return [encabezados.map(celda).join(','), ...lineas].join('\n');
}
