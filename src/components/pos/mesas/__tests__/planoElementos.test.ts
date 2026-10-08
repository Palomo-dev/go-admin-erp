import {
  actualizarElemento,
  cajaDeZona,
  cajaElemento,
  cambiosPlano,
  colocarMesas,
  crearElemento,
  duplicarElemento,
  elementosDeZona,
  errorRangoWeb,
  mesasConRangoInvalido,
  normalizarRotacion,
  quitarElemento,
  rangoWeb,
  redimensionarElemento,
  totalCambios,
  actualizarMesa,
  COLORES_ZONA,
  LADO_MAX,
  LADO_MIN,
  TAMANO_ELEMENTO,
  TIPOS_ELEMENTO,
  type ElementoEnPlano,
  type EstadoEditor,
} from '../plano/planoMesasLogica';
import { cuerpoGuardarPlano, elementoDesdeFila, elementoRpc, hayQueGuardar, mesaRpc } from '../plano/planoGuardadoLogica';
import { vistaMesaPlano, type VistaMesaPlano } from '../plano/estadoMesaPlano';
import type { TableWithSession } from '../types';

function vista(id: string, extra: Partial<VistaMesaPlano> = {}): VistaMesaPlano {
  return {
    id,
    nombre: `Mesa ${id}`,
    numero: id,
    zona: 'Salón',
    estado: 'libre',
    capacidad: 4,
    comensales: 0,
    minutos: null,
    importe: 0,
    productos: 0,
    mesero: null,
    reservaHora: null,
    reservaNombre: null,
    platosListos: 0,
    abandonada: false,
    forma: 'cuadrada',
    tamano: 'm',
    x: 24,
    y: 40,
    rotacion: 0,
    ...extra,
  };
}

const columna: ElementoEnPlano = {
  id: '00000000-0000-4000-8000-000000000001',
  tipo: 'column',
  etiqueta: 'Columna',
  zona: 'Salón',
  x: 400,
  y: 300,
  ancho: 60,
  alto: 80,
  rotacion: 0,
  enSitio: true,
  orden: 1,
};

function estadoBase(): EstadoEditor {
  return {
    mesas: colocarMesas([vista('1'), vista('2', { x: 176, reservableWeb: false, webMin: 2, webMax: 4 })], ['Salón']),
    zonas: [{ nombre: 'Salón', color: COLORES_ZONA[0], orden: 0, original: 'Salón' }],
    borradas: [],
    elementos: [columna],
    elementosBorrados: [],
  };
}

describe('campos web de la mesa', () => {
  const fila = (p: Record<string, unknown>) =>
    ({ id: '1', name: 'Mesa 1', organization_id: 1, branch_id: 1, zone: 'Salón', capacity: 4, state: 'free', position_x: 0, position_y: 0, rotation: 0, ...p }) as unknown as TableWithSession;
  it('la vista lee is_web_bookable y el rango (por defecto: reservable, sin rango)', () => {
    expect(vistaMesaPlano(fila({}), undefined)).toMatchObject({ reservableWeb: true, webMin: null, webMax: null });
    expect(vistaMesaPlano(fila({ is_web_bookable: false, web_min_party: 2, web_max_party: 3 }), undefined)).toMatchObject({ reservableWeb: false, webMin: 2, webMax: 3 });
  });
  it('colocarMesas conserva los campos web', () => {
    const m = estadoBase().mesas.find((x) => x.id === '2')!;
    expect(m).toMatchObject({ reservableWeb: false, webMin: 2, webMax: 4 });
  });
  it('valida el rango: mínimo 1, orden y capacidad', () => {
    expect(errorRangoWeb({ capacidad: 4, webMin: null, webMax: null })).toBeNull();
    expect(errorRangoWeb({ capacidad: 4, webMin: 2, webMax: 4 })).toBeNull();
    expect(errorRangoWeb({ capacidad: 4, webMin: 0, webMax: null })).toBe('minimo');
    expect(errorRangoWeb({ capacidad: 4, webMin: 3, webMax: 2 })).toBe('orden');
    expect(errorRangoWeb({ capacidad: 4, webMin: null, webMax: 6 })).toBe('capacidad');
    expect(rangoWeb({ capacidad: 4, webMin: null, webMax: null })).toEqual({ min: 1, max: 4 });
    expect(rangoWeb({ capacidad: 6, webMin: 2, webMax: null })).toEqual({ min: 2, max: 6 });
  });
  it('un rango inválido solo bloquea si la mesa se reserva en la web', () => {
    const e = estadoBase();
    const mal = actualizarMesa(e, '1', { webMin: 5, webMax: 2 });
    expect(mesasConRangoInvalido(mal.mesas).map((m) => m.id)).toEqual(['1']);
    expect(mesasConRangoInvalido(actualizarMesa(mal, '1', { reservableWeb: false }).mesas)).toEqual([]);
  });
  it('cambiar «Se puede reservar en la web» cuenta como mesa editada', () => {
    const e = estadoBase();
    const c = cambiosPlano(e, actualizarMesa(e, '1', { reservableWeb: false }));
    expect(c.editadas.map((m) => m.id)).toEqual(['1']);
  });
});

