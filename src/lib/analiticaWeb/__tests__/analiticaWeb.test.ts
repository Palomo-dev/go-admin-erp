/**
 * Analítica web — lógica pura (periodos, petición, mapeo de la RPC,
 * indicadores, embudo, CSV). Se corre con TZ=UTC y TZ=America/Bogota: nada
 * depende de la zona del proceso. Cifras ficticias.
 */
import {
  csvAnalitica,
  diasEntre,
  embudo,
  esFechaValida,
  indicadores,
  leerPeticion,
  mapearRespuestaRpc,
  rangoDePeriodo,
  sinUbicacion,
  sumarDias,
  variacionPct,
} from '../analiticaWeb';

describe('fechas y periodos', () => {
  test('sumarDias cruza meses y años sin tocar la zona del proceso', () => {
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasEntre('2026-09-01', '2026-09-30')).toBe(30);
  });

  test('esFechaValida rechaza días inexistentes y formatos raros', () => {
    expect(esFechaValida('2026-02-28')).toBe(true);
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('30/09/2026')).toBe(false);
    expect(esFechaValida(null)).toBe(false);
  });

  test('rangos de los atajos a partir del «hoy» de la sucursal/organización', () => {
    const hoy = '2026-09-30';
    expect(rangoDePeriodo('hoy', hoy)).toEqual({ desde: hoy, hasta: hoy });
    expect(rangoDePeriodo('ayer', hoy)).toEqual({ desde: '2026-09-29', hasta: '2026-09-29' });
    expect(rangoDePeriodo('7d', hoy)).toEqual({ desde: '2026-09-24', hasta: hoy });
    expect(rangoDePeriodo('30d', hoy)).toEqual({ desde: '2026-09-01', hasta: hoy });
    expect(rangoDePeriodo('90d', hoy)).toEqual({ desde: '2026-07-03', hasta: hoy });
    expect(rangoDePeriodo('año', hoy)).toEqual({ desde: '2026-01-01', hasta: hoy });
  });
});

describe('leerPeticion (query de la ruta)', () => {
  const q = (s: string) => leerPeticion(new URLSearchParams(s));
  test('válida, con sucursal y país normalizado', () => {
    expect(q('desde=2026-09-01&hasta=2026-09-30&sucursal=7&pais=co')).toEqual({
      ok: true,
      valor: { desde: '2026-09-01', hasta: '2026-09-30', sucursal: 7, pais: 'CO' },
    });
  });
  test('«all» o vacío = todas las sucursales', () => {
    expect(q('desde=2026-09-01&hasta=2026-09-30&sucursal=all')).toMatchObject({ ok: true, valor: { sucursal: null } });
  });
  test('rechaza fechas invertidas, rangos de más de 400 días, sucursales y países basura', () => {
    expect(q('desde=2026-09-30&hasta=2026-09-01')).toEqual({ ok: false, codigo: 'FECHAS_INVALIDAS' });
    expect(q('desde=2024-01-01&hasta=2026-09-01')).toEqual({ ok: false, codigo: 'RANGO_DEMASIADO_LARGO' });
    expect(q('desde=2026-09-01&hasta=2026-09-30&sucursal=-1')).toEqual({ ok: false, codigo: 'SUCURSAL_INVALIDA' });
    expect(q('desde=2026-09-01&hasta=2026-09-30&sucursal=7;drop')).toEqual({ ok: false, codigo: 'SUCURSAL_INVALIDA' });
    expect(q('desde=2026-09-01&hasta=2026-09-30&pais=COL')).toEqual({ ok: false, codigo: 'PAIS_INVALIDO' });
  });
  test('una organización en la query no forma parte de la petición', () => {
    const r = q('desde=2026-09-01&hasta=2026-09-30&organization_id=999');
    expect(r.ok && Object.keys(r.valor)).toEqual(['desde', 'hasta', 'sucursal', 'pais']);
  });
});

