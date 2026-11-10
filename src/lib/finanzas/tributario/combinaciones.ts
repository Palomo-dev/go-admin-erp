/**
 * Combinaciones del perfil tributario por vigencia (P5 y P8 del Contador,
 * rondas 1 y 2: docs/contador/RESPUESTAS-CONTADOR-*.md). El régimen de RENTA y
 * la condición frente al IVA son campos independientes; las calidades llevan su
 * soporte. Aquí se decide qué combinaciones de una vigencia son contradictorias
 * (BLOQUEO: no se guarda) y cuáles son dudosas (ADVERTENCIA: se guarda solo si
 * la persona la acepta). Fundamento de cada regla:
 * docs/contador/PERFIL-Y-CALENDARIO-P5-P8.md.
 *
 * Los BLOQUEOS se repiten en la base (`fn_perfil_tributario_bloqueos`, migración
 * 20261108160500) como defensa; una prueba de jest compara los códigos de ambos.
 * Las ADVERTENCIAS y el estado del cambio de periodicidad también se calculan
 * aquí para mostrarlos antes de guardar. Sin React ni Supabase.
 *
 * Ronda 4 (docs/contador/RESPUESTAS-CONTADOR-RONDA-4-2026-11-09.md): gran
 * contribuyente con calificación ordinaria (efectos el 1 de enero siguiente) o
 * excepcional (fecha del acto) y, ya exigible, la bimestral se BLOQUEA; RUT del
 * SIMPLE con 15 o 59 queda para aclaración (no se exige borrar); ningún motivo de
 * cambio de periodicidad autoriza por sí solo («documentado» ≠ «procedente»).
 */

export const REGIMENES_RENTA = ['ordinario', 'simple', 'especial', 'no_contribuyente_declarante', 'no_contribuyente_no_declarante'] as const;
export type RegimenRenta = (typeof REGIMENES_RENTA)[number];

export const CONDICIONES_IVA = ['responsable', 'no_responsable'] as const;
export type CondicionIva = (typeof CONDICIONES_IVA)[number];

/** Motivos DESCRIPTIVOS: ninguno autoriza el cambio por sí solo; todos exigen hecho, norma y fecha (ronda 4). */
export const MOTIVOS_CAMBIO_PERIODICIDAD = [
  'inicio_actividades',
  'ingreso_simple',
  'salida_simple',
  'designacion_gran_contribuyente',
  'correccion_clasificacion',
  'acto_especial',
  'otro',
] as const;
export type MotivoCambioPeriodicidad = (typeof MOTIVOS_CAMBIO_PERIODICIDAD)[number];

/** Hecho generador del INC que aplica (ET art. 512-1). */
export const ACTIVIDADES_INC = ['restaurantes_bares', 'telefonia_datos', 'vehiculos_y_bienes', 'bolsas_plasticas', 'cannabis', 'otra'] as const;
export type ActividadInc = (typeof ACTIVIDADES_INC)[number];

/** Tipo de entidad del régimen tributario especial (ET arts. 19 y 19-4). */
export const TIPOS_RTE = ['calificada_art19', 'cooperativa_art19_4', 'otra'] as const;
export type TipoRte = (typeof TIPOS_RTE)[number];

export const ESTADOS_CAMBIO_PERIODICIDAD = ['no_aplica', 'pendiente_soporte', 'documentado'] as const;
export type EstadoCambioPeriodicidad = (typeof ESTADOS_CAMBIO_PERIODICIDAD)[number];

/** Ronda 4: «documentado» no es «procedente». La procedencia la registra una persona con fundamento. */
export const PROCEDENCIAS_CAMBIO_PERIODICIDAD = ['por_evaluar', 'procedente', 'no_procedente'] as const;
export type ProcedenciaCambioPeriodicidad = (typeof PROCEDENCIAS_CAMBIO_PERIODICIDAD)[number];

/** Ronda 4: calificación del gran contribuyente. Ordinaria: efectos el 1 de enero siguiente; excepcional: fecha del acto. */
export const CALIFICACIONES_GRAN_CONTRIBUYENTE = ['ordinaria', 'excepcional'] as const;
export type CalificacionGranContribuyente = (typeof CALIFICACIONES_GRAN_CONTRIBUYENTE)[number];

