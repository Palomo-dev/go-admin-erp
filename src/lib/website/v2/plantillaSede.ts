/**
 * Plantilla del sitio de una SEDE según su tipo de negocio (`branches.branch_type`).
 *
 * Pedido del dueño: «cuando seleccione un tipo de negocio en la sucursal, esa página se cree con
 * el template de ese tipo de negocio» («Aplicar una plantilla a una sede», «que la sede nazca con
 * estructura de restaurante»).
 *
 * No hay una segunda plantilla: la sede usa la «Plantilla completa» de su giro
 * (`construirSitioDePlantilla` de `plantillaCompleta.ts`, la fuente única): el juego de páginas
 * `PAGINAS_BASE_GIRO` (copia verificada de `public.create_default_pages`; la prueba
 * `plantillaSede.test.ts` lo compara con la última migración), Inicio con la estructura de la
 * plantilla por defecto del giro, el encabezado y el pie de esa plantilla (`shellPorPlantilla.ts`) y sus menús.
 * Restaurante suma «Carta QR» (`PLANTILLAS_PAGINA`), la página que se abre desde el QR de la mesa.
 *
 * Identidad, tema, SEO y contenido salen del sitio principal como en cualquier sede
 * (`documentoSedeDesdeBase`) y quedan HEREDADOS campo a campo: la plantilla se arma sin su estilo
 * (`conEstilo: false`). Los menús del principal no se copian: apuntarían a páginas que la sede no tiene.
 *
 * Puro: sin React ni Supabase. Lo usan `siteDocumentService.crearSitio` (la sede nace con la
 * plantilla) y `plantillaSedeService` («Aplicar plantilla de <tipo>»).
 */
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { documentoSedeDesdeBase } from './importadorLegacy';
import { crearPaginaDesdePlantilla } from '@/components/sitio-web/paginas/operacionesPagina';
import { giroDeTipoSede, plantillaPorId, type GenerarId, type Giro } from '@/components/sitio-web/paginas/plantillasPagina';
import { construirSitioDePlantilla } from './plantillaCompleta';

/** Tipos de sede que tienen plantilla (`BranchType`, los mismos que admite la RPC). */
export const TIPOS_SEDE_CON_PLANTILLA = ['restaurant', 'hotel', 'retail', 'gym', 'transport', 'parking', 'services'] as const;
export type TipoSedePlantilla = (typeof TIPOS_SEDE_CON_PLANTILLA)[number];

export function esTipoSedePlantilla(valor: unknown): valor is TipoSedePlantilla {
  return typeof valor === 'string' && (TIPOS_SEDE_CON_PLANTILLA as readonly string[]).includes(valor);
}

/** Páginas que se suman al juego base del giro en una sede (por dirección, sin repetir). */
const EXTRAS_POR_GIRO: Partial<Record<Giro, readonly { plantilla: string; titulo: string }[]>> = {
  restaurante: [{ plantilla: 'carta_qr', titulo: 'Carta QR' }],
};

/** Sede vacía con la herencia de una sede: sin páginas ni menús propios. */
function sedeSinPaginas(base: DocumentoSitio): DocumentoSitio {
  const sede = documentoSedeDesdeBase(base);
  return {
    ...sede,
    menus: [],
    paginas: [],
    shell: {
      header: { ...sede.shell.header, menuPrincipalId: null, menuMegaId: null },
      footer: { ...sede.shell.footer, menuIds: [] },
    },
  };
}

/**
 * Documento inicial del sitio de una sede con la plantilla de su tipo. `null` si el tipo no tiene
 * plantilla (sin tipo, `main` u otro valor viejo): entonces la sede hereda del principal como hoy.
 */
