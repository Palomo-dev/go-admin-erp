/**
 * Combinaciones del perfil tributario por vigencia (P5 y P8 del Contador,
 * docs/contador/RESPUESTAS-CONTADOR-P1-P9-2026-11-07.md). El régimen de RENTA y
 * la condición frente al IVA son campos independientes; aquí se decide qué
 * combinaciones de una vigencia son contradictorias (BLOQUEO: no se guarda) y
 * cuáles son dudosas (ADVERTENCIA: se guarda solo si la persona la acepta, y se
 * le pregunta al Contador). Fundamento de cada regla:
 * docs/contador/PERFIL-Y-CALENDARIO-P5-P8.md.
 *
 * Los BLOQUEOS se repiten en la base (`fn_perfil_tributario_bloqueos`, migración
 * 20261108160500) como defensa; una prueba de jest compara los códigos de ambos.
 * Las ADVERTENCIAS viven solo aquí. Sin React ni Supabase.
 */

export const REGIMENES_RENTA = ['ordinario', 'simple', 'especial', 'no_contribuyente_declarante', 'no_contribuyente_no_declarante'] as const;
export type RegimenRenta = (typeof REGIMENES_RENTA)[number];

export const CONDICIONES_IVA = ['responsable', 'no_responsable'] as const;
export type CondicionIva = (typeof CONDICIONES_IVA)[number];

export const MOTIVOS_CAMBIO_PERIODICIDAD = ['inicio_actividades', 'ingreso_simple', 'salida_simple', 'otro'] as const;
export type MotivoCambioPeriodicidad = (typeof MOTIVOS_CAMBIO_PERIODICIDAD)[number];

/** Periodicidades del IVA en las que se declara (las que pueden «cambiar a mitad de año»). */
const DECLARABLES = new Set(['bimestral', 'cuatrimestral', 'anual']);

export interface DatosCombinacion {
  regimenRenta: RegimenRenta | null;
  condicionIva: CondicionIva | null;
  periodicidadIva: string;
  granContribuyente: boolean | null;
  autorretenedor: boolean | null;
  agenteRetencionIva: boolean | null;
  agenteRetencion: boolean;
  responsableInc: boolean;
  /** Códigos del DOCUMENTO ELECTRÓNICO (O-13, O-15, O-23, O-47, R-99-PN…). */
  responsabilidades: readonly string[];
  /** Códigos de la casilla 53 del RUT ('05', '48'…). Opcional: vacío = no se diligenció. */
  responsabilidadesRut: readonly string[];
}

/** La vigencia contigua (anterior o siguiente) contra la que se mira el cambio de periodicidad. */
export interface VigenciaContigua {
  vigenteDesde: string;
  periodicidadIva: string;
  regimenRenta: RegimenRenta | null;
}

export interface ContextoCombinacion {
  vigenteDesde: string;
  motivoCambioPeriodicidad: MotivoCambioPeriodicidad | null;
  anterior: VigenciaContigua | null;
  siguiente: VigenciaContigua | null;
}

/** Contradicciones claras: la vigencia no se guarda. Misma lista que `fn_perfil_tributario_bloqueos` (+ el cambio de periodicidad). */
export const BLOQUEOS = [
  'falta_regimen_renta',
  'falta_condicion_iva',
  'no_responsable_con_periodicidad',
  'responsable_sin_periodicidad',
  'periodicidad_anual_fuera_de_simple',
  'simple_responsable_no_anual',
  'fe_o48_y_o49',
  'fe_o48_no_responsable',
  'fe_o49_responsable',
  'fe_o47_sin_simple',
  'fe_o13_sin_gran_contribuyente',
  'fe_o15_sin_autorretenedor',
  'fe_o23_sin_agente_iva',
  'rut_varios_regimenes_renta',
  'rut_regimen_renta_contradictorio',
  'rut_iva_contradictorio',
  'rut_13_sin_gran_contribuyente',
  'rut_15_sin_autorretenedor',
  'rut_23_sin_agente_iva',
  'rut_07_sin_agente_retencion',
  'rut_33_sin_inc',
  'periodicidad_cambio_sin_motivo',
] as const;
export type Bloqueo = (typeof BLOQUEOS)[number];

/** Dudosas: se guardan si la persona las acepta; quedan registradas y van al Contador. */
export const ADVERTENCIAS = [
  'simple_con_autorretenedor',
  'simple_con_gran_contribuyente',
  'simple_con_inc',
  'simple_sin_fe_o47',
  'gran_contribuyente_sin_fe_o13',
  'autorretenedor_sin_fe_o15',
  'agente_iva_sin_fe_o23',
  'fe_r99_con_otros',
  'fe_codigo_por_validar',
  'rut_falta_codigo',
  'rut_codigo_no_vigente',
  'periodicidad_cambio_a_mitad_de_anio',
  'periodicidad_cambio_por_simple',
  'periodicidad_cambio_siguiente',
] as const;
export type Advertencia = (typeof ADVERTENCIAS)[number];

