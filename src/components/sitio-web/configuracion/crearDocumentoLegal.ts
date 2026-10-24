/**
 * Crea o regenera una página legal con el generador único.
 *
 * El borrador lo escriben dos caminos de la misma pantalla. Se manda la versión
 * más nueva y, si choca, se relee una vez. Un texto editado no se pisa: la API
 * responde 409 `requiere_confirmacion` y aquí se devuelve para el diálogo.
 */
import { documentosLegales, versionMasNueva, type ClaveLegal, type DocumentoLegalVista } from '@/lib/website/configuracionSitio';
import { ErrorApiPaginas } from '../paginas/apiPaginas';
import type { PaginasSitio } from '../paginas/usePaginasSitio';
import type { RespuestaPaginas } from '../paginas/tiposPaginas';
import { apiLegales, ErrorConfirmacionLegal, type ConfirmacionLegal } from './apiLegales';
import type { RespuestaEscrituraPaginas } from '../paginas/tiposPaginas';

type Escrito = RespuestaEscrituraPaginas & { origen?: 'ia' | 'plantilla' };

export interface DependenciasCrearLegal {
  versionBorrador: () => number | null;
  escribir: PaginasSitio['escribir'];
  revalidar: () => Promise<RespuestaPaginas | null>;
  recargarBorrador: () => Promise<void>;
}

export interface PaginaLegalCreada {
  id: string;
  origen: 'ia' | 'plantilla';
}

function idDelDocumento(lista: RespuestaPaginas | null, clave: ClaveLegal): string | null {
  if (!lista) return null;
  return (
    documentosLegales(
      lista.paginas.map((p) => ({
        id: p.id,
        slug: p.slug,
        titulo: p.titulo,
        publicada: p.publicada,
        estado: p.estado.tipo,
        actualizadaEn: p.actualizadaEn,
        caracteres: p.caracteres,
      })),
    ).find((d) => d.clave === clave)?.paginaId ?? null
  );
}

async function cerrar(id: string | null, origen: 'ia' | 'plantilla', deps: DependenciasCrearLegal): Promise<PaginaLegalCreada | null> {
  if (!id) return null;
  try {
    await deps.recargarBorrador();
  } catch {
    // El editor vuelve a leer el borrador al abrirlo.
  }
  return { id, origen };
}

export async function crearDocumentoLegal(doc: DocumentoLegalVista, deps: DependenciasCrearLegal): Promise<PaginaLegalCreada | null> {
  const pedir = () =>
    deps.escribir('*', (c) =>
      apiLegales.aplicar({ ...c, version: versionMasNueva(c.version, deps.versionBorrador()) }, { clave: doc.clave }),
    );

  try {
    let escritura = (await pedir()) as Escrito | null;
    if (!escritura?.paginaId) {
      const fresco = await deps.revalidar();
      const ya = idDelDocumento(fresco, doc.clave);
      if (ya) return cerrar(ya, 'plantilla', deps);
      if (!escritura) escritura = await pedir();
    }
    return cerrar(escritura?.paginaId ?? null, escritura?.origen ?? 'plantilla', deps);
  } catch (error) {
    if (error instanceof ErrorConfirmacionLegal) throw error;
    try {
      return cerrar(idDelDocumento(await deps.revalidar(), doc.clave), 'plantilla', deps);
    } catch {
      return null;
    }
  }
}

export type ResultadoRegenerar =
  | { ok: true; id: string; origen: 'ia' | 'plantilla' }
  | { ok: false; confirmacion: ConfirmacionLegal };

/** Regenera. Si el texto fue editado, devuelve el diff en vez de pisarlo. */
export async function regenerarDocumentoLegal(
  doc: DocumentoLegalVista,
  deps: DependenciasCrearLegal,
  extra?: { confirmar?: boolean; texto?: string; origen?: 'ia' | 'plantilla' },
): Promise<ResultadoRegenerar | null> {
  const pedir = () =>
    deps.escribir('*', (c) =>
      apiLegales.aplicar({ ...c, version: versionMasNueva(c.version, deps.versionBorrador()) }, { clave: doc.clave, ...extra }),
    );
  try {
    let escritura = (await pedir()) as Escrito | null;
    if (!escritura) {
      await deps.revalidar();
      escritura = await pedir();
    }
    if (!escritura?.paginaId) return null;
    const cerrado = await cerrar(escritura.paginaId, escritura.origen ?? 'plantilla', deps);
    return cerrado ? { ok: true, id: cerrado.id, origen: cerrado.origen } : null;
  } catch (error) {
    if (error instanceof ErrorConfirmacionLegal) return { ok: false, confirmacion: error.confirmacion };
    if (error instanceof ErrorApiPaginas) return null;
    return null;
  }
}
