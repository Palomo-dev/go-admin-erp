// Tipos para el módulo de propinas

export type TipType = 'cash' | 'card' | 'transfer' | 'online';

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
}

export interface CreateTipData {
  sale_id?: string;
  payment_id?: string;
  server_id: string;
  amount: number;
  tip_type: TipType;
  notes?: string;
}

export interface UpdateTipData extends Partial<CreateTipData> {
  is_distributed?: boolean;
}

export interface TipFilters {
  server_id?: string;
  is_distributed?: boolean;
  tip_type?: TipType;
  dateFrom?: string;
  dateTo?: string;
}

export interface DistributionBatch {
  id: string;
  distributed_at: string;
  tips: Tip[];
  total_amount: number;
}

export const TIP_TYPE_LABELS: Record<TipType, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  online: 'Online'
};
