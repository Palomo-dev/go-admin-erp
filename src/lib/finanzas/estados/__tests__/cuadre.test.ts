/**
 * Cuadre de los estados nuevos. Las cifras salen del motor, sin base:
 * el patrimonio cierra contra el balance, el flujo indirecto contra la
 * variación del efectivo y el kárdex contra el auxiliar 1435 de la sede.
 */

import { construirInforme } from '../construir';
import {
  PERFIL_DEFECTO,
  type Cuenta,
  type EntradaInforme,
  type InformeResultado,
  type Movimiento,
  type MovimientoKardex,
} from '../tipos';

function mov(parcial: Pick<Movimiento, 'asientoId' | 'fecha' | 'cuenta' | 'debito' | 'credito'> & Partial<Movimiento>): Movimiento {
  return {
    sucursalId: 1,
    centroId: null,
    terceroNit: '',
    terceroNombre: '',
    source: 'manual',
    ...parcial,
  };
}

function entrada(movimientos: Movimiento[], extra: Partial<EntradaInforme> = {}): EntradaInforme {
  return {
    desde: '2026-01-01',
    hasta: '2026-12-31',
    movimientos,
    cuentas: [],
    perfil: { ...PERFIL_DEFECTO },
    kardex: [],
    iva: [],
    nomina: [],
    topes: [],
    topesConfigurados: false,
    accionistas: [],
    ajustesFiscales: [],
    contribucion: [],
    cuenta: null,
    nombresCentro: {},
    nombresSucursal: { '1': 'Sede norte' },
    ...extra,
    perfil: { ...PERFIL_DEFECTO, ...extra.perfil },
  };
}

function fila(informe: InformeResultado, id: string) {
  const encontrada = informe.filas.find((f) => f.id === id);
  if (!encontrada) throw new Error(`falta la fila ${id}`);
  return encontrada;
}

/** Apertura, venta, costo, depreciación por el gasto, dividendo no pagado y aporte. */
function ejercicio(): Movimiento[] {
  return [
    mov({ asientoId: 1, fecha: '2025-12-31', cuenta: '1105', debito: 1000, credito: 0 }),
    mov({ asientoId: 1, fecha: '2025-12-31', cuenta: '3105', debito: 0, credito: 1000 }),
    mov({ asientoId: 2, fecha: '2026-03-01', cuenta: '1105', debito: 200, credito: 0 }),
    mov({ asientoId: 2, fecha: '2026-03-01', cuenta: '4135', debito: 0, credito: 200 }),
    mov({ asientoId: 3, fecha: '2026-03-02', cuenta: '6135', debito: 80, credito: 0 }),
    mov({ asientoId: 3, fecha: '2026-03-02', cuenta: '1435', debito: 0, credito: 80 }),
    mov({ asientoId: 4, fecha: '2026-06-30', cuenta: '5160', debito: 10, credito: 0 }),
    mov({ asientoId: 4, fecha: '2026-06-30', cuenta: '1592', debito: 0, credito: 10 }),
    mov({ asientoId: 5, fecha: '2026-07-01', cuenta: '3705', debito: 30, credito: 0 }),
    mov({ asientoId: 5, fecha: '2026-07-01', cuenta: '2360', debito: 0, credito: 30 }),
    mov({ asientoId: 6, fecha: '2026-08-01', cuenta: '1105', debito: 50, credito: 0 }),
    mov({ asientoId: 6, fecha: '2026-08-01', cuenta: '3105', debito: 0, credito: 50 }),
  ];
}

