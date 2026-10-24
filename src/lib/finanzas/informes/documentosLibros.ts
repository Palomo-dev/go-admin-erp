import type { DocumentoInforme, TablaInforme } from '@/components/finanzas/contabilidad/informes/catalogo';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { fechaAnoAnterior } from './estados';
import { auxiliarContable, conciliarInventario1435, kardexValorizado, libroInventariosBalances, mayorConsolidado, type EntradaLibros, type MovimientoStockInforme } from './libros';

const columnasMayor: TablaInforme['columnas'] = [
  { clave: 'clase', titulo: 'Clase' }, { clave: 'codigo', titulo: 'Cuenta' }, { clave: 'nombre', titulo: 'Nombre' },
  { clave: 'saldoInicial', titulo: 'Saldo inicial', formato: 'pesos' }, { clave: 'debitos', titulo: 'Débitos', formato: 'pesos' },
  { clave: 'creditos', titulo: 'Créditos', formato: 'pesos' }, { clave: 'ajusteAnulaciones', titulo: 'Efecto de anulaciones anteriores', formato: 'pesos' },
  { clave: 'saldoFinal', titulo: 'Saldo final', formato: 'pesos' },
];
const columnasAuxiliar: TablaInforme['columnas'] = [
  { clave: 'codigo', titulo: 'Cuenta' }, { clave: 'nombre', titulo: 'Nombre' }, { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'documento', titulo: 'Documento' }, { clave: 'centro', titulo: 'Centro de costo' },
  { clave: 'terceroDocumento', titulo: 'Identificación' }, { clave: 'tercero', titulo: 'Tercero' },
  { clave: 'saldoInicial', titulo: 'Saldo inicial', formato: 'pesos' }, { clave: 'debito', titulo: 'Débito', formato: 'pesos' },
  { clave: 'credito', titulo: 'Crédito', formato: 'pesos' }, { clave: 'ajusteAnulaciones', titulo: 'Efecto de anulaciones anteriores', formato: 'pesos' },
  { clave: 'saldo', titulo: 'Saldo corrido', formato: 'pesos' },
];

