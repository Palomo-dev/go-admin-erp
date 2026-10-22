/**
 * Crear una página legal no puede quedarse con la versión vieja del borrador.
 * La identidad de la misma pantalla ya pudo haberla subido; un 409 se reintenta
 * una vez con la versión recién leída. El generador devuelve la página con texto.
 */
import { crearDocumentoLegal, regenerarDocumentoLegal } from '../crearDocumentoLegal';
import { ErrorApiPaginas, type ContextoEscritura } from '../../paginas/apiPaginas';
import { apiLegales, ErrorConfirmacionLegal } from '../apiLegales';
import type { DocumentoLegalVista } from '@/lib/website/configuracionSitio';
import type { RespuestaEscrituraPaginas, RespuestaPaginas } from '../../paginas/tiposPaginas';
import type { PaginasSitio } from '../../paginas/usePaginasSitio';

jest.mock('../../paginas/apiPaginas', () => {
  class ErrorApiPaginas extends Error {
    constructor(
      public readonly estado: number,
      public readonly codigo: string,
      mensaje: string,
    ) {
      super(mensaje);
      this.name = 'ErrorApiPaginas';
    }

    get esConflicto(): boolean {
      return this.estado === 409 && this.codigo === 'conflicto_version';
    }
  }
  return { ErrorApiPaginas, apiPaginas: { crear: jest.fn() } };
});

jest.mock('../apiLegales', () => {
  class ErrorConfirmacionLegal extends Error {
    constructor(public readonly confirmacion: unknown) {
      super('requiere_confirmacion');
      this.name = 'ErrorConfirmacionLegal';
    }
  }
  return { ErrorConfirmacionLegal, apiLegales: { aplicar: jest.fn(), vista: jest.fn() } };
});

const doc: DocumentoLegalVista = {
  clave: 'tratamiento',
  titulo: 'Política de tratamiento de datos (Ley 1581)',
  slug: 'tratamiento-de-datos',
  estado: 'falta',
  paginaId: null,
  fecha: null,
};

const aplicar = apiLegales.aplicar as jest.MockedFunction<typeof apiLegales.aplicar>;

function lista(version: number, slug?: string): RespuestaPaginas {
  return {
    modo: 'v2',
    sitio: { id: 'sitio', branchId: null, version, v2Adoptado: true, revisionPublicadaId: null },
    paginas: slug
      ? [
          {
            id: 'p-ya',
            titulo: 'Política de tratamiento de datos (Ley 1581)',
            ruta: `/${slug}`,
            slug,
            tipo: 'legal',
            publicada: false,
            estado: { tipo: 'sin_publicar' },
            enMenu: false,
            legal: true,
            inicio: false,
            seo: 'sin_revisar',
            actualizadaEn: null,
            caracteres: 0,
          },
        ]
      : [],
    contadores: { todas: slug ? 1 : 0, menu: 0, ocultas: 0, legales: slug ? 1 : 0, conCambios: 0 },
    permisos: { editar: true, publicar: true },
    giro: 'tienda',
    paginasBase: [],
    sedes: [],
  };
}

function escribirCon(versionDeLista: () => number | null): PaginasSitio['escribir'] {
  return async (_clave, operar) => {
    try {
      return await operar({ branchId: null, version: versionDeLista() });
    } catch (error) {
      if (error instanceof ErrorApiPaginas && error.esConflicto) return null;
      throw error;
    }
  };
}

describe('crearDocumentoLegal', () => {
  const recargarBorrador = jest.fn(async () => undefined);

  beforeEach(() => {
    aplicar.mockReset();
    recargarBorrador.mockClear();
  });

  it('manda la versión del borrador cuando la lista de páginas se quedó atrás', async () => {
    aplicar.mockResolvedValue({ sitioId: 'sitio', version: 6, actualizadoEn: '2026-10-17T23:34:00Z', paginaId: 'p-nueva', origen: 'plantilla', faltantes: [] });
    const id = await crearDocumentoLegal(doc, {
      versionBorrador: () => 5,
      escribir: escribirCon(() => 4),
      revalidar: jest.fn(),
      recargarBorrador,
    });
    expect(id).toEqual({ id: 'p-nueva', origen: 'plantilla' });
    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(aplicar.mock.calls[0][0]).toMatchObject({ version: 5, branchId: null });
    expect(aplicar.mock.calls[0][1]).toMatchObject({ clave: 'tratamiento' });
    expect(recargarBorrador).toHaveBeenCalledTimes(1);
  });

  it('si el 409 persiste, relee la versión y reintenta una sola vez', async () => {
    let versionLista: number | null = 4;
    aplicar.mockImplementation(async (c: ContextoEscritura) => {
      if (c.version !== 5) throw new ErrorApiPaginas(409, 'conflicto_version', 'Alguien guardó una versión más nueva.');
      const r: RespuestaEscrituraPaginas & { origen: 'ia'; faltantes: string[] } = {
        sitioId: 'sitio',
        version: 6,
        actualizadoEn: '2026-10-17T23:34:00Z',
        paginaId: 'p-nueva',
        origen: 'ia',
        faltantes: [],
      };
      return r;
    });
    const id = await crearDocumentoLegal(doc, {
      versionBorrador: () => 4,
      escribir: escribirCon(() => versionLista),
      revalidar: jest.fn(async () => {
        versionLista = 5;
        return lista(5);
      }),
      recargarBorrador,
    });
    expect(id).toEqual({ id: 'p-nueva', origen: 'ia' });
    expect(aplicar.mock.calls.map((c) => c[0].version)).toEqual([4, 5]);
  });

  it('si al releer la página ya existe, abre esa y no crea otra', async () => {
    aplicar.mockRejectedValue(new ErrorApiPaginas(409, 'conflicto_version', 'Alguien guardó una versión más nueva.'));
    const id = await crearDocumentoLegal(doc, {
      versionBorrador: () => 4,
      escribir: escribirCon(() => 4),
      revalidar: jest.fn(async () => lista(5, 'tratamiento-de-datos')),
      recargarBorrador,
    });
    expect(id).toEqual({ id: 'p-ya', origen: 'plantilla' });
    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(recargarBorrador).toHaveBeenCalledTimes(1);
  });

  it('regenerar con edición devuelve el diff y no pisa el texto', async () => {
    aplicar.mockRejectedValue(
      new ErrorConfirmacionLegal({ actual: 'Texto editado a mano con más de ochenta caracteres para contar como edición real.', propuesto: '<p>Nuevo</p>', origen: 'plantilla', faltantes: [], diff: '- Texto' }),
    );
    const r = await regenerarDocumentoLegal(doc, {
      versionBorrador: () => 4,
      escribir: escribirCon(() => 4),
      revalidar: jest.fn(),
      recargarBorrador,
    });
    expect(r && !r.ok && r.confirmacion.actual.startsWith('Texto editado')).toBe(true);
  });
});