describe('cuadre del ejercicio de ejemplo', () => {
  const base = entrada(ejercicio());

  test('el patrimonio del balance iguala al activo menos el pasivo', () => {
    const situacion = construirInforme('situacion-financiera', base);
    expect(fila(situacion, 'bs-total-activo').actual).toBe(1160);
    expect(fila(situacion, 'bs-total-pasivo').actual).toBe(30);
    expect(fila(situacion, 'bs-total-patrimonio').actual).toBe(1130);
    expect(situacion.diferencia).toBe(0);
  });

  test('el estado de cambios cierra contra ese patrimonio', () => {
    const situacion = construirInforme('situacion-financiera', base);
    const cambios = construirInforme('cambios-patrimonio', base);
    const final = fila(cambios, 'pat-final');
    expect(final.total).toBe(1130);
    expect(final.total).toBe(fila(situacion, 'bs-total-patrimonio').actual);
    expect(fila(cambios, 'pat-utilidad')['36']).toBe(110);
    expect(fila(cambios, 'pat-dividendos-efectivo')['37']).toBe(-30);
    expect(cambios.diferencia).toBe(0);
  });

  test('la utilidad del patrimonio es la del estado de resultados', () => {
    const resultados = construirInforme('resultados-integral', base);
    const cambios = construirInforme('cambios-patrimonio', base);
    expect(fila(resultados, 'er-neta').actual).toBe(110);
    expect(fila(cambios, 'pat-utilidad')['36']).toBe(fila(resultados, 'er-neta').actual);
  });

  test('el flujo indirecto cuadra con la variación del efectivo', () => {
    const flujo = construirInforme('flujo-indirecto', base);
    expect(fila(flujo, 'fe-operacion').actual).toBe(200);
    expect(fila(flujo, 'fe-inversion').actual).toBe(0);
    expect(fila(flujo, 'fe-financiacion').actual).toBe(50);
    expect(fila(flujo, 'fe-efectivo').actual).toBe(250);
    expect(fila(flujo, 'fe-dividendos').actual).toBe(0);
    expect(flujo.diferencia).toBe(0);
  });

  test('el cierre del ejercicio no cambia la utilidad ni el patrimonio', () => {
    const cerrado = entrada([
      ...ejercicio(),
      mov({ asientoId: 7, fecha: '2026-12-31', cuenta: '4135', debito: 200, credito: 0 }),
      mov({ asientoId: 7, fecha: '2026-12-31', cuenta: '6135', debito: 0, credito: 80 }),
      mov({ asientoId: 7, fecha: '2026-12-31', cuenta: '5160', debito: 0, credito: 10 }),
      mov({ asientoId: 7, fecha: '2026-12-31', cuenta: '3605', debito: 0, credito: 110 }),
    ]);
    const resultados = construirInforme('resultados-integral', cerrado);
    const situacion = construirInforme('situacion-financiera', cerrado);
    const cambios = construirInforme('cambios-patrimonio', cerrado);
    expect(fila(resultados, 'er-neta').actual).toBe(110);
    expect(fila(situacion, 'bs-total-patrimonio').actual).toBe(1130);
    expect(fila(cambios, 'pat-final').total).toBe(1130);
    expect(cambios.diferencia).toBe(0);
    expect(construirInforme('flujo-indirecto', cerrado).diferencia).toBe(0);
  });

  test('los indicadores usan el activo corriente y el EBITDA del crédito de depreciación', () => {
    const indicadores = construirInforme('indicadores', base);
    expect(fila(indicadores, 'ind-ac').actual).toBe(1170);
    expect(fila(indicadores, 'ind-pc').actual).toBe(30);
    expect(fila(indicadores, 'ind-razon').actual).toBe(39);
    expect(fila(indicadores, 'ind-acida').actual).toBe(41.67);
    expect(fila(indicadores, 'ind-kt').actual).toBe(1140);
    expect(fila(indicadores, 'ind-ebitda').actual).toBe(120);
    expect(fila(indicadores, 'ind-bruto').actual).toBe(60);
    expect(fila(indicadores, 'ind-ventas').actual).toBe(200);
  });

  test('el punto de equilibrio separa la 51 fija de la clase 6', () => {
    const punto = construirInforme('punto-equilibrio', base);
    expect(fila(punto, 'pe-var').actual).toBe(80);
    expect(fila(punto, 'pe-fijo').actual).toBe(10);
    expect(fila(punto, 'pe-pesos').actual).toBe(17);
  });
});

