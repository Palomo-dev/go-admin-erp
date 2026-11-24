// ============================================================================
// Reportes › Impuestos y Reportes › Ventas por canal y por sede (2026-11-24)
// ============================================================================
// Armado puro de los dos reportes aprobados en Figma «24 Ventas», sección 7.
// Lo que se fija aquí es la regla del Contador, no el formato:
//   · IVA e INC van por separado y netos de devoluciones; las devoluciones se
//     muestran en negativo y el neto es ventas − devoluciones.
//   · Las retenciones que nos practicaron van en su propia pestaña y no se
//     restan del IVA.
//   · Canal y sede suman exactamente las ventas netas; «Sin asignar» va al final
//     y nunca se reparte.
// ============================================================================

import { aRespuestaImpuestos, armarReporteImpuestos, nombreRenglon, textoTarifa } from '../modulos/impuestosVista';
import { aRespuestaCanalSede, armarCanalSede, nombreCanal, participacion } from '../modulos/canalSedeVista';

// Respuesta de `fn_reporte_impuestos` con los números del Figma (los numeric llegan como texto).
const RESPUESTA_IMPUESTOS = {
  iva_generado: '7600000',
  iva_descontable: '2104300',
  compras: 186,
  iva: { ventas: '7412300', devoluciones: '186200', neto: '7226100' },
  inc: { ventas: 642400, devoluciones: 12800, neto: 629600 },
  sin_detalle: 0,
  por_tarifa: [
    { clase: 'IVA', tarifa: 19, base: 38380500, ventas: 7292300, devoluciones: 180500, neto: 7111800 },
    { clase: 'IVA', tarifa: 5, base: 2400000, ventas: 120000, devoluciones: 5700, neto: 114300 },
    { clase: 'INC', tarifa: 8, base: 8030000, ventas: 642400, devoluciones: 12800, neto: 629600 },
    { clase: 'EXENTO', tarifa: null, base: 690400, ventas: 0, devoluciones: 0, neto: 0 },
  ],
  retenciones: { retefuente: 412600, reteiva: 0, reteica: 58900, otras: 0, total: 471500, asientos: 12 },
  saldo_iva_estimado: '5121800',
};

describe('Reporte de Impuestos', () => {
  const a = armarReporteImpuestos(aRespuestaImpuestos(RESPUESTA_IMPUESTOS));

  test('las cifras de arriba: IVA neto, INC neto, IVA de compras, retenciones y saldo estimado', () => {
    expect(a.kpis.map((k) => [k.titulo, k.valor])).toEqual([
      ['IVA generado neto', 7226100],
      ['INC generado neto', 629600],
      ['IVA de las compras', 2104300],
      ['Retenciones que nos practicaron', 471500],
      ['Saldo estimado del IVA', 5121800],
    ]);
  });

  test('el saldo estimado es IVA neto − IVA de compras: el INC y las retenciones no entran', () => {
    const saldo = a.kpis.find((k) => k.titulo === 'Saldo estimado del IVA')!.valor;
    expect(saldo).toBe(7226100 - 2104300);
  });

  test('por tarifa: nombres, devoluciones en negativo y neto = ventas − devoluciones', () => {
    expect(a.filas.map((f) => f.impuesto)).toEqual(['IVA 19 %', 'IVA 5 %', 'INC 8 %', 'Exento y excluido']);
    expect(a.filas[0]).toEqual({ impuesto: 'IVA 19 %', base: 38380500, ventas: 7292300, devoluciones: -180500, neto: 7111800 });
    for (const f of a.filas) expect(Number(f.ventas) + Number(f.devoluciones)).toBe(f.neto);
    expect(a.totales).toEqual({ impuesto: 'Total', base: 49500900, ventas: 8054700, devoluciones: -199000, neto: 7855700 });
  });

  test('las retenciones que nos practicaron van en su propia pestaña, con su cuenta', () => {
    expect(a.vistaPrincipal).toBe('IVA e INC por tarifa');
    const v = a.vistas.find((x) => x.id === 'retenciones')!;
    expect(v.filas).toEqual([
      { tipo: 'Retefuente', cuenta: '135515', retenido: 412600 },
      { tipo: 'ReteIVA', cuenta: '135517', retenido: 0 },
      { tipo: 'ReteICA', cuenta: '135518', retenido: 58900 },
    ]);
    expect(v.totales).toEqual({ tipo: 'Total', retenido: 471500 });
  });

  test('dice que es informativo y lleva al Centro tributario', () => {
    expect(a.lectura[0]).toMatchObject({ tono: 'info', href: '/app/finanzas/tributario', etiquetaAccion: 'Ir al Centro tributario' });
    expect(a.lectura[0].texto).toMatch(/no es lo que se paga/);
    expect(a.lectura[0].texto).toMatch(/propinas no llevan IVA ni INC/);
  });

  test('sin asientos de retenciones lo dice; con impuesto sin tarifa avisa', () => {
    const vacio = armarReporteImpuestos(aRespuestaImpuestos({ ...RESPUESTA_IMPUESTOS, sin_detalle: 1500, retenciones: { total: 0, asientos: 0 } }));
    expect(vacio.lectura.some((l) => /No hay retenciones que nos practicaran/.test(l.texto))).toBe(true);
    expect(vacio.lectura.some((l) => l.tono === 'aviso' && /Sin detalle de tarifa/.test(l.texto))).toBe(true);
    expect(a.lectura.some((l) => l.tono === 'aviso')).toBe(false);
  });

  test('otras retenciones (1355 sin subcuenta) solo aparecen si tienen valor', () => {
    const conOtras = armarReporteImpuestos(aRespuestaImpuestos({ ...RESPUESTA_IMPUESTOS, retenciones: { ...RESPUESTA_IMPUESTOS.retenciones, otras: 300, total: 471800 } }));
    expect(conOtras.vistas[0].filas.at(-1)).toEqual({ tipo: 'Otras retenciones', cuenta: '1355', retenido: 300 });
  });

  test('respuesta vacía: ceros, sin romper', () => {
    const v = armarReporteImpuestos(aRespuestaImpuestos(null));
    expect(v.kpis.every((k) => k.valor === 0)).toBe(true);
    expect(v.filas).toEqual([]);
  });

  test('nombres de renglón y tarifas', () => {
    expect(textoTarifa(19)).toBe('19 %');
    expect(textoTarifa(0.5)).toBe('0,5 %');
    expect(nombreRenglon({ clase: 'SIN_DETALLE', tarifa: null })).toBe('Sin detalle de tarifa');
  });
});

