/**
 * Obligaciones del periodo derivadas del perfil tributario (Centro tributario,
 * Figma 2335:136794) y su vencimiento según el calendario oficial cargado en
 * `tax_calendar_dates` (migración 20261108100500).
 *
 * Reglas del dueño y del Contador:
 * - Las fechas de la DIAN NO se adivinan. Con el calendario de un año vacío, o
 *   sin la fecha de una obligación, el vencimiento es «Calendario {año}
 *   incompleto»: nunca se interpreta como ausencia de obligaciones.
 * - Renta e IVA son campos separados (P5). Un dato sin definir no borra la
 *   obligación: la muestra con «perfil por revisar».
 * - Un periodo con más de una vigencia se señala y no se decide solo (P8).
 * - El ICA es municipal y siempre «confirmar con el municipio».
 * Sin React ni Supabase.
 */
import { periodoCerradoAl, ultimoDiaDelMes, leerMes, type Periodicidad, type PeriodoFiscal } from './periodos';
import { RESPONSABILIDAD, vigenciaEn, type VigenciaPerfil } from './perfil';
import { analizarPeriodo, vigenciasEnRango } from './vigenciasPeriodo';

export type ClaveObligacion =
  | 'iva'
  | 'retencion'
  | 'ica'
  | 'inc'
  | 'renta'
  | 'ingresos_patrimonio'
  | 'no_declarante'
  | 'rte_registro_web'
  | 'rte_memoria_economica'
  | 'simple'
  | 'simple_anticipo'
  | 'exogena'
  | 'conciliacion_fiscal';

/** De dónde sale el valor estimado y adónde lleva la fila. */
export type FuenteValor = 'borrador_iva' | 'reporte_retenciones' | 'ninguna';

export interface Obligacion {
  /** Único en la lista (el ICA se repite por municipio; el IVA puede repetirse con otro periodo si cambió la periodicidad). */
  id: string;
  clave: ClaveObligacion;
  formulario: string | null;
  periodo: PeriodoFiscal;
  /** Clave en `tax_calendar_dates.obligacion`; null = no es del calendario nacional (ICA). */
  calendario: string | null;
  fuente: FuenteValor;
  municipioId?: string;
  municipio?: string | null;
  /** Avisos para el Contador (p. ej. la autorretención no está en el estimado). */
  notas: NotaObligacion[];
}

export type NotaObligacion =
  | 'sin_autorretencion'
  | 'persona_natural_no_soportada'
  | 'requisitos_por_confirmar'
  | 'perfil_por_revisar'
  | 'iva_anual_simple'
  | 'anticipo_simple'
  | 'regimen_especial'
  | 'conciliacion_por_evaluar'
  | 'rte_cooperativa_formatos'
  | 'rte_memoria_pdf_firmado'
  | 'rte_umbral_por_confirmar'
  /** Ronda 5: formato 2532 (donaciones y cooperación internacional no reembolsable recibidas). */
  | 'rte_2532_aplica'
  | 'rte_2532_no_aplica'
  | 'rte_2532_por_confirmar'
  | 'clasificacion_inicial'
  | 'cambio_vigencia_en_periodo'
  | 'cambio_periodicidad_pendiente'
  | 'decision_registrada'
  | 'decision_reabierta'
  | 'periodo_sin_perfil_completo';

/**
 * Ronda 6 del Contador: el formato 2532 va POR AÑO GRAVABLE (tabla `tributario_rte_2532_anio`), no por vigencia del
 * perfil. `recibio` = la cooperativa recibió ese año donaciones o cooperación internacional no reembolsable; si no, la
 * constancia de lo verificado. Sin dato del año → «por confirmar».
 */
export interface Dato2532 {
  recibio: boolean;
  constancia: string | null;
}
export type Formato2532PorAnio = ReadonlyMap<number, Dato2532>;

