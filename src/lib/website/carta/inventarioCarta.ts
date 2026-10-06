'use client';

/**
 * Lecturas de Inventario para el constructor de la carta (navegador, cliente con RLS; mismo
 * patrón que `EntityField`). Siempre filtradas por la organización activa.
 *
 * Columnas verificadas por MCP (jgmgphmzusbluqhuqihj) el 2026-10-05:
 * - categories: id, organization_id, parent_id, name, is_active
 * - products: id, organization_id, name, sku, category_id, description, status, parent_product_id
 * Mismo criterio que la web: productos `status = 'active'` y sin padre.
 */
import { supabase } from '@/lib/supabase/config';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';

export interface CategoriaInventario {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface PlatoInventario {
  id: number;
  name: string;
  sku: string | null;
  category_id: number | null;
  description: string | null;
}

const COLUMNAS_PLATO = 'id, name, sku, category_id, description';
/** Tope de platos que se cargan para la carta (las cartas reales tienen decenas o cientos). */
export const TOPE_PLATOS_CARTA = 1000;

export async function categoriasDeInventario(organizationId: number): Promise<CategoriaInventario[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, parent_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CategoriaInventario[];
}

/** Platos activos de esas categorías (o de todas si `categorias` es null). */
export async function platosDeCategorias(organizationId: number, categorias: number[] | null): Promise<PlatoInventario[]> {
  let q = supabase
    .from('products')
    .select(COLUMNAS_PLATO)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('parent_product_id', null);
  if (categorias) {
    if (categorias.length === 0) return [];
    q = q.in('category_id', categorias.slice(0, 500));
  }
  const { data, error } = await q.order('name', { ascending: true }).limit(TOPE_PLATOS_CARTA);
  if (error) throw error;
  return (data ?? []) as PlatoInventario[];
}

/** Búsqueda en todo el Inventario por nombre o SKU (columna izquierda). */
export async function buscarPlatos(organizationId: number, texto: string): Promise<PlatoInventario[]> {
  const t = texto.trim();
  if (!t) return [];
  const { data, error } = await supabase
    .from('products')
    .select(COLUMNAS_PLATO)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('parent_product_id', null)
    .or(ilikeAnyOf(['name', 'sku'], t))
    .order('name', { ascending: true })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as PlatoInventario[];
}