/** Periodicidades del IVA en las que se declara (las que pueden «cambiar a mitad de año»). */
const DECLARABLES = new Set(['bimestral', 'cuatrimestral', 'anual']);

export interface DatosCombinacion {
  regimenRenta: RegimenRenta | null;
  condicionIva: CondicionIva | null;
  periodicidadIva: string;
  granContribuyente: boolean | null;
  granContribuyenteActo: string | null;
  /** Desde cuándo producen efectos la calificación (AAAA-MM-DD). */
  granContribuyenteDesde: string | null;
  /** Ronda 4: ordinaria o excepcional. Opcional para leer filas anteriores. */
  granContribuyenteCalificacion?: CalificacionGranContribuyente | null;
  /** Ronda 4: fecha de la resolución que califica (AAAA-MM-DD). */
  granContribuyenteActoFecha?: string | null;
  /** Autorretención ORDINARIA sobre ingresos propios (RUT 15, acto administrativo). */
  autorretenedor: boolean | null;
  autorretenedorActo: string | null;
  autorretenedorActoFecha: string | null;
  /** Autorretención ESPECIAL a título de renta (RUT 59, ET art. 365 par. 2, DUR 1.2.6.6). */
  autorretencionEspecial: boolean | null;
  agenteRetencionIva: boolean | null;
  agenteRetencion: boolean;
  responsableInc: boolean;
  incActividad: ActividadInc | null;
  rteTipo: TipoRte | null;
  /** Ingresos del año anterior > 160.000 UVT (memoria económica, ET art. 356-3). null = sin dato. */
  rteIngresosSuperan160000Uvt: boolean | null;
  noContribuyenteNaturaleza: string | null;
  motivoCambioPeriodicidad: MotivoCambioPeriodicidad | null;
  cambioPeriodicidadHecho: string | null;
  cambioPeriodicidadNorma: string | null;
  cambioPeriodicidadFecha: string | null;
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
  anterior: VigenciaContigua | null;
  siguiente: VigenciaContigua | null;
}

/** Contradicciones claras: la vigencia no se guarda. Mismos códigos que `fn_perfil_tributario_bloqueos` (+ la fecha efectiva). */
export const BLOQUEOS = [
  'falta_regimen_renta',
  'falta_condicion_iva',
  'no_responsable_con_periodicidad',
  'responsable_sin_periodicidad',
  'periodicidad_anual_fuera_de_simple',
  'simple_responsable_no_anual',
  'fe_codigo_no_validado',
  'fe_o47_sin_simple',
  'fe_o13_sin_gran_contribuyente',
  'fe_o15_sin_autorretenedor',
  'fe_o23_sin_agente_iva',
  'fe_r99_con_otros',
  'fe_r99_con_calidades',
  'simple_con_autorretencion',
  'gran_contribuyente_sin_acto',
  'gran_contribuyente_sin_calificacion',
  'gran_contribuyente_fecha_efectos',
  'gran_contribuyente_antes_de_efectos',
  'gran_contribuyente_no_bimestral',
  'autorretenedor_sin_acto',
  'inc_sin_actividad',
  'no_contribuyente_sin_naturaleza',
  'rte_sin_tipo',
  'cambio_gran_contribuyente_no_bimestral',
  'rut_47_y_05',
  'rut_53_sin_simple',
  'rut_iva_contradictorio',
  'rut_art22_con_renta',
  'rut_13_sin_gran_contribuyente',
  'rut_15_sin_autorretenedor',
  'rut_59_sin_autorretencion_especial',
  'rut_23_sin_agente_iva',
  'rut_07_sin_agente_retencion',
  'rut_33_sin_inc',
  'cambio_fecha_efectiva_distinta',
] as const;
export type Bloqueo = (typeof BLOQUEOS)[number];

/** Dudosas o pendientes: se guardan si la persona las acepta; quedan registradas y van al Contador. */
export const ADVERTENCIAS = [
  'simple_sin_fe_o47',
  'gran_contribuyente_sin_fe_o13',
  'autorretenedor_sin_fe_o15',
  'agente_iva_sin_fe_o23',
  'gran_contribuyente_transicion_por_resolver',
  'rut_simple_con_autorretencion_para_aclaracion',
  'rut_falta_codigo',
  'rut_codigo_no_vigente',
  'rut_varios_regimenes_renta',
  'rut_regimen_renta_distinto',
  'rte_memoria_por_confirmar',
  'no_contribuyente_clasificacion_inicial',
  'periodicidad_cambio_pendiente_soporte',
  'periodicidad_cambio_documentado',
  'periodicidad_cambio_siguiente',
] as const;
export type Advertencia = (typeof ADVERTENCIAS)[number];

