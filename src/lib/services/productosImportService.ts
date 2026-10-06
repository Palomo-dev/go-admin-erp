/**
 * Importación de productos en servidor — SOLO SERVIDOR.
 *
 * - `contextoImportacion`: lo que el asistente necesita para validar ANTES de
 *   importar (SKU existentes, coincidencias por nombre para la web, categorías
 *   e impuestos de la organización).
 * - `importarLote`: un lote → RPC transaccional `fn_importar_productos_lote`
 *   con la sesión del usuario (así `fn_assert_acceso_org` ve su `auth.uid()`),
 *   y después las imágenes por URL, que la base no puede descargar.
 *
 * La organización llega siempre de la sesión (`withOrg`). Los datos que se
 * leen con el cliente de sesión pasan por RLS; el service role se usa solo
 * para subir las imágenes al bucket (con la organización ya validada).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { normalizarNombre } from '@/lib/inventario/importacion/texto';
import { filaParaRpc, MAX_FILAS_POR_LOTE, type CuerpoLote, type FilaRpc } from '@/lib/inventario/importacion/payload';
import type { ResultadoFila } from '@/lib/inventario/importacion/tipos';
import { urlPublicaSegura } from '@/lib/services/urlSegura';
import { sinRetenciones } from '@/lib/services/taxResolverCore';

const BUCKET = 'product-images';
const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;
const TIMEOUT_IMAGEN_MS = 8000;
const CONCURRENCIA_IMAGENES = 4;
const MODOS = new Set(['crear_y_actualizar', 'solo_crear', 'solo_actualizar', 'duplicar']);

export interface ContextoRespuesta {
  existentes: Record<string, number>;
  porNombre: Record<string, { id: number; sku: string }>;
  categorias: string[];
  impuestos: string[];
}

/** SKU (en mayúsculas) y nombres normalizados que ya existen; categorías e impuestos. */
export async function contextoImportacion(
  sb: SupabaseClient,
  organizationId: number,
  entrada: { skus: string[]; nombres: string[] },
): Promise<ContextoRespuesta> {
  // Un catálogo web de 20 000 productos con variantes pasa de 20 000 SKU.
  const skus = Array.from(new Set(entrada.skus.map((s) => s.trim()).filter(Boolean))).slice(0, 60000);
  const existentes: Record<string, number> = {};
  // El SKU es único por organización y la RPC lo compara EXACTO: se busca tal
  // cual (la clave del mapa va en mayúsculas porque así compara el asistente).
  const candidatos = skus;
  for (let i = 0; i < candidatos.length; i += 300) {
    const { data, error } = await sb.from('products').select('id, sku').eq('organization_id', organizationId).in('sku', candidatos.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as { id: number; sku: string }[]) existentes[p.sku.toUpperCase()] = p.id;
  }

  const porNombre: Record<string, { id: number; sku: string }> = {};
  const buscados = new Set(entrada.nombres.map(normalizarNombre).filter(Boolean));
  if (buscados.size > 0) {
    for (let desde = 0; desde < 50000; desde += 1000) {
      const { data, error } = await sb
        .from('products')
        .select('id, sku, name')
        .eq('organization_id', organizationId)
        .is('parent_product_id', null)
        .neq('status', 'deleted')
        .order('id', { ascending: true })
        .range(desde, desde + 999);
      if (error) throw new Error(error.message);
      const pagina = (data ?? []) as { id: number; sku: string; name: string }[];
      for (const p of pagina) {
        const k = normalizarNombre(p.name);
        if (buscados.has(k) && !porNombre[k]) porNombre[k] = { id: p.id, sku: p.sku };
      }
      if (pagina.length < 1000) break;
    }
  }

  const [{ data: cats }, { data: taxes }] = await Promise.all([
    sb.from('categories').select('name').eq('organization_id', organizationId).limit(5000),
    sb.from('organization_taxes').select('name, rate, is_active, kind').eq('organization_id', organizationId),
  ]);
  const impuestos = new Set<string>();
  // Una retención no se relaciona con productos: la importación no la reconoce (fn_importar_productos_lote tampoco).
  for (const t of sinRetenciones((taxes ?? []) as { name: string; rate: number | string; is_active: boolean | null; kind?: string | null }[])) {
    if (t.is_active === false) continue;
    impuestos.add(normalizarNombre(t.name));
    impuestos.add(`tasa:${Number(t.rate)}`);
  }
  return {
    existentes,
    porNombre,
    categorias: Array.from(new Set(((cats ?? []) as { name: string }[]).map((c) => normalizarNombre(c.name)))),
    impuestos: Array.from(impuestos),
  };
}

export class ErrorLote extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = 'ErrorLote';
  }
}

