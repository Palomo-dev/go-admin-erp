/**
 * Informes nuevos de contabilidad. El cálculo vive en el motor; esta ficha
 * solo declara el catálogo y pide los movimientos de la sesión.
 * Los reportes que ya existían (estado de resultados, balance, flujo directo)
 * no se reemplazan: siguen con su RPC.
 */

import type { DefinicionModulo, PeriodoCierre, ReportData, ReportesClient } from '../types';
import { informeAReporte } from '@/lib/finanzas/estados/aReporte';
import { construirInforme } from '@/lib/finanzas/estados/construir';
import { IDS_INFORME, TITULOS_INFORME, type IdInforme } from '@/lib/finanzas/estados/tipos';

export const DESCRIPCION: Record<IdInforme, string> = {
  'situacion-financiera': 'Activo, pasivo y patrimonio al corte, con el año anterior y la variación.',
  'resultados-integral': 'Resultado del ejercicio y, en el grupo 2, el otro resultado integral.',
  'cambios-patrimonio': 'Movimientos de las cuentas 31 a 38. Cuadra con el patrimonio del balance.',
  'flujo-indirecto': 'Método indirecto. Cuadra contra la variación del efectivo y los equivalentes.',
  'notas-estados': 'Políticas de la organización y una nota por rubro, con el detalle del PUC.',
  'certificacion-estados': 'Certificación del artículo 37 de la Ley 222 de 1995 y dictamen opcional.',
  'libro-mayor': 'Todas las cuentas, con saldo inicial, débitos, créditos y saldo final.',
  'auxiliar-cuenta': 'Movimientos de la cuenta con saldo corrido.',
  'auxiliar-centro': 'Cuenta, centro de costo y tercero.',
  'inventarios-balances': 'Detalle de las clases 1, 2 y 3 al corte. El inventario de sede sale de la 1435.',
  'conciliacion-inventario': 'Kárdex valorizado contra el auxiliar 1435 de cada sede.',
  'kardex': 'Entradas, salidas, ajustes y traslados, a costo promedio ponderado.',
  indicadores: 'Liquidez, endeudamiento, márgenes, rentabilidad y días de rotación.',
  'punto-equilibrio': 'En pesos y en unidades. La 51 es fija y la clase 6 es costo variable, salvo marca.',
  'formulario-300': 'Borrador de IVA. La tarifa sale de cada factura. El contador lo revisa antes de presentar.',
  'formulario-350': 'Borrador de retenciones en la fuente y de IVA. El reteICA no va aquí.',
  'ica-municipal': 'Borrador de ICA por municipio y actividad, con el anticipo de la 1355.',
  reteica: 'Borrador del reteICA practicado, en la 2368. Va en declaración aparte.',
  exogena: 'Borrador de los formatos 1001, 1005, 1006, 1007, 1008 y 1009. Los topes salen de la configuración.',
  'certificado-220': 'Solo empleados, desde la nómina: 5105, 5205 y la retención de salarios.',
  'certificado-retenciones': 'Retenciones practicadas a proveedores: renta, IVA e ICA.',
  'conciliacion-fiscal': 'Borrador de los formularios 2516 y 2517 con los ajustes que cargue el contador.',
  'informe-gestion': 'Texto del informe de gestión guardado por la organización.',
  'registro-accionistas': 'Accionistas de la organización, con acciones y participación.',
  pila: 'Aportes de la nómina del periodo: salud, pensión, ARL y parafiscales.',
};

function definicion(id: IdInforme): DefinicionModulo {
  return {
    id,
    modulo: 'finance',
    titulo: TITULOS_INFORME[id],
    descripcion: DESCRIPCION[id],
    categoria: 'contable',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const { cargarEntrada } = await import('@/lib/finanzas/estados/cargar');
      const entrada = await cargarEntrada({
        client,
        organizationId: orgId,
        desde: periodo.fechaInicio,
        hasta: periodo.fechaFin,
        sucursalId: branchId ?? null,
      });
      return informeAReporte(construirInforme(id, entrada), periodo);
    },
  };
}

export const estadosFinancierosReports: DefinicionModulo[] = IDS_INFORME.map(definicion);