/** Filas de `tributario_rte_2532_anio` → mapa por año gravable (descarta lo que no tenga la forma esperada). */
export function leerFormato2532(filas: readonly unknown[] | null | undefined): Map<number, Dato2532> {
  const m = new Map<number, Dato2532>();
  for (const f of filas ?? []) {
    const r = (f ?? {}) as { anio_gravable?: unknown; recibio?: unknown; constancia?: unknown };
    const anio = Number(r.anio_gravable);
    if (!Number.isInteger(anio) || typeof r.recibio !== 'boolean') continue;
    m.set(anio, { recibio: r.recibio, constancia: typeof r.constancia === 'string' && r.constancia.trim() ? r.constancia : null });
  }
  return m;
}

/** Nota del 2532 para el año gravable: aplica, no aplica (con constancia) o por confirmar. */
export function nota2532(dato: Dato2532 | undefined): NotaObligacion {
  if (dato?.recibio === true) return 'rte_2532_aplica';
  if (dato?.recibio === false && dato.constancia) return 'rte_2532_no_aplica';
  return 'rte_2532_por_confirmar';
}

/** Obligaciones de UNA vigencia, con el último periodo cerrado al mes `corte` (`YYYY-MM`). */
export function derivarObligaciones(perfil: VigenciaPerfil, corte: string, formato2532?: Formato2532PorAnio): Obligacion[] {
  const out: Obligacion[] = [];
  const fe = new Set(perfil.responsabilidades);
  const revisar: NotaObligacion[] = perfil.requiereRevision ? ['perfil_por_revisar'] : [];
  const agregar = (periodicidad: Periodicidad, o: Omit<Obligacion, 'periodo' | 'notas'>, notas: NotaObligacion[] = []) => {
    const periodo = periodoCerradoAl(periodicidad, corte);
    if (periodo) out.push({ ...o, periodo, notas: Array.from(new Set(notas)) });
  };
  const simple = perfil.regimenRenta === 'simple';

  // IVA: se declara si es responsable (o si aún no se sabe y tiene periodicidad: se muestra, por revisar).
  if (perfil.condicionIva !== 'no_responsable' && perfil.periodicidadIva !== 'no_aplica') {
    const notas: NotaObligacion[] = [...revisar];
    if (perfil.condicionIva === null) notas.push('perfil_por_revisar');
    // SIMPLE: el IVA anual consolidado (ET art. 915) es una obligación propia, separada de los anticipos bimestrales.
    if (simple && perfil.periodicidadIva === 'anual') notas.push('iva_anual_simple');
    agregar(
      perfil.periodicidadIva,
      { id: `iva:${perfil.periodicidadIva}`, clave: 'iva', formulario: '300', calendario: `iva_${perfil.periodicidadIva}`, fuente: 'borrador_iva' },
      notas,
    );
  }

  const autorretenedor = perfil.autorretenedor === true || perfil.autorretencionEspecial === true || fe.has(RESPONSABILIDAD.autorretenedor);
  if (perfil.agenteRetencion || autorretenedor || perfil.agenteRetencionIva === true || fe.has(RESPONSABILIDAD.agenteRetencionIva)) {
    agregar(
      'mensual',
      { id: 'retencion', clave: 'retencion', formulario: '350', calendario: 'retencion_fuente', fuente: 'reporte_retenciones' },
      [...revisar, ...(autorretenedor ? (['sin_autorretencion'] as NotaObligacion[]) : [])],
    );
  }
  for (const ica of perfil.ica) {
    agregar(
      ica.periodicidad,
      { id: `ica:${ica.municipioId}`, clave: 'ica', formulario: null, calendario: null, fuente: 'ninguna', municipioId: ica.municipioId, municipio: ica.municipio },
      revisar,
    );
  }
  if (perfil.responsableInc) {
    agregar('bimestral', { id: 'inc', clave: 'inc', formulario: '310', calendario: 'inc_bimestral', fuente: 'ninguna' }, [
      ...revisar,
      // El INC depende de la actividad (ET art. 512-1); en el SIMPLE parte se integra al impuesto unificado.
      ...(simple || perfil.incActividad === null ? (['requisitos_por_confirmar'] as NotaObligacion[]) : []),
    ]);
  }

  // Renta según su propio régimen.
  const gran = perfil.granContribuyente === true || fe.has(RESPONSABILIDAD.granContribuyente);
  switch (perfil.regimenRenta) {
    case 'simple':
      agregar('anual', { id: 'simple', clave: 'simple', formulario: '260', calendario: 'simple_anual', fuente: 'ninguna' }, revisar);
      agregar('bimestral', { id: 'simple_anticipo', clave: 'simple_anticipo', formulario: '2593', calendario: 'simple_anticipo', fuente: 'ninguna' }, [
        ...revisar,
        'anticipo_simple',
      ]);
      break;
    case 'ordinario':
    case null: {
      const notas: NotaObligacion[] = [...revisar];
      if (perfil.regimenRenta === null) notas.push('perfil_por_revisar');
      if (!gran) notas.push('persona_natural_no_soportada');
      agregar(
        'anual',
        { id: 'renta', clave: 'renta', formulario: '110 o 210', calendario: gran ? 'renta_gran_contribuyente' : 'renta_persona_juridica', fuente: 'ninguna' },
        notas,
      );
      agregar(
        'anual',
        { id: 'conciliacion_fiscal', clave: 'conciliacion_fiscal', formulario: '2516 o 2517', calendario: 'conciliacion_fiscal', fuente: 'ninguna' },
        perfil.regimenRenta === null ? [...revisar, 'perfil_por_revisar'] : revisar,
      );
      break;
    }
    case 'especial': {
      // Régimen tributario especial (ET arts. 19, 356 a 364-6): renta en el formulario 110, conciliación fiscal
      // evaluada (no excluida), actualización anual del registro web (art. 364-5) y memoria económica cuando los
      // ingresos del año anterior superan 160.000 UVT (art. 356-3 par. 2). Parametrizado por tipo de entidad.
      // Ronda 4 del Contador: a las cooperativas SÍ les aplica la actualización del registro web (no es opcional), con
      // los formatos 5245, 2530 y 2531 (2532 cuando corresponda, con las adaptaciones de cooperativas) y sin la
      // información de asignaciones permanentes propia de las ESAL. La memoria económica se presenta en PDF firmado
      // según corresponda, no como un formato numerado.
      // Ronda 5 del Contador: el 2532 es para donaciones y cooperación internacional no reembolsable RECIBIDAS (Res. 227
      // de 2025, art. 1.1.6.3). Se pide solo si la cooperativa las recibió; si no, queda la constancia de que no aplica;
      // sin el dato, «por confirmar». Nunca se da por aplicable ni por no aplicable sin que alguien lo diga.
      // Ronda 6: el dato es del AÑO GRAVABLE del registro (el año del periodo anual), no de la vigencia del perfil.
      const cooperativa = perfil.rteTipo === 'cooperativa_art19_4';
      const anioGravable = periodoCerradoAl('anual', corte)?.anio;
      const dato2532 = anioGravable !== undefined ? formato2532?.get(anioGravable) : undefined;
      const donaciones = dato2532?.recibio ?? null;
      const notaDel2532 = nota2532(dato2532);
      agregar('anual', { id: 'renta', clave: 'renta', formulario: '110', calendario: gran ? 'renta_gran_contribuyente' : 'renta_persona_juridica', fuente: 'ninguna' }, [
        ...revisar,
        'regimen_especial',
      ]);
      agregar('anual', { id: 'conciliacion_fiscal', clave: 'conciliacion_fiscal', formulario: '2516 o 2517', calendario: 'conciliacion_fiscal', fuente: 'ninguna' }, [
        ...revisar,
        'conciliacion_por_evaluar',
      ]);
      agregar(
        'anual',
        {
          id: 'rte_registro_web',
          clave: 'rte_registro_web',
          formulario: cooperativa ? (donaciones === true ? '5245, 2530, 2531, 2532' : '5245, 2530, 2531') : null,
          calendario: 'rte_registro_web',
          fuente: 'ninguna',
        },
        [...revisar, ...(cooperativa ? (['rte_cooperativa_formatos', notaDel2532] as NotaObligacion[]) : [])],
      );
      if (perfil.rteIngresosSuperan160000Uvt !== false) {
        agregar('anual', { id: 'rte_memoria_economica', clave: 'rte_memoria_economica', formulario: null, calendario: 'rte_memoria_economica', fuente: 'ninguna' }, [
          ...revisar,
          'rte_memoria_pdf_firmado',
          ...(perfil.rteIngresosSuperan160000Uvt === null ? (['rte_umbral_por_confirmar'] as NotaObligacion[]) : []),
        ]);
      }
      break;
    }
    case 'no_contribuyente_declarante':
      // ET art. 23: no contribuyente, declarante de ingresos y patrimonio. Clasificación inicial: nunca «sin obligaciones».
      agregar(
        'anual',
        { id: 'ingresos_patrimonio', clave: 'ingresos_patrimonio', formulario: '110', calendario: 'ingresos_patrimonio', fuente: 'ninguna' },
        [...revisar, 'clasificacion_inicial'],
      );
      break;
    case 'no_contribuyente_no_declarante':
      // ET art. 22: no declara renta ni ingresos y patrimonio; la fila deja la clasificación a la vista.
      agregar('anual', { id: 'no_declarante', clave: 'no_declarante', formulario: null, calendario: null, fuente: 'ninguna' }, [
        ...revisar,
        'clasificacion_inicial',
      ]);
      break;
  }
  agregar('anual', { id: 'exogena', clave: 'exogena', formulario: null, calendario: 'exogena', fuente: 'ninguna' }, [...revisar, 'requisitos_por_confirmar']);
  return out;
}