export interface ResultadoCombinacion {
  bloqueos: Bloqueo[];
  advertencias: Advertencia[];
  /** Estado del cambio de periodicidad respecto de la vigencia anterior (P8, ronda 2). */
  cambioPeriodicidad: EstadoCambioPeriodicidad;
}

/** RUT → régimen de renta que suele acompañar (solo para advertir; IN-CAC-0237 numeral 31). */
const RUT_REGIMEN: Record<string, RegimenRenta> = { '05': 'ordinario', '04': 'especial', '47': 'simple', '06': 'no_contribuyente_declarante' };
/** Códigos del RUT que ya no se asignan (reemplazados por 48 y 49). */
const RUT_NO_VIGENTES = new Set(['11', '12']);
const vacio = (v: string | null | undefined) => !v || !v.trim();

/**
 * ¿Hay cambio de periodicidad del IVA a mitad de año entre `a` (anterior) y `b`
 * (posterior)? ET art. 600: la periodicidad sale de los ingresos del año
 * anterior, así que se fija por año. No cuenta si `b` empieza el 1 de enero o si
 * alguna no declara. Entrar o salir del SIMPLE también es cambio (con su propio
 * soporte).
 */
export function hayCambioPeriodicidad(a: VigenciaContigua, b: VigenciaContigua): boolean {
  if (b.vigenteDesde.slice(5) === '01-01') return false;
  if (!DECLARABLES.has(a.periodicidadIva) || !DECLARABLES.has(b.periodicidadIva)) return false;
  return a.periodicidadIva !== b.periodicidadIva;
}