const RPC = {
  zona: 'America/Bogota',
  desde: '2026-09-01',
  hasta: '2026-09-02',
  dias: 2,
  actual: { visitantes: 3104, visitantes_nuevos: 1924, sesiones: 4812, pedidos: 164, pendientes: 12, completados: 106, cancelados: 18, ingresos: 9317400, venta_media: 87900 },
  anterior: { visitantes: 2626, visitantes_nuevos: 1500, sesiones: 4181, pedidos: 150, pendientes: 5, completados: 100, cancelados: 10, ingresos: 8444000, venta_media: 84440 },
  serie: [{ fecha: '2026-09-01', visitantes: 10, pedidos: 1, visitantes_anterior: 8, pedidos_anterior: 0 }],
  paises: [{ pais: 'CO', visitantes: 2418, sesiones: 3702 }],
  pais: null,
  ciudades: [],
  ciudades_total: 0,
  visitas_con_pais: 5000,
  visitas_sin_ubicacion_total: null,
};

describe('mapeo e indicadores', () => {
  const d = mapearRespuestaRpc(RPC);

  test('snake_case → camelCase, tolerante a campos ausentes', () => {
    expect(d.actual.visitantesNuevos).toBe(1924);
    expect(d.serie[0]).toEqual({ fecha: '2026-09-01', visitantes: 10, pedidos: 1, visitantesAnterior: 8, pedidosAnterior: 0 });
    expect(mapearRespuestaRpc(null).actual.visitantes).toBe(0);
    expect(mapearRespuestaRpc({ actual: { venta_media: null } }).actual.ventaMedia).toBeNull();
  });

  test('conversión = pedidos / sesiones (3,4 %) y diferencia en pp', () => {
    const k = indicadores(d);
    expect(k.conversion.valor).toBeCloseTo(164 / 4812, 6);
    expect(k.conversion.diferenciaPp).toBeCloseTo((164 / 4812 - 150 / 4181) * 100, 6);
    expect(k.visitantes.variacion).toBeCloseTo(((3104 - 2626) / 2626) * 100, 6);
    expect(k.sesiones.pctNuevos).toBeCloseTo(1924 / 3104, 6);
    expect(k.pedidos.pendientes).toBe(12);
  });

  test('sin periodo anterior: variaciones null, nunca Infinity', () => {
    const k = indicadores({ actual: d.actual, anterior: mapearRespuestaRpc({}).anterior });
    expect(k.visitantes.variacion).toBeNull();
    expect(k.conversion.diferenciaPp).toBeNull();
    expect(k.ventaMedia.variacion).toBeNull();
    expect(variacionPct(5, 0)).toBeNull();
  });

  test('embudo: 5,3 % de los visitantes piden y 64,6 % de los pedidos se completan', () => {
    const e = embudo(d.actual);
    expect(e.pctPedidos).toBeCloseTo(164 / 3104, 6);
    expect(e.pctCompletados).toBeCloseTo(106 / 164, 6);
    expect(e.pctAbandono).toBeCloseTo(18 / 164, 6);
    expect(embudo(mapearRespuestaRpc({}).actual).pctPedidos).toBe(0);
  });

  test('sin ubicación cuando ninguna visita del periodo trae país', () => {
    expect(sinUbicacion(d)).toBe(false);
    expect(sinUbicacion({ visitasConPais: 0 })).toBe(true);
  });
});

describe('CSV', () => {
  const enc = { fecha: 'Fecha', visitantes: 'Visitantes', pedidos: 'Pedidos', visitantesAnterior: 'Ant. v', pedidosAnterior: 'Ant. p', pais: 'País', sesiones: 'Sesiones' };
  test('serie y países, con encabezados del idioma', () => {
    const csv = csvAnalitica(mapearRespuestaRpc(RPC), enc);
    expect(csv.split('\n')[0]).toBe('Fecha,Visitantes,Pedidos,Ant. v,Ant. p');
    expect(csv).toContain('2026-09-01,10,1,8,0');
    expect(csv).toContain('CO,2418,3702');
  });
  test('neutraliza fórmulas y escapa comillas', () => {
    const d = mapearRespuestaRpc({ ...RPC, paises: [{ pais: '=HYPERLINK("x")', visitantes: 1, sesiones: 1 }] });
    expect(csvAnalitica(d, enc)).toContain(`"'=HYPERLINK(""x"")",1,1`);
  });
});
