/**
 * Obligaciones del periodo derivadas del perfil tributario (Centro tributario,
 * Figma 2335:136794) y su vencimiento según el calendario oficial cargado en
 * `tax_calendar_dates` (migración propuesta 20261108100500).
 *
 * Regla del dueño: las fechas de la DIAN NO se adivinan. Si el año no está
 * cargado, el vencimiento es «sin cargar»; si falta el NIT, «sin NIT»; el ICA
 * es municipal y siempre «confirmar con el municipio». Sin React ni Supabase.
 */
import { periodoCerradoAl, type Periodicidad, type PeriodoFiscal } from './periodos';
import { RESPONSABILIDAD, type VigenciaPerfil } from './perfil';

export type ClaveObligacion = 'iva' | 'retencion' | 'ica' | 'inc' | 'renta' | 'simple' | 'exogena' | 'conciliacion_fiscal';

/** De dónde sale el valor estimado y adónde lleva la fila. */
export type FuenteValor = 'borrador_iva' | 'reporte_retenciones' | 'ninguna';

export interface Obligacion {
  /** Único en la lista (el ICA se repite por municipio). */
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

export type NotaObligacion = 'sin_autorretencion' | 'persona_natural_no_soportada' | 'requisitos_por_confirmar';

/** Obligaciones de la vigencia, con el último periodo cerrado al mes `corte` (`YYYY-MM`). */
export function derivarObligaciones(perfil: VigenciaPerfil, corte: string): Obligacion[] {
  const out: Obligacion[] = [];
  const r = new Set(perfil.responsabilidades);
  const agregar = (periodicidad: Periodicidad, o: Omit<Obligacion, 'periodo' | 'notas'>, notas: NotaObligacion[] = []) => {
    const periodo = periodoCerradoAl(periodicidad, corte);
    if (periodo) out.push({ ...o, periodo, notas });
  };

  if (perfil.regimen !== 'no_responsable_iva' && perfil.periodicidadIva !== 'no_aplica') {
    agregar(perfil.periodicidadIva, { id: 'iva', clave: 'iva', formulario: '300', calendario: `iva_${perfil.periodicidadIva}`, fuente: 'borrador_iva' });
  }
  if (perfil.agenteRetencion || r.has(RESPONSABILIDAD.autorretenedor) || r.has(RESPONSABILIDAD.agenteRetencionIva)) {
    agregar(
      'mensual',
      { id: 'retencion', clave: 'retencion', formulario: '350', calendario: 'retencion_fuente', fuente: 'reporte_retenciones' },
      r.has(RESPONSABILIDAD.autorretenedor) ? ['sin_autorretencion'] : [],
    );
  }
  for (const ica of perfil.ica) {
    agregar(ica.periodicidad, {
      id: `ica:${ica.municipioId}`,
      clave: 'ica',
      formulario: null,
      calendario: null,
      fuente: 'ninguna',
      municipioId: ica.municipioId,
      municipio: ica.municipio,
    });
  }
  if (perfil.responsableInc) {
    agregar('bimestral', { id: 'inc', clave: 'inc', formulario: '310', calendario: 'inc_bimestral', fuente: 'ninguna' });
  }
  if (perfil.regimen === 'simple') {
    agregar('anual', { id: 'simple', clave: 'simple', formulario: '260 y 2593', calendario: 'simple_anual', fuente: 'ninguna' });
  } else {
    const gran = r.has(RESPONSABILIDAD.granContribuyente);
    agregar(
      'anual',
      { id: 'renta', clave: 'renta', formulario: '110 o 210', calendario: gran ? 'renta_gran_contribuyente' : 'renta_persona_juridica', fuente: 'ninguna' },
      gran ? [] : ['persona_natural_no_soportada'],
    );
    agregar('anual', { id: 'conciliacion_fiscal', clave: 'conciliacion_fiscal', formulario: '2516 o 2517', calendario: 'conciliacion_fiscal', fuente: 'ninguna' });
  }
  agregar('anual', { id: 'exogena', clave: 'exogena', formulario: null, calendario: 'exogena', fuente: 'ninguna' }, ['requisitos_por_confirmar']);
  return out;
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
  | { estado: 'sin_cargar'; anio: number }
  | { estado: 'sin_nit' }
  | { estado: 'no_encontrado' }
  | { estado: 'municipal' }
  | { estado: 'pendiente_activar' };

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
 * hay fila y queda «no encontrado»: nunca se inventa una fecha.
 */
export function anioCalendario(periodo: PeriodoFiscal): number {
  return periodo.hasta.slice(5, 7) === '12' ? periodo.anio + 1 : periodo.anio;
}

/**
 * Vencimiento de una obligación: la primera cuota del periodo para los dígitos
 * del NIT. `calendario` null = la tabla no existe todavía (pendiente de activar).
 */
export function vencimientoDe(
  o: Pick<Obligacion, 'calendario' | 'periodo'>,
  nit: string | null,
  calendario: readonly FilaCalendario[] | null,
): Vencimiento {
  if (o.calendario === null) return { estado: 'municipal' };
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
  if (candidatas.length === 0) return { estado: 'no_encontrado' };
  return { estado: 'fecha', fecha: candidatas[0].fecha_vencimiento, norma: candidatas[0].norma, cuotas: candidatas.length };
}

/** Años de calendario que hacen falta para las obligaciones (para leer solo esos). */
export function aniosCalendario(obligaciones: readonly Obligacion[]): number[] {
  return Array.from(new Set(obligaciones.filter((o) => o.calendario).map((o) => anioCalendario(o.periodo)))).sort();
}
