/** Textos editables por organización. No se modifican los asientos ni sus saldos. */
export interface PlantillaNotas {
  entidad: string;
  basesPreparacion: string;
  politicas: string;
  revelaciones: string;
}

export interface FirmanteInforme {
  nombre: string;
  cedula: string;
  tarjetaProfesional?: string;
}

export interface ConfiguracionCertificacion {
  entidad: string;
  nit: string;
  representante: FirmanteInforme;
  contador: FirmanteInforme;
  revisorFiscal?: FirmanteInforme | null;
  /** Texto preparado/revisado por el revisor; nunca se emite una opinión automática. */
  dictamen?: string | null;
}

export function plantillaNotasPredeterminada(grupo: 2 | 3): PlantillaNotas {
  return {
    entidad: 'Describa la entidad, su domicilio, actividad económica, duración y órgano que autoriza estos estados financieros.',
    basesPreparacion: grupo === 2
      ? 'Los estados financieros se preparan de conformidad con el marco técnico normativo para entidades del grupo 2, NIIF para las PYMES, incorporado en el Decreto 2420 de 2015, anexo 2, y sus modificaciones. Los importes se presentan en unidades enteras de la moneda funcional de la entidad. La administración debe revelar las estimaciones y juicios significativos aplicados.'
      : 'Los estados financieros se preparan de conformidad con el marco técnico normativo para microempresas del grupo 3, incorporado en el Decreto 2420 de 2015, anexo 3, y sus modificaciones. Se presentan el estado de situación financiera, el estado de resultados y sus notas en unidades enteras de la moneda funcional de la entidad, sin otro resultado integral.',
    politicas: 'Efectivo y equivalentes: incluye caja, bancos e inversiones de alta liquidez con vencimiento original de tres meses o menos, identificadas como equivalentes. Inventarios: se miden al costo mediante promedio ponderado, considerando el deterioro que corresponda. Cuentas por cobrar: se reconocen con evaluación de recuperabilidad. Propiedades, planta y equipo: se reconocen al costo menos depreciación y deterioro, salvo una política de medición posterior aplicable y revelada. Ingresos y gastos: se reconocen por causación. Revise y adapte estas políticas a las operaciones y al marco normativo de la entidad antes de aprobar los estados.',
    revelaciones: 'Incluya contingencias, compromisos, partes relacionadas, hechos posteriores y cualquier información material necesaria para comprender los estados financieros.',
  };
}

/** Vacío es una edición válida; solo null/undefined reciben el valor predeterminado. */
export function resolverPlantillaNotas(grupo: 2 | 3, guardada?: Partial<PlantillaNotas> | null): PlantillaNotas {
  const base = plantillaNotasPredeterminada(grupo);
  return {
    entidad: guardada?.entidad ?? base.entidad,
    basesPreparacion: guardada?.basesPreparacion ?? base.basesPreparacion,
    politicas: guardada?.politicas ?? base.politicas,
    revelaciones: guardada?.revelaciones ?? base.revelaciones,
  };
}

/** Saldos propios de cuentas de movimiento, provenientes del motor de estados. */
export interface SaldoNota {
  account_code: string;
  name: string;
  actual: number;
  anterior: number;
  es_ori?: boolean;
}

export interface DetalleNota {
  codigo: string;
  nombre: string;
  actual: number;
  anterior: number;
  variacion: number;
  variacionPorcentaje: number | null;
}

export interface NotaAutomatica {
  rubro: string;
  detalle: DetalleNota[];
  totalActual: number;
  totalAnterior: number;
}

