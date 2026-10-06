/**
 * Lógica pura de la Carta (Figma B/13): horario, lote de guardado, orden,
 * excepciones y códigos QR. Datos ficticios.
 */
import {
  agruparHorario,
  contarZonas,
  elementosQr,
  esquemaGuardarCarta,
  esquemaNuevaCarta,
  alternarOpcion,
  excepcionesDe,
  horaCorta,
  horarioDeJson,
  horarioTodoElDia,
  mover,
  ordenarProductos,
  parcheGuardarCarta,
  partesBanner,
  type ProductoCarta,
} from '../carta';
import { resumenHorario, resumenSedes, horaCompacta, momentoLocal } from '@/components/sitio-web/configuracion/carta/formatoCarta';
import { textoConfiguracionCanonico } from '@/components/sitio-web/configuracion/textos';

jest.mock('next-intl', () => ({ useTranslations: () => Object.assign(() => '', { has: () => false }) }));

const t = (clave: string, valores?: Record<string, string | number>) =>
  (textoConfiguracionCanonico(clave) ?? clave).replace(/\{(\w+)\}/g, (_, k: string) => String(valores?.[k] ?? ''));

describe('horario de la carta', () => {
  it('agrupa días consecutivos con las mismas franjas', () => {
    const h = {
      '1': [{ from: '07:00', to: '11:00' }],
      '2': [{ from: '07:00', to: '11:00' }],
      '3': [{ from: '07:00', to: '11:00' }],
      '6': [{ from: '08:00', to: '12:00' }],
      '7': [{ from: '08:00', to: '12:00' }],
    };
    expect(agruparHorario(h).map((g) => [g.desde, g.hasta])).toEqual([
      ['1', '3'],
      ['6', '7'],
    ]);
    expect(resumenHorario(t, h)).toBe('Lun–Mié 7:00 a. m. – 11:00 a. m. · Sáb–Dom 8:00 a. m. – 12:00 p. m.');
    expect(resumenHorario(t, h, true)).toBe('Lun–Mié 7–11 · Sáb–Dom 8–12');
  });

  it('dice «Todos los días» y «todo el día» con la carta por defecto', () => {
    expect(resumenHorario(t, horarioTodoElDia())).toBe('Todos los días todo el día');
    expect(resumenHorario(t, {})).toBe('Sin horario: no se muestra');
  });

  it('formatea horas en 12 h como el diseño', () => {
    expect(horaCorta('00:00')).toBe('12:00 a. m.');
    expect(horaCorta('12:40')).toBe('12:40 p. m.');
    expect(horaCorta('15:30')).toBe('3:30 p. m.');
    expect(horaCompacta('15:30')).toBe('15:30');
    expect(momentoLocal(t, { dia: 5, hora: '12:40' })).toBe('vie 12:40 p. m.');
  });

  it('descarta un horario mal formado', () => {
    expect(horarioDeJson({ '1': [{ from: '25:00', to: '11:00' }] })).toEqual({});
    expect(horarioDeJson('nada')).toEqual({});
  });
});

describe('sedes y banner', () => {
  const sedes = [
    { id: 1, nombre: 'Sede Centro' },
    { id: 2, nombre: 'Sede Norte' },
    { id: 3, nombre: 'Sede Sur' },
  ];
  it('resume las sedes', () => {
    expect(resumenSedes(t, null, sedes)).toBe('Todas las sedes');
    expect(resumenSedes(t, [1], sedes)).toBe('Sede Centro');
    expect(resumenSedes(t, [1, 2, 3], sedes)).toBe('3 sedes');
  });
  it('arma el banner solo con sedes que ven alguna carta', () => {
    expect(
      partesBanner([
        { sedeId: 1, sede: 'Sede Centro', cartas: ['Almuerzo'] },
        { sedeId: 2, sede: 'Sede Norte', cartas: [] },
      ]),
    ).toEqual([{ cartas: 'Almuerzo', sede: 'Sede Centro' }]);
  });
});

