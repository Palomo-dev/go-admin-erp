/**
 * Finanzas en «Módulos» del inicio (Figma 2360:42276, aprobado 2026-11-07):
 * qué pendientes aparecen, en qué orden, y los estados con pendientes / al día
 * / error. Cifras ficticias.
 */
import {
  armarFinanzas,
  armarPendientes,
  filaFinanzas,
  mesAnterior,
  mesDeFecha,
  ordenarPendientes,
  ORDEN_PENDIENTES,
  PAGINAS_FINANZAS,
  RUTA_CONCILIACIONES,
  type CrudoFinanzasInicio,
  type PendienteFinanzas,
} from '../finanzasInicio';
import type { KpiModulo } from '../resumenModulos';

const todas = (pagina: string) => pagina;

function crudo(parcial: Partial<CrudoFinanzasInicio> = {}): CrudoFinanzasInicio {
  return {
    dia: '2026-11-07',
    pendientesContables: { estado: 'ok', datos: { cantidad: 3, bloqueanCierre: 1 } },
    conciliaciones: { estado: 'ok', datos: { cantidad: 1, unica: { id: 'abc-1', mes: { anio: 2026, mes: 10 } } } },
    dian: { estado: 'ok', datos: { rechazados: 2, sinEnviar: 0 } },
    periodos: { estado: 'ok', datos: { cantidad: 1, ultimo: { anio: 2026, mes: 10 } } },
    resultado: { estado: 'ok', datos: { utilidad: 9050000, mes: { anio: 2026, mes: 10 }, desde: '2026-10-01', hasta: '2026-10-31' } },
    ...parcial,
  };
}

const ceros = (): Partial<CrudoFinanzasInicio> => ({
  pendientesContables: { estado: 'ok', datos: { cantidad: 0, bloqueanCierre: 0 } },
  conciliaciones: { estado: 'ok', datos: { cantidad: 0, unica: null } },
  dian: { estado: 'ok', datos: { rechazados: 0, sinEnviar: 0 } },
  periodos: { estado: 'ok', datos: { cantidad: 0, ultimo: null } },
});

describe('mesAnterior / mesDeFecha', () => {
  test('mes anterior con su primer y último día, sin pasar por la zona del navegador', () => {
    expect(mesAnterior('2026-11-07')).toEqual({ mes: { anio: 2026, mes: 10 }, desde: '2026-10-01', hasta: '2026-10-31' });
    expect(mesAnterior('2026-01-15')).toEqual({ mes: { anio: 2025, mes: 12 }, desde: '2025-12-01', hasta: '2025-12-31' });
    expect(mesAnterior('2028-03-01').hasta).toBe('2028-02-29');
    expect(mesAnterior('2026-03-31').hasta).toBe('2026-02-28');
  });

  test('fecha no válida', () => {
    expect(() => mesAnterior('07/11/2026')).toThrow();
    expect(mesDeFecha(null)).toBeNull();
    expect(mesDeFecha('2026-10-31')).toEqual({ anio: 2026, mes: 10 });
  });
});

