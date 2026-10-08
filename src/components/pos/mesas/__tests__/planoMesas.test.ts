import { conteoEstados, formaPorCapacidad, numeroDeMesa, resumenZona, vistaMesaPlano, type VistaMesaPlano } from '../plano/estadoMesaPlano';
import {
  aplicar,
  ajustarARejilla,
  cajaDeZona,
  cajaMesa,
  cambiosPlano,
  colocarMesas,
  colorDeZona,
  deshacer,
  duplicarMesa,
  iniciarHistorial,
  limitarZoom,
  moverZona,
  quitarMesa,
  rehacer,
  siguienteNombre,
  totalCambios,
  zoomAjustar,
  actualizarMesa,
  COLORES_ZONA,
  type EstadoEditor,
} from '../plano/planoMesasLogica';
import type { TableWithSession } from '../types';

const AHORA = new Date('2026-10-06T18:00:00Z');

function mesa(p: Partial<TableWithSession> & { id: string; name: string }): TableWithSession {
  return {
    organization_id: 140,
    branch_id: 115,
    zone: 'Salón',
    capacity: 4,
    state: 'free',
    position_x: null,
    position_y: null,
    rotation: 0,
    ...p,
  };
}

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
    x: null,
    y: null,
    rotacion: 0,
    ...extra,
  };
}

describe('vistaMesaPlano', () => {
  it('libre, ocupada, por cobrar y por limpiar', () => {
    expect(vistaMesaPlano(mesa({ id: '1', name: 'Mesa 1' }), undefined, AHORA).estado).toBe('libre');
    const sesion = { id: 's', organization_id: 140, restaurant_table_id: '2', sale_id: null, opened_at: '2026-10-06T17:00:00Z', closed_at: null, server_id: 'u', customers: 2, status: 'active' as const, notes: null };
    const ocupada = vistaMesaPlano(mesa({ id: '2', name: 'Mesa 2', session: sesion, totalAmount: 48000 }), undefined, AHORA);
    expect(ocupada.estado).toBe('ocupada');
    expect(ocupada.minutos).toBe(60);
    expect(ocupada.importe).toBe(48000);
    expect(vistaMesaPlano(mesa({ id: '3', name: 'Mesa 3', session: { ...sesion, status: 'bill_requested' } }), undefined, AHORA).estado).toBe('por_cobrar');
    expect(vistaMesaPlano(mesa({ id: '4', name: 'Mesa 4', state: 'cleaning' }), undefined, AHORA).estado).toBe('por_limpiar');
  });
  it('abierta sin movimiento desde hace 4 h', () => {
    const sesion = { id: 's', organization_id: 140, restaurant_table_id: '2', sale_id: null, opened_at: '2026-10-05T16:00:00Z', closed_at: null, server_id: 'u', customers: 2, status: 'active' as const, notes: null };
    expect(vistaMesaPlano(mesa({ id: '2', name: 'Mesa 2', session: sesion }), undefined, AHORA).abandonada).toBe(true);
    expect(vistaMesaPlano(mesa({ id: '2', name: 'Mesa 2', session: sesion, lastActivityAt: '2026-10-06T17:50:00Z' }), undefined, AHORA).abandonada).toBe(false);
  });
  it('forma: la guardada o la de la capacidad', () => {
    expect(vistaMesaPlano(mesa({ id: '1', name: 'Mesa 1', shape: 'long' }), undefined, AHORA).forma).toBe('larga');
    expect(formaPorCapacidad(2)).toBe('redonda');
    expect(formaPorCapacidad(4)).toBe('cuadrada');
    expect(formaPorCapacidad(8)).toBe('larga');
  });
  it('número de la mesa y resúmenes', () => {
    expect(numeroDeMesa('Mesa 14')).toBe('14');
    expect(numeroDeMesa('Barra')).toBe('Barra');
    const vs = [vista('1'), vista('2', { estado: 'ocupada' }), vista('3', { estado: 'por_cobrar' }), vista('4', { estado: 'reservada' })];
    expect(resumenZona(vs)).toEqual({ total: 4, libres: 1, ocupadas: 1, porCobrar: 1 });
    expect(conteoEstados(vs)).toEqual({ libre: 1, ocupada: 1, por_cobrar: 1, reservada: 1, por_limpiar: 0 });
  });
});