describe('flujo indirecto en casos que se duplican fácil', () => {
  test('la depreciación que va al costo se suma por el crédito de la 1592', () => {
    const flujo = construirInforme('flujo-indirecto', entrada([
      mov({ asientoId: 1, fecha: '2026-04-01', cuenta: '6135', debito: 5, credito: 0 }),
      mov({ asientoId: 1, fecha: '2026-04-01', cuenta: '1592', debito: 0, credito: 5 }),
    ]));
    expect(fila(flujo, 'fe-utilidad').actual).toBe(-5);
    expect(fila(flujo, 'fe-dep').actual).toBe(5);
    expect(fila(flujo, 'fe-operacion').actual).toBe(0);
    expect(flujo.diferencia).toBe(0);
    expect(flujo.lectura.join(' ')).toContain('5160');
  });

  test('el dividendo pagado de una baja el efectivo y la financiación', () => {
    const flujo = construirInforme('flujo-indirecto', entrada([
      mov({ asientoId: 1, fecha: '2025-12-31', cuenta: '1105', debito: 100, credito: 0 }),
      mov({ asientoId: 1, fecha: '2025-12-31', cuenta: '3105', debito: 0, credito: 100 }),
      mov({ asientoId: 2, fecha: '2026-05-01', cuenta: '3705', debito: 30, credito: 0 }),
      mov({ asientoId: 2, fecha: '2026-05-01', cuenta: '1105', debito: 0, credito: 30 }),
    ]));
    expect(fila(flujo, 'fe-dividendos').actual).toBe(-30);
    expect(fila(flujo, 'fe-financiacion').actual).toBe(-30);
    expect(fila(flujo, 'fe-efectivo').actual).toBe(-30);
    expect(flujo.diferencia).toBe(0);
  });

  test('la venta de un activo no resta dos veces el crédito del bien', () => {
    const flujo = construirInforme('flujo-indirecto', entrada([
      mov({ asientoId: 1, fecha: '2025-12-31', cuenta: '1520', debito: 120, credito: 0 }),
      mov({ asientoId: 1, fecha: '2025-12-31', cuenta: '3105', debito: 0, credito: 120 }),
      mov({ asientoId: 2, fecha: '2026-09-01', cuenta: '1105', debito: 100, credito: 0 }),
      mov({ asientoId: 2, fecha: '2026-09-01', cuenta: '1592', debito: 40, credito: 0 }),
      mov({ asientoId: 2, fecha: '2026-09-01', cuenta: '1520', debito: 0, credito: 120 }),
      mov({ asientoId: 2, fecha: '2026-09-01', cuenta: '4245', debito: 0, credito: 20 }),
    ]));
    expect(fila(flujo, 'fe-util-venta').actual).toBe(-20);
    expect(fila(flujo, 'fe-ventas-act').actual).toBe(100);
    expect(fila(flujo, 'fe-compras').actual).toBe(0);
    expect(fila(flujo, 'fe-inversion').actual).toBe(100);
    expect(fila(flujo, 'fe-operacion').actual).toBe(0);
    expect(fila(flujo, 'fe-efectivo').actual).toBe(100);
    expect(flujo.diferencia).toBe(0);
  });
});

describe('grupo 3', () => {
  const cuentas: Cuenta[] = [{
    codigo: '381005',
    nombre: 'Revaluación de PPE',
    nivel: 6,
    naturaleza: 'credito',
    presentacion: null,
    plazoMeses: null,
    esOri: true,
    equivalenteEfectivo: false,
    comportamiento: null,
    esMovimiento: true,
  }];
  const movimientos = [
    mov({ asientoId: 1, fecha: '2026-04-01', cuenta: '1105', debito: 15, credito: 0 }),
    mov({ asientoId: 1, fecha: '2026-04-01', cuenta: '381005', debito: 0, credito: 15 }),
  ];

  test('oculta el ORI en resultados y en el patrimonio', () => {
    const grupo3 = entrada(movimientos, { cuentas, perfil: { ...PERFIL_DEFECTO, grupo: 3, cambiosPatrimonio: true } });
    const resultados = construirInforme('resultados-integral', grupo3);
    expect(resultados.filas.some((f) => String(f.id).startsWith('ori-'))).toBe(false);
    expect(resultados.filas.some((f) => f.id === 'er-ori')).toBe(false);
    const cambios = construirInforme('cambios-patrimonio', grupo3);
    expect(cambios.oculto).toBe(false);
    expect(cambios.filas.some((f) => f.id === 'pat-ori')).toBe(false);
    expect(cambios.diferencia).toBe(0);
    expect(construirInforme('flujo-indirecto', grupo3).oculto).toBe(true);
  });

  test('el estado de cambios es opcional', () => {
    const grupo3 = entrada(movimientos, { cuentas, perfil: { ...PERFIL_DEFECTO, grupo: 3, cambiosPatrimonio: false } });
    const cambios = construirInforme('cambios-patrimonio', grupo3);
    expect(cambios.oculto).toBe(true);
  });
});

