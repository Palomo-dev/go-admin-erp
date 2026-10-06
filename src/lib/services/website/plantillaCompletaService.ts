/**
 * «Plantilla completa» en el servidor: lee los DATOS REALES de la organización (y de la sede) y
 * arma el sitio con la fuente única `armarPlantillaCompleta` (src/lib/website/v2/plantillaCompleta.ts).
 *
 * Solo servidor y con el cliente de la SESIÓN (`ctx.supabase` de `withOrg`): la organización sale
 * de la sesión, la RLS filtra por pertenencia y cada consulta filtra además por `organization_id`.
 *
 * Para otros flujos (p. ej. la sede que nace con la plantilla de su tipo):
 * - `leerDatosNegocio(cliente, org, branchId)` → datos reales para la plantilla.
 * - `documentoPlantillaCompleta(cliente, org, branchId, base, plantilla)` → documento ya validado.
 *
 * `aplicarPlantillaCompleta` es la acción del diálogo «Usar esta plantilla › Plantilla completa»:
 * 1. Comprueba el permiso `website.sites.edit` y la versión que vio la persona.
 * 2. Guarda el borrador actual en el historial (`crearInstantanea`, motivo `antes_de_restaurar`).
 * 3. Reemplaza el borrador con compare-and-swap (`aplicarAlBorrador` → `guardarBorrador`).
 * Si el paso 3 choca con otra versión, queda una instantánea de más (inofensiva) y el borrador no
 * cambia: nunca se pierde trabajo. Deshacer = restaurar esa instantánea (ruta de instantáneas).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { plantillaPorId, type PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import {
  CATALOGO_PLANTILLAS,
  armarPlantillaCompleta,
  type DatosNegocio,
  type ProductoPlantilla,
  type ResumenPlantillaCompleta,
} from '@/lib/website/v2/plantillaCompleta';
import { tokensExtendidosDisponibles } from '@/lib/website/v2/tokensEstilo';
import { bucketDeRutaImagen } from '@/lib/utils/bucketImagen';
import { ErrorSitio, crearSitio, errorDesdePostgrest, listarSitios, obtenerBorrador } from './siteDocumentService';
import { crearInstantanea } from './editorSitioService';
import { aplicarAlBorrador, errorPagina, permisosSitio, type ContextoPaginas } from './paginasSitioService';
import type { RespuestaPlantillaCompleta } from '@/components/sitio-web/paginas/tiposPaginas';

/** Productos que se leen para fotos y platos estrella (los que tienen foto van primero). */
const LIMITE_PRODUCTOS = 24;
const LIMITE_CATEGORIAS = 8;

interface FilaProducto {
  id: number;
  name: string;
  category_id: number | null;
  product_images: { storage_path: string | null; is_primary: boolean | null; display_order: number | null }[] | null;
}

function urlPublica(cliente: SupabaseClient, ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  if (/^https?:\/\//.test(ruta)) return ruta;
  return cliente.storage.from(bucketDeRutaImagen(ruta)).getPublicUrl(ruta).data?.publicUrl || null;
}

function fotoPrincipal(fila: FilaProducto): string | null {
  const imagenes = [...(fila.product_images ?? [])].filter((i) => i.storage_path);
  imagenes.sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || (a.display_order ?? 0) - (b.display_order ?? 0));
  return imagenes[0]?.storage_path ?? null;
}

/**
 * Datos reales para la plantilla. La sede es `branchId` o, para el sitio principal, la sede
 * principal (o la primera activa). Columnas verificadas por MCP el 2026-10-06.
 */
