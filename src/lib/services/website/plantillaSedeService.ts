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
 * Plantilla ELEGIDA (Diseño › Plantillas con una sede elegida; Figma «Plantillas por sede»):
 * `usarPlantillaEnSede` («Plantilla completa» o «Solo estilo» de una plantilla concreta del
 * catálogo) y `heredarEstiloDeSede` («Volver a heredar el estilo del sitio principal»). Pasan por
 * las mismas escrituras del módulo: `aplicarPlantillaCompleta` (instantánea + compare-and-swap) y
 * `aplicarAlBorrador` (compare-and-swap); las dos exigen `website.sites.edit` en el servidor.
 * La sucursal debe ser de la organización de la sesión: si no, 403 (`sin_permiso`).
 *
 * Contrato para quien guarda la sucursal (formulario, importación, otro consumidor):
 *   POST /api/sitio-web/sedes/<branchId>/plantilla { modo: 'auto' }
 * tras crear la sucursal o cambiar su `branch_type`. Ver `sincronizarPlantillaSede`.
 */
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ErrorSitio,
  crearSitio,
  documentoPlantillaDeSede,
  errorDesdePostgrest,
  rpcPlantillaSede,
} from '@/lib/services/website/siteDocumentService';
import { aplicarPlantillaCompleta, type ArmarPlantilla } from '@/lib/services/website/plantillaCompletaService';
import { aplicarAlBorrador } from '@/lib/services/website/paginasSitioService';
import { VERSION_ESQUEMA_DOCUMENTO, validarDocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { giroDeTipoSede } from '@/components/sitio-web/paginas/plantillasPagina';
import { tokensExtendidosDisponibles } from '@/lib/website/v2/tokensEstilo';
import {
  aplicarEstiloPlantillaSede,
  armarPlantillaSede,
  borradorIntacto,
  esTipoSedePlantilla,
  heredarEstiloSede,
  plantillaEnUsoDeSede,
  tieneEstiloPropio,
  validarPlantillaSede,
  type AlcancePlantillaSede,
  type EstadoPlantillaSede,
  type MotivoPlantillaSedeInvalida,
  type ResultadoPlantillaSede,
  type ResultadoUsoPlantillaSede,
  type SedeParaPlantillas,
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
  // Otra organización (o una sucursal que no existe): 403, sin decir cuál de las dos.
  if (!data) throw new ErrorSitio('sin_permiso', 'La sucursal no pertenece a tu organización.');
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

// ─── Plantilla elegida del catálogo ────────────────────────────────────────────────────────────

const MENSAJE_PLANTILLA: Record<MotivoPlantillaSedeInvalida, string> = {
  plantilla_no_existe: 'La plantilla no existe.',
  plantilla_otro_giro: 'La plantilla completa debe ser del tipo de negocio de la sede. Usa «Solo estilo» o elige una de su giro.',
  sede_sin_tipo: 'La sucursal no tiene un tipo de negocio con plantilla. Usa «Solo estilo» o asígnale un tipo.',
};

/** «Plantilla completa» en una sede: la misma de siempre, con el estilo propio de la sede. */
const ARMAR_EN_SEDE: ArmarPlantilla = (base, plantilla, datos, opciones) =>
  armarPlantillaSede({ base, actual: base }, plantilla, opciones.generarId, { datos, extendidos: opciones.extendidos });

/**
 * «Usar esta plantilla en <sede>»: una plantilla concreta del catálogo, validada contra el catálogo
 * y el giro de la sede (`validarPlantillaSede`).
 * - `completa`: estructura, encabezado, pie y estilo propio; lo anterior queda en el historial.
 * - `estilo`: colores y letras propios; el contenido no cambia.
 * `versionEsperada` es la versión del borrador que vio la persona (`null` si la sede aún no tiene
 * sitio: entonces se crea como siempre y la plantilla se aplica encima).
 */
export async function usarPlantillaEnSede(
  ctx: ContextoPlantillaSede,
  branchId: number,
  entrada: { plantillaId: string; alcance: AlcancePlantillaSede; versionEsperada: number | null },
): Promise<ResultadoUsoPlantillaSede> {
  const s = await sucursal(ctx, branchId);
  const v = validarPlantillaSede(entrada.plantillaId, s.branch_type, entrada.alcance);
  if (!v.ok) throw new ErrorSitio('peticion_invalida', MENSAJE_PLANTILLA[v.motivo], { codigo: v.motivo });
  const plantilla = v.plantilla;

  if (entrada.alcance === 'completa') {
    const r = await aplicarPlantillaCompleta(ctx, branchId, entrada.versionEsperada, plantilla.id, randomUUID, ARMAR_EN_SEDE);
    return {
      accion: 'completa',
      branchId,
      sitioId: r.sitioId,
      version: r.version,
      actualizadoEn: r.actualizadoEn,
      plantillaId: plantilla.id,
      instantaneaId: r.instantaneaId,
      resumen: r.resumen,
    };
  }
  const extendidos = tokensExtendidosDisponibles();
  const r = await aplicarAlBorrador(ctx, branchId, entrada.versionEsperada, (documento) => ({
    ok: true,
    documento: aplicarEstiloPlantillaSede(documento, plantilla, extendidos),
  }));
  return { accion: 'estilo', branchId, sitioId: r.sitioId, version: r.version, actualizadoEn: r.actualizadoEn, plantillaId: plantilla.id };
}

/** «Volver a heredar el estilo del sitio principal»: el tema de la sede vuelve a `inherit`. */
export async function heredarEstiloDeSede(
  ctx: ContextoPlantillaSede,
  branchId: number,
  versionEsperada: number | null,
): Promise<ResultadoUsoPlantillaSede> {
  await sucursal(ctx, branchId);
  const r = await aplicarAlBorrador(ctx, branchId, versionEsperada, (documento) => ({ ok: true, documento: heredarEstiloSede(documento) }));
  return { accion: 'heredar', branchId, sitioId: r.sitioId, version: r.version, actualizadoEn: r.actualizadoEn, plantillaId: null };
}

interface FilaSucursalSitio {
  id: number;
  name: string;
  branch_type: string | null;
}

/**
 * Sedes con sitio V2 para el selector de Diseño › Plantillas: nombre, tipo (giro de la pestaña
 * inicial), si tiene estilo propio y la plantilla en uso. Lee solo el grupo `tema` del borrador
 * (`document->tema`), no el documento entero. Columnas verificadas por MCP el 2026-10-08.
 */
export async function sedesParaPlantillas(ctx: ContextoPlantillaSede): Promise<SedeParaPlantillas[]> {
  const estados = await ctx.supabase
    .from('website_site_states')
    .select('id, branch_id')
    .eq('organization_id', ctx.organizationId)
    .not('branch_id', 'is', null);
  if (estados.error) throw errorDesdePostgrest(estados.error, 'plantillaSede.sedes');
  const filas = (estados.data ?? []) as { id: string; branch_id: number }[];
  if (filas.length === 0) return [];

  const [sucursales, borradores] = await Promise.all([
    ctx.supabase
      .from('branches')
      .select('id, name, branch_type')
      .eq('organization_id', ctx.organizationId)
      .in('id', filas.map((f) => f.branch_id)),
    ctx.supabase
      .from('website_site_drafts')
      .select('site_state_id, version, tema:document->tema')
      .eq('organization_id', ctx.organizationId)
      .in('site_state_id', filas.map((f) => f.id)),
  ]);
  if (sucursales.error) throw errorDesdePostgrest(sucursales.error, 'plantillaSede.sedes.sucursales');
  if (borradores.error) throw errorDesdePostgrest(borradores.error, 'plantillaSede.sedes.borradores');
  const porId = new Map(((sucursales.data ?? []) as FilaSucursalSitio[]).map((b) => [b.id, b]));
  const porSitio = new Map(
    ((borradores.data ?? []) as { site_state_id: string; version: number; tema: unknown }[]).map((b) => [b.site_state_id, b]),
  );

  const sedes: SedeParaPlantillas[] = [];
  for (const f of filas) {
    const b = porId.get(f.branch_id);
    if (!b) continue;
    const borrador = porSitio.get(f.id);
    // Solo el grupo `tema`: se valida dentro de un documento mínimo con el contrato.
    const tema = documentoConTema(borrador?.tema);
    const tipo = esTipoSedePlantilla(b.branch_type) ? b.branch_type : null;
    sedes.push({
      branchId: b.id,
      nombre: b.name,
      tipo,
      giro: giroDeTipoSede(tipo),
      sitioId: f.id,
      version: borrador?.version ?? null,
      estiloPropio: tieneEstiloPropio(tema),
      plantillaEnUsoId: plantillaEnUsoDeSede(tema),
    });
  }
  return sedes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Documento mínimo con el `tema` leído, validado con el contrato (`null` si no cumple). */
function documentoConTema(tema: unknown) {
  if (!tema || typeof tema !== 'object') return null;
  const r = validarDocumentoSitio({
    schemaVersion: VERSION_ESQUEMA_DOCUMENTO,
    identidad: {},
    tema,
    seo: {},
    contenido: {},
    shell: { header: { composicion: 'default', menuPrincipalId: null, menuMegaId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } },
    menus: [],
    paginas: [],
  });
  return r.ok ? r.documento : null;
}