describe('elementos fijos', () => {
  it('los tipos son los del CHECK de la base y todos tienen tamaño de partida', () => {
    expect([...TIPOS_ELEMENTO]).toEqual(['column', 'planter', 'bar', 'wall', 'door', 'window', 'label']);
    for (const t of TIPOS_ELEMENTO) expect(TAMANO_ELEMENTO[t].w).toBeGreaterThanOrEqual(LADO_MIN);
  });
  it('crear: tamaño del tipo, posición en la rejilla, nuevo y visible en el sitio', () => {
    const el = crearElemento({ id: 'n1', tipo: 'planter', etiqueta: 'Jardinera', zona: 'Salón', x: 33, y: -12, orden: 2 });
    expect(el).toMatchObject({ ancho: 140, alto: 70, x: 40, y: 0, rotacion: 0, enSitio: true, nuevo: true });
  });
  it('la caja girada 90° intercambia ancho y alto; 45° crece', () => {
    expect(cajaElemento({ ancho: 60, alto: 80, rotacion: 0 })).toEqual({ w: 60, h: 80 });
    expect(cajaElemento({ ancho: 60, alto: 80, rotacion: 90 })).toEqual({ w: 80, h: 60 });
    const c = cajaElemento({ ancho: 100, alto: 100, rotacion: 45 });
    expect(c.w).toBe(141);
  });
  it('rotación en 0–359 y lados entre los límites del CHECK', () => {
    expect(normalizarRotacion(-90)).toBe(270);
    expect(normalizarRotacion(450)).toBe(90);
    const e = actualizarElemento(estadoBase(), columna.id, { ancho: 1, alto: 99999, rotacion: 360, x: -5 });
    expect(e.elementos[0]).toMatchObject({ ancho: LADO_MIN, alto: LADO_MAX, rotacion: 0, x: 0 });
  });
  it('redimensionar desde la esquina sigue al giro del elemento', () => {
    expect(redimensionarElemento({ ancho: 60, alto: 80, rotacion: 0 }, 20, 10)).toEqual({ ancho: 80, alto: 90 });
    // Girado 90°: bajar el puntero alarga el elemento; moverlo a la derecha lo angosta.
    expect(redimensionarElemento({ ancho: 60, alto: 80, rotacion: 90 }, 0, 20)).toEqual({ ancho: 80, alto: 80 });
    expect(redimensionarElemento({ ancho: 60, alto: 80, rotacion: 90 }, 20, 0)).toEqual({ ancho: 60, alto: 60 });
  });
  it('el recuadro de la zona también rodea sus elementos', () => {
    const e = estadoBase();
    const sinEl = cajaDeZona(e.mesas)!;
    const conEl = cajaDeZona(e.mesas, elementosDeZona(e.elementos, 'Salón'))!;
    expect(conEl.y + conEl.h).toBeGreaterThan(sinEl.y + sinEl.h);
    expect(cajaDeZona([], [columna])).not.toBeNull();
  });
  it('cambios: nuevos, editados y borrados (borrar uno nuevo no se manda)', () => {
    const base = estadoBase();
    let e = duplicarElemento(base, columna.id, 'nuevo-elemento-1');
    e = actualizarElemento(e, columna.id, { enSitio: false });
    let c = cambiosPlano(base, e);
    expect(c.elementosNuevos.map((x) => x.id)).toEqual(['nuevo-elemento-1']);
    expect(c.elementosEditados.map((x) => x.id)).toEqual([columna.id]);
    expect(totalCambios(c)).toBe(2);
    e = quitarElemento(quitarElemento(e, 'nuevo-elemento-1'), columna.id);
    c = cambiosPlano(base, e);
    expect(c.elementosNuevos).toEqual([]);
    expect(c.elementosBorrados).toEqual([columna.id]);
  });
  it('duplicar deja la copia a la derecha, sin pisar el original', () => {
    const e = duplicarElemento(estadoBase(), columna.id, 'copia');
    const copia = e.elementos.find((x) => x.id === 'copia')!;
    expect(copia.x).toBeGreaterThanOrEqual(columna.x + columna.ancho);
    expect(copia.orden).toBe(2);
  });
});

