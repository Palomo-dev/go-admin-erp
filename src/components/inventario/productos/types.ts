/**
 * Tipos para el módulo de Productos
 */

export interface Producto {
  id: number | string; // Puede ser string para casos temporales como "duplicate"
  uuid?: string; // UUID para URLs amigables
  organization_id: number;
  sku: string;
  name: string;
  description: string;
  category_id: number;
  category?: Categoria; // Relación con categorías
  unit_code: string;
  unit?: UnidadMedida; // Relación con unidades
  supplier_id: number | null;
  barcode: string | null;
  status: string;
  is_menu_item: boolean;
  created_at?: string;
  updated_at?: string;
  parent_product_id?: number | string | null;
  
  // Campos calculados basados en relaciones
  cost?: number; // Campo calculado del costo actual
  price?: number; // Campo calculado del precio actual
  stock?: number; // Campo calculado de stock
  
  // Relaciones optimizadas
  product_prices?: ProductoPrecio[];
  product_costs?: ProductoCosto[];
  stock_levels?: StockLevel[];
  product_images?: ProductoImagen[];
  children?: Producto[]; // Productos hijos/variantes
  
  // Campos adicionales
  tags?: Etiqueta[];
  lots?: Lote[];
  serial_numbers?: NumeroSerie[];
  initial_stock?: number; // Stock inicial (solo para creación)
  selected_branch_id?: number; // Sucursal para el stock inicial
}

export interface Categoria {
  id: number;
  organization_id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  rank: number;
  created_at?: string;
  updated_at?: string;
  parent?: Categoria;
}

export interface UnidadMedida {
  code: string;
  name: string;
  conversion_factor: number;
  created_at?: string;
  updated_at?: string;
}

export interface Lote {
  id: number;
  product_id: number;
  lot_code: string;
  expiry_date: string;
  supplier_id: number;
  created_at?: string;
  updated_at?: string;
}

export interface NumeroSerie {
  id: number;
  product_id: number;
  serial: string;
  status: string;
  sale_id: string | null;
  purchase_id: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StockSucursal {
  branch_id: number;
  branch_name?: string;
  product_id: number;
  qty: number;
}

export interface ProductoPrecio {
  id: number | string;
  product_id: number | string;
  price: number;
  effective_from: string;
  effective_to: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductoCosto {
  id: number | string;
  product_id: number | string;
  cost: number;
  effective_from: string;
  effective_to: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StockLevel {
  id?: number;
  product_id: number | string;
  branch_id: number;
  qty_on_hand: number;
  qty_reserved: number;
  avg_cost?: number;
  created_at?: string;
  updated_at?: string;
  branches?: {
    id: number;
    name: string;
  };
}

export interface ProductoImagen {
  id: number | string;
  product_id: number | string;
  storage_path: string;
  file_name?: string;
  file_type?: string;
  size?: number;
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Etiqueta {
  id: number;
  organization_id: number;
  name: string;
}

export interface VariantTypeFormValue {
  name: string;
  values: string[];
}

export interface TipoVariante {
  id: number;
  organization_id: number;
  name: string;
  values?: ValorVariante[];
}

export interface ValorVariante {
  id: number;
  variant_type_id: number;
  value: string;
  display_order: number;
}

export interface ProductoVariante {
  id?: number;
  product_id: number;
  sku?: string;
  price?: number;
  cost?: number;
  stock_quantity?: number;
  attributes: ProductoVarianteAtributo[];
}

export interface ProductoVarianteAtributo {
  variant_type_id: number;
  variant_value_id: number;
}

export interface Proveedor {
  id: number;
  organization_id: number;
  name: string;
  nit?: string;
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface FiltrosProductos {
  busqueda: string;
  categoria: number | null;
  estado: string;
  ordenarPor: string;
  mostrarEliminados?: boolean;
}

export interface ProductoFormValues {
  sku: string;
  name: string;
  description: string;
  category_id: number | null;
  unit_code: string;
  supplier_id: number | null;
  track_stock: boolean;
  cost: number;
  price: number;
  barcode: string;
  status: string;
  is_menu_item: boolean;
  initial_stock?: number;
  selected_branch_id?: number;
  tags?: number[];
  variant_types?: VariantTypeFormValue[];
  images?: FileList | File[];
}
