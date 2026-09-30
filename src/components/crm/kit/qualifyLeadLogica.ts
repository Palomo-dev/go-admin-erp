/**
 * Lógica de `QualifyLeadDialog` (Figma 759:445219): paso 1 de «Calificar →
 * crear oportunidad». Sin React.
 *
 * Recoge necesidad, presupuesto, decisor, cierre, responsable y temperatura
 * (D4). «Continuar» abre `OpportunityForm Origen=lead` (paso 2) con estos datos
 * prellenados. El diálogo **no** cambia `lifecycle_stage`: lo hace el sistema
 * (`trg_sync_customer_lifecycle`) al crear la oportunidad.
 *
 * «¿Quién decide la compra?» no tiene columna: va en
 * `opportunities.discovery_data.decisor` (plan §3.5, sin migración).
 */
import { parsearMonto } from './camposCrm';
import type { Temperatura } from './opportunityCardLogica';
import type { LeadFila } from './leadRowLogica';
import type { ValoresOportunidad } from './opportunityFormLogica';

export const DECISORES = ['el_mismo', 'otra_persona', 'comite', 'no_se'] as const;
export type Decisor = (typeof DECISORES)[number];

export interface ValoresCalificacion {
  necesidad: string;
  /** Texto como lo escribe el usuario («18.000.000»). */
  presupuesto: string;
  /** `YYYY-MM-DD` o ''. */
  cierre: string;
  decisor: Decisor | '';
  responsableId: string;
  temperatura: Temperatura;
}

export function valoresInicialesCalificacion(opciones: { responsableId?: string | null } = {}): ValoresCalificacion {
  return { necesidad: '', presupuesto: '', cierre: '', decisor: '', responsableId: opciones.responsableId ?? '', temperatura: 'warm' };
}

export type ErroresCalificacion = Partial<Record<'necesidad' | 'presupuesto' | 'cierre', 'obligatorio' | 'montoInvalido' | 'fechaPasada'>>;

/** `hoy` es el día de la organización (`todayInTz`). */
export function validarCalificacion(v: ValoresCalificacion, hoy: string): ErroresCalificacion {
  const errores: ErroresCalificacion = {};
  if (!v.necesidad.trim()) errores.necesidad = 'obligatorio';
  const monto = parsearMonto(v.presupuesto);
  if (monto !== null && (Number.isNaN(monto) || monto < 0)) errores.presupuesto = 'montoInvalido';
  if (v.cierre && v.cierre < hoy) errores.cierre = 'fechaPasada';
  return errores;
}

export function esValida(errores: object): boolean {
  return Object.keys(errores).length === 0;
}

/** Nombre sugerido de la oportunidad: «<necesidad> · <lead>», hasta 120 caracteres. */
export function nombreSugerido(necesidad: string, lead: Pick<LeadFila, 'full_name'>): string {
  const partes = [necesidad.trim().replace(/\s+/g, ' '), lead.full_name?.trim()].filter(Boolean);
  const nombre = partes.join(' · ');
  return nombre.length > 120 ? `${nombre.slice(0, 119)}…` : nombre;
}

/**
 * Datos que el paso 2 (`OpportunityForm Origen=lead`) recibe prellenados.
 * `customer_id` queda fijado; el resto se puede corregir en el formulario.
 */
export function prefillDesdeLead(lead: LeadFila, v: ValoresCalificacion): Partial<ValoresOportunidad> {
  const monto = parsearMonto(v.presupuesto);
  return {
    customer_id: lead.id,
    name: nombreSugerido(v.necesidad, lead),
    amount: monto !== null && !Number.isNaN(monto) ? String(monto) : '',
    expected_close_date: v.cierre,
    salesperson_id: v.responsableId,
    temperature: v.temperatura,
    source: lead.lead_source ?? '',
    discovery_data: {
      necesidad: v.necesidad.trim(),
      ...(v.decisor ? { decisor: v.decisor } : {}),
      ...(monto !== null && !Number.isNaN(monto) ? { presupuesto: monto } : {}),
    },
  };
}