export interface ResultadoCombinacion {
  bloqueos: Bloqueo[];
  advertencias: Advertencia[];
}

/** RUT → lo que afirma sobre los campos. */
const RUT_REGIMEN: Record<string, RegimenRenta> = { '05': 'ordinario', '04': 'especial', '47': 'simple', '06': 'no_contribuyente_declarante' };
/** Códigos del RUT que ya no se asignan (reemplazados por 48 y 49). */
const RUT_NO_VIGENTES = new Set(['11', '12']);

/**
 * ¿Hay cambio de periodicidad del IVA a mitad de año entre `a` (anterior) y `b`
 * (posterior)? ET art. 600: la periodicidad sale de los ingresos del año
 * anterior, así que se fija por año. No cuenta si `b` empieza el 1 de enero, si
 * alguna no declara, o si la vigencia entra o sale del SIMPLE (tratamiento propio).
 */
export function cambioPeriodicidad(a: VigenciaContigua, b: VigenciaContigua): 'ninguno' | 'ordinario' | 'por_simple' {
  if (b.vigenteDesde.slice(5) === '01-01') return 'ninguno';
  if (!DECLARABLES.has(a.periodicidadIva) || !DECLARABLES.has(b.periodicidadIva)) return 'ninguno';
  if (a.periodicidadIva === b.periodicidadIva) return 'ninguno';
  return (a.regimenRenta === 'simple') !== (b.regimenRenta === 'simple') ? 'por_simple' : 'ordinario';
}

/** Bloqueos y advertencias de una vigencia. `contexto` = sus vigencias contiguas (sin la propia). */
export function evaluarCombinacion(d: DatosCombinacion, contexto: ContextoCombinacion | null = null): ResultadoCombinacion {
  const b = new Set<Bloqueo>();
  const a = new Set<Advertencia>();
  const fe = new Set(d.responsabilidades);
  const rut = new Set(d.responsabilidadesRut);
  const simple = d.regimenRenta === 'simple';

  // Campos obligatorios: sin ellos la vigencia queda «revisar perfil».
  if (d.regimenRenta === null) b.add('falta_regimen_renta');
  if (d.condicionIva === null) b.add('falta_condicion_iva');

  // IVA: ET art. 437 par. 3 (no responsable no declara), art. 600 (periodos), art. 915 (anual del SIMPLE).
  if (d.condicionIva === 'no_responsable' && d.periodicidadIva !== 'no_aplica') b.add('no_responsable_con_periodicidad');
  if (d.condicionIva === 'responsable' && d.periodicidadIva === 'no_aplica') b.add('responsable_sin_periodicidad');
  if (d.periodicidadIva === 'anual' && d.regimenRenta !== null && !simple) b.add('periodicidad_anual_fuera_de_simple');
  if (simple && d.condicionIva === 'responsable' && (d.periodicidadIva === 'bimestral' || d.periodicidadIva === 'cuatrimestral')) {
    b.add('simple_responsable_no_anual');
  }

  // Códigos del documento electrónico: un código presente es una afirmación.
  if (fe.has('O-48') && fe.has('O-49')) b.add('fe_o48_y_o49');
  if (fe.has('O-48') && d.condicionIva === 'no_responsable') b.add('fe_o48_no_responsable');
  if (fe.has('O-49') && d.condicionIva === 'responsable') b.add('fe_o49_responsable');
  if (fe.has('O-47') && d.regimenRenta !== null && !simple) b.add('fe_o47_sin_simple');
  if (fe.has('O-13') && d.granContribuyente !== true) b.add('fe_o13_sin_gran_contribuyente');
  if (fe.has('O-15') && d.autorretenedor !== true) b.add('fe_o15_sin_autorretenedor');
  if (fe.has('O-23') && d.agenteRetencionIva !== true) b.add('fe_o23_sin_agente_iva');
  // La ausencia del código no prueba nada (la tabla del anexo está por validar): advertencia.
  if (simple && !fe.has('O-47')) a.add('simple_sin_fe_o47');
  if (d.granContribuyente === true && !fe.has('O-13')) a.add('gran_contribuyente_sin_fe_o13');
  if (d.autorretenedor === true && !fe.has('O-15')) a.add('autorretenedor_sin_fe_o15');
  if (d.agenteRetencionIva === true && !fe.has('O-23')) a.add('agente_iva_sin_fe_o23');
  // R-99-PN = «no aplica ninguna de las otras»: junto a otra es dudoso, no contradictorio (anexo por validar).
  if (fe.has('R-99-PN') && fe.size > 1) a.add('fe_r99_con_otros');
  if (fe.has('O-48') || fe.has('O-49')) a.add('fe_codigo_por_validar');

  // Casilla 53 del RUT.
  if (rut.size > 0) {
    const regimenesRut = Object.keys(RUT_REGIMEN).filter((c) => rut.has(c));
    if (regimenesRut.length > 1) b.add('rut_varios_regimenes_renta');
    if (d.regimenRenta !== null && regimenesRut.some((c) => RUT_REGIMEN[c] !== d.regimenRenta)) b.add('rut_regimen_renta_contradictorio');
    const noResp = rut.has('49') || rut.has('53');
    if ((rut.has('48') && noResp) || (rut.has('48') && d.condicionIva === 'no_responsable') || (noResp && d.condicionIva === 'responsable')) {
      b.add('rut_iva_contradictorio');
    }
    if (rut.has('13') && d.granContribuyente !== true) b.add('rut_13_sin_gran_contribuyente');
    if (rut.has('15') && d.autorretenedor !== true) b.add('rut_15_sin_autorretenedor');
    if (rut.has('23') && d.agenteRetencionIva !== true) b.add('rut_23_sin_agente_iva');
    if (rut.has('07') && d.agenteRetencion !== true) b.add('rut_07_sin_agente_retencion');
    if (rut.has('33') && d.responsableInc !== true) b.add('rut_33_sin_inc');

    // Lo que los campos afirman y el RUT diligenciado no trae.
    const esperados: string[] = [];
    const codigoRegimen = Object.keys(RUT_REGIMEN).find((c) => RUT_REGIMEN[c] === d.regimenRenta);
    if (codigoRegimen) esperados.push(codigoRegimen);
    if (d.condicionIva === 'responsable') esperados.push('48');
    if (d.granContribuyente === true) esperados.push('13');
    if (d.autorretenedor === true) esperados.push('15');
    if (d.agenteRetencionIva === true) esperados.push('23');
    if (d.agenteRetencion) esperados.push('07');
    if (d.responsableInc) esperados.push('33');
    const faltaNoResp = d.condicionIva === 'no_responsable' && !noResp;
    if (esperados.some((c) => !rut.has(c)) || faltaNoResp) a.add('rut_falta_codigo');
    if (Array.from(rut).some((c) => RUT_NO_VIGENTES.has(c))) a.add('rut_codigo_no_vigente');
  }

  // Dudosas con el SIMPLE (preguntar al Contador).
  if (simple && d.autorretenedor === true) a.add('simple_con_autorretenedor'); // ET art. 911
  if (simple && d.granContribuyente === true) a.add('simple_con_gran_contribuyente'); // ET arts. 905 y 906
  if (simple && d.responsableInc) a.add('simple_con_inc'); // ET arts. 908 y 915 (INC de restaurantes y bares)

  // P8: la periodicidad del IVA se fija por año.
  if (contexto) {
    const propia: VigenciaContigua = { vigenteDesde: contexto.vigenteDesde, periodicidadIva: d.periodicidadIva, regimenRenta: d.regimenRenta };
    if (contexto.anterior) {
      const c = cambioPeriodicidad(contexto.anterior, propia);
      if (c === 'ordinario') {
        if (contexto.motivoCambioPeriodicidad === null) b.add('periodicidad_cambio_sin_motivo');
        else a.add('periodicidad_cambio_a_mitad_de_anio');
      } else if (c === 'por_simple') {
        a.add('periodicidad_cambio_por_simple');
      }
    }
    if (contexto.siguiente && cambioPeriodicidad(propia, contexto.siguiente) !== 'ninguno') a.add('periodicidad_cambio_siguiente');
  }

  return {
    bloqueos: BLOQUEOS.filter((x) => b.has(x)),
    advertencias: ADVERTENCIAS.filter((x) => a.has(x)),
  };
}

