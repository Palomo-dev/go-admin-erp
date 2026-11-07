/**
 * Rutas viejas de reportes de Finanzas → su reporte en el centro de reportes.
 *
 * Política: Finanzas no tiene reportes propios; todos viven en
 * `/app/reportes/<grupo>/<reporte>`. Las páginas viejas redirigen en el
 * servidor con esta tabla para que enlaces guardados, favoritos del navegador
 * y botones que nadie actualizó sigan llegando al mismo informe.
 *
 * Se conservan los parámetros que tienen sentido en el visor: el periodo
 * (`desde`/`hasta` como periodo personalizado), la sucursal y la cuenta del
 * mayor. El resto se descarta.
 */
import type { TipoCierre } from './types';

interface Destino {
  grupo: 'contabilidad' | 'finanzas';
  /** Sin reporte: la lista del grupo. */
  reporte?: string;
  /** Periodo con el que abría la pantalla vieja, si no era el mensual del visor. */
  periodo?: TipoCierre;
  /** Parámetros propios del informe que se conservan tal cual. */
  conservar?: readonly string[];
}

export const REDIRECCIONES_FINANZAS = {
  '/app/finanzas/reportes': { grupo: 'finanzas' },
  '/app/finanzas/reportes/cartera-edades': { grupo: 'finanzas', reporte: 'cxc-aging' },
  '/app/finanzas/reporte-categorias': { grupo: 'finanzas', reporte: 'categorias-tesoreria' },
  '/app/finanzas/contabilidad/mayor-contable': { grupo: 'contabilidad', reporte: 'mayor-cuenta', periodo: 'anual', conservar: ['cuenta'] },
  '/app/finanzas/contabilidad/libro-diario': { grupo: 'contabilidad', reporte: 'libro-diario' },
  '/app/finanzas/contabilidad/auxiliar-tercero': { grupo: 'contabilidad', reporte: 'auxiliar-tercero', periodo: 'anual' },
  '/app/finanzas/contabilidad/balance-comprobacion': { grupo: 'contabilidad', reporte: 'balance-prueba' },
  '/app/finanzas/contabilidad/estado-resultados': { grupo: 'contabilidad', reporte: 'estado-resultados', periodo: 'anual' },
  '/app/finanzas/contabilidad/balance-general': { grupo: 'contabilidad', reporte: 'balance-general' },
  '/app/finanzas/contabilidad/informes/flujo-efectivo': { grupo: 'contabilidad', reporte: 'estado-flujos-efectivo', periodo: 'anual' },
  '/app/finanzas/contabilidad/informes/cambios-patrimonio': { grupo: 'contabilidad', reporte: 'cambios-patrimonio', periodo: 'anual' },
  '/app/finanzas/contabilidad/informes/notas': { grupo: 'contabilidad', reporte: 'notas-estados', periodo: 'anual' },
  '/app/finanzas/contabilidad/informes/certificacion': { grupo: 'contabilidad', reporte: 'certificacion-estados', periodo: 'anual' },
  '/app/finanzas/contabilidad/informes/indicadores': { grupo: 'contabilidad', reporte: 'indicadores-financieros', periodo: 'anual' },
  '/app/finanzas/contabilidad/informes/presupuesto-real': { grupo: 'contabilidad', reporte: 'presupuesto-vs-real', periodo: 'anual' },
  '/app/finanzas/contabilidad/informes/libros': { grupo: 'contabilidad', reporte: 'libros-contables', periodo: 'anual' },
} as const satisfies Record<string, Destino>;

export type RutaViejaFinanzas = keyof typeof REDIRECCIONES_FINANZAS;

type Parametros = Record<string, string | string[] | undefined>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CUENTA = /^[\w.-]{1,30}$/;
const SUCURSAL = /^(todas|\d{1,9})$/;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return typeof v === 'string' && v !== '' ? v : null;
}

/** URL del reporte en el centro de reportes para una ruta vieja de Finanzas. */
export function destinoReporteFinanzas(ruta: RutaViejaFinanzas, parametros: Parametros = {}): string {
  const destino: Destino = REDIRECCIONES_FINANZAS[ruta];
  let reporte = destino.reporte;
  // La cartera vieja tenía CxC y CxP en una sola pantalla.
  if (ruta === '/app/finanzas/reportes/cartera-edades' && uno(parametros.tipo) === 'cxp') reporte = 'cxp-aging';

  const q = new URLSearchParams();
  if (reporte) {
    const desde = uno(parametros.desde);
    const hasta = uno(parametros.hasta);
    if (desde && hasta && FECHA.test(desde) && FECHA.test(hasta) && desde <= hasta) {
      q.set('periodo', 'personalizado');
      q.set('desde', desde);
      q.set('hasta', hasta);
    } else if (destino.periodo) {
      q.set('periodo', destino.periodo);
    }
    const sucursal = uno(parametros.sucursal);
    if (sucursal && SUCURSAL.test(sucursal)) q.set('sucursal', sucursal);
    for (const clave of destino.conservar ?? []) {
      const valor = uno(parametros[clave]);
      if (valor && CUENTA.test(valor)) q.set(clave, valor);
    }
  }
  const base = reporte ? `/app/reportes/${destino.grupo}/${reporte}` : `/app/reportes/${destino.grupo}`;
  const query = q.toString();
  return query ? `${base}?${query}` : base;
}
