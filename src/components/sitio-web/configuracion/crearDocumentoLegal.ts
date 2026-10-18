/**
 * Crea una página legal desde Configuración.
 *
 * El borrador lo escriben dos caminos de la misma pantalla: la identidad
 * (`useSitioV2`) y las páginas (`usePaginasSitio`). Cada uno recuerda su versión.
 * Crear la política con la versión vieja responde 409 y el asistente muestra
 * «No pudimos crear la página» aunque el documento quepa. Aquí se manda la
 * versión más nueva que ya conocemos y, si aun así chocó, se relee una vez y se
 * reintenta. Si en esa relectura la página ya está, se abre esa.
 */
import { documentosLegales, versionMasNueva, type DocumentoLegalVista } from '@/lib/website/configuracionSitio';
import { apiPaginas } from '../paginas/apiPaginas';
import type { PaginasSitio } from '../paginas/usePaginasSitio';
import type { RespuestaPaginas } from '../paginas/tiposPaginas';

export interface DependenciasCrearLegal {
  /** Versión del borrador que recuerda `useSitioV2` (identidad, logo, favicon). */
  versionBorrador: () => number | null;
  escribir: PaginasSitio['escribir'];
  revalidar: () => Promise<RespuestaPaginas | null>;
  /** Vuelve a leer el documento del borrador para que un guardado de identidad no lo pise. */
  recargarBorrador: () => Promise<void>;
}

function idDelDocumento(lista: RespuestaPaginas | null, doc: DocumentoLegalVista): string | null {
  if (!lista) return null;
  const encontrado = documentosLegales(
    lista.paginas.map((p) => ({
      id: p.id,
      slug: p.slug,
      titulo: p.titulo,
      publicada: p.publicada,
      estado: p.estado.tipo,
      actualizadaEn: p.actualizadaEn,
    })),
  ).find((d) => d.clave === doc.clave);
  return encontrado?.paginaId ?? null;
}

export async function crearDocumentoLegal(doc: DocumentoLegalVista, deps: DependenciasCrearLegal): Promise<string | null> {
  const pedir = () =>
    deps.escribir('*', (c) =>
      apiPaginas.crear(
        { ...c, version: versionMasNueva(c.version, deps.versionBorrador()) },
        { plantilla: 'legal', titulo: doc.titulo, slug: doc.slug, enMenu: false },
      ),
    );

  const cerrar = async (id: string | null): Promise<string | null> => {
    if (!id) return null;
    try {
      await deps.recargarBorrador();
    } catch {
      // La página ya está en el borrador. Si recargar el documento local falla,
      // el editor lo vuelve a leer al abrirlo.
    }
    return id;
  };

  try {
    let escritura = await pedir();
    if (!escritura?.paginaId) {
      const fresco = await deps.revalidar();
      const ya = idDelDocumento(fresco, doc);
      if (ya) return cerrar(ya);
      // `null` es el 409: la versión que mandamos ya no era la del borrador.
      if (!escritura) escritura = await pedir();
    }
    return cerrar(escritura?.paginaId ?? null);
  } catch {
    try {
      return cerrar(idDelDocumento(await deps.revalidar(), doc));
    } catch {
      return null;
    }
  }
}