describe('lote de guardado', () => {
  it('traduce el detalle a las columnas de guardar_carta y guarda solo excepciones', () => {
    const lote = esquemaGuardarCarta.parse({
      nombre: 'Almuerzo',
      horario: { '1': [{ from: '12:00', to: '15:30' }] },
      sedes: [1],
      categorias: [10, 20],
      excepciones: [
        { productoId: 5, destacado: true, oculto: false, orden: null },
        { productoId: 6, destacado: false, oculto: false, orden: null },
        { productoId: 7, destacado: false, oculto: true, orden: 2 },
      ],
    });
    expect(parcheGuardarCarta(lote)).toEqual({
      name: 'Almuerzo',
      schedule: { '1': [{ from: '12:00', to: '15:30' }] },
      branch_ids: [1],
      secciones: [
        { category_id: 10, sort_order: 0 },
        { category_id: 20, sort_order: 1 },
      ],
      items: [
        { product_id: 5, is_featured: true, is_hidden: false, sort_order: null, hidden_variant_ids: [], hidden_modifier_group_ids: [] },
        { product_id: 7, is_featured: false, is_hidden: true, sort_order: 2, hidden_variant_ids: [], hidden_modifier_group_ids: [] },
      ],
    });
  });

  it('guarda una fila cuando solo hay variantes o extras ocultos', () => {
    const lote = esquemaGuardarCarta.parse({
      excepciones: [{ productoId: 8, destacado: false, oculto: false, orden: null, variantesOcultas: [81], extrasOcultos: [3] }],
    });
    expect(parcheGuardarCarta(lote).items).toEqual([
      { product_id: 8, is_featured: false, is_hidden: false, sort_order: null, hidden_variant_ids: [81], hidden_modifier_group_ids: [3] },
    ]);
  });

  it('acepta los cambios por sede en el mismo lote y no los manda a guardar_carta', () => {
    const lote = esquemaGuardarCarta.parse({ porSede: [{ branch_id: 2, cambios: [{ product_id: 5, is_listed: false }] }] });
    expect(lote.porSede).toHaveLength(1);
    expect(parcheGuardarCarta(lote)).toEqual({});
    expect(esquemaGuardarCarta.safeParse({ porSede: [{ branch_id: 2, cambios: [] }] }).success).toBe(false);
  });

  it('rechaza claves extra (nada de organización en el body) y horas inválidas', () => {
    expect(esquemaGuardarCarta.safeParse({ organization_id: 9 }).success).toBe(false);
    expect(esquemaGuardarCarta.safeParse({ horario: { '8': [] } }).success).toBe(false);
    expect(esquemaNuevaCarta.safeParse({ nombre: '  ' }).success).toBe(false);
  });
});

describe('orden y excepciones', () => {
  const p = (id: number, nombre: string, orden: number | null = null): ProductoCarta => ({
    id,
    nombre,
    precio: 1000,
    etiquetas: [],
    destacado: false,
    oculto: false,
    orden,
  });
  it('mueve elementos y deja igual lo fuera de rango', () => {
    expect(mover(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(mover(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
  it('ordena primero lo que tiene orden propio y luego por nombre', () => {
    expect(ordenarProductos([p(1, 'Zanahoria'), p(2, 'Arepa'), p(3, 'Mote', 0)]).map((x) => x.id)).toEqual([3, 2, 1]);
  });
  it('arma las excepciones de todas las categorías', () => {
    expect(excepcionesDe([{ id: 1, nombre: 'Entradas', productos: [p(1, 'A')] }])).toEqual([{ productoId: 1, destacado: false, oculto: false, orden: null }]);
    const conOpciones = { ...p(2, 'B'), variantes: [{ id: 21, nombre: 'Grande', oculta: false }], extras: [{ id: 9, nombre: 'Salsas', opciones: 3, oculta: false }] };
    const cats = alternarOpcion([{ id: 1, nombre: 'Entradas', productos: [conOpciones] }], 2, 'extras', 9, false);
    expect(excepcionesDe(cats)).toEqual([{ productoId: 2, destacado: false, oculto: false, orden: null, extrasOcultos: [9] }]);
    expect(conOpciones.extras[0].oculta).toBe(false);
  });
});

describe('Carta QR', () => {
  const mesas = [
    { id: 'm1', nombre: 'Mesa 1', zona: 'Salón', url: 'https://tumarca.com/menu?mesa=m1' },
    { id: 'm2', nombre: 'Mesa 2', zona: 'Terraza', url: 'https://tumarca.com/menu?mesa=m2' },
    { id: 'm3', nombre: 'Barra 1', zona: null, url: null },
  ];
  it('un código por mesa con la mesa en la URL, o la carta general en «solo ver»', () => {
    const pedir = elementosQr(mesas, { por: 'mesa', modo: 'pedir', urlGeneral: 'https://tumarca.com/menu', sede: 'Sede Centro', sinZona: 'Sin zona' });
    expect(pedir.map((e) => [e.titulo, e.detalle, e.url])).toEqual([
      ['Mesa 1', 'Salón · Sede Centro', 'https://tumarca.com/menu?mesa=m1'],
      ['Mesa 2', 'Terraza · Sede Centro', 'https://tumarca.com/menu?mesa=m2'],
      ['Barra 1', 'Sin zona · Sede Centro', 'https://tumarca.com/menu'],
    ]);
    const ver = elementosQr(mesas, { por: 'mesa', modo: 'ver', urlGeneral: 'https://tumarca.com/menu', sede: 'S', sinZona: 'Sin zona' });
    expect(new Set(ver.map((e) => e.url))).toEqual(new Set(['https://tumarca.com/menu']));
  });
  it('un código por zona y nada sin dirección del sitio', () => {
    expect(elementosQr(mesas, { por: 'zona', modo: 'pedir', urlGeneral: 'https://tumarca.com/menu', sede: 'S', sinZona: 'Sin zona' }).map((e) => e.titulo)).toEqual([
      'Salón',
      'Terraza',
      'Sin zona',
    ]);
    expect(elementosQr(mesas, { por: 'mesa', modo: 'pedir', urlGeneral: null, sede: 'S', sinZona: 'x' })).toEqual([]);
    expect(contarZonas(mesas)).toBe(3);
  });
});