/**
 * Obligaciones al corte con TODAS las vigencias que tocan sus periodos (P8):
 * la que rige el último día del corte, más las de las vigencias anteriores
 * cuyo periodo cae dentro de ellas (p. ej. el bimestre que se declaraba antes
 * de cambiar a cuatrimestral). Cada periodo que toque más de una vigencia lleva
 * «cambio_vigencia_en_periodo»; el que tenga días sin vigencia,
 * «periodo_sin_perfil_completo». Ninguna se descarta por eso.
 */
export function obligacionesDelCorte(vigencias: readonly VigenciaPerfil[], corte: string, formato2532?: Formato2532PorAnio): Obligacion[] {
  const m = leerMes(corte);
  if (!m) return [];
  const finCorte = ultimoDiaDelMes(m[0], m[1]);
  const actual = vigenciaEn(vigencias, finCorte);
  const porClave = new Map<string, Obligacion>();
  const clave = (o: Obligacion) => `${o.id}|${o.periodo.desde}|${o.periodo.hasta}`;
  if (actual) for (const o of derivarObligaciones(actual, corte, formato2532)) porClave.set(clave(o), o);
  for (const v of vigencias) {
    if (v === actual || v.vigenteDesde > finCorte) continue;
    for (const o of derivarObligaciones(v, corte, formato2532)) {
      if (vigenciasEnRango([v], o.periodo.desde, o.periodo.hasta).length === 0) continue;
      if (!porClave.has(clave(o))) porClave.set(clave(o), o);
    }
  }
  return Array.from(porClave.values()).map((o) => {
    const a = analizarPeriodo(vigencias, o.periodo.desde, o.periodo.hasta);
    const notas = [...o.notas];
    if (a.cambioDeVigencia) notas.push('cambio_vigencia_en_periodo');
    if (a.cambioPendienteSoporte && o.clave === 'iva') notas.push('cambio_periodicidad_pendiente');
    if (a.sinPerfilCompleto) notas.push('periodo_sin_perfil_completo');
    return { ...o, notas: Array.from(new Set(notas)) };
  });
}