/** Valida la forma del cuerpo (lo que no se puede validar aquí lo vuelve a validar la RPC). */
export function validarCuerpoLote(cuerpo: unknown): CuerpoLote {
  const c = cuerpo as Partial<CuerpoLote> | null;
  if (!c || typeof c !== 'object') throw new ErrorLote('Cuerpo inválido', 400, 'INVALID_BODY');
  if (!c.modo || !MODOS.has(c.modo)) throw new ErrorLote('Modo de importación inválido', 400, 'INVALID_MODE');
  const branchId = Number(c.branch_id);
  if (!Number.isInteger(branchId) || branchId <= 0) throw new ErrorLote('Sucursal requerida', 400, 'BRANCH_REQUIRED');
  if (!Array.isArray(c.filas) || c.filas.length === 0) throw new ErrorLote('Sin filas', 400, 'ROWS_REQUIRED');
  if (c.filas.length > MAX_FILAS_POR_LOTE) throw new ErrorLote(`Máximo ${MAX_FILAS_POR_LOTE} filas por lote`, 413, 'TOO_MANY_ROWS');
  const o = (c.opciones ?? {}) as Partial<CuerpoLote['opciones']>;
  return {
    modo: c.modo,
    branch_id: branchId,
    opciones: {
      stock_existentes: o.stock_existentes === 'sumar' ? 'sumar' : 'ignorar',
      importar_imagenes: o.importar_imagenes !== false,
      origen: o.origen === 'web' ? 'web' : 'archivo',
      fuente_url: typeof o.fuente_url === 'string' ? o.fuente_url.slice(0, 300) : undefined,
    },
    filas: c.filas as FilaRpc[],
  };
}

interface RespuestaRpc {
  creados: number;
  actualizados: number;
  omitidos: number;
  fallidos: number;
  resultados: Array<{ fila: number; sku: string; ok: boolean; accion?: 'creado' | 'actualizado' | 'omitido'; product_id?: number; error?: string; avisos?: { codigo: string; detalle?: string }[] }>;
}

export interface ResultadoLote {
  creados: number;
  actualizados: number;
  omitidos: number;
  fallidos: number;
  resultados: ResultadoFila[];
}

/** Traduce los errores de la base a un código estable para la UI. */
export function codigoErrorRpc(mensaje: string): string {
  const m = mensaje.toUpperCase();
  for (const c of ['SIN_SKU', 'SIN_NOMBRE', 'VARIANTE_PADRE_ELIMINADO', 'PADRE_NO_ENCONTRADO', 'STOCK_SIN_COSTO', 'PRECIO_INVALIDO', 'COSTO_INVALIDO', 'STOCK_INVALIDO']) if (m.includes(c)) return c;
  if (m.includes('DUPLICATE KEY')) return 'DUPLICADO';
  if (m.includes('VIOLATES CHECK') || m.includes('VIOLATES FOREIGN KEY')) return 'DATO_NO_VALIDO';
  return 'ERROR';
}

export async function importarLote(
  sbUsuario: SupabaseClient,
  organizationId: number,
  cuerpo: CuerpoLote,
): Promise<ResultadoLote> {
  const { data, error } = await sbUsuario.rpc('fn_importar_productos_lote', {
    p_organization_id: organizationId,
    p_branch_id: cuerpo.branch_id,
    p_modo: cuerpo.modo,
    p_filas: cuerpo.filas.map(filaParaRpc),
    p_opciones: { stock_existentes: cuerpo.opciones.stock_existentes, origen: cuerpo.opciones.origen, fuente_url: cuerpo.opciones.fuente_url ?? null },
  });
  if (error) {
    const msg = error.message ?? '';
    if (/SUCURSAL_NO_ES_DE_LA_ORGANIZACION/.test(msg)) throw new ErrorLote('La sucursal no pertenece a la organización', 403, 'BRANCH_NOT_IN_ORG');
    if (/Acceso denegado/.test(msg)) throw new ErrorLote('Sin acceso a la organización', 403, 'FORBIDDEN');
    throw new ErrorLote(msg || 'La importación falló', 500, 'RPC_ERROR');
  }
  const r = data as RespuestaRpc;
  const porFila = new Map(cuerpo.filas.map((f) => [f.fila, f]));
  const resultados: ResultadoFila[] = r.resultados.map((x) => ({
    fila: x.fila,
    sku: x.sku,
    ok: x.ok,
    accion: x.accion,
    productId: x.product_id ?? undefined,
    error: x.ok ? undefined : codigoErrorRpc(x.error ?? ''),
    avisos: [...(x.avisos ?? [])],
  }));

  if (cuerpo.opciones.importar_imagenes) {
    const tareas = resultados.filter((res) => res.ok && res.productId && res.accion !== 'omitido' && porFila.get(res.fila));
    await enParalelo(tareas, CONCURRENCIA_IMAGENES, async (res) => {
      const fila = porFila.get(res.fila)!;
      try {
        if (fila.imagenes?.length) {
          const fallidas = await importarImagenes(organizationId, res.productId!, fila.imagenes, res.accion === 'actualizado', fila.nombre);
          if (fallidas > 0) res.avisos!.push({ codigo: 'IMAGENES_FALLIDAS', detalle: String(fallidas) });
        } else if (fila.imagenes_del_padre && fila.sku_padre) {
          await copiarImagenesDelPadre(organizationId, res.productId!, fila.sku_padre);
        }
      } catch (err) {
        console.warn('[importarLote] imágenes', err instanceof Error ? err.message : err);
        res.avisos!.push({ codigo: 'IMAGENES_FALLIDAS', detalle: String(fila.imagenes?.length ?? 0) });
      }
    });
  }

  return { creados: r.creados, actualizados: r.actualizados, omitidos: r.omitidos, fallidos: r.fallidos, resultados };
}