describe('armarPendientes', () => {
  test('con pendientes: filas con cantidad > 0, orden del diseño, total y enlace a la pantalla que lo resuelve', () => {
    const p = armarPendientes(crudo({ dian: { estado: 'ok', datos: { rechazados: 2, sinEnviar: 4 } } }), todas);
    expect(p.estado).toBe('pendientes');
    expect(p.filas.map((f) => f.id)).toEqual(['pendientesContables', 'conciliacion', 'dianRechazados', 'dianSinEnviar', 'periodosSinCerrar']);
    expect(p.total).toBe(3 + 1 + 2 + 4 + 1);
    expect(p.parcial).toBe(false);
    const porId = Object.fromEntries(p.filas.map((f) => [f.id, f]));
    expect(porId.pendientesContables.href).toBe(PAGINAS_FINANZAS.pendientesContables);
    expect(porId.pendientesContables.tono).toBe('peligro');
    expect(porId.dianRechazados.href).toBe(PAGINAS_FINANZAS.facturacionElectronica);
    expect(porId.periodosSinCerrar.href).toBe(PAGINAS_FINANZAS.periodosFiscales);
    expect(porId.periodosSinCerrar.tono).toBe('informacion');
  });

  test('una sola conciliación abierta: «Conciliación de <mes>» abre su detalle; varias: la pestaña de Bancos', () => {
    const una = armarPendientes(crudo(), todas).filas.find((f) => f.id === 'conciliacion')!;
    expect(una.href).toBe('/app/finanzas/conciliacion-bancaria/abc-1');
    expect(una.que.clave).toBe('pendientes.que.conciliacionMes');
    expect(una.mes).toEqual({ anio: 2026, mes: 10 });

    const varias = armarPendientes(crudo({ conciliaciones: { estado: 'ok', datos: { cantidad: 3, unica: null } } }), todas).filas.find((f) => f.id === 'conciliacion')!;
    expect(varias.href).toBe(RUTA_CONCILIACIONES);
    expect(varias.que).toEqual({ clave: 'pendientes.que.conciliaciones', params: { n: 3 } });
    expect(varias.mes).toBeUndefined();
  });

  test('varios meses sin cerrar: el conteo, sin nombrar un mes', () => {
    const f = armarPendientes(crudo({ periodos: { estado: 'ok', datos: { cantidad: 10, ultimo: { anio: 2026, mes: 10 } } } }), todas).filas.find((x) => x.id === 'periodosSinCerrar')!;
    expect(f.que).toEqual({ clave: 'pendientes.que.mesesSinCerrar', params: { n: 10 } });
    expect(f.cantidad).toBe(10);
  });

  test('solo lo que la persona puede resolver: sin la página en su menú, la fila no aparece', () => {
    const sinContabilidad = (p: string) => (p.startsWith('/app/finanzas/contabilidad') ? null : p);
    const p = armarPendientes(crudo(), sinContabilidad);
    expect(p.filas.map((f) => f.id)).toEqual(['conciliacion', 'dianRechazados']);
    expect(p.total).toBe(3);
  });

  test('sin acceso a una fuente (42501): no es un error ni una fila', () => {
    const p = armarPendientes(crudo({ ...ceros(), pendientesContables: { estado: 'sinAcceso' } }), todas);
    expect(p).toEqual({ estado: 'alDia', filas: [], total: 0, parcial: false });
  });

  test('al día: todo en cero', () => {
    expect(armarPendientes(crudo(ceros()), todas)).toEqual({ estado: 'alDia', filas: [], total: 0, parcial: false });
  });

  test('error: si una fuente falló y no hay nada que mostrar, nunca se dice «al día»', () => {
    const p = armarPendientes(crudo({ ...ceros(), dian: { estado: 'error' } }), todas);
    expect(p.estado).toBe('error');
    expect(p.parcial).toBe(true);
    const todasMal = armarPendientes(
      crudo({ pendientesContables: { estado: 'error' }, conciliaciones: { estado: 'error' }, dian: { estado: 'error' }, periodos: { estado: 'error' } }),
      todas,
    );
    expect(todasMal.estado).toBe('error');
  });

  test('parcial: lo que sí se leyó se muestra, avisando que puede faltar algo', () => {
    const p = armarPendientes(crudo({ dian: { estado: 'error' } }), todas);
    expect(p.estado).toBe('pendientes');
    expect(p.parcial).toBe(true);
    expect(p.filas.some((f) => f.id.startsWith('dian'))).toBe(false);
  });

  test('cantidades raras (texto, negativas, NaN) cuentan como cero', () => {
    const p = armarPendientes(
      crudo({
        ...ceros(),
        pendientesContables: { estado: 'ok', datos: { cantidad: '4' as unknown as number, bloqueanCierre: 0 } },
        dian: { estado: 'ok', datos: { rechazados: -2, sinEnviar: Number.NaN } },
      }),
      todas,
    );
    expect(p.filas.map((f) => [f.id, f.cantidad])).toEqual([['pendientesContables', 4]]);
  });

  test('ordenarPendientes respeta el orden del diseño sea cual sea la entrada', () => {
    const fila = (id: PendienteFinanzas['id']): PendienteFinanzas => ({
      id, que: { clave: 'x' }, donde: { clave: 'y' }, cantidad: 1, tono: 'neutro', accion: { clave: 'z' }, href: '/',
    });
    const desordenadas = [...ORDEN_PENDIENTES].reverse().map(fila);
    expect(ordenarPendientes(desordenadas).map((f) => f.id)).toEqual([...ORDEN_PENDIENTES]);
  });
});

const KPI_CARTERA: KpiModulo = { etiqueta: 'carteraVencida', cifra: { tipo: 'moneda', valor: 3100000, moneda: 'COP' }, tono: 'peligro' };
const KPI_PAGAR: KpiModulo = { etiqueta: 'porPagar7d', cifra: { tipo: 'moneda', valor: 4200000, moneda: 'COP' }, tono: 'advertencia' };

