import type { DocumentoInforme, TablaInforme } from '@/components/finanzas/contabilidad/informes/catalogo';
import { generarEstados, comparar, movimientosContabilizados, resultadoPeriodo, type EntradaEstados } from './estados';
import { generarIndicadores } from './indicadores';
import { generarCertificacion, generarNotasAutomaticas, resolverPlantillaNotas, type ConfiguracionCertificacion, type PlantillaNotas } from './notasCertificacion';

export interface OpcionesDocumentosEstados {
  nivel: 1 | 2 | 4 | 6 | 'auxiliar';
  notas?: Partial<PlantillaNotas> | null;
  certificacion: ConfiguracionCertificacion;
  patrimonioOpcional: boolean;
}

const columnasComparativo: TablaInforme['columnas'] = [
  { clave: 'codigo', titulo: 'Código' }, { clave: 'nombre', titulo: 'Concepto' },
  { clave: 'actual', titulo: 'Actual', formato: 'pesos' },
  { clave: 'anterior', titulo: 'Año anterior', formato: 'pesos' },
  { clave: 'variacion', titulo: 'Variación $', formato: 'pesos' },
  { clave: 'variacionPorcentaje', titulo: 'Variación %', formato: 'porcentaje' },
];

/** Compone documentos con las mismas cifras del motor; no recalcula políticas contables. */
export function documentosEstados(entrada: EntradaEstados, opciones: OpcionesDocumentosEstados) {
  const estados = generarEstados(entrada);
  const { actual, anterior } = estados;
  const catalogo = new Map(entrada.cuentas.map((cuenta) => [cuenta.account_code, cuenta.name]));
  const agrupar = (saldos: Record<string, number>, nivel: OpcionesDocumentosEstados['nivel']) => {
    const agrupado: Record<string, number> = {};
    for (const [codigo, valor] of Object.entries(saldos)) {
      if (!/^[123]/.test(codigo)) continue;
      const clave = nivel === 'auxiliar' ? codigo : codigo.slice(0, nivel);
      agrupado[clave] = (agrupado[clave] ?? 0) + valor;
    }
    return agrupado;
  };
  const a = agrupar(actual.saldosFinales, opciones.nivel);
  const b = agrupar(anterior.saldosFinales, opciones.nivel);
  const detalleBalance = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map((codigo) => ({
    ...comparar(codigo, catalogo.get(codigo) ?? `Cuenta ${codigo}`, a[codigo] ?? 0, b[codigo] ?? 0),
  }));
  const documentos: Record<string, DocumentoInforme> = {
    'situacion-financiera': {
      titulo: 'Estado de situación financiera',
      tablas: [
        { titulo: 'Resumen al corte', columnas: columnasComparativo, filas: estados.situacion.map((fila) => ({ ...fila })) },
        { titulo: 'Detalle PUC al corte', columnas: columnasComparativo, filas: detalleBalance },
        { titulo: 'Resultado pendiente de cierre y conciliación', columnas: columnasComparativo, filas: [
          { ...comparar('resultado_abierto', 'Resultado no trasladado aún al patrimonio en libros', actual.resultadoAbierto, anterior.resultadoAbierto) },
          { ...comparar('diferencia_balance', 'Diferencia: activo − pasivo − patrimonio', actual.diferenciaBalance, anterior.diferenciaBalance) },
        ] },
      ],
      avisos: Math.abs(actual.diferenciaBalance) > 0.005 ? ['El balance presenta una diferencia contable; revise los asientos antes de presentarlo.'] : [],
    },
    'resultados-integral': {
      titulo: entrada.grupoNiif === 3 ? 'Estado de resultados' : 'Estado de resultados integral',
      tablas: [{ titulo: 'Resultados del periodo', columnas: columnasComparativo, filas: estados.resultados.map((fila) => ({ ...fila })) }],
    },
  };
  if (entrada.grupoNiif === 2 || opciones.patrimonioOpcional) {
    documentos['cambios-patrimonio'] = {
      titulo: 'Estado de cambios en el patrimonio',
      tablas: [
        ...[estados.patrimonio, estados.patrimonioAnterior].map((patrimonio, indice) => ({
          titulo: indice === 0 ? 'Periodo actual' : 'Mismo periodo del año anterior',
          columnas: [{ clave: 'nombre', titulo: 'Movimiento' }, ...patrimonio.columnas.filter((codigo) => codigo !== 'total').map((codigo) => ({ clave: codigo, titulo: codigo, formato: 'pesos' as const })), { clave: 'total', titulo: 'Total', formato: 'pesos' as const }],
          filas: patrimonio.filas.map((fila) => ({ nombre: fila.nombre, ...fila.valores, total: fila.total })),
        })),
        { titulo: 'Conciliación con el balance', columnas: columnasComparativo, filas: [
          { ...comparar('saldo_final', 'Saldo final del estado de patrimonio', estados.patrimonio.saldoFinal, estados.patrimonioAnterior.saldoFinal) },
          { ...comparar('balance', 'Patrimonio del estado de situación financiera', estados.patrimonio.patrimonioBalance, estados.patrimonioAnterior.patrimonioBalance) },
          { ...comparar('diferencia', 'Diferencia', estados.patrimonio.diferencia, estados.patrimonioAnterior.diferencia) },
        ] },
      ],
      avisos: [...new Set([...estados.patrimonio.advertencias, ...estados.patrimonioAnterior.advertencias])],
    };
  }
  if (entrada.grupoNiif === 2) {
    const flujo = estados.flujoIndirecto;
    const previo = estados.flujoIndirectoAnterior;
    documentos['flujo-indirecto'] = {
      titulo: 'Flujo de efectivo indirecto',
      tablas: [
        { titulo: 'Actividades del flujo', columnas: [{ clave: 'actividad', titulo: 'Actividad' }, ...columnasComparativo.slice(1)], filas: flujo.filas.map((fila) => ({
          actividad: fila.actividad,
          ...comparar(fila.clave, fila.nombre, fila.valor, previo.filas.find((previa) => previa.clave === fila.clave)?.valor ?? 0),
        })) },
        { titulo: 'Cuadre con efectivo y equivalentes', columnas: columnasComparativo, filas: [
          ...(['operacion', 'inversion', 'financiacion', 'flujoNeto', 'efectivoInicial', 'efectivoFinal', 'variacionEfectivo', 'diferencia'] as const).map((clave) => ({
            ...comparar(clave, ({ operacion: 'Operación', inversion: 'Inversión', financiacion: 'Financiación', flujoNeto: 'Flujo neto', efectivoInicial: 'Efectivo y equivalentes iniciales', efectivoFinal: 'Efectivo y equivalentes finales', variacionEfectivo: 'Variación de 11 y equivalentes de efectivo', diferencia: 'Diferencia por conciliar' })[clave], flujo[clave], previo[clave]),
          })),
        ] },
      ],
      avisos: [...new Set([...flujo.advertencias, ...previo.advertencias])],
    };
  }
  const plantilla = resolverPlantillaNotas(entrada.grupoNiif, opciones.notas);
  const resultadoActual = resultadoPeriodo(entrada.movimientos, actual.desde, actual.hasta);
  const resultadoPrevio = resultadoPeriodo(entrada.movimientos, anterior.desde, anterior.hasta);
  // El detalle de resultados utiliza movimientos económicos sin asientos de cierre.
  const saldosNotas = [...new Set(entrada.movimientos.map((movimiento) => movimiento.account_code))].map((codigo) => {
    const esResultado = /^[4-7]/.test(codigo);
    const importePeriodo = (desde: string, hasta: string) => movimientosContabilizados(entrada.movimientos, hasta).filter((movimiento) => movimiento.account_code === codigo && movimiento.entry_date >= desde && movimiento.entry_date <= hasta && !['cierre_ejercicio', 'cierre_periodo'].includes(movimiento.source ?? '')).reduce((total, movimiento) => total + (codigo.startsWith('4') ? movimiento.credit - movimiento.debit : movimiento.debit - movimiento.credit), 0);
    return { account_code: codigo, name: catalogo.get(codigo) ?? `Cuenta ${codigo}`,
      actual: esResultado ? importePeriodo(actual.desde, actual.hasta) : actual.saldosFinales[codigo] ?? 0,
      anterior: esResultado ? importePeriodo(anterior.desde, anterior.hasta) : anterior.saldosFinales[codigo] ?? 0 };
  });
  // Referencia visible al resultado para comprobar la consistencia del paquete.
  const notas = generarNotasAutomaticas(saldosNotas, opciones.nivel === 6 || opciones.nivel === 'auxiliar' ? 6 : 4);
  documentos['notas-estados'] = {
    titulo: 'Notas a los estados financieros',
    textos: [plantilla.entidad, plantilla.basesPreparacion, plantilla.politicas, plantilla.revelaciones],
    tablas: [
      ...notas.map((nota) => ({ titulo: `Nota del rubro ${nota.rubro}`, columnas: columnasComparativo, filas: nota.detalle.map((fila) => ({ ...fila })) })),
      { titulo: 'Utilidad del paquete', columnas: columnasComparativo, filas: [{ ...comparar('utilidad_neta', 'Utilidad neta del estado de resultados', resultadoActual.utilidadNeta, resultadoPrevio.utilidadNeta) }] },
    ],
  };
  const certificacion = generarCertificacion(opciones.certificacion, entrada.desde, entrada.hasta);
  documentos.certificacion = {
    titulo: certificacion.titulo,
    textos: [...certificacion.textos, ...certificacion.firmas.map((firma) => `${firma.cargo}: ${firma.nombre || 'Pendiente'} · Cédula: ${firma.cedula || 'Pendiente'}${firma.tarjetaProfesional ? ` · TP: ${firma.tarjetaProfesional}` : ''}\nFirma: ______________________________`),
      ...(certificacion.dictamen ? [certificacion.dictamen.titulo, certificacion.dictamen.texto, `${certificacion.dictamen.firmante.nombre} · TP ${certificacion.dictamen.firmante.tarjetaProfesional ?? 'Pendiente'}\nFirma: ______________________________`] : [])],
    tablas: [],
    avisos: certificacion.faltantes.map((campo) => `Borrador: falta ${campo.toLocaleLowerCase('es')}.`),
  };
  return { estados, documentos, columnasComparativo };
}