export function documentosLibros({ entrada, stock, cuenta, productoId, stockCompleto = true, advertenciasStock = [] }: {
  entrada: EntradaLibros;
  stock: MovimientoStockInforme[];
  cuenta?: string;
  productoId?: number;
  /** Falso si falta historia verificable o no puede asignarse al centro de costo. */
  stockCompleto?: boolean;
  advertenciasStock?: string[];
}): Record<string, DocumentoInforme> {
  const previo: EntradaLibros = { ...entrada, desde: fechaAnoAnterior(entrada.desde), hasta: fechaAnoAnterior(entrada.hasta) };
  const periodos = [entrada, previo];
  const mayor = periodos.map((periodo, indice) => ({ titulo: indice === 0 ? 'Periodo actual' : 'Mismo periodo del año anterior', columnas: columnasMayor, filas: mayorConsolidado(periodo).map((fila) => ({ ...fila })) }));
  const kardex = stockCompleto ? kardexValorizado(stock, entrada.hasta) : [];
  const kardexPrevio = stockCompleto ? kardexValorizado(stock, previo.hasta) : [];
  const conciliacion = stockCompleto ? conciliarInventario1435(kardex, entrada.movimientos, entrada.hasta) : [];
  const conciliacionPrevia = stockCompleto ? conciliarInventario1435(kardexPrevio, entrada.movimientos, previo.hasta) : [];
  const avisosStock = stockCompleto ? [] : advertenciasStock.length ? advertenciasStock : ['El inventario histórico no está completo para estos filtros. No se presenta el kárdex ni la conciliación con 1435; no se interpreta como inventario de valor cero.'];
  const columnasConciliacion: TablaInforme['columnas'] = [
    { clave: 'sedeId', titulo: 'Sede' }, { clave: 'valorKardex', titulo: 'Kárdex valorizado', formato: 'pesos' },
    { clave: 'saldo1435', titulo: 'Saldo de auxiliares 1435', formato: 'pesos' }, { clave: 'diferencia', titulo: 'Diferencia', formato: 'pesos' },
  ];
  const documentos: Record<string, DocumentoInforme> = {
    'mayor-consolidado': { titulo: 'Libro mayor y balances', tablas: mayor },
    'auxiliar-cuenta': { titulo: 'Auxiliar por cuenta', tablas: periodos.map((periodo, indice) => ({
      titulo: indice === 0 ? 'Periodo actual' : 'Mismo periodo del año anterior', columnas: columnasAuxiliar,
      filas: auxiliarContable(periodo, false, cuenta).map((fila) => ({ ...fila, fecha: formatPlainDate(fila.fecha) })),
    })) },
    'auxiliar-centro': { titulo: 'Auxiliar por centro de costo', tablas: periodos.map((periodo, indice) => ({
      titulo: indice === 0 ? 'Cuenta × centro de costo × tercero · actual' : 'Cuenta × centro de costo × tercero · año anterior', columnas: columnasAuxiliar,
      filas: auxiliarContable(periodo, true, cuenta).map((fila) => ({ ...fila, fecha: formatPlainDate(fila.fecha) })),
    })) },
    'inventarios-balances': {
      titulo: 'Libro de inventarios y balances',
      tablas: [
        ...periodos.map((periodo, indice) => ({ titulo: `Clases 1, 2 y 3 · ${indice === 0 ? 'actual' : 'año anterior'}`, columnas: columnasMayor, filas: libroInventariosBalances(periodo).map((fila) => ({ ...fila })) })),
        ...(stockCompleto ? [
          { titulo: 'Conciliación de inventario por sede · actual', columnas: columnasConciliacion, filas: conciliacion.map((fila) => ({ ...fila })) },
          { titulo: 'Conciliación de inventario por sede · año anterior', columnas: columnasConciliacion, filas: conciliacionPrevia.map((fila) => ({ ...fila })) },
        ] : []),
      ],
      avisos: [...avisosStock, ...([...conciliacion, ...conciliacionPrevia].some((fila) => Math.abs(fila.diferencia) > 0.005) ? ['Hay diferencias entre el kárdex por producto/sede y los auxiliares de 1435 en el periodo actual o su comparativo. No se usó 1405 ni se generaron ajustes contables automáticamente.'] : [])],
    },
    'kardex-sede': { titulo: 'Kárdex por producto y sede', tablas: (stockCompleto ? [kardex, kardexPrevio] : []).map((filas, indice) => ({
      titulo: indice === 0 ? 'Periodo actual · promedio ponderado' : 'Año anterior · promedio ponderado',
      columnas: [
        { clave: 'productoId', titulo: 'Producto' }, { clave: 'sedeId', titulo: 'Sede' }, { clave: 'fecha', titulo: 'Fecha' },
        { clave: 'documento', titulo: 'Documento' }, { clave: 'tipo', titulo: 'Tipo' },
        { clave: 'cantidad', titulo: 'Cantidad', formato: 'numero' }, { clave: 'costoUnitario', titulo: 'Costo unitario', formato: 'pesos' },
        { clave: 'saldoCantidad', titulo: 'Saldo en cantidad', formato: 'numero' }, { clave: 'costoPromedio', titulo: 'Costo promedio', formato: 'pesos' },
        { clave: 'saldoValorizado', titulo: 'Saldo valorizado', formato: 'pesos' },
      ],
      filas: filas.filter((fila) => fila.fecha >= periodos[indice].desde && (!productoId || fila.productoId === productoId)).map((fila) => ({ ...fila, fecha: formatPlainDate(fila.fecha) })),
    })), avisos: [...avisosStock, ...([...kardex, ...kardexPrevio].some((fila) => fila.saldoCantidad < 0) ? ['Existen saldos negativos de inventario en el periodo actual o su comparativo. Revise entradas iniciales, secuencia de movimientos y costos antes de presentar la conciliación.'] : [])] },
  };
  return documentos;
}
