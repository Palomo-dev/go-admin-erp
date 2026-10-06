import {
  agruparCuenta,
  escribirNotaMesa,
  estadoCocinaDeItems,
  hayNotaMesa,
  leerNotaMesa,
  mesaAbandonada,
  minutosDesde,
  partesIguales,
  partesPorComensal,
  partesPorProductos,
  resumenPartes,
  textoDuracion,
  totalesCuenta,
  unidadesSinAsignar,
  unirPendientes,
  type LineaMesa,
  type ParteCobro,
} from '../cuenta/cuentaMesaLogica';

function linea(p: Partial<LineaMesa> & { id: string; total: number }): LineaMesa {
  const cantidad = p.cantidad ?? 1;
  return {
    id: p.id,
    nombre: p.nombre ?? p.id,
    variante: null,
    cantidad,
    precioUnitario: p.total / cantidad,
    total: p.total,
    impuesto: p.impuesto ?? 0,
    tasaImpuesto: p.tasaImpuesto ?? 0,
    impuestoIncluido: true,
    descuento: 0,
    comensal: p.comensal ?? null,
    notaCocina: null,
    notaCliente: null,
    alergia: false,
    modificadores: [],
    pagada: p.pagada ?? false,
    abonado: p.abonado ?? 0,
    ronda: p.ronda ?? null,
    porEnviar: p.porEnviar ?? false,
    enviadaAt: p.enviadaAt ?? null,
    estado: p.estado ?? 'por_enviar',
    estadoDesde: null,
    imagen: null,
    creadaAt: null,
    productoId: 1,
    comandaId: p.comandaId ?? null,
  };
}

describe('estadoCocinaDeItems', () => {
  it('sin ítems de comanda no hay estado', () => {
    expect(estadoCocinaDeItems([])).toBeNull();
    expect(estadoCocinaDeItems(null)).toBeNull();
  });
  it('el ítem menos avanzado manda', () => {
    expect(estadoCocinaDeItems([{ id: 1, status: 'delivered' }, { id: 2, status: 'pending' }])).toBe('en_cocina');
    expect(estadoCocinaDeItems([{ id: 1, status: 'ready' }, { id: 2, status: 'delivered' }])).toBe('lista');
  });
  it('los ajustes de baja no cuentan y lo cancelado entero queda cancelado', () => {
    expect(estadoCocinaDeItems([{ id: 1, status: 'in_progress' }, { id: 2, status: 'pending', adjustment_kind: 'decrease' }])).toBe('preparando');
    expect(estadoCocinaDeItems([{ id: 1, status: 'pending', cancelled_at: '2026-10-06T12:00:00Z' }])).toBe('cancelada');
  });
});

describe('agruparCuenta', () => {
  const lineas = [
    linea({ id: 'a', total: 32000, porEnviar: true }),
    linea({ id: 'b', total: 42000, ronda: 2, estado: 'preparando', enviadaAt: '2026-10-06T17:36:00Z', comandaId: 2 }),
    linea({ id: 'c', total: 12000, ronda: 1, estado: 'servida', enviadaAt: '2026-10-06T17:05:00Z', comandaId: 1 }),
    linea({ id: 'd', total: 8000, pagada: true, ronda: 1, estado: 'servida', comandaId: 1 }),
    linea({ id: 'e', total: 5000 }),
    linea({ id: 'f', total: 0, cantidad: 0 }),
  ];
  const r = agruparCuenta(lineas, [
    { id: 1, created_at: '2026-10-06T17:05:00Z', updated_at: '2026-10-06T17:20:00Z', status: 'delivered' },
    { id: 2, created_at: '2026-10-06T17:36:00Z', status: 'preparing' },
  ]);
  it('separa por enviar, rondas (la más reciente arriba), directas y pagadas', () => {
    expect(r.porEnviar.map((l) => l.id)).toEqual(['a']);
    expect(r.rondas.map((x) => x.numero)).toEqual([2, 1]);
    expect(r.directas.map((l) => l.id)).toEqual(['e']);
    expect(r.pagadas.map((l) => l.id)).toEqual(['d']);
  });
  it('la ronda servida lleva la hora de su última comanda entregada', () => {
    expect(r.rondas[1].estado).toBe('servida');
    expect(r.rondas[1].servidaAt).toBe('2026-10-06T17:20:00Z');
    expect(r.rondas[0].servidaAt).toBeNull();
  });
  it('cuenta lo que sigue en cocina', () => {
    expect(r.enCocina).toBe(1);
  });
});

