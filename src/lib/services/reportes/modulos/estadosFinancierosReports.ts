// ============================================================
// Estados financieros, libros y auxiliares contables
// ============================================================
// Informes que antes eran pantallas de Finanzas y que ahora se abren en el
// visor de Reportes con su componente propio (`componente` en el catálogo).
// No tienen versión tabular (`sinTabla`): su cálculo es el de las RPC
// corregidas en la auditoría del Contador (2026-11-07) —
// `fn_estado_flujos_efectivo`, `fn_estado_cambios_patrimonio`,
// `fn_indicadores_financieros_base`, `fn_libro_*`— y el del servicio de
// contabilidad (`ReportesContablesService.getLedger`,
// `fn_auxiliar_tercero_detalle`). Aquí no se calcula nada: si alguien pide
// la tabla (cierre, envío, documento, asistente), se responde que el informe
// se consulta en su pantalla.
// ============================================================

import type { DefinicionModulo, ReportData } from '../types';

export class ReporteSinTablaError extends Error {
  constructor(titulo: string) {
    super(`«${titulo}» se consulta en su pantalla del centro de reportes: no tiene versión tabular para cierres, envíos ni documentos.`);
    this.name = 'ReporteSinTablaError';
  }
}

function informe(id: string, titulo: string, descripcion: string, periodosSugeridos: DefinicionModulo['periodosSugeridos']): DefinicionModulo {
  return {
    id,
    modulo: 'finance',
    titulo,
    descripcion,
    categoria: 'contable',
    alcance: 'organizacion',
    periodosSugeridos,
    fetch(): Promise<ReportData> {
      return Promise.reject(new ReporteSinTablaError(titulo));
    },
  };
}

export const estadosFinancierosReports: DefinicionModulo[] = [
  informe('estado-flujos-efectivo', 'Estado de flujos de efectivo', 'Método indirecto: operación, inversión y financiación, con cuadre contra caja y bancos', ['mensual', 'trimestral', 'anual']),
  informe('cambios-patrimonio', 'Estado de cambios en el patrimonio', 'Movimiento de cada componente del patrimonio en el periodo', ['anual']),
  informe('notas-estados', 'Notas a los estados financieros', 'Notas con sus cifras del libro de inventarios y balances', ['anual']),
  informe('certificacion-estados', 'Certificación de estados financieros', 'Datos del representante legal y del contador para certificar los estados', ['anual']),
  informe('indicadores-financieros', 'Indicadores financieros', 'Liquidez, endeudamiento, rentabilidad y actividad, con el año anterior', ['mensual', 'trimestral', 'anual']),
  informe('libros-contables', 'Libros contables', 'Diario, mayor y balances, inventarios y balances, auxiliares por cuenta, tercero y centro de costo', ['mensual', 'anual']),
  informe('libro-diario', 'Libro diario', 'Asientos publicados del periodo, línea por línea, con su tercero', ['diario', 'semanal', 'mensual']),
  informe('mayor-cuenta', 'Mayor de una cuenta', 'Saldo inicial, movimientos y saldo corrido de la cuenta elegida', ['mensual', 'anual']),
  informe('auxiliar-tercero', 'Auxiliar por tercero', 'Saldo inicial, movimientos y saldo corrido por NIT y cuenta', ['mensual', 'anual']),
];