export async function leerDatosNegocio(cliente: SupabaseClient, org: number, branchId: number | null): Promise<DatosNegocio> {
  const sedes = cliente
    .from('branches')
    .select('id, address, city, phone, website_cover_url, is_main')
    .eq('organization_id', org)
    .eq('is_active', true);
  const consultaSede = branchId === null ? sedes.order('is_main', { ascending: false }).order('id') : sedes.eq('id', branchId);

  const [organizacion, sede, productos, categorias, testimonios] = await Promise.all([
    cliente.from('organizations').select('name, description, phone, address, city').eq('id', org).maybeSingle(),
    consultaSede.limit(1).maybeSingle(),
    cliente
      .from('products')
      .select('id, name, category_id, product_images(storage_path, is_primary, display_order)')
      .eq('organization_id', org)
      .eq('status', 'active')
      .is('parent_product_id', null)
      .order('id', { ascending: true })
      .limit(LIMITE_PRODUCTOS * 2),
    cliente
      .from('categories')
      .select('id, name')
      .eq('organization_id', org)
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .limit(LIMITE_CATEGORIAS),
    cliente.from('testimonials').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('is_active', true),
  ]);
  for (const [r, contexto] of [
    [organizacion, 'organizacion'],
    [sede, 'sede'],
    [productos, 'productos'],
    [categorias, 'categorias'],
    [testimonios, 'testimonios'],
  ] as const) {
    if (r.error) throw errorDesdePostgrest(r.error, `plantillaCompleta.${contexto}`);
  }

  const o = (organizacion.data ?? {}) as { name?: string | null; description?: string | null; phone?: string | null; address?: string | null; city?: string | null };
  const s = (sede.data ?? {}) as { address?: string | null; city?: string | null; phone?: string | null; website_cover_url?: string | null };
  const filas = (productos.data ?? []) as FilaProducto[];
  const lista: ProductoPlantilla[] = filas.map((f) => ({
    id: f.id,
    nombre: f.name,
    imagenUrl: urlPublica(cliente, fotoPrincipal(f)),
    categoriaId: f.category_id,
  }));
  lista.sort((a, b) => Number(Boolean(b.imagenUrl)) - Number(Boolean(a.imagenUrl)));

  return {
    nombre: o.name ?? null,
    descripcion: o.description ?? null,
    ciudad: s.city || o.city || null,
    direccion: s.address || o.address || null,
    telefono: s.phone || o.phone || null,
    portadaUrl: urlPublica(cliente, s.website_cover_url),
    productos: lista.slice(0, LIMITE_PRODUCTOS),
    categorias: ((categorias.data ?? []) as { id: number; name: string }[]).map((c) => ({ id: c.id, nombre: c.name })),
    testimonios: testimonios.count ?? 0,
  };
}

/** Sitio completo de la plantilla sobre `base`, con los datos reales y ya validado. */
export async function documentoPlantillaCompleta(
  cliente: SupabaseClient,
  org: number,
  branchId: number | null,
  base: DocumentoSitio,
  plantilla: PlantillaCatalogo,
  generarId: () => string,
): Promise<{ documento: DocumentoSitio; resumen: ResumenPlantillaCompleta }> {
  const datos = await leerDatosNegocio(cliente, org, branchId);
  const r = armarPlantillaCompleta(base, plantilla, datos, { generarId, extendidos: tokensExtendidosDisponibles() });
  const validacion = validarDocumentoSitio(r.documento);
  if (!validacion.ok) throw new ErrorSitio('documento_invalido', 'La plantilla completa no cumple el contrato.', validacion.errores);
  return { documento: validacion.documento, resumen: r.resumen };
}

/** «Usar esta plantilla › Plantilla completa» sobre el borrador del sitio (principal o sede). */
export async function aplicarPlantillaCompleta(
  ctx: ContextoPaginas,
  branchId: number | null,
  versionEsperada: number | null,
  plantillaId: string,
  generarId: () => string,
): Promise<RespuestaPlantillaCompleta> {
  const plantilla = plantillaPorId(CATALOGO_PLANTILLAS, plantillaId);
  if (!plantilla) throw errorPagina('plantilla_no_existe');
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorSitio('sin_permiso', 'Necesitas el permiso «Editar sitio web» (website.sites.edit).');

  let sitio = (await listarSitios(ctx.supabase, ctx.organizationId)).find((s) => s.branchId === branchId);
  let version = versionEsperada;
  if (!sitio) {
    sitio = (await crearSitio(ctx.supabase, ctx.organizationId, branchId)).sitio;
    version = sitio.versionBorrador;
  }
  const borrador = await obtenerBorrador(ctx.supabase, ctx.organizationId, sitio.id);
  if (version === null || borrador.version !== version) {
    throw new ErrorSitio('conflicto_version', 'Alguien guardó o publicó una versión más nueva del borrador.', {
      esperada: version,
      actual: borrador.version,
    });
  }

  const { documento, resumen } = await documentoPlantillaCompleta(ctx.supabase, ctx.organizationId, branchId, borrador.documento, plantilla, generarId);
  // Lo anterior queda en el historial antes de reemplazarlo (se puede deshacer).
  const instantaneaId = (await crearInstantanea(ctx.supabase, ctx.organizationId, sitio.id, { documento: borrador.documento, version, motivo: 'antes_de_restaurar' })).id;
  const escrito = await aplicarAlBorrador(ctx, branchId, version, () => ({ ok: true, documento }));
  return { ...escrito, instantaneaId, resumen };
}
