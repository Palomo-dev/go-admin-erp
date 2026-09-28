/**
 * «Exportar productos» del importador: el catálogo en el MISMO formato de la
 * plantilla (26 columnas), para editarlo en Excel y volver a importarlo.
 * Lee con la sesión del usuario (RLS) y por páginas de 500.
 *
 * Corrige la exportación anterior, que leía columnas inexistentes
 * (`products.tags`, `.tax_name`, `.notes`, `.min_stock_level`) y por eso
 * sacaba etiquetas, impuesto y stock mínimo siempre vacíos; y que incluía los
 * productos eliminados.
 */

import { supabase } from '@/lib/supabase/config';
import { BOM, aCsv } from '@/lib/inventario/importacion/reporte';
import { CAMPOS } from '@/lib/inventario/importacion/campos';

const PAGINA = 500;

type Uno<T> = T | T[] | null;
const primero = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

interface FilaExport {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  product_type: string | null;
  unit_code: string | null;
  barcode: string | null;
  brand: string | null;
  reference: string | null;
  track_stock: boolean | null;
  variant_data: unknown;
  is_parent: boolean | null;
  station: string | null;
  status: string | null;
  categories: Uno<{ name: string }>;
  parent: Uno<{ sku: string }>;
  product_prices: { price: number; compare_price: number | null; effective_from: string; effective_to: string | null }[] | null;
  product_costs: { cost: number; effective_from: string; effective_to: string | null }[] | null;
  stock_levels: { qty_on_hand: number | null; qty_reserved: number | null; min_level: number | null }[] | null;
  product_images: { storage_path: string; is_primary: boolean | null; display_order: number | null }[] | null;
  product_suppliers: { is_preferred: boolean | null; suppliers: Uno<{ name: string }> }[] | null;
  product_tag_relations: { product_tags: Uno<{ name: string }> }[] | null;
  product_tax_relations: { organization_taxes: Uno<{ name: string }> }[] | null;
  product_modifier_groups: { name: string; selection_mode: string | null; min_selections: number | null; max_selections: number | null; required: boolean | null; display_order: number | null; product_modifiers: { name: string; extra_price: number | null; is_active: boolean | null; display_order: number | null }[] | null }[] | null;
}

function vigente<T extends { effective_from: string; effective_to: string | null }>(lista: T[] | null): T | null {
  const ahora = Date.now();
  return (lista ?? [])
    .filter((x) => !x.effective_to || new Date(x.effective_to).getTime() > ahora)
    .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0] ?? null;
}

/**
 * Textos visibles del archivo en el idioma de la interfaz: cabeceras
 * (`productosImportar.cabeceras`, que el importador reconoce en es/en/fr/pt) y
 * el valor de la columna «Tipo» (el importador lo lee por la raíz «serv»).
 */
export interface TextosExportacion {
  cabeceras: readonly string[];
  producto: string;
  servicio: string;
}

/** Textos del archivo con el `t` de `useTranslations('productosImportar')`. */
export function textosExportacion(t: (clave: string) => string): TextosExportacion {
  return {
    cabeceras: CAMPOS.map((c) => t(`cabeceras.${c.campo}`)),
    producto: t('valores.producto'),
    servicio: t('valores.servicio'),
  };
}

function filaCsv(p: FilaExport, textos: TextosExportacion): unknown[] {
  const precio = vigente(p.product_prices);
  const costo = vigente(p.product_costs);
  const niveles = p.stock_levels ?? [];
  const stock = p.track_stock === false ? 0 : niveles.reduce((s, n) => s + Number(n.qty_on_hand ?? 0) - Number(n.qty_reserved ?? 0), 0);
  const minimo = niveles.reduce((m, n) => Math.max(m, Number(n.min_level ?? 0)), 0);
  const imagenes = (p.product_images ?? [])
    .slice()
    .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((i) => (/^https?:\/\//.test(i.storage_path) ? i.storage_path : supabase.storage.from('product-images').getPublicUrl(i.storage_path).data.publicUrl))
    .filter(Boolean);
  const proveedores = (p.product_suppliers ?? [])
    .slice()
    .sort((a, b) => Number(!!b.is_preferred) - Number(!!a.is_preferred))
    .map((s) => primero(s.suppliers)?.name)
    .filter(Boolean);
  const etiquetas = (p.product_tag_relations ?? []).map((r) => primero(r.product_tags)?.name).filter(Boolean);
  const impuesto = (p.product_tax_relations ?? []).map((r) => primero(r.organization_taxes)?.name).filter(Boolean)[0] ?? '';
  const modificadores = (p.product_modifier_groups ?? [])
    .slice()
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((g) => {
      const ops = (g.product_modifiers ?? [])
        .filter((m) => m.is_active !== false)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((m) => `${m.name}=${m.extra_price ?? 0}`);
      return `${g.name}|${g.selection_mode || 'single'}|${g.min_selections ?? 0}|${g.max_selections ?? ''}|${g.required ? 'true' : 'false'}|${ops.join(',')}`;
    })
    .join('; ');
  const variante = p.variant_data && typeof p.variant_data === 'object' && Object.keys(p.variant_data as object).length ? JSON.stringify(p.variant_data) : '';
  return [
    p.sku,
    p.name,
    p.product_type === 'service' ? textos.servicio : textos.producto,
    p.description ?? '',
    primero(p.categories)?.name ?? '',
    p.unit_code?.trim() ?? '',
    p.barcode ?? '',
    p.brand ?? '',
    p.reference ?? '',
    proveedores.join(';'),
    precio?.price ?? '',
    precio?.compare_price ?? '',
    costo?.cost ?? '',
    impuesto,
    p.track_stock === false ? 'false' : 'true',
    stock,
    minimo,
    etiquetas.join(';'),
    '',
    imagenes.join(';'),
    primero(p.parent)?.sku ?? '',
    variante,
    p.is_parent ? 'true' : 'false',
    p.station ?? 'none',
    modificadores,
    p.status ?? 'active',
  ];
}

/** Devuelve el CSV (con BOM) y cuántos productos lleva. */
export async function exportarCatalogoCsv(
  organizationId: number,
  textos: TextosExportacion,
  alAvanzar?: (leidos: number) => void,
): Promise<{ csv: string; total: number }> {
  const filas: unknown[][] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from('products')
      .select(
        `id, sku, name, description, product_type, unit_code, barcode, brand, reference, track_stock, variant_data, is_parent, station, status,
         categories(name), parent:products!parent_product_id(sku),
         product_prices(price, compare_price, effective_from, effective_to),
         product_costs(cost, effective_from, effective_to),
         stock_levels(qty_on_hand, qty_reserved, min_level),
         product_images(storage_path, is_primary, display_order),
         product_suppliers(is_preferred, suppliers(name)),
         product_tag_relations(product_tags(name)),
         product_tax_relations(organization_taxes(name)),
         product_modifier_groups(name, selection_mode, min_selections, max_selections, required, display_order, product_modifiers(name, extra_price, is_active, display_order))`,
      )
      .eq('organization_id', organizationId)
      .neq('status', 'deleted')
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as unknown as FilaExport[];
    filas.push(...pagina.map((p) => filaCsv(p, textos)));
    alAvanzar?.(filas.length);
    if (pagina.length < PAGINA) break;
  }
  return { csv: BOM + aCsv([[...textos.cabeceras], ...filas]), total: filas.length };
}

export function descargarTexto(contenido: string, nombre: string, tipo = 'text/csv;charset=utf-8;'): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
