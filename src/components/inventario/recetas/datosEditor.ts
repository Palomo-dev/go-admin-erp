import { supabase } from '@/lib/supabase/config';
import { recipeService, type RecetasFormularioServidor } from '@/lib/services/recipeService';
import { recetaDesdeServidor, recetaVacia, unidadLimpia, type RecetaBorrador, type UnidadReceta } from '@/components/kit/receta';

/**
 * Lo que necesita el editor de receta de la pantalla Recetas (el mismo
 * `EditorReceta` del formulario de producto): el producto final, su receta
 * activa en borrador, las unidades y el precio vigente para el margen. Solo
 * lecturas; guardar va por `fn_receta_guardar`.
 */
export interface ProductoReceta {
  id: number;
  nombre: string;
  sku: string | null;
  unidad: string;
  trackStock: boolean;
  modo: 'al_producir' | 'al_vender';
  parentId: number | null;
  /** El propio producto, su padre y sus variantes: no pueden ser ingredientes. */
  excluirIds: number[];
  precio: number | null;
}

export interface DatosEditorReceta {
  producto: ProductoReceta;
  receta: RecetaBorrador;
  /** La receta activa guardada (para saber si hay cambios y qué versión reemplaza). */
  activa: RecetaBorrador | null;
  unidades: UnidadReceta[];
  ordenesAbiertas: number;
}

interface FilaProducto {
  id: number;
  name: string;
  sku: string | null;
  unit_code: string | null;
  track_stock: boolean | null;
  production_type: string | null;
  parent_product_id: number | null;
  status: string | null;
}

export async function cargarUnidades(): Promise<UnidadReceta[]> {
  const { data, error } = await supabase.from('units').select('code, name, unit_type').order('name');
  if (error) throw error;
  return ((data ?? []) as UnidadReceta[]).map((u) => ({ ...u, code: unidadLimpia(u.code) }));
}

export async function cargarProductoReceta(organizationId: number, productId: number): Promise<ProductoReceta | null> {
  const [{ data: p, error }, { data: hijos }, { data: precio }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, sku, unit_code, track_stock, production_type, parent_product_id, status')
      .eq('organization_id', organizationId)
      .eq('id', productId)
      .maybeSingle(),
    supabase.from('products').select('id').eq('organization_id', organizationId).eq('parent_product_id', productId),
    supabase
      .from('product_prices')
      .select('price, effective_from')
      .eq('product_id', productId)
      .lte('effective_from', new Date().toISOString())
      .or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`)
      .order('effective_from', { ascending: false })
      .limit(1),
  ]);
  if (error) throw error;
  const fila = p as FilaProducto | null;
  if (!fila || fila.status === 'deleted') return null;
  const excluir = new Set<number>([fila.id, ...((hijos ?? []) as { id: number }[]).map((h) => Number(h.id))]);
  if (fila.parent_product_id) excluir.add(Number(fila.parent_product_id));
  const vigente = (precio ?? []) as { price: number | string }[];
  return {
    id: Number(fila.id),
    nombre: fila.name,
    sku: fila.sku,
    unidad: unidadLimpia(fila.unit_code),
    trackStock: fila.track_stock !== false,
    modo: fila.production_type === 'preparation' ? 'al_producir' : 'al_vender',
    parentId: fila.parent_product_id ? Number(fila.parent_product_id) : null,
    excluirIds: [...excluir],
    precio: vigente.length > 0 ? Number(vigente[0].price) : null,
  };
}

/** Receta activa propia del producto en borrador (o una vacía si no tiene). */
export function recetaActivaDe(datos: RecetasFormularioServidor, productId: number): RecetaBorrador | null {
  const r = datos.recetas.find((x) => Number(x.product_id) === productId);
  return r ? recetaDesdeServidor(r, datos.productos, { conId: true }) : null;
}

export async function cargarEditorReceta(organizationId: number, productId: number): Promise<DatosEditorReceta | null> {
  const [producto, formulario, unidades] = await Promise.all([
    cargarProductoReceta(organizationId, productId),
    recipeService.paraFormulario(organizationId, productId),
    cargarUnidades(),
  ]);
  if (!producto) return null;
  const activa = recetaActivaDe(formulario, productId);
  return {
    producto,
    receta: activa ?? recetaVacia(producto.unidad),
    activa,
    unidades,
    ordenesAbiertas: formulario.ordenes_abiertas,
  };
}