describe('filaFinanzas', () => {
  test('con pendientes: «N pendientes», rojo si alguno es urgente', () => {
    const p = armarPendientes(crudo(), todas);
    const f = filaFinanzas(p, { vencidas: 14, carteraVencida: KPI_CARTERA, porPagar: KPI_PAGAR });
    expect(f.badge).toEqual({ clave: 'fila.badgePendientes', params: { n: p.total } });
    expect(f.tono).toBe('peligro');
    expect(f.resumen).toEqual([
      { clave: 'fila.carteraVencida', cifra: KPI_CARTERA.cifra },
      { clave: 'fila.porPagar', cifra: KPI_PAGAR.cifra },
    ]);
  });

  test('solo pendientes no urgentes y cartera al día: advertencia', () => {
    const p = armarPendientes(crudo({ ...ceros(), periodos: { estado: 'ok', datos: { cantidad: 1, ultimo: { anio: 2026, mes: 10 } } } }), todas);
    const f = filaFinanzas(p, { vencidas: 0, carteraVencida: null, porPagar: null });
    expect(f.tono).toBe('advertencia');
    expect(f.resumen).toEqual([{ clave: 'fila.carteraAlDia' }]);
  });

  test('al día: badge «Al día» en verde', () => {
    const f = filaFinanzas(armarPendientes(crudo(ceros()), todas), { vencidas: 0, carteraVencida: null, porPagar: KPI_PAGAR });
    expect(f).toMatchObject({ tono: 'exito', badge: { clave: 'fila.alDia' } });
  });

  test('sin pendientes pero con cartera vencida: el badge de vencidas', () => {
    const f = filaFinanzas(armarPendientes(crudo(ceros()), todas), { vencidas: 5, carteraVencida: KPI_CARTERA, porPagar: null });
    expect(f).toMatchObject({ tono: 'peligro', badge: { clave: 'fila.badgeVencidas', params: { n: 5 } } });
  });

  test('error de lectura y nada urgente: sin badge (nunca «Al día»)', () => {
    const f = filaFinanzas(armarPendientes(crudo({ ...ceros(), periodos: { estado: 'error' } }), todas), { vencidas: 0, carteraVencida: null, porPagar: null });
    expect(f).toMatchObject({ tono: 'neutro', badge: null });
  });

  test('varias monedas: cuentas en lugar de un importe sumado', () => {
    const f = filaFinanzas(armarPendientes(crudo(ceros()), todas), {
      vencidas: 3,
      carteraVencida: { etiqueta: 'carteraVencida', cifra: { tipo: 'numero', valor: 3 } },
      porPagar: { etiqueta: 'porPagar7d', cifra: { tipo: 'numero', valor: 2 } },
    });
    expect(f.resumen).toEqual([
      { clave: 'fila.carteraVencidaCuentas', params: { n: 3 } },
      { clave: 'fila.porPagarCuentas', params: { n: 2 } },
    ]);
  });
});

describe('armarFinanzas', () => {
  const entrada = (c: CrudoFinanzasInicio, ver: (p: string) => string | null = todas) => ({
    crudo: c,
    moneda: 'COP',
    vencidas: 14,
    kpis: [KPI_CARTERA, { etiqueta: 'porCobrar', cifra: { tipo: 'numero' as const, valor: 1 } }, KPI_PAGAR],
    href: ver,
    hrefResultado: (desde: string, hasta: string) => `/app/reportes/contabilidad/estado-resultados?periodo=personalizado&desde=${desde}&hasta=${hasta}`,
    hrefReportes: '/app/reportes/finanzas',
  });

  test('cifras de los KPIs del resumen (sin recalcular), resultado del mes anterior y dinero disponible sin fuente', () => {
    const f = armarFinanzas(entrada(crudo()));
    expect(f.disponible).toEqual({ estado: 'noDisponible', motivo: 'faltaFuente' });
    expect(f.porCobrarVencido).toEqual({ kpi: KPI_CARTERA, href: PAGINAS_FINANZAS.porCobrar });
    expect(f.porPagar).toEqual({ kpi: KPI_PAGAR, href: PAGINAS_FINANZAS.porPagar });
    expect(f.resultado).toEqual({
      estado: 'ok',
      cifra: { tipo: 'moneda', valor: 9050000, moneda: 'COP' },
      mes: { anio: 2026, mes: 10 },
      href: '/app/reportes/contabilidad/estado-resultados?periodo=personalizado&desde=2026-10-01&hasta=2026-10-31',
    });
    expect(f.hrefReportes).toBe('/app/reportes/finanzas');
  });

  test('sin permiso sobre el mayor: no hay tarjeta de resultado; si falla, se dice', () => {
    expect(armarFinanzas(entrada(crudo({ resultado: { estado: 'sinAcceso' } }))).resultado).toBeNull();
    expect(armarFinanzas(entrada(crudo({ resultado: { estado: 'error' } }))).resultado).toEqual({ estado: 'error', mes: { anio: 2026, mes: 10 } });
  });

  test('sin las páginas de cartera en el menú: las tarjetas no enlazan', () => {
    const f = armarFinanzas(entrada(crudo(), (p) => (p.includes('cuentas-por') ? null : p)));
    expect(f.porCobrarVencido?.href).toBeNull();
    expect(f.porPagar?.href).toBeNull();
  });
});
