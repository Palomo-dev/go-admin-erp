/**
 * Cartera y proveedores por edades a una fecha de corte.
 *
 * El cálculo vive en `fn_reporte_cxc_aging` y `fn_reporte_cxp_aging`: mora al corte, saldo al
 * corte y bandas que suman el total. Aquí solo se lee y se normaliza. Lo usan la pantalla
 * `/app/finanzas/reportes/cartera-edades` y los reportes `cxc-aging` y `cxp-aging`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeBranchParam } from '@/lib/services/branchFilterHelper';

export type TipoCartera = 'cxc' | 'cxp';

export const BANDAS = ['corriente', '1-30', '31-60', '61-90', '+90'] as const;
export type Banda = (typeof BANDAS)[number];

export interface TotalBanda {
  banda: Banda;
  total: number;
  cantidad: number;
}

export interface FilaTercero {
  terceroId: string;
  tercero: string;
  porBanda: Record<Banda, number>;
  total: number;
  cantidad: number;
}

export interface FilaDocumento {
  documentoId: string;
  numero: string | null;
  terceroId: string;
  tercero: string;
  sucursalId: number | null;
  /** Días calendario `YYYY-MM-DD`. */
  fecha: string;
  vence: string;
  monto: number;
  abonado: number;
  saldo: number;
  diasMora: number;
  banda: Banda;
}

export interface AnticipoTercero {
  creditoId: string;
  terceroId: string;
  tercero: string;
  fecha: string;
  saldo: number;
}

export interface CarteraEdades {
  tipo: TipoCartera;
  corte: string;
  total: number;
  vencida: number;
  bandas: TotalBanda[];
  terceros: FilaTercero[];
  documentos: FilaDocumento[];
  /** Aparte: nunca resta de la cartera. */
  anticipos: {
    /** `saldos_a_favor`: auxiliar por cliente. `mayor`: con proveedores solo hay saldo del mayor. */
    origen: 'saldos_a_favor' | 'mayor';
    cuenta: string;
    total: number;
    detalle: AnticipoTercero[];
  };
  mayor: { cuenta: string; saldo: number; diferencia: number; cuadra: boolean };
}

type Crudo = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const lista = (v: unknown): Crudo[] => (Array.isArray(v) ? (v as Crudo[]) : []);
const esBanda = (v: unknown): v is Banda => BANDAS.includes(v as Banda);

/** Normaliza el jsonb de la RPC. Con un doble vacío devuelve una cartera en cero. */
export function normalizarCartera(tipo: TipoCartera, corte: string, dato: unknown): CarteraEdades {
  const d = (dato ?? {}) as Crudo;
  const crudas = lista(d.buckets);
  const anticipos = (d.anticipos ?? {}) as Crudo;
  const mayor = (d.mayor ?? {}) as Crudo;

  return {
    tipo,
    corte: texto(d.corte) || corte,
    total: num(d.total),
    vencida: num(d.vencida),
    bandas: BANDAS.map((banda) => {
      const fila = crudas.find((b) => b.bucket === banda);
      return { banda, total: num(fila?.total), cantidad: num(fila?.cantidad) };
    }),
    terceros: lista(d.terceros).map((t) => ({
      terceroId: texto(t.tercero_id),
      tercero: texto(t.tercero) || '—',
      porBanda: {
        corriente: num(t.corriente),
        '1-30': num(t.d1_30),
        '31-60': num(t.d31_60),
        '61-90': num(t.d61_90),
        '+90': num(t.d90),
      },
      total: num(t.total),
      cantidad: num(t.cantidad),
    })),
    documentos: lista(d.detalle).map((f) => ({
      documentoId: texto(f.documento_id),
      numero: f.numero ? texto(f.numero) : null,
      terceroId: texto(f.tercero_id),
      tercero: texto(f.tercero) || '—',
      sucursalId: f.branch_id === null || f.branch_id === undefined ? null : num(f.branch_id),
      fecha: texto(f.fecha),
      vence: texto(f.vence),
      monto: num(f.monto),
      abonado: num(f.abonado),
      saldo: num(f.saldo),
      diasMora: num(f.dias_mora),
      banda: esBanda(f.banda) ? f.banda : 'corriente',
    })),
    anticipos: {
      origen: anticipos.origen === 'mayor' ? 'mayor' : 'saldos_a_favor',
      cuenta: texto(anticipos.cuenta) || (tipo === 'cxc' ? '2805' : '1330'),
      total: num(anticipos.total),
      detalle: lista(anticipos.detalle).map((a) => ({
        creditoId: texto(a.credito_id),
        terceroId: texto(a.tercero_id),
        tercero: texto(a.tercero) || '—',
        fecha: texto(a.fecha),
        saldo: num(a.saldo),
      })),
    },
    mayor: {
      cuenta: texto(mayor.cuenta) || (tipo === 'cxc' ? '1305' : '2205'),
      saldo: num(mayor.saldo),
      diferencia: num(mayor.diferencia),
      cuadra: mayor.cuadra === true,
    },
  };
}

export const RPC_CARTERA = { cxc: 'fn_reporte_cxc_aging', cxp: 'fn_reporte_cxp_aging' } as const;
export type RpcCartera = (typeof RPC_CARTERA)[TipoCartera];

export async function leerCarteraEdades(
  db: Pick<SupabaseClient, 'rpc'>,
  rpc: RpcCartera,
  organizacionId: number,
  corte: string,
  sucursalId?: number | null,
): Promise<CarteraEdades> {
  const { data, error } = await db.rpc(rpc, {
    p_organization_id: organizacionId,
    p_as_of: corte,
    p_branch_id: normalizeBranchParam(sucursalId),
  });
  if (error) throw error;
  return normalizarCartera(rpc === RPC_CARTERA.cxc ? 'cxc' : 'cxp', corte, data);
}

/** % vencido entero. Sin cartera es 0, no `NaN`. */
export function porcentajeVencido(c: Pick<CarteraEdades, 'total' | 'vencida'>): number {
  return c.total > 0 ? Math.round((c.vencida / c.total) * 100) : 0;
}

/** Totales por banda de la fila «Total» de la tabla: los mismos del servidor. */
export function totalesPorBanda(c: Pick<CarteraEdades, 'bandas'>): Record<Banda, number> {
  return Object.fromEntries(c.bandas.map((b) => [b.banda, b.total])) as Record<Banda, number>;
}

/** Banda con más atraso que tiene saldo: la que resume al tercero en la tarjeta móvil. */
export function bandaMasAtrasada(f: Pick<FilaTercero, 'porBanda'>): Banda | null {
  for (const banda of [...BANDAS].reverse()) {
    if (banda !== 'corriente' && f.porBanda[banda] > 0) return banda;
  }
  return null;
}
