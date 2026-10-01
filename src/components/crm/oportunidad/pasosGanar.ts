/**
 * «Qué hacer al ganar» del `WinDialog` (paso 2) → los ejecutores ÚNICOS de
 * `wonCloseSteps.ts` (regla dura 7: factura desde la cotización por el
 * servidor, venta POS, reservas, onboarding, renovación, referido y
 * comisión). El `WonCloseModal` y el `WinDialog` arman las dependencias con
 * `crearDepsGanar`, así que no hay dos cableados.
 *
 * Se ejecuta DESPUÉS de `POST /api/crm/opportunities/[id]/win` (la
 * oportunidad ya está en la etapa ganadora y con `win_data`).
 */
import { supabase } from '@/lib/supabase/config';
import { CotizacionesService } from '@/lib/services/cotizacionesService';
import { commissionService } from '@/lib/services/crm/commissionService';
import { proposalService } from '@/lib/services/crm/proposalService';
import { buildInitialSteps, WON_STEP_EXECUTORS, type OpportunityData, type WonCloseDeps, type WonStepId } from '@/lib/services/crm/wonCloseSteps';
import type { AccionGanar, DocumentoCreado } from '@/components/crm/kit/winDialogLogica';

export function crearDepsGanar(o: { orgId: number; contextBranchId: number | null; timezone: string }): WonCloseDeps {
  return {
    supabase,
    orgId: o.orgId,
    contextBranchId: o.contextBranchId,
    timezone: o.timezone,
    getLatestProposal: async (id) => {
      const p = await proposalService.getLatestProposalForOpportunity(id);
      return p ? { id: p.id, branch_id: p.branch_id ?? null } : null;
    },
    convertToInvoice: (quotationId, branchId, oppId) => CotizacionesService.convertToInvoice(quotationId, { branchId, opportunityId: oppId }),
    // Vendedor, base y tasa los resuelve la RPC desde la base (no el navegador).
    accrueCommission: (id) => commissionService.accrueCommission(id),
  };
}

/** Acción del Figma → paso de `wonCloseSteps`. «Agradecimiento» no tiene ejecutor (se omite). */
export const PASO_DE_ACCION: Record<AccionGanar, WonStepId | null> = {
  factura: 'invoice',
  pos: 'pos_sale',
  onboarding: 'onboarding',
  renovacion: 'renewal',
  referido: 'referral',
  agradecimiento: null,
};

/** Pasos a ejecutar, en el orden de `buildInitialSteps`; reservas y comisión siempre (son del sistema). */
export function pasosElegidos(acciones: readonly AccionGanar[]): WonStepId[] {
  const elegidos = new Set<WonStepId>(['reservations', 'commission']);
  acciones.forEach((a) => {
    const p = PASO_DE_ACCION[a];
    if (p) elegidos.add(p);
  });
  return buildInitialSteps().map((s) => s.id).filter((id) => elegidos.has(id));
}

const TIPO_DOC: Partial<Record<WonStepId, DocumentoCreado['tipo']>> = { invoice: 'factura', onboarding: 'onboarding', renewal: 'renovacion' };

export interface ResultadoPaso {
  paso: WonStepId;
  ok: boolean;
  mensaje: string;
}

/** Ejecuta en orden; un paso que falla no detiene a los demás (igual que el `WonCloseModal`). */
export async function ejecutarPasosGanar(opp: OpportunityData, pasos: readonly WonStepId[], deps: WonCloseDeps): Promise<ResultadoPaso[]> {
  const salida: ResultadoPaso[] = [];
  for (const paso of pasos) {
    try {
      salida.push({ paso, ok: true, mensaje: await WON_STEP_EXECUTORS[paso](opp, deps) });
    } catch (e) {
      salida.push({ paso, ok: false, mensaje: mensajeDeError(e) });
    }
  }
  return salida;
}

/**
 * Texto de un error de paso. Los errores de Supabase (PostgrestError) son
 * objetos planos, no `Error`: con `String(e)` el resumen mostraba «[object Object]».
 */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return typeof e === 'string' ? e : 'Error desconocido';
}

/**
 * Los ejecutores de `wonCloseSteps` terminan en «— se omitió…» / «— no se duplicó»
 * cuando no crean nada: eso no es un documento nuevo, y el resumen no debe contarlo.
 */
export function pasoSinCambios(mensaje: string): boolean {
  return /—\s*(se omiti|no se duplic)/i.test(mensaje) || /^Comisión no devengada/.test(mensaje);
}

/** Resultados → documentos del resumen del `WinDialog`. */
export function documentosDe(resultados: readonly ResultadoPaso[]): DocumentoCreado[] {
  return resultados.map((r) => ({
    tipo: (r.ok && TIPO_DOC[r.paso]) || 'otro',
    numero: r.mensaje,
    href: r.ok && r.paso === 'invoice' ? '/app/finanzas/facturas-venta' : null,
    estado: !r.ok ? 'error' : pasoSinCambios(r.mensaje) ? 'omitido' : 'creado',
  }));
}