export interface FilaCalendario {
  anio: number;
  obligacion: string;
  periodo: number;
  cuota: number;
  cantidad_digitos: number;
  digitos_desde: number;
  digitos_hasta: number;
  fecha_vencimiento: string;
  norma: string;
}

export type Vencimiento =
  | { estado: 'fecha'; fecha: string; norma: string; cuotas: number }
  /** El año no tiene NINGUNA fecha cargada: calendario incompleto. */
  | { estado: 'sin_cargar'; anio: number }
  | { estado: 'sin_nit' }
  /** El año tiene fechas, pero no la de esta obligación, periodo y dígitos: calendario incompleto. */
  | { estado: 'no_encontrado'; anio: number }
  | { estado: 'municipal' }
  /** Sin vencimiento nacional (p. ej. el no contribuyente no declarante del art. 22). */
  | { estado: 'no_aplica' }
  | { estado: 'pendiente_activar' };

/** ¿El vencimiento no se puede determinar porque al calendario le faltan fechas? */
export function calendarioIncompleto(v: Vencimiento): v is Extract<Vencimiento, { estado: 'sin_cargar' | 'no_encontrado' }> {
  return v.estado === 'sin_cargar' || v.estado === 'no_encontrado';
}

/** Los `cantidad` últimos dígitos del NIT sin dígito de verificación, o null. */
export function digitosNit(nit: string | null | undefined, cantidad: number): number | null {
  const solo = (nit ?? '').split('-')[0].replace(/\D/g, '');
  if (solo.length < cantidad) return null;
  return Number(solo.slice(-cantidad));
}

