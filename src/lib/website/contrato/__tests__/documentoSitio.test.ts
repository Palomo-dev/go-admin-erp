import {
  LIMITES_DOCUMENTO,
  VERSION_ESQUEMA_DOCUMENTO,
  bytesDocumento,
  campoDesdeLegacy,
  campoExplicito,
  heredar,
  resolverCampo,
  resolverCampoConOrigen,
  resolverGrupo,
  serializarDeterminista,
  vaciar,
  validarDocumentoSitio,
  valorPropio,
  type DocumentoSitioEntrada,
} from '../documentoSitio';

/** Documento sintético mínimo: un sitio con inicio, carta y un menú en header y footer. */
function documentoBase(): DocumentoSitioEntrada {
  return {
    schemaVersion: VERSION_ESQUEMA_DOCUMENTO,
    tema: {
      modo: valorPropio<'light' | 'dark'>('light'),
      colores: { primario: valorPropio('#0EA5E9'), secundario: heredar() },
      tipografia: { titulos: valorPropio('Inter') },
    },
    shell: {
      header: { composicion: 'H01', menuPrincipalId: 'principal' },
      footer: { composicion: 'F03', menuIds: ['principal'] },
    },
    menus: [
      {
        id: 'principal',
        nombre: 'Principal',
        items: [
          { id: 'i1', etiqueta: 'Inicio', tipo: 'page', paginaId: 'p-inicio' },
          {
            id: 'i2',
            etiqueta: 'Carta',
            tipo: 'page',
            paginaId: 'p-carta',
            hijos: [{ id: 'i3', etiqueta: 'Bebidas', tipo: 'entity', entidad: 'category', entidadId: '42' }],
          },
          { id: 'i4', etiqueta: 'Sede norte', tipo: 'site', sitioRef: 'sitio-2' },
        ],
      },
    ],
    paginas: [
      {
        id: 'p-inicio',
        slug: '',
        tipo: 'home',
        titulo: 'Inicio',
        publicada: true,
        secciones: [{ id: 's1', tipo: 'hero', variante: 'split', version: 1, contenido: { titulo: 'Hola' } }],
      },
      {
        id: 'p-carta',
        slug: 'carta',
        tipo: 'menu',
        titulo: 'Carta',
        publicada: true,
        secciones: [
          {
            id: 's2',
            tipo: 'menu_preview',
            variante: 'tabs',
            version: 1,
            contenido: {},
            fuente: { tipo: 'category', limite: 24, orden: 'relevancia' },
          },
        ],
      },
    ],
  };
}

describe('resolverCampo (D6: inherit | value | clear)', () => {
  it('inherit devuelve el valor del principal', () => {
    expect(resolverCampo('#111111', heredar())).toBe('#111111');
  });

  it('un campo ausente en la sede equivale a inherit', () => {
    expect(resolverCampo('#111111', undefined)).toBe('#111111');
  });

  it('value devuelve el valor propio aunque el principal tenga otro', () => {
    expect(resolverCampo('#111111', valorPropio('#222222'))).toBe('#222222');
  });

  it('clear devuelve null aunque el principal tenga valor', () => {
    expect(resolverCampo('#111111', vaciar())).toBeNull();
  });

  it('inherit sobre un principal sin valor da null, no undefined', () => {
    expect(resolverCampo<string>(undefined, heredar())).toBeNull();
    expect(resolverCampo<string>(null, heredar())).toBeNull();
  });

  it('value admite valores falsy sin confundirlos con heredar', () => {
    expect(resolverCampo(true, valorPropio(false))).toBe(false);
    expect(resolverCampo(10, valorPropio(0))).toBe(0);
    expect(resolverCampo('x', valorPropio(''))).toBe('');
  });

  it('informa el origen del valor para el inspector', () => {
    expect(resolverCampoConOrigen('a', undefined).origen).toBe('principal');
    expect(resolverCampoConOrigen('a', valorPropio('b')).origen).toBe('propio');
    expect(resolverCampoConOrigen('a', vaciar())).toEqual({ valor: null, origen: 'vacio' });
  });
});

describe('resolverGrupo', () => {
  it('resuelve campo a campo, sin merge superficial', () => {
    const principal = { primario: '#000000', secundario: '#111111', acento: null };
    const sede = { secundario: valorPropio('#222222'), acento: valorPropio('#333333'), fondo: vaciar<string>() };
    expect(resolverGrupo<string, string>(principal, sede)).toEqual({
      primario: '#000000',
      secundario: '#222222',
      acento: '#333333',
      fondo: null,
    });
  });

  it('sin overrides devuelve el principal tal cual', () => {
    expect(resolverGrupo({ a: 1, b: null }, undefined)).toEqual({ a: 1, b: null });
  });
});