describe('totalesCuenta', () => {
  it('suma lo pendiente, agrupa impuestos por tasa y descuenta lo abonado', () => {
    const t = totalesCuenta([
      linea({ id: 'a', total: 32400, impuesto: 2400, tasaImpuesto: 8 }),
      linea({ id: 'b', total: 10800, impuesto: 800, tasaImpuesto: 8, abonado: 800 }),
      linea({ id: 'c', total: 9500 }),
      linea({ id: 'd', total: 99999, pagada: true }),
    ]);
    expect(t.total).toBe(52700);
    expect(t.subtotal).toBe(49500);
    expect(t.impuestos).toEqual([{ tasa: 8, importe: 3200 }]);
    expect(t.abonado).toBe(800);
    expect(t.saldo).toBe(51900);
  });
});

describe('tiempos', () => {
  const ahora = new Date('2026-10-06T18:00:00Z');
  it('minutosDesde nunca es negativo y tolera vacíos', () => {
    expect(minutosDesde('2026-10-06T17:15:00Z', ahora)).toBe(45);
    expect(minutosDesde('2026-10-06T19:00:00Z', ahora)).toBe(0);
    expect(minutosDesde(null, ahora)).toBeNull();
    expect(minutosDesde('no-es-fecha', ahora)).toBeNull();
  });
  it('textoDuracion como el plano', () => {
    expect(textoDuracion(8)).toBe('8 min');
    expect(textoDuracion(60)).toBe('1 h 00');
    expect(textoDuracion(74)).toBe('1 h 14');
    expect(textoDuracion(26 * 60 + 5)).toBe('26 h');
    expect(textoDuracion(null)).toBe('');
  });
  it('mesaAbandonada usa el último movimiento y el umbral de 4 h', () => {
    expect(mesaAbandonada('2026-10-05T10:00:00Z', null, ahora)).toBe(true);
    expect(mesaAbandonada('2026-10-05T10:00:00Z', '2026-10-06T17:00:00Z', ahora)).toBe(false);
  });
});

describe('cuenta dividida', () => {
  const lineas = [
    linea({ id: 'h1', total: 32000, comensal: 1 }),
    linea({ id: 'l1', total: 9500, comensal: 1 }),
    linea({ id: 'a2', total: 32000, comensal: 2 }),
    linea({ id: 'g', total: 10000 }),
  ];
  it('por comensal: cada uno lo suyo más su parte de lo general, y la suma es el saldo', () => {
    const p = partesPorComensal(lineas, 2);
    expect(p.map((x) => x.importe)).toEqual([46500, 37000]);
    expect(p[0].fraccionGeneral).toBe(0.5);
    expect(p.reduce((s, x) => s + x.importe, 0)).toBe(totalesCuenta(lineas).saldo);
  });
  it('por comensal: no deja fuera a un comensal con número mayor que los declarados', () => {
    expect(partesPorComensal(lineas, 1)).toHaveLength(2);
  });
  it('partes iguales: la última absorbe el redondeo', () => {
    const p = partesIguales([linea({ id: 'x', total: 100000 })], 3);
    expect(p.map((x) => x.importe).reduce((a, b) => a + b, 0)).toBe(100000);
    expect(p).toHaveLength(3);
  });
  it('por productos: reparte unidades y cuenta las que faltan', () => {
    const jugos = [linea({ id: 'j', total: 15000, cantidad: 2 })];
    const p = partesPorProductos(jugos, { j: [1, 1] }, 2);
    expect(p.map((x) => x.importe)).toEqual([7500, 7500]);
    expect(unidadesSinAsignar(jugos, { j: [1] })).toBe(1);
  });
  it('resumen y unir pendientes', () => {
    const partes: ParteCobro[] = [
      { id: '1', nombre: '1', comensal: 1, lineas: [], fraccionGeneral: 0, importe: 47500, estado: 'pagada' },
      { id: '2', nombre: '2', comensal: 2, lineas: [], fraccionGeneral: 0, importe: 64000, estado: 'cobrando' },
      { id: '3', nombre: '3', comensal: 3, lineas: [], fraccionGeneral: 0, importe: 41500, estado: 'pendiente' },
    ];
    expect(resumenPartes(partes)).toEqual({ total: 153000, pagado: 47500, falta: 105500 });
    const unidas = unirPendientes(partes, 'Resto');
    expect(unidas).toHaveLength(2);
    expect(unidas[1].importe).toBe(105500);
  });
});

describe('nota de la mesa', () => {
  it('lee con valores por defecto y escribe limpio', () => {
    expect(leerNotaMesa(null)).toEqual({ alergias: [], instrucciones: '', ritmo: 'junto', notaCliente: '' });
    const n = leerNotaMesa({ alergias: [' Maní ', '', 3], instrucciones: 'Entradas primero', ritmo: 'tiempos', nota_cliente: 'Cumpleaños' });
    expect(n.alergias).toEqual(['Maní']);
    expect(hayNotaMesa(n)).toBe(true);
    expect(escribirNotaMesa({ ...n, alergias: ['Maní', 'Maní'], instrucciones: '  a   b ' })).toEqual({
      alergias: ['Maní'],
      instrucciones: 'a b',
      ritmo: 'tiempos',
      nota_cliente: 'Cumpleaños',
    });
  });
});