describe('cuerpo de guardar_plano_sede', () => {
  it('mesas nuevas con clave, editadas con id, campos web y forma de la base', () => {
    const base = estadoBase();
    const e: EstadoEditor = {
      ...base,
      mesas: [...base.mesas, { ...base.mesas[0], id: 'nueva-1', nombre: ' Mesa 9 ', nueva: true, forma: 'redonda', rotacion: -90 }],
    };
    const cuerpo = cuerpoGuardarPlano(cambiosPlano(base, actualizarMesa(e, '2', { webMax: 3 })), e);
    expect(cuerpo.mesas_nuevas[0]).toMatchObject({ clave: 'nueva-1', name: 'Mesa 9', shape: 'round', rotation: 270, is_web_bookable: true });
    expect(cuerpo.mesas_editadas[0]).toMatchObject({ id: '2', is_web_bookable: false, web_min_party: 2, web_max_party: 3 });
    expect(cuerpo.zonas[0]).toMatchObject({ zone_name: 'Salón', original: 'Salón' });
    expect(hayQueGuardar(cuerpo)).toBe(true);
  });
  it('un elemento nuevo va con clave y uno existente con id; la etiqueta vacía es null', () => {
    expect(elementoRpc({ ...columna, id: 'nuevo-elemento-9', nuevo: true, etiqueta: '  ' })).toMatchObject({ clave: 'nuevo-elemento-9', label: null, kind: 'column' });
    const existente = elementoRpc(columna);
    expect(existente.id).toBe(columna.id);
    expect(existente).not.toHaveProperty('clave');
    expect(existente).toMatchObject({ width: 60, height: 80, show_on_web: true, zone_name: 'Salón' });
  });
  it('mesaRpc no manda estado ni nada de la cuenta', () => {
    expect(Object.keys(mesaRpc(estadoBase().mesas[0])).sort()).toEqual(
      ['capacity', 'is_web_bookable', 'name', 'position_x', 'position_y', 'rotation', 'shape', 'size', 'web_max_party', 'web_min_party', 'zone'].sort(),
    );
  });
  it('lee filas de restaurant_floor_elements y descarta las de tipo desconocido', () => {
    expect(elementoDesdeFila({ id: 'a', kind: 'door', label: null, zone_name: '', position_x: 10, position_y: 20, width: 80, height: 12, rotation: 90, show_on_web: false, sort_order: 3 })).toEqual({
      id: 'a',
      tipo: 'door',
      etiqueta: '',
      zona: null,
      x: 10,
      y: 20,
      ancho: 80,
      alto: 12,
      rotacion: 90,
      enSitio: false,
      orden: 3,
    });
    expect(elementoDesdeFila({ id: 'b', kind: 'sofa' })).toBeNull();
  });
});