// Respuesta de `fn_reporte_ventas_canal_sede` con los números del Figma.
const RESPUESTA_CANAL_SEDE = {
  ventas: '48320500',
  devoluciones: 1180400,
  efectivas: 1312,
  ticket_promedio: 36830,
  por_canal: [
    { canal: 'tienda_web', ventas: 13046500, efectivas: 402 },
    { canal: null, ventas: 241700, efectivas: 4 },
    { canal: 'pos', ventas: 30441900, efectivas: 808 },
    { canal: 'menu_qr', ventas: 2416000, efectivas: 61 },
    { canal: 'manual', ventas: 2174400, efectivas: 37 },
  ],
  por_sede: [
    { id: 2, ventas: 12563300, efectivas: 341 },
    { id: null, ventas: 482900, efectivas: 7 },
    { id: 1, ventas: 26576300, efectivas: 702 },
    { id: 3, ventas: 8698000, efectivas: 262 },
  ],
  sedes: [
    { id: 1, nombre: 'Principal' },
    { id: 2, nombre: 'Norte' },
    { id: 3, nombre: 'Centro' },
  ],
};

describe('Reporte de ventas por canal y por sede', () => {
  const a = armarCanalSede(aRespuestaCanalSede(RESPUESTA_CANAL_SEDE));

  test('cifras: ventas netas, n.º de ventas, devoluciones restadas en negativo y ticket', () => {
    expect(a.kpis.map((k) => [k.titulo, k.valor])).toEqual([
      ['Ventas netas del periodo', 48320500],
      ['N.º de ventas', 1312],
      ['Devoluciones restadas', -1180400],
      ['Ticket promedio', 36830],
    ]);
  });

  test('por canal: ordenado por ventas, «Sin asignar» al final y la suma da el total', () => {
    expect(a.filas.map((f) => f.canal)).toEqual(['POS', 'Tienda web', 'Menú QR', 'Manual', 'Sin asignar']);
    expect(a.filas.reduce((s, f) => s + Number(f.ventas), 0)).toBe(48320500);
    expect(a.filas[0].participacion).toBe(63);
    expect(a.totales).toEqual({ canal: 'Total', cantidad: 1312, ventas: 48320500, participacion: 100 });
  });

  test('por sede: con el nombre de la sede, «Sin asignar» al final y la suma da el total', () => {
    const v = a.vistas.find((x) => x.id === 'por-sede')!;
    expect(v.filas.map((f) => f.sede)).toEqual(['Principal', 'Norte', 'Centro', 'Sin asignar']);
    expect(v.filas.reduce((s, f) => s + Number(f.ventas), 0)).toBe(48320500);
  });

  test('cuadra: sin alerta; la lectura explica la regla y avisa las ventas sin canal', () => {
    expect(a.lectura.some((l) => l.tono === 'alerta')).toBe(false);
    expect(a.lectura[0]).toMatchObject({ href: '/app/pos/ventas', etiquetaAccion: 'Ver en Todas las ventas' });
    expect(a.lectura.some((l) => l.tono === 'aviso' && /4 ventas sin canal/.test(l.texto))).toBe(true);
  });

  test('si algún día no cuadra, lo dice en vez de esconderlo', () => {
    const roto = armarCanalSede(aRespuestaCanalSede({ ...RESPUESTA_CANAL_SEDE, ventas: 50000000 }));
    expect(roto.lectura.some((l) => l.tono === 'alerta')).toBe(true);
  });

  test('canales y participación', () => {
    expect(nombreCanal('tienda_web')).toBe('Tienda web');
    expect(nombreCanal(null)).toBe('Sin asignar');
    expect(participacion(1, 3)).toBe(33.3);
    expect(participacion(5, 0)).toBe(0);
  });
});