export function documentoPlantillaSede(
  base: DocumentoSitio,
  tipoSede: string | null | undefined,
  generarId: GenerarId,
): DocumentoSitio | null {
  const giro = giroDeTipoSede(tipoSede);
  if (!giro) return null;
  let documento = construirSitioDePlantilla(giro, sedeSinPaginas(base), generarId, { conEstilo: false });
  for (const extra of EXTRAS_POR_GIRO[giro] ?? []) {
    const plantilla = plantillaPorId(extra.plantilla);
    if (!plantilla || documento.paginas.some((p) => p.slug === plantilla.slug)) continue;
    const c = crearPaginaDesdePlantilla(documento, plantilla, { titulo: extra.titulo, slug: plantilla.slug, enMenu: false }, generarId);
    if (c.ok) documento = c.documento;
  }
  return documento;
}

/** Resultado de crear o aplicar la plantilla en el sitio de una sede (contrato de la API). */
export type AccionPlantillaSede =
  /** El sitio de la sede no existía: nació con la plantilla, en borrador. */
  | 'creado'
  /** El borrador se reemplazó por la plantilla; el anterior quedó en el historial. */
  | 'reemplazado'
  /** Ya tenía esa plantilla y nada cambió (idempotente). */
  | 'sin_cambios'
  /** El borrador tiene contenido propio: no se pisa; hay que confirmar «Aplicar plantilla». */
  | 'pendiente_confirmacion'
  /** La sucursal no tiene tipo de negocio con plantilla: no se hace nada. */
  | 'sin_tipo';

export interface ResultadoPlantillaSede {
  accion: AccionPlantillaSede;
  branchId: number;
  tipo: TipoSedePlantilla | null;
  sitioId: string | null;
  /** Versión del borrador después de la operación (la que espera el próximo guardado). */
  version: number | null;
  /** Tipo cuya plantilla tenía el sitio antes (si se sabe). */
  tipoAnterior?: string | null;
  /** Copia del borrador anterior en el historial (para deshacer). */
  instantaneaId?: string | null;
}

export interface EstadoPlantillaSede {
  branchId: number;
  tipo: TipoSedePlantilla | null;
  sitioId: string | null;
  version: number | null;
  /** Tipo de la última plantilla aplicada (`null` si nunca se aplicó o la migración falta). */
  plantillaTipo: string | null;
  /** El borrador sigue tal como lo dejó la plantilla (sin cambios del usuario). */
  intacto: boolean | null;
  /** Se puede ofrecer «Aplicar plantilla de <tipo>». */
  puedeAplicar: boolean;
}

/** Fila de `fn_website_plantilla_sede` → resultado de la API. */
export function resultadoDesdeRpc(branchId: number, tipo: TipoSedePlantilla, fila: unknown): ResultadoPlantillaSede {
  const f = (fila ?? {}) as Record<string, unknown>;
  const accion = f.accion;
  const valida: AccionPlantillaSede[] = ['creado', 'reemplazado', 'sin_cambios', 'pendiente_confirmacion'];
  return {
    accion: valida.includes(accion as AccionPlantillaSede) ? (accion as AccionPlantillaSede) : 'sin_cambios',
    branchId,
    tipo,
    sitioId: typeof f.site_id === 'string' ? f.site_id : null,
    version: typeof f.version === 'number' ? f.version : null,
    tipoAnterior: typeof f.tipo_anterior === 'string' ? f.tipo_anterior : null,
    instantaneaId: typeof f.instantanea_id === 'string' ? f.instantanea_id : null,
  };
}

/**
 * Misma regla que la RPC para «sin cambios del usuario»: la versión del borrador es la que dejó
 * la plantilla; o, en un sitio anterior a la marca, el borrador nunca se guardó ni publicó.
 */
export function borradorIntacto(e: { versionBorrador: number | null; versionPlantilla: number | null; publicado: boolean }): boolean {
  if (e.versionBorrador === null) return false;
  if (e.versionPlantilla !== null) return e.versionPlantilla === e.versionBorrador;
  return e.versionBorrador === 1 && !e.publicado;
}