/** Un solo agregado por prefijo: nunca se suman títulos PUC junto con sus hijos. */
export function generarNotasAutomaticas(saldos: SaldoNota[], nivel: 4 | 6 = 4): NotaAutomatica[] {
  const rubros = new Map<string, Map<string, DetalleNota>>();
  for (const saldo of saldos) {
    if (!/^[1-7]\d+$/.test(saldo.account_code)) continue;
    if (!Number.isFinite(saldo.actual) || !Number.isFinite(saldo.anterior)) {
      throw new Error('La nota contiene un saldo no numérico.');
    }
    if (saldo.actual === 0 && saldo.anterior === 0) continue;
    const rubro = saldo.account_code.slice(0, 2);
    const codigo = saldo.account_code.slice(0, nivel);
    const detalle = rubros.get(rubro) ?? new Map<string, DetalleNota>();
    const fila = detalle.get(codigo) ?? {
      codigo, nombre: saldo.account_code.length <= nivel ? saldo.name : `Cuenta ${codigo}`,
      actual: 0, anterior: 0, variacion: 0, variacionPorcentaje: null,
    };
    fila.actual += saldo.actual;
    fila.anterior += saldo.anterior;
    if (!Number.isFinite(fila.actual) || !Number.isFinite(fila.anterior)) {
      throw new Error('El agregado de la nota contiene un saldo no numérico.');
    }
    detalle.set(codigo, fila);
    rubros.set(rubro, detalle);
  }
  return [...rubros.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([rubro, filas]) => {
    const detalle = [...filas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)).map((fila) => {
      const variacion = fila.actual - fila.anterior;
      const variacionPorcentaje = fila.anterior === 0 ? null : variacion / Math.abs(fila.anterior) * 100;
      if (!Number.isFinite(variacion) || (variacionPorcentaje !== null && !Number.isFinite(variacionPorcentaje))) {
        throw new Error('La variación de la nota contiene un saldo no numérico.');
      }
      return { ...fila, variacion, variacionPorcentaje };
    });
    const totalActual = detalle.reduce((s, f) => s + f.actual, 0);
    const totalAnterior = detalle.reduce((s, f) => s + f.anterior, 0);
    if (!Number.isFinite(totalActual) || !Number.isFinite(totalAnterior)) {
      throw new Error('El total de la nota contiene un saldo no numérico.');
    }
    return {
      rubro, detalle,
      totalActual, totalAnterior,
    };
  });
}

export interface CertificacionInforme {
  titulo: string;
  textos: string[];
  firmas: Array<{ cargo: string; nombre: string; cedula: string; tarjetaProfesional?: string }>;
  faltantes: string[];
  dictamen: { titulo: string; texto: string; firmante: FirmanteInforme } | null;
}

export function generarCertificacion(config: ConfiguracionCertificacion, desde: string, hasta: string): CertificacionInforme {
  const faltantes: string[] = [];
  for (const [campo, valor] of [
    ['Nombre de la entidad', config.entidad], ['NIT', config.nit],
    ['Nombre del representante legal', config.representante.nombre], ['Cédula del representante legal', config.representante.cedula],
    ['Nombre del contador', config.contador.nombre], ['Cédula del contador', config.contador.cedula],
    ['Tarjeta profesional del contador', config.contador.tarjetaProfesional],
  ]) if (!valor?.trim()) faltantes.push(campo as string);
  const dictamen = config.dictamen?.trim();
  if (dictamen && (!config.revisorFiscal?.nombre.trim() || !config.revisorFiscal.tarjetaProfesional?.trim())) {
    faltantes.push('Nombre y tarjeta profesional del revisor fiscal para adjuntar dictamen');
  }
  return {
    titulo: 'Certificación de estados financieros',
    textos: [
      `${config.entidad || '[Entidad pendiente]'} — NIT ${config.nit || '[NIT pendiente]'}. Periodo: ${desde} a ${hasta}.`,
      'El representante legal y el contador público bajo cuya responsabilidad se han preparado los estados financieros declaramos, de conformidad con el artículo 37 de la Ley 222 de 1995, que hemos verificado previamente las afirmaciones contenidas en ellos y que las mismas se han tomado fielmente de los libros.',
      'Las firmas deben ser incorporadas por sus titulares después de la revisión y aprobación. La generación de este documento no constituye una firma ni una certificación emitida automáticamente.',
    ],
    firmas: [
      { cargo: 'Representante legal', ...config.representante },
      { cargo: 'Contador público', ...config.contador },
    ],
    faltantes,
    dictamen: dictamen && config.revisorFiscal ? {
      titulo: 'Dictamen del revisor fiscal — artículo 38 de la Ley 222 de 1995',
      texto: dictamen,
      firmante: config.revisorFiscal,
    } : null,
  };
}