/** ¿Faltan advertencias por aceptar? */
export function advertenciasSinAceptar(advertencias: readonly Advertencia[], aceptadas: readonly string[]): Advertencia[] {
  const ok = new Set(aceptadas);
  return advertencias.filter((x) => !ok.has(x));
}

/**
 * El campo combinado viejo (`regimen`) → campos separados, con la MISMA regla
 * conservadora de la migración 20261108160500: solo lo inequívoco; lo demás,
 * null y «revisar perfil». Sirve para leer filas viejas mientras la migración
 * no esté aplicada.
 */
export function desdeRegimenCombinado(
  regimen: string | null | undefined,
  fe: readonly string[],
): { regimenRenta: RegimenRenta | null; condicionIva: CondicionIva | null; granContribuyente: boolean | null; autorretenedor: boolean | null; agenteRetencionIva: boolean | null } {
  const tiene = (c: string) => fe.includes(c);
  const regimenRenta: RegimenRenta | null = regimen === 'simple' ? 'simple' : regimen === 'especial' ? 'especial' : null;
  let condicionIva: CondicionIva | null = null;
  if (regimen === 'no_responsable_iva') condicionIva = tiene('O-48') ? null : 'no_responsable';
  else if (tiene('O-48') && !tiene('O-49')) condicionIva = 'responsable';
  else if (tiene('O-49') && !tiene('O-48')) condicionIva = 'no_responsable';
  return {
    regimenRenta,
    condicionIva,
    granContribuyente: tiene('O-13') ? true : null,
    autorretenedor: tiene('O-15') ? true : null,
    agenteRetencionIva: tiene('O-23') ? true : null,
  };
}
