'use client';

/**
 * Estado de las secuencias (FASE-08 §5.2). Todo pasa por rutas de servidor.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SequenceOverview } from '@/lib/services/crm/sequenceOverview';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { enrollErrorText } from './sequenceOptions';

export interface SequenceStepView {
  id?: string;
  step_number: number;
  delay_days: number;
  delay_hours?: number;
  channel: string;
  template_id?: string | null;
  action_config?: Record<string, unknown>;
  condition?: unknown;
  is_active?: boolean;
}

/** Inscritos activos y tasa de respuesta (GET de lista, brief UX 6.3). */
export interface SequenceEnrollmentStats {
  active: number;
  total: number;
  replied: number;
  /** 0..1; `null` sin inscripciones. */
  response_rate: number | null;
}

export interface SequenceView {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  pause_on_reply?: boolean;
  exit_conditions: unknown[];
  steps?: SequenceStepView[];
  updated_at: string;
  enrollment_stats?: SequenceEnrollmentStats;
}

export interface EnrollPreviewStep {
  id: string;
  step_number: number;
  channel: string;
  delay_days: number;
  delay_hours: number | null;
  name: string | null;
  /** El preview solo devuelve pasos activos; viaja para que `enrollBlockReason` cuente igual que la tarjeta. */
  is_active?: boolean;
  /** Solo en los pasos `condition`: reglas configuradas (0 = corta siempre). */
  condition_rules?: number;
}

export interface EnrollCandidate {
  id: string;
  name: string;
  amount: number | null;
  currency: string | null;
  customer_name: string | null;
  customer_email: string | null;
  already_enrolled: boolean;
}

export interface EnrollmentView {
  id: string;
  sequence_id: string;
  opportunity_id: string | null;
  customer_id: string | null;
  status: 'active' | 'paused' | 'completed' | 'exited';
  enrolled_at: string;
  exit_reason: string | null;
  paused_reason?: string | null;
  next_run_at?: string | null;
  /** ID del paso que programa el motor; el GET ya devuelve la columna real. */
  current_step_id?: string | null;
  /** Resueltos en el GET para no mostrar UUIDs. */
  opportunity_name?: string | null;
  customer_name?: string | null;
}

async function readJson(res: Response): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { ok: res.ok, body };
}

function messageOf(body: Record<string, unknown>, fallback: string): string {
  const issues = Array.isArray(body.issues) ? (body.issues as string[]).join('; ') : '';
  const error = typeof body.error === 'string' ? body.error : '';
  return [error || fallback, issues].filter(Boolean).join(' — ');
}