describe('adaptadores legacy', () => {
  it('campoDesdeLegacy conserva la semántica histórica de null = heredar', () => {
    expect(campoDesdeLegacy(null)).toEqual({ mode: 'inherit' });
    expect(campoDesdeLegacy(undefined)).toEqual({ mode: 'inherit' });
    expect(campoDesdeLegacy('#fff')).toEqual({ mode: 'value', value: '#fff' });
  });

  it('campoExplicito deja explícito el valor del principal al adoptar (null = vacío)', () => {
    expect(campoExplicito(null)).toEqual({ mode: 'clear' });
    expect(campoExplicito(false)).toEqual({ mode: 'value', value: false });
  });
});

describe('validarDocumentoSitio', () => {
  it('acepta un documento válido y aplica los defaults', () => {
    const resultado = validarDocumentoSitio(documentoBase());
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.documento.identidad).toEqual({});
      expect(resultado.documento.paginas[0].secciones[0].visibilidad).toEqual({ movil: true, escritorio: true });
    }
  });

  it('conserva tipos de sección desconocidos y su contenido (F01-03)', () => {
    const doc = documentoBase();
    doc.paginas[0].secciones.push({
      id: 's9',
      tipo: 'tipo_del_futuro',
      variante: 'x',
      version: 7,
      contenido: { cualquier: { cosa: [1, 2] } },
    });
    const resultado = validarDocumentoSitio(doc);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.documento.paginas[0].secciones[1].contenido).toEqual({ cualquier: { cosa: [1, 2] } });
    }
  });

  it('rechaza una versión de esquema desconocida', () => {
    const doc = { ...documentoBase(), schemaVersion: 99 };
    expect(validarDocumentoSitio(doc).ok).toBe(false);
  });

  it('rechaza campos que no pertenecen al documento (operación fuera, ADR-001 §6)', () => {
    const doc = { ...documentoBase(), shipping_flat_rate: 10000 };
    expect(validarDocumentoSitio(doc).ok).toBe(false);
  });

  it('rechaza un modo de herencia inválido', () => {
    const doc = documentoBase();
    (doc.tema.colores as Record<string, unknown>).primario = { mode: 'merge', value: '#000' };
    expect(validarDocumentoSitio(doc).ok).toBe(false);
  });

  it('exige que header y footer referencien menús existentes (D3)', () => {
    const doc = documentoBase();
    doc.shell.footer.menuIds = ['inexistente'];
    const resultado = validarDocumentoSitio(doc);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.errores.map((e) => e.codigo)).toContain('menu_inexistente');
  });

  it('exige que los ítems de página apunten a páginas del documento', () => {
    const doc = documentoBase();
    doc.menus[0].items.push({ id: 'i9', etiqueta: 'Rota', tipo: 'page', paginaId: 'no-existe' });
    const resultado = validarDocumentoSitio(doc);
    expect(!resultado.ok && resultado.errores.some((e) => e.codigo === 'pagina_inexistente')).toBe(true);
  });

  it('detecta ids de sección y slugs repetidos', () => {
    const doc = documentoBase();
    doc.paginas[1].secciones[0].id = 's1';
    doc.paginas[1].slug = '';
    const resultado = validarDocumentoSitio(doc);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      const codigos = resultado.errores.map((e) => e.codigo);
      expect(codigos).toEqual(expect.arrayContaining(['seccion_id_repetido', 'slug_repetido']));
    }
  });

  it('limita la profundidad del menú', () => {
    const doc = documentoBase();
    doc.menus[0].items = [
      {
        id: 'n1', etiqueta: 'N1', tipo: 'custom', url: '/a',
        hijos: [{
          id: 'n2', etiqueta: 'N2', tipo: 'custom', url: '/b',
          hijos: [{
            id: 'n3', etiqueta: 'N3', tipo: 'custom', url: '/c',
            hijos: [{ id: 'n4', etiqueta: 'N4', tipo: 'custom', url: '/d' }],
          }],
        }],
      },
    ];
    const resultado = validarDocumentoSitio(doc);
    expect(!resultado.ok && resultado.errores.some((e) => e.codigo === 'menu_demasiado_profundo')).toBe(true);
  });

  it('rechaza un documento por encima del tamaño máximo sin intentar parsearlo', () => {
    const doc = documentoBase();
    doc.paginas[0].secciones[0].contenido = { relleno: 'x'.repeat(LIMITES_DOCUMENTO.bytesMaximos) };
    const resultado = validarDocumentoSitio(doc);
    expect(resultado).toEqual({ ok: false, errores: [{ ruta: '', codigo: 'documento_demasiado_grande' }] });
  });

  it('rechaza una fuente de datos con límite fuera de rango (D13)', () => {
    const doc = documentoBase();
    doc.paginas[1].secciones[0].fuente = { tipo: 'best_sellers', limite: 500 };
    expect(validarDocumentoSitio(doc).ok).toBe(false);
  });
});

describe('serialización', () => {
  it('es determinista sin importar el orden de las claves', () => {
    expect(serializarDeterminista({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      serializarDeterminista({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }),
    );
  });

  it('cuenta bytes UTF-8, no caracteres', () => {
    expect(bytesDocumento('ñ')).toBe(4); // comillas + 2 bytes
  });
});
