/**
 * El visor de Reportes habla ReportData. El motor habla InformeResultado.
 * Esta traducción no recalcula nada.
 */

import type { PeriodoCierre, ReportData, TonoLectura } from '@/lib/services/reportes/types';
import type { InformeResultado } from './tipos';

export function informeAReporte(informe: InformeResultado, periodo: PeriodoCierre): ReportData {
  const tono: TonoLectura = informe.diferencia ? 'alerta' : informe.borrador ? 'aviso' : 'info';
  return {
    id: informe.id,
    titulo: informe.titulo,
    modulo: 'finance',
    kpis: informe.kpis.map((kpi) => ({ titulo: kpi.titulo, valor: kpi.valor, formato: kpi.formato })),
    columnas: informe.columnas.map((columna) => ({
      key: columna.key,
      titulo: columna.titulo,
      tipo: columna.tipo === 'texto' ? 'texto' : columna.tipo,
      alinear: columna.tipo === 'texto' ? 'left' : 'right',
    })),
    filas: informe.filas,
    generadoEn: new Date().toISOString(),
    periodo,
    lectura: informe.lectura.map((texto) => ({ tono, texto })),
  };
}
