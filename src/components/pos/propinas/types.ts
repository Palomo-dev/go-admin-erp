// Tipos para el módulo de propinas

/**
 * Los seis valores que admite `tips_tip_type_check` (migración
 * 20260925110000). `split` y `pooled` no se ofrecen al registrar a mano, pero
 * existen en la base y se muestran y suman como los demás.
 */
export const TIP_TYPES = ['cash', 'card', 'transfer', 'online', 'split', 'pooled'] as const;
export type TipType = (typeof TIP_TYPES)[number];

/** Tipos que ofrece el formulario «Nueva propina». */
export const TIP_TYPES_FORMULARIO: readonly TipType[] = ['cash', 'card', 'transfer', 'online'];

export interface Tip {
  id: string;
  organization_id: number;
  branch_id: number;
  sale_id?: string;
  payment_id?: string;
  server_id: string;
  amount: number;
  tip_type: TipType;
  is_distributed: boolean;
  distributed_at?: string;
  distribution_batch_id?: string;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  notes?: string;
  created_at: string;
  server?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  sale?: {
    id: string;
    total: number;
    sale_date: string;
  };
}

export interface TipSummary {
  server_id: string;
  server_name: string;
  server_email: string;
  total_tips: number;
  tips_count: number;
  distributed_amount: number;
  pending_amount: number;
  cash_tips: number;
  card_tips: number;
  transfer_tips: number;
  online_tips: number;
  split_tips: number;
  pooled_tips: number;
}

/** Los KPI de la cabecera: salen de las mismas propinas que pinta la tabla. */
export interface TipStats {
  total: number;
  distributed: number;
  pending: number;
  count: number;
  byType: Record<TipType, number>;
}

export interface CreateTipData {
  sale_id?: string;
  payment_id?: string;
  server_id: string;
  amount: number;
  tip_type: TipType;
  notes?: string;
  /**
   * Sucursal de la propina. Si no viene, la sucursal activa del operador.
   * Un pedido web la manda explícita: la propina es de la sucursal del pedido.
   */
  branch_id?: number;
}

/** Lo único que se corrige de una propina pendiente. Distribuir y anular van por RPC. */
export type UpdateTipData = Partial<Pick<CreateTipData, 'server_id' | 'amount' | 'tip_type' | 'notes'>>;

export interface TipFilters {
  server_id?: string;
  is_distributed?: boolean;
  tip_type?: TipType;
  /** Día calendario de la organización (YYYY-MM-DD). */
  dateFrom?: string;
  /** Día calendario de la organización (YYYY-MM-DD), incluido. */
  dateTo?: string;
}

export interface DistributionBatch {
  id: string;
  distributed_at: string;
  tips: Tip[];
  total_amount: number;
}

export interface Mesero {
  id: string;
  name: string;
  email: string;
}

/** Lo que el usuario de la sesión puede hacer en Propinas (lo decide la base). */
export interface PermisosPropinas {
  registrar: boolean;
  anular: boolean;
  liquidar: boolean;
}