export function documentosIndicadores(resultado: ReturnType<typeof generarIndicadores>): Record<string, DocumentoInforme> {
  return {
    indicadores: {
      titulo: 'Indicadores financieros',
      tablas: [{ titulo: 'Indicadores comparativos', columnas: [
        { clave: 'nombre', titulo: 'Indicador' }, { clave: 'formula', titulo: 'Fórmula' }, { clave: 'unidad', titulo: 'Unidad' },
        { clave: 'actual', titulo: 'Actual', formato: 'numero' }, { clave: 'anterior', titulo: 'Año anterior', formato: 'numero' },
        { clave: 'variacion', titulo: 'Variación', formato: 'numero' }, { clave: 'variacionPorcentaje', titulo: 'Variación %', formato: 'porcentaje' },
        { clave: 'motivoActual', titulo: 'Observación actual' }, { clave: 'motivoAnterior', titulo: 'Observación comparativo' },
      ], filas: resultado.filas.map((fila) => ({ ...fila })) }],
      avisos: resultado.advertencias,
    },
    'punto-equilibrio': {
      titulo: 'Punto de equilibrio',
      tablas: [
        { titulo: 'Equilibrio comparativo', columnas: columnasComparativo, filas: (['ventas', 'costosFijos', 'costosVariables', 'margenContribucion', 'pesos', 'unidades'] as const).map((clave) => {
          const a = resultado.equilibrio.actual[clave]; const b = resultado.equilibrio.anterior[clave];
          return { codigo: clave, nombre: ({ ventas: 'Ventas netas', costosFijos: 'Costos fijos', costosVariables: 'Costos variables', margenContribucion: 'Margen de contribución', pesos: 'Punto de equilibrio en pesos', unidades: 'Unidades para alcanzar equilibrio' })[clave], actual: a, anterior: b,
            variacion: a === null || b === null ? null : a - b, variacionPorcentaje: a === null || b === null || b === 0 ? null : (a - b) / Math.abs(b) * 100 };
        }) },
        ...(['actual', 'anterior', 'lineasActual', 'lineasAnterior'] as const).map((clave) => ({
          titulo: `Contribución ${clave === 'actual' || clave === 'anterior' ? 'por producto' : 'por línea'} · ${clave === 'actual' || clave === 'lineasActual' ? 'actual' : 'año anterior'}`,
          columnas: [{ clave: 'nombre', titulo: 'Producto o línea' }, { clave: 'ventas', titulo: 'Ventas', formato: 'pesos' as const }, { clave: 'costoVariable', titulo: 'Costo variable', formato: 'pesos' as const }, { clave: 'margenContribucion', titulo: 'Contribución', formato: 'pesos' as const }, { clave: 'porcentajeContribucion', titulo: 'Contribución %', formato: 'porcentaje' as const }],
          filas: resultado.contribucion[clave].map((fila) => ({ ...fila })),
        })),
      ],
      avisos: [...new Set([...resultado.advertencias, resultado.equilibrio.actual.motivoUnidades, resultado.equilibrio.anterior.motivoUnidades].filter((aviso): aviso is string => Boolean(aviso)))],
    },
  };
}