describe('colocarMesas', () => {
  it('respeta las posiciones guardadas y acomoda las que faltan sin pisar otras zonas', () => {
    const vs = [
      vista('1', { x: 24, y: 40 }),
      vista('2'),
      vista('3', { zona: 'Terraza' }),
      vista('4', { zona: 'Terraza' }),
    ];
    const m = colocarMesas(vs, ['Salón', 'Terraza'], 6);
    const p = new Map(m.map((x) => [x.id, x]));
    expect(p.get('1')).toMatchObject({ x: 24, y: 40 });
    expect(p.get('2')!.y).toBeGreaterThan(40);
    const salon = cajaDeZona(m.filter((x) => x.zona === 'Salón'))!;
    const terraza = cajaDeZona(m.filter((x) => x.zona === 'Terraza'))!;
    expect(terraza.y).toBeGreaterThanOrEqual(salon.y + salon.h);
    expect(p.get('4')!.x).toBeGreaterThan(p.get('3')!.x);
  });
  it('con reflujo de 3 columnas (celular) arma filas de 3', () => {
    const m = colocarMesas([1, 2, 3, 4].map((n) => vista(String(n))), [], 3);
    expect(new Set(m.slice(0, 3).map((x) => x.y)).size).toBe(1);
    expect(m[3].y).toBeGreaterThan(m[0].y);
  });
});

describe('geometría y zoom', () => {
  it('la mesa girada 90° intercambia ancho y alto', () => {
    expect(cajaMesa({ forma: 'larga', tamano: 'm', rotacion: 0 })).toEqual({ w: 184, h: 102 });
    expect(cajaMesa({ forma: 'larga', tamano: 'm', rotacion: 90 })).toEqual({ w: 102, h: 184 });
  });
  it('rejilla, límites del zoom y «Ajustar»', () => {
    expect(ajustarARejilla(31)).toBe(40);
    expect(limitarZoom(5)).toBe(2);
    expect(limitarZoom(0.01)).toBe(0.4);
    expect(zoomAjustar({ x: 0, y: 0, w: 2000, h: 500 }, 1000, 600)).toBe(0.4);
    expect(zoomAjustar({ x: 0, y: 0, w: 500, h: 300 }, 1000, 600)).toBe(1);
  });
  it('color de la zona: el guardado o el de la marca', () => {
    expect(colorDeZona('Terraza', '#16A34A')).toBe('#16A34A');
    expect(colorDeZona('Terraza', 'rojo')).toBe(COLORES_ZONA[0]);
  });
});

describe('editor', () => {
  const base: EstadoEditor = {
    mesas: colocarMesas([vista('1', { x: 24, y: 40 }), vista('2', { x: 176, y: 40 })], ['Salón']),
    zonas: [
      { nombre: 'Salón', color: COLORES_ZONA[0], orden: 0, original: 'Salón' },
      { nombre: 'Terraza', color: COLORES_ZONA[1], orden: 1, original: 'Terraza' },
    ],
    borradas: [],
    elementos: [],
    elementosBorrados: [],
  };
  it('deshacer y rehacer', () => {
    let h = iniciarHistorial(base);
    h = aplicar(h, actualizarMesa(h.presente, '1', { x: 60 }));
    expect(h.presente.mesas[0].x).toBe(60);
    h = deshacer(h);
    expect(h.presente.mesas[0].x).toBe(24);
    h = rehacer(h);
    expect(h.presente.mesas[0].x).toBe(60);
  });
  it('cuenta nuevas, editadas, borradas y zonas cambiadas', () => {
    let e = actualizarMesa(base, '1', { capacidad: 6 });
    e = duplicarMesa(e, '2', 'nueva-1', 'Mesa');
    e = quitarMesa(e, '2');
    e = { ...e, zonas: moverZona(e.zonas, 'Terraza', -1) };
    const c = cambiosPlano(base, e);
    expect(c.nuevas.map((m) => m.nombre)).toEqual(['Mesa 3']);
    expect(c.editadas.map((m) => m.id)).toEqual(['1']);
    expect(c.borradas).toEqual(['2']);
    expect(c.zonas.map((z) => z.nombre).sort()).toEqual(['Salón', 'Terraza']);
    expect(totalCambios(c)).toBe(5);
  });
  it('borrar una mesa nueva no la manda a borrar a la base', () => {
    const e = quitarMesa(duplicarMesa(base, '1', 'nueva-2', 'Mesa'), 'nueva-2');
    expect(e.borradas).toEqual([]);
  });
  it('siguiente nombre libre', () => {
    expect(siguienteNombre([{ nombre: 'Mesa 9' }, { nombre: 'Barra' }, { nombre: 'Mesa 12' }], 'Mesa')).toBe('Mesa 13');
  });
});