describe('kárdex contra el auxiliar 1435', () => {
  const kardex: MovimientoKardex[] = [
    { fecha: '2026-01-10', documento: 'E1', source: 'purchase', direction: 'in', cantidad: 10, costoUnitario: 100, sucursalId: 1, productoId: 'p1', orden: 1 },
    { fecha: '2026-02-10', documento: 'S1', source: 'sale', direction: 'out', cantidad: 4, costoUnitario: 0, sucursalId: 1, productoId: 'p1', orden: 2 },
    { fecha: '2026-03-10', documento: 'E2', source: 'purchase', direction: 'in', cantidad: 4, costoUnitario: 150, sucursalId: 1, productoId: 'p1', orden: 3 },
  ];
  const movimientos = [
    mov({ asientoId: 1, fecha: '2026-01-10', cuenta: '1435', debito: 1000, credito: 0, sucursalId: 1 }),
    mov({ asientoId: 1, fecha: '2026-01-10', cuenta: '2205', debito: 0, credito: 1000 }),
    mov({ asientoId: 2, fecha: '2026-02-10', cuenta: '6135', debito: 400, credito: 0 }),
    mov({ asientoId: 2, fecha: '2026-02-10', cuenta: '1435', debito: 0, credito: 400, sucursalId: 1 }),
    mov({ asientoId: 3, fecha: '2026-03-10', cuenta: '1435', debito: 600, credito: 0, sucursalId: 1 }),
    mov({ asientoId: 3, fecha: '2026-03-10', cuenta: '2205', debito: 0, credito: 600 }),
    mov({ asientoId: 4, fecha: '2026-03-10', cuenta: '1405', debito: 999, credito: 0, sucursalId: 2 }),
    mov({ asientoId: 4, fecha: '2026-03-10', cuenta: '3105', debito: 0, credito: 999 }),
  ];

  test('la sede cuadra en 1200 y la 1405 no entra', () => {
    const informe = construirInforme('conciliacion-inventario', entrada(movimientos, { kardex }));
    expect(informe.filas).toHaveLength(1);
    expect(fila(informe, 'con-1').kardex).toBe(1200);
    expect(fila(informe, 'con-1').auxiliar).toBe(1200);
    expect(informe.diferencia).toBe(0);
  });

  test('el formulario 300 compara el IVA del año anterior', () => {
    const informe = construirInforme('formulario-300', entrada([
      mov({ asientoId: 1, fecha: '2025-05-01', cuenta: '240805', debito: 0, credito: 19 }),
      mov({ asientoId: 1, fecha: '2025-05-01', cuenta: '1305', debito: 19, credito: 0 }),
      mov({ asientoId: 2, fecha: '2026-05-01', cuenta: '240805', debito: 0, credito: 38 }),
      mov({ asientoId: 2, fecha: '2026-05-01', cuenta: '1305', debito: 38, credito: 0 }),
    ]));
    expect(fila(informe, '300-generado').actual).toBe(38);
    expect(fila(informe, '300-generado').anterior).toBe(19);
  });

  test('el kárdex deja saldo valorizado con promedio ponderado', () => {
    const informe = construirInforme('kardex', entrada(movimientos, { kardex }));
    const ultima = informe.filas[informe.filas.length - 1];
    expect(ultima.saldo).toBe(1200);
    expect(ultima.saldoCantidad).toBe(10);
    expect(ultima.tipo).toBe('entrada');
  });
});