/** Bloqueos y advertencias de una vigencia. `contexto` = sus vigencias contiguas (sin la propia). */
export function evaluarCombinacion(d: DatosCombinacion, contexto: ContextoCombinacion | null = null): ResultadoCombinacion {
  const b = new Set<Bloqueo>();
  const a = new Set<Advertencia>();
  const fe = new Set(d.responsabilidades);
  const rut = new Set(d.responsabilidadesRut);
  const simple = d.regimenRenta === 'simple';

  if (d.regimenRenta === null) b.add('falta_regimen_renta');
  if (d.condicionIva === null) b.add('falta_condicion_iva');

  // IVA: ET art. 437 par. 3, art. 600, art. 915.
  if (d.condicionIva === 'no_responsable' && d.periodicidadIva !== 'no_aplica') b.add('no_responsable_con_periodicidad');
  if (d.condicionIva === 'responsable' && d.periodicidadIva === 'no_aplica') b.add('responsable_sin_periodicidad');
  if (d.periodicidadIva === 'anual' && d.regimenRenta !== null && !simple) b.add('periodicidad_anual_fuera_de_simple');
  if (simple && d.condicionIva === 'responsable' && (d.periodicidadIva === 'bimestral' || d.periodicidadIva === 'cuatrimestral')) {
    b.add('simple_responsable_no_anual');
  }

  // Códigos del documento electrónico: un código presente es una afirmación.
  if (fe.has('O-48') || fe.has('O-49')) b.add('fe_codigo_no_validado');
  if (fe.has('O-47') && d.regimenRenta !== null && !simple) b.add('fe_o47_sin_simple');
  if (fe.has('O-13') && d.granContribuyente !== true) b.add('fe_o13_sin_gran_contribuyente');
  if (fe.has('O-15') && d.autorretenedor !== true) b.add('fe_o15_sin_autorretenedor');
  if (fe.has('O-23') && d.agenteRetencionIva !== true) b.add('fe_o23_sin_agente_iva');
  // R-99-PN es residual: no corresponde ninguna otra responsabilidad.
  if (fe.has('R-99-PN') && fe.size > 1) b.add('fe_r99_con_otros');
  if (fe.has('R-99-PN') && (simple || d.granContribuyente === true || d.autorretenedor === true || d.agenteRetencionIva === true)) {
    b.add('fe_r99_con_calidades');
  }
  if (simple && !fe.has('O-47')) a.add('simple_sin_fe_o47');
  if (d.granContribuyente === true && !fe.has('O-13')) a.add('gran_contribuyente_sin_fe_o13');
  if (d.autorretenedor === true && !fe.has('O-15')) a.add('autorretenedor_sin_fe_o15');
  if (d.agenteRetencionIva === true && !fe.has('O-23')) a.add('agente_iva_sin_fe_o23');

  // ET art. 911: el SIMPLE no practica autorretenciones (ordinaria ni especial).
  if (simple && (d.autorretenedor === true || d.autorretencionEspecial === true)) b.add('simple_con_autorretencion');
  // Calidades que nacen de un acto administrativo: sin acto y fecha no se afirman.
  const gran = d.granContribuyente === true;
  const calificacion = d.granContribuyenteCalificacion ?? null;
  const actoFecha = d.granContribuyenteActoFecha ?? null;
  if (gran && (vacio(d.granContribuyenteActo) || !d.granContribuyenteDesde || !actoFecha)) b.add('gran_contribuyente_sin_acto');
  if (d.autorretenedor === true && (vacio(d.autorretenedorActo) || !d.autorretenedorActoFecha)) b.add('autorretenedor_sin_acto');
  // Ronda 4 (Res. 227 de 2025, art. 1.1.4.3): ordinaria → efectos desde el 1 de enero siguiente a la resolución (primer
  // bimestre enero–febrero); excepcional → la fecha expresa del acto. Ya exigible la bimestral, no se advierte: se bloquea.
  if (gran && calificacion === null) b.add('gran_contribuyente_sin_calificacion');
  if (gran && d.granContribuyenteDesde && actoFecha) {
    const efectosOrdinaria = `${Number(actoFecha.slice(0, 4)) + 1}-01-01`;
    if ((calificacion === 'ordinaria' && d.granContribuyenteDesde !== efectosOrdinaria) || (calificacion === 'excepcional' && d.granContribuyenteDesde < actoFecha)) {
      b.add('gran_contribuyente_fecha_efectos');
    }
  }
  if (gran && d.granContribuyenteDesde && contexto && contexto.vigenteDesde < d.granContribuyenteDesde) b.add('gran_contribuyente_antes_de_efectos');
  if (gran && d.condicionIva === 'responsable' && d.periodicidadIva === 'cuatrimestral') b.add('gran_contribuyente_no_bimestral');
  if (gran && calificacion === 'excepcional' && d.granContribuyenteDesde) {
    const [, mes, dia] = d.granContribuyenteDesde.split('-').map(Number);
    if (!(dia === 1 && mes % 2 === 1)) a.add('gran_contribuyente_transicion_por_resolver');
  }
  if (d.motivoCambioPeriodicidad === 'designacion_gran_contribuyente' && d.periodicidadIva !== 'bimestral') b.add('cambio_gran_contribuyente_no_bimestral');

  // INC según actividad (ET art. 512-1).
  if (d.responsableInc && d.incActividad === null) b.add('inc_sin_actividad');

  // No contribuyentes (arts. 22 y 23) y RTE.
  if ((d.regimenRenta === 'no_contribuyente_declarante' || d.regimenRenta === 'no_contribuyente_no_declarante')) {
    if (vacio(d.noContribuyenteNaturaleza)) b.add('no_contribuyente_sin_naturaleza');
    a.add('no_contribuyente_clasificacion_inicial');
  }
  if (d.regimenRenta === 'especial') {
    if (d.rteTipo === null) b.add('rte_sin_tipo');
    if (d.rteIngresosSuperan160000Uvt === null) a.add('rte_memoria_por_confirmar');
  }

  // Casilla 53 del RUT (IN-CAC-0237, numeral 31).
  if (rut.size > 0) {
    if (rut.has('47') && rut.has('05')) b.add('rut_47_y_05');
    if (rut.has('53') && d.regimenRenta !== null && !simple) b.add('rut_53_sin_simple');
    const noResp = rut.has('49') || rut.has('53');
    if ((rut.has('48') && noResp) || (rut.has('48') && d.condicionIva === 'no_responsable') || (noResp && d.condicionIva === 'responsable')) {
      b.add('rut_iva_contradictorio');
    }
    if (d.regimenRenta === 'no_contribuyente_no_declarante' && (rut.has('04') || rut.has('05') || rut.has('06'))) b.add('rut_art22_con_renta');
    if (rut.has('13') && d.granContribuyente !== true) b.add('rut_13_sin_gran_contribuyente');
    // Ronda 4: en el SIMPLE, un RUT con 15 o 59 es contradictorio: para aclaración, sin exigir borrar el código.
    if (simple && (rut.has('15') || rut.has('59'))) a.add('rut_simple_con_autorretencion_para_aclaracion');
    if (rut.has('15') && d.autorretenedor !== true && !simple) b.add('rut_15_sin_autorretenedor');
    if (rut.has('59') && d.autorretencionEspecial !== true && !simple) b.add('rut_59_sin_autorretencion_especial');
    if (rut.has('23') && d.agenteRetencionIva !== true) b.add('rut_23_sin_agente_iva');
    if (rut.has('07') && d.agenteRetencion !== true) b.add('rut_07_sin_agente_retencion');
    if (rut.has('33') && d.responsableInc !== true) b.add('rut_33_sin_inc');

    // Una obligación en el RUT no implica otro régimen de renta sin examinar el sujeto: solo se advierte.
    const regimenesRut = Object.keys(RUT_REGIMEN).filter((c) => rut.has(c));
    if (regimenesRut.length > 1 && !(regimenesRut.length === 2 && rut.has('47') && rut.has('05'))) a.add('rut_varios_regimenes_renta');
    if (d.regimenRenta !== null && regimenesRut.some((c) => RUT_REGIMEN[c] !== d.regimenRenta)) a.add('rut_regimen_renta_distinto');

    const esperados: string[] = [];
    const codigoRegimen = Object.keys(RUT_REGIMEN).find((c) => RUT_REGIMEN[c] === d.regimenRenta);
    if (codigoRegimen) esperados.push(codigoRegimen);
    if (d.condicionIva === 'responsable') esperados.push('48');
    if (d.granContribuyente === true) esperados.push('13');
    if (d.autorretenedor === true && !simple) esperados.push('15');
    if (d.autorretencionEspecial === true && !simple) esperados.push('59');
    if (d.agenteRetencionIva === true) esperados.push('23');
    if (d.agenteRetencion) esperados.push('07');
    if (d.responsableInc) esperados.push('33');
    if (esperados.some((c) => !rut.has(c)) || (d.condicionIva === 'no_responsable' && !noResp)) a.add('rut_falta_codigo');
    if (Array.from(rut).some((c) => RUT_NO_VIGENTES.has(c))) a.add('rut_codigo_no_vigente');
  }

  // P8 ronda 2: el cambio de periodicidad queda pendiente hasta documentar hecho, norma y fecha efectiva.
  let cambioPeriodicidad: EstadoCambioPeriodicidad = 'no_aplica';
  if (contexto) {
    if (d.cambioPeriodicidadFecha && d.cambioPeriodicidadFecha !== contexto.vigenteDesde) b.add('cambio_fecha_efectiva_distinta');
    const propia: VigenciaContigua = { vigenteDesde: contexto.vigenteDesde, periodicidadIva: d.periodicidadIva, regimenRenta: d.regimenRenta };
    if (contexto.anterior && hayCambioPeriodicidad(contexto.anterior, propia)) {
      const completo = d.motivoCambioPeriodicidad !== null && !vacio(d.cambioPeriodicidadHecho) && !vacio(d.cambioPeriodicidadNorma) && !!d.cambioPeriodicidadFecha;
      cambioPeriodicidad = completo ? 'documentado' : 'pendiente_soporte';
      a.add(completo ? 'periodicidad_cambio_documentado' : 'periodicidad_cambio_pendiente_soporte');
    }
    if (contexto.siguiente && hayCambioPeriodicidad(propia, contexto.siguiente)) a.add('periodicidad_cambio_siguiente');
  }

  return {
    bloqueos: BLOQUEOS.filter((x) => b.has(x)),
    advertencias: ADVERTENCIAS.filter((x) => a.has(x)),
    cambioPeriodicidad,
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
