/**
 * Textos por defecto de las notas y de la certificación. La organización
 * puede reemplazarlos; si deja el campo vacío, se usa este.
 */

import type { PerfilEstados } from './tipos';

export function basesDePreparacion(perfil: PerfilEstados): string {
  if (perfil.grupo === 3) {
    return 'Los estados se preparan conforme al marco de información financiera para microempresas, anexo 3 del Decreto 2420 de 2015. Ese marco comprende el estado de situación financiera, el estado de resultados y las notas. No incluye otro resultado integral.';
  }
  return 'Los estados se preparan conforme a las Normas de Información Financiera para pymes, anexo 2 del Decreto 2420 de 2015. El otro resultado integral se presenta solo en las cuentas del grupo 38 marcadas para ese fin.';
}

export const POLITICAS_DEFECTO: readonly { id: string; titulo: string; texto: string }[] = [
  {
    id: 'entidad',
    titulo: 'Entidad que informa',
    texto: 'La entidad informa en pesos colombianos, sin decimales. Los estados cubren la entidad individual y, cuando se elige una sede o un centro de costo, solo ese segmento.',
  },
  {
    id: 'efectivo',
    titulo: 'Efectivo y equivalentes',
    texto: 'El efectivo comprende la caja y los depósitos a la vista. Un equivalente es una inversión del grupo 12, con vencimiento de tres meses o menos desde la fecha del reporte, marcada como tal. Sin esa marca no se reclasifica.',
  },
  {
    id: 'inventarios',
    titulo: 'Inventarios',
    texto: 'Los inventarios se miden al costo promedio ponderado. El saldo contable de la mercancía está en los auxiliares de la cuenta 1435, por sede. La cuenta 1405 no se usa para ese cuadre.',
  },
  {
    id: 'instrumentos',
    titulo: 'Deudores y obligaciones',
    texto: 'Los deudores comerciales se presentan netos del deterioro acumulado en la 1399. Las obligaciones se separan entre corrientes y no corrientes según la marca de la cuenta o, si depende del plazo, según los meses registrados. Sin plazo, una cuenta «según plazo» permanece como no corriente.',
  },
  {
    id: 'ppe',
    titulo: 'Propiedad, planta y equipo',
    texto: 'La propiedad, planta y equipo se presenta neta de la depreciación acumulada. La depreciación del periodo es el crédito de la 1592 y de la 1598, también cuando el débito fue al costo de ventas y no a un gasto.',
  },
  {
    id: 'ingresos',
    titulo: 'Ingresos',
    texto: 'Los ingresos de actividades ordinarias se reconocen cuando se transfiere el bien o se presta el servicio. Las devoluciones de la 4175 se restan para llegar a las ventas netas.',
  },
  {
    id: 'patrimonio',
    titulo: 'Patrimonio',
    texto: 'Los dividendos decretados en efectivo reducen el patrimonio en el momento del decreto, contra la 2360, aunque no se hayan pagado. La corrección de errores de periodos anteriores se reconoce contra las utilidades acumuladas, sección 10 del marco aplicable.',
  },
];

export function politica(perfil: PerfilEstados, id: string, texto: string): string {
  const propio = perfil.notas[id];
  return propio && propio.trim() ? propio.trim() : texto;
}

export function textoCertificacion(perfil: PerfilEstados, desde: string, hasta: string): string {
  const entidad = perfil.entidad.trim() || 'la entidad';
  const nit = perfil.nit.trim() || 'sin NIT registrado';
  return `El representante legal y el contador de ${entidad}, identificada con NIT ${nit}, certifican que han verificado las afirmaciones contenidas en los estados financieros del ${desde} al ${hasta}, de conformidad con el artículo 37 de la Ley 222 de 1995, y que tales estados se han tomado fielmente de los libros de contabilidad.`;
}

export function textoDictamen(perfil: PerfilEstados): string {
  return `Dictamen del revisor fiscal, artículo 38 de la Ley 222 de 1995. ${perfil.revisorNombre || 'Revisor fiscal'}${perfil.revisorTarjeta ? `, tarjeta profesional ${perfil.revisorTarjeta}` : ''}. El texto del dictamen lo incorpora el revisor; este espacio solo reserva la firma.`;
}

export const AVISO_BORRADOR = 'Borrador para que el contador lo revise antes de presentarlo. No es una declaración radicada.';