export type SequenceSummary=SequenceOverview;
export function useSequences() {
  const {organization}=useOrganization();const orgId=organization?.id??null;
  const currentOrg=useRef(orgId);currentOrg.current=orgId;
  const [scope,setScope]=useState<number|null>(null),[canManage,setCanManage]=useState(false),[summary,setSummary]=useState<SequenceSummary|null>(null);
  const [sequences, setSequences] = useState<SequenceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Solo la primera carga muestra el esqueleto. Si cada recarga (guardar,
  // activar, inscribir) desmontara la rejilla, el botón que abrió el diálogo
  // dejaría de existir y el foco caería al body (tester r2, misma causa que
  // H1 de Automatizaciones).
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if(!orgId)return;
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const { ok, body } = await readJson(await fetch('/api/crm/sequences', { cache: 'no-store' }));
      if (!ok) throw new Error(messageOf(body, 'No se pudieron cargar las secuencias'));
      if(currentOrg.current!==orgId)return;
      setSequences((body.data as SequenceView[]) ?? []);setScope(orgId);setCanManage(body.can_manage===true);setSummary((body.summary as SequenceSummary|undefined)??null);
      loadedOnce.current = true;
    } catch (err) {
      if(currentOrg.current===orgId){setError(err instanceof Error ? err.message : 'Error desconocido');setCanManage(false);}
    } finally {
      if(currentOrg.current===orgId)setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {loadedOnce.current=false;setSequences([]);setScope(orgId);setCanManage(false);setSummary(null);setError(null);setLoading(true);if(orgId)void load();}, [load,orgId]);

  const save = useCallback(async (input: Partial<SequenceView> & { id?: string; steps?: SequenceStepView[] }) => {
    const isEdit = !!input.id;
    const { ok, body } = await readJson(
      await fetch(isEdit ? `/api/crm/sequences/${input.id}` : '/api/crm/sequences', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo guardar la secuencia'));
    if(currentOrg.current===orgId && body.data){const row=body.data as SequenceView;setSequences(items=>items.some(item=>item.id===row.id)?items.map(item=>item.id===row.id?{...item,...row,steps:row.steps??item.steps,enrollment_stats:row.enrollment_stats??item.enrollment_stats}:item):[...items,{...row,steps:row.steps??input.steps}]);}
    await load();
    return body.data as SequenceView;
  }, [load,orgId]);

  const toggle = useCallback(async (sequence: SequenceView) => {
    const { ok, body } = await readJson(
      await fetch(`/api/crm/sequences/${sequence.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !sequence.is_active }),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo cambiar el estado'));
    if(currentOrg.current===orgId && body.data){const row=body.data as SequenceView;setSequences(items=>items.map(item=>item.id===row.id?{...item,...row}:item));}
    await load();
  }, [load,orgId]);

  const remove = useCallback(async (id: string) => {
    const { ok, body } = await readJson(await fetch(`/api/crm/sequences/${id}`, { method: 'DELETE' }));
    if (!ok) throw new Error(messageOf(body, 'No se pudo eliminar la secuencia'));
    if(currentOrg.current===orgId)setSequences(items=>items.filter(item=>item.id!==id));
    await load();
  }, [load,orgId]);

  const enroll = useCallback(async (id: string, opportunityId: string) => {
    const { ok, body } = await readJson(
      await fetch(`/api/crm/sequences/${id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id: opportunityId }),
      }),
    );
    const skipped = (body.skipped as { reason: string }[] | undefined) ?? [];
    // El código de la RPC (`sequence_inactive`, `already_active`…) se muestra en
    // castellano y es el mensaje entero: el título del toast ya dice «No se pudo inscribir».
    if (!ok) throw new Error(skipped[0] ? enrollErrorText(skipped[0].reason) : messageOf(body, 'No se pudo inscribir'));
    return { enrolled: Number(body.enrolled ?? 0), skipped };
  }, []);

  return { sequences:scope===orgId?sequences:[], loading:scope===orgId?loading:true, error:scope===orgId?error:null, canManage:scope===orgId&&canManage, summary:scope===orgId?summary:null, organizationId:orgId, reload: load, save, toggle, remove, enroll };
}

export async function fetchEnrollments(sequenceId: string): Promise<EnrollmentView[]> {
  const { ok, body } = await readJson(
    await fetch(`/api/crm/sequences/${sequenceId}/enrollments?limit=50`, { cache: 'no-store' }),
  );
  if (!ok) throw new Error(messageOf(body, 'No se pudieron cargar las inscripciones'));
  return (body.data as EnrollmentView[]) ?? [];
}

/**
 * Pasos de la secuencia + oportunidades candidatas para el diálogo de
 * inscripción (tester r2 N7: hacía falta selector y previsualización).
 */
export async function fetchEnrollPreview(
  sequenceId: string,
  q: string,
): Promise<{ sequence: { is_active: boolean }; steps: EnrollPreviewStep[]; candidates: EnrollCandidate[] }> {
  const url = `/api/crm/sequences/${sequenceId}/enroll/preview${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  const { ok, body } = await readJson(await fetch(url, { cache: 'no-store' }));
  if (!ok) throw new Error(messageOf(body, 'No se pudo preparar la inscripción'));
  const data = (body.data ?? {}) as { sequence?: { is_active?: boolean }; steps?: EnrollPreviewStep[]; candidates?: EnrollCandidate[] };
  return { sequence: { is_active: data.sequence?.is_active !== false }, steps: data.steps ?? [], candidates: data.candidates ?? [] };
}

/** Reanuda una inscripción pausada (tester r2 N3). */
export async function resumeEnrollment(sequenceId: string, enrollmentId: string): Promise<void> {
  const { ok, body } = await readJson(
    await fetch(`/api/crm/sequences/${sequenceId}/enrollments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_id: enrollmentId, action: 'resume' }),
    }),
  );
  if (!ok) {
    const reason = enrollErrorText((body.data as { reason?: string } | undefined)?.reason);
    throw new Error(messageOf(body, 'No se pudo reanudar') + (reason ? ` (${reason})` : ''));
  }
}

export async function unenroll(sequenceId: string, enrollmentId: string): Promise<void> {
  const { ok, body } = await readJson(
    await fetch(`/api/crm/sequences/${sequenceId}/enrollments?enrollment_id=${encodeURIComponent(enrollmentId)}`, {
      method: 'DELETE',
    }),
  );
  if (!ok) throw new Error(messageOf(body, 'No se pudo desinscribir'));
}
