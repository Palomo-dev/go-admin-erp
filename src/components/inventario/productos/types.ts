/**
 * Tipos para el módulo de Productos
 */

export interface Producto {
  id: number;
  organization_id: number;
  sku: string;
  name: string;
  description: string;
  category_id: number;
  category?: Categoria; // Relación con categorías
  unit_code: string;
  unit?: UnidadMedida; // Relación con unidades
  supplier_id: number | null;
  supplier?: Proveedor; // Relación con proveedor
  track_stock: boolean;
  cost: number;
  price: number;
  image_url: string | null;
  image_type: string | null;
  image_path: string | null;
  barcode: string | null;
  status: string;
  is_menu_item: boolean;
  created_at?: string;
  updated_at?: string;
  stock?: number; // Campo calculado
  lots?: Lote[]; // Relación con lotes
  serial_numbers?: NumeroSerie[]; // Relación con números de serie
  images?: ProductoImagen[]; // Múltiples imágenes
  tags?: Etiqueta[]; // Etiquetas
  variants?: ProductoVariante[]; // Variantes
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

export interface ProductoImagen {
  id?: number;
  product_id: number;
  image_url: string;
  storage_path: string;
  display_order: number;
  is_primary: boolean;
  alt_text?: string;
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