async function enParalelo<T>(items: T[], limite: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const trabajador = async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
}

const EXTENSION_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** Descarga una imagen pública: http(s) sin hosts internos, ≤ 8 MB, `image/*`, 8 s. */
export async function descargarImagen(url: string): Promise<{ bytes: ArrayBuffer; tipo: string; extension: string } | null> {
  let actual = urlPublicaSegura(url);
  for (let salto = 0; actual && salto < 3; salto++) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_IMAGEN_MS);
    try {
      const res = await fetch(actual, { redirect: 'manual', signal: controlador.signal, headers: { Accept: 'image/*', 'User-Agent': 'GOAdmin-Importador/1.0' } });
      if (res.status >= 300 && res.status < 400) {
        const destino = res.headers.get('location');
        actual = destino ? urlPublicaSegura(new URL(destino, actual).toString()) : null;
        continue;
      }
      if (!res.ok) return null;
      const tipo = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!tipo.startsWith('image/') || tipo === 'image/svg+xml') return null;
      const largo = Number(res.headers.get('content-length') ?? 0);
      if (largo > MAX_BYTES_IMAGEN) return null;
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES_IMAGEN) return null;
      return { bytes, tipo, extension: EXTENSION_POR_TIPO[tipo] ?? 'jpg' };
    } catch {
      return null;
    } finally {
      clearTimeout(temporizador);
    }
  }
  return null;
}

/**
 * Sube las imágenes del producto. En una actualización solo reemplaza las
 * anteriores si al menos una nueva se descargó (y nunca borra archivos del
 * bucket: otras filas —variantes— pueden apuntar al mismo archivo).
 * Devuelve cuántas URLs fallaron.
 */
async function importarImagenes(organizationId: number, productId: number, urls: string[], reemplazar: boolean, nombre: string): Promise<number> {
  const sb = getServiceClient();
  const subidas: { storage_path: string }[] = [];
  let fallidas = 0;
  for (let i = 0; i < urls.length; i++) {
    const img = await descargarImagen(urls[i]);
    if (!img) {
      fallidas++;
      continue;
    }
    const ruta = `products/${organizationId}/${productId}_${Date.now()}_${i}.${img.extension}`;
    const { error } = await sb.storage.from(BUCKET).upload(ruta, img.bytes, { contentType: img.tipo, upsert: false });
    if (error) {
      fallidas++;
      continue;
    }
    subidas.push({ storage_path: ruta });
  }
  if (subidas.length === 0) return fallidas;

  let base = 0;
  if (reemplazar) {
    await sb.from('product_images').delete().eq('product_id', productId);
  } else {
    const { data } = await sb.from('product_images').select('display_order').eq('product_id', productId).order('display_order', { ascending: false }).limit(1);
    base = data && data.length ? Number((data[0] as { display_order: number }).display_order) + 1 : 0;
  }
  const { error } = await sb.from('product_images').insert(
    subidas.map((s, i) => ({ product_id: productId, storage_path: s.storage_path, display_order: base + i, is_primary: base === 0 && i === 0, alt_text: nombre.slice(0, 100) })),
  );
  if (error) throw new Error(error.message);
  return fallidas;
}

/** Variante creada desde la web: apunta a los mismos archivos del padre (sin duplicarlos). */
async function copiarImagenesDelPadre(organizationId: number, productId: number, skuPadre: string): Promise<void> {
  const sb = getServiceClient();
  const { data: padre } = await sb.from('products').select('id').eq('organization_id', organizationId).eq('sku', skuPadre).maybeSingle();
  if (!padre) return;
  const [{ data: imgs }, { count }] = await Promise.all([
    sb.from('product_images').select('storage_path, display_order, is_primary, alt_text').eq('product_id', (padre as { id: number }).id).order('display_order'),
    sb.from('product_images').select('id', { count: 'exact', head: true }).eq('product_id', productId),
  ]);
  if (!imgs?.length || (count ?? 0) > 0) return;
  await sb.from('product_images').insert((imgs as { storage_path: string; display_order: number; is_primary: boolean | null; alt_text: string | null }[]).map((i) => ({ ...i, product_id: productId })));
}
