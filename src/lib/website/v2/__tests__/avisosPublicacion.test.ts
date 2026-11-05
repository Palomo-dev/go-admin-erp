/**
 * «Revisión con los datos de la sede» del diálogo Publicar (Figma «16 Sitio web» 2264:51434,
 * lámina 16): qué secciones la piden y qué avisos salen de los datos de la sede. Ninguno bloquea.
 */
import { validarDocumentoSitio, type DocumentoSitio, type SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import { avisosPublicacion, usosConDatos, type DatosSedePublicacion } from '../cambiosPublicacion';

function documento(secciones: Partial<SeccionSitio>[]): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: {},
    tema: { colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'pill', menuPrincipalId: null, menuMegaId: null, opciones: {} },
      footer: { composicion: 'three_columns', menuIds: [], opciones: {} },
    },
    menus: [],
    paginas: [
      {
        id: 'p1',
        slug: 'home',
        tipo: 'builtin',
        titulo: 'Inicio',
        publicada: true,
        secciones: secciones.map((s, i) => ({ id: `s${i}`, version: 1, contenido: {}, ...s })),
      },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const laureles: DatosSedePublicacion = {
  id: 1,
  nombre: 'Sede Laureles',
  mesas: [
    ...Array.from({ length: 3 }, () => ({ zona: 'Salón', conPosicion: true })),
    { zona: 'Terraza', conPosicion: false },
    { zona: 'Terraza', conPosicion: true },
  ],
  elementos: 2,
  reservasActivas: true,
  preciosPropios: 0,
};

describe('usosConDatos', () => {
  test('solo las variantes que dependen de datos del ERP, y vacío = todas las sedes', () => {
    const u = usosConDatos(
      documento([
        { tipo: 'reservation', variante: 'floor_plan', contenido: { branch_ids: [1] } },
        { tipo: 'reservation', variante: 'floor_plan', contenido: {} },
        { tipo: 'menu_full', variante: 'dotted', contenido: { branch_ids: [2, '3'] } },
        { tipo: 'hero', variante: 'carousel_editorial', contenido: { slides: [{ image_url: 'https://x/1.jpg', image_url_mobile: 'https://x/1m.jpg' }, { image_url: 'https://x/2.jpg' }, {}] } },
        { tipo: 'reservation', variante: 'stepper', contenido: {} },
      ]),
    );
    expect(u).toEqual({ plano: { sedes: [] }, carta: { sedes: [2, 3] }, portada: { fotos: 2, conCelular: 1 } });
  });

  test('sin las variantes del café no hay nada que revisar; una sección oculta no cuenta', () => {
    expect(usosConDatos(documento([{ tipo: 'reservation', variante: 'band' }]))).toEqual({ plano: null, carta: null, portada: null });
    expect(usosConDatos(documento([{ tipo: 'menu_full', variante: 'dotted', visibilidad: { movil: false, escritorio: false } }])).carta).toBeNull();
    expect(usosConDatos(null)).toEqual({ plano: null, carta: null, portada: null });
  });
});

describe('avisosPublicacion', () => {
  test('plano por zona, reservas, precio general y fotos para celular (lámina 16)', () => {
    const avisos = avisosPublicacion({ plano: { sedes: [] }, carta: { sedes: [1] }, portada: { fotos: 3, conCelular: 3 } }, [laureles]);
    expect(avisos).toEqual([
      { clave: 'planoListo', estado: 'ok', valores: { sede: 'Sede Laureles', zona: 'Salón', mesas: 3, sinPosicion: 0, elementos: 2 } },
      { clave: 'zonaSinPlano', estado: 'aviso', valores: { sede: 'Sede Laureles', zona: 'Terraza', mesas: 2, sinPosicion: 1, elementos: 2 } },
      { clave: 'reservasActivas', estado: 'ok', valores: { sede: 'Sede Laureles' } },
      { clave: 'precioGeneral', estado: 'aviso', valores: { sede: 'Sede Laureles' } },
      { clave: 'fotosPortada', estado: 'ok', valores: { n: 3, total: 3 } },
    ]);
  });

  test('reservas apagadas, sede sin mesas y precios propios', () => {
    const sinMesas: DatosSedePublicacion = { ...laureles, id: 2, nombre: 'Sede Envigado', mesas: [], preciosPropios: 14 };
    const apagadas: DatosSedePublicacion = { ...laureles, reservasActivas: false };
    const avisos = avisosPublicacion({ plano: { sedes: [] }, carta: { sedes: [2] }, portada: null }, [apagadas, sinMesas]);
    expect(avisos.map((a) => `${a.clave}:${a.estado}`)).toEqual([
      'planoListo:ok',
      'zonaSinPlano:aviso',
      'reservasApagadas:aviso',
      'sinMesas:aviso',
      'preciosSede:ok',
    ]);
  });

  test('sin configuración de reservas, la sede reserva como hoy (no se avisa)', () => {
    const avisos = avisosPublicacion({ plano: { sedes: [1] }, carta: null, portada: null }, [{ ...laureles, reservasActivas: null }]);
    expect(avisos.find((a) => a.clave.startsWith('reservas'))).toEqual({ clave: 'reservasActivas', estado: 'ok', valores: { sede: 'Sede Laureles' } });
  });
});