/**
 * Año del calendario en que se declara el periodo: los periodos del año se
 * declaran ese mismo año, salvo el último (diciembre o el último bimestre o
 * cuatrimestre), que vence en enero del siguiente, y los anuales, que se
 * declaran al año siguiente. Si la DIAN lo ubica en otro año, simplemente no
 * hay fila y queda «calendario incompleto»: nunca se inventa una fecha.
 */
export function anioCalendario(periodo: PeriodoFiscal): number {
  return periodo.hasta.slice(5, 7) === '12' ? periodo.anio + 1 : periodo.anio;
}

/**
 * Vencimiento de una obligación: la primera cuota del periodo para los dígitos
 * del NIT. `calendario` null = la tabla no existe todavía (pendiente de activar).
 */
export function vencimientoDe(
  o: Pick<Obligacion, 'calendario' | 'periodo' | 'clave'>,
  nit: string | null,
  calendario: readonly FilaCalendario[] | null,
): Vencimiento {
  if (o.calendario === null) return o.clave === 'ica' ? { estado: 'municipal' } : { estado: 'no_aplica' };
  if (calendario === null) return { estado: 'pendiente_activar' };
  const anio = anioCalendario(o.periodo);
  const delAnio = calendario.filter((f) => f.anio === anio);
  if (delAnio.length === 0) return { estado: 'sin_cargar', anio };
  if (digitosNit(nit, 1) === null) return { estado: 'sin_nit' };
  const candidatas = delAnio
    .filter((f) => f.obligacion === o.calendario && f.periodo === o.periodo.indice)
    .filter((f) => {
      const d = digitosNit(nit, f.cantidad_digitos);
      return d !== null && d >= f.digitos_desde && d <= f.digitos_hasta;
    })
    .sort((a, b) => a.cuota - b.cuota);
  if (candidatas.length === 0) return { estado: 'no_encontrado', anio };
  return { estado: 'fecha', fecha: candidatas[0].fecha_vencimiento, norma: candidatas[0].norma, cuotas: candidatas.length };
}

/** Años de calendario que hacen falta para las obligaciones (para leer solo esos). */
export function aniosCalendario(obligaciones: readonly Obligacion[]): number[] {
  return Array.from(new Set(obligaciones.filter((o) => o.calendario).map((o) => anioCalendario(o.periodo)))).sort();
}
