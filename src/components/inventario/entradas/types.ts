// Tipos para entradas de inventario

export type TipoEntrada = 'compra' | 'devolucion' | 'ajuste'

export interface EntradaBase {
  id: number
  organization_id: number
  branch_id: number
  status: string
  created_at: string
  updated_at: string
  notes?: string
}

// Tipo para compras (purchase_orders)
export interface EntradaCompra extends EntradaBase {
  tipo: 'compra'
  supplier_id: number
  expected_date?: string
  total: number
  created_by?: string
  suppliers?: {
    id: number
    name: string
  }
  branches?: {
    id: number
    name: string
  }
  po_items?: ItemCompra[]
}

// Tipo para ajustes de inventario
export interface EntradaAjuste extends EntradaBase {
  tipo: 'ajuste'
  type: string // 'increase' | 'decrease'
  reason: string
  created_by?: string
  branches?: {
    id: number
    name: string
  }
  adjustment_items?: ItemAjuste[]
}

// Tipo para devoluciones
export interface EntradaDevolucion extends EntradaBase {
  tipo: 'devolucion'
  sale_id: string
  user_id: string
  total_refund: number
  reason: string
  return_date?: string
  return_items?: any // jsonb field
  branches?: {
    id: number
    name: string
  }
}

// Items para cada tipo
export interface ItemCompra {
  id: number
  purchase_order_id: number
  product_id: number
  quantity: number
  unit_cost: number
  lot_code?: string
  received_qty?: number
  status?: string
  products?: {
    id: number
    name: string
    sku: string
  }
}

export interface ItemAjuste {
  id: number
  adjustment_id: number
  product_id: number
  quantity_change: number
  unit_cost?: number
  lot_code?: string
  reason?: string
  products?: {
    id: number
    name: string
    sku: string
  }
}

// Tipo unión para todas las entradas
export type Entrada = EntradaCompra | EntradaAjuste | EntradaDevolucion

// Helper para determinar el tipo
export function determinarTipoEntrada(id: number): Promise<TipoEntrada | null> {
  // Esta función será implementada para determinar qué tipo de entrada es
  // basándose en qué tabla contiene el ID
  return Promise.resolve(null)
}
