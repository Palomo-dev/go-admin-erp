/**
 * Plantilla del sitio de una sede según su tipo de negocio: estado y «Aplicar plantilla de <tipo>».
 *
 * Solo servidor, con el cliente de la SESIÓN (`ctx.supabase` de `withOrg`): la organización sale
 * de la sesión; el permiso (`website.sites.edit`), la pertenencia de la sucursal y la coherencia
 * del tipo los vuelve a comprobar `fn_website_plantilla_sede` contra `auth.uid()`.
 *
 * No hay lógica de sitio duplicada: el documento lo arma `documentoPlantillaDeSede` (el juego de
 * páginas de `create_default_pages` + «Restaurar páginas base») y la creación normal pasa por
 * `crearSitio`, igual que cuando se abre la sede en el editor.
 *
 * Contrato para quien guarda la sucursal (formulario, importación, otro consumidor):
 *   POST /api/sitio-web/sedes/<branchId>/plantilla { modo: 'auto' }
 * tras crear la sucursal o cambiar su `branch_type`. Ver `sincronizarPlantillaSede`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ErrorSitio,
  crearSitio,
  documentoPlantillaDeSede,
  errorDesdePostgrest,
  rpcPlantillaSede,
} from '@/lib/services/website/siteDocumentService';
import {
  borradorIntacto,
  esTipoSedePlantilla,
  type EstadoPlantillaSede,
  type ResultadoPlantillaSede,
} from '@/lib/website/v2/plantillaSede';

export interface ContextoPlantillaSede {
  supabase: SupabaseClient;
  organizationId: number;
}

interface FilaSitioSede {
  id: string;
  published_revision_id: string | null;
  plantilla_tipo?: string | null;
  plantilla_version_borrador?: number | null;
}

async function sucursal(ctx: ContextoPlantillaSede, branchId: number): Promise<{ id: number; branch_type: string | null }> {
  const { data, error } = await ctx.supabase
    .from('branches')
    .select('id, branch_type')
    .eq('id', branchId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'plantillaSede.sucursal');
  if (!data) throw new ErrorSitio('sucursal_no_encontrada', 'La sucursal no existe en esta organización.');
  return data as { id: number; branch_type: string | null };
}

/** Sitio V2 de la sede con su marca de plantilla. Sin la migración, la marca no existe (null). */
async function sitioDeSede(ctx: ContextoPlantillaSede, branchId: number): Promise<{ fila: FilaSitioSede | null; conMarca: boolean }> {
  const base = () =>
    ctx.supabase
      .from('website_site_states')
      .select('id, published_revision_id, plantilla_tipo, plantilla_version_borrador')
      .eq('organization_id', ctx.organizationId)
      .eq('branch_id', branchId)
      .maybeSingle();
  const r = await base();
  if (!r.error) return { fila: (r.data as FilaSitioSede | null) ?? null, conMarca: true };
  // 42703 / PGRST204: la columna de la marca aún no existe → se lee sin ella.
  if (r.error.code !== '42703' && !/column .* does not exist|plantilla_/i.test(r.error.message ?? '')) {
    throw errorDesdePostgrest(r.error, 'plantillaSede.sitio');
  }
  const sinMarca = await ctx.supabase
    .from('website_site_states')
    .select('id, published_revision_id')
    .eq('organization_id', ctx.organizationId)
    .eq('branch_id', branchId)
    .maybeSingle();
  if (sinMarca.error) throw errorDesdePostgrest(sinMarca.error, 'plantillaSede.sitioSinMarca');
  return { fila: (sinMarca.data as FilaSitioSede | null) ?? null, conMarca: false };
}

async function versionBorrador(ctx: ContextoPlantillaSede, sitioId: string): Promise<number | null> {
  const { data, error } = await ctx.supabase
    .from('website_site_drafts')
    .select('version')
    .eq('site_state_id', sitioId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'plantillaSede.borrador');
  return (data as { version: number } | null)?.version ?? null;
}

/** Estado de la plantilla del sitio de una sede (para el diálogo y el formulario de sucursal). */
export async function estadoPlantillaSede(ctx: ContextoPlantillaSede, branchId: number): Promise<EstadoPlantillaSede> {
  const s = await sucursal(ctx, branchId);
  const tipo = esTipoSedePlantilla(s.branch_type) ? s.branch_type : null;
  const { fila, conMarca } = await sitioDeSede(ctx, branchId);
  const version = fila ? await versionBorrador(ctx, fila.id) : null;
  const intacto = fila
    ? borradorIntacto({
        versionBorrador: version,
        versionPlantilla: conMarca ? fila.plantilla_version_borrador ?? null : null,
        publicado: Boolean(fila.published_revision_id),
      })
    : null;
  return {
    branchId,
    tipo,
    sitioId: fila?.id ?? null,
    version,
    plantillaTipo: conMarca ? fila?.plantilla_tipo ?? null : null,
    intacto,
    // Aplicar reemplaza el borrador: solo tiene sentido con un tipo con plantilla y la marca
    // (la RPC) disponible; sin sitio, «aplicar» es crearlo.
    puedeAplicar: tipo !== null && conMarca,
  };
}

/**
 * Crea o actualiza el sitio de la sede con la plantilla de su tipo.
 * - `auto` (al crear la sucursal o cambiarle el tipo): nunca pisa contenido propio.
 * - `confirmado` («Aplicar plantilla de <tipo>»): reemplaza el borrador; el anterior queda en el
 *   historial («Guardado automático») y se puede restaurar. Exige la versión que vio la persona.
 */
export async function aplicarPlantillaSede(
  ctx: ContextoPlantillaSede,
  branchId: number,
  modo: 'auto' | 'confirmado',
  versionEsperada: number | null,
): Promise<ResultadoPlantillaSede> {
  const s = await sucursal(ctx, branchId);
  if (!esTipoSedePlantilla(s.branch_type)) {
    return { accion: 'sin_tipo', branchId, tipo: null, sitioId: null, version: null };
  }
  const tipo = s.branch_type;
  const { fila } = await sitioDeSede(ctx, branchId);

  // Sin sitio: el camino normal de creación (el mismo del editor), que ya usa la plantilla.
  if (!fila) {
    const creado = await crearSitio(ctx.supabase, ctx.organizationId, branchId);
    return {
      accion: creado.creado ? 'creado' : 'sin_cambios',
      branchId,
      tipo,
      sitioId: creado.sitio.id,
      version: creado.sitio.versionBorrador,
    };
  }

  if (modo === 'confirmado' && versionEsperada === null) {
    throw new ErrorSitio('peticion_invalida', 'Falta la versión del borrador.');
  }
  const documento = await documentoPlantillaDeSede(ctx.supabase, ctx.organizationId, tipo);
  if (!documento) return { accion: 'sin_tipo', branchId, tipo: null, sitioId: fila.id, version: null };
  const r = await rpcPlantillaSede(ctx.supabase, ctx.organizationId, branchId, tipo, documento, modo, versionEsperada);
  if (!r) {
    // Migración pendiente: no hay forma atómica de reemplazar y guardar la copia. Se degrada al
    // comportamiento anterior (el borrador no se toca) y se dice.
    if (modo === 'auto') return { accion: 'sin_cambios', branchId, tipo, sitioId: fila.id, version: await versionBorrador(ctx, fila.id) };
    throw new ErrorSitio('no_disponible', 'Aplicar una plantilla a la sede se activa cuando se aplique su migración.');
  }
  return r;
}
