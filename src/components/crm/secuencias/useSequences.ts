'use client';

/**
 * Estado de las secuencias (FASE-08 §5.2). Todo pasa por rutas de servidor.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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

export function useSequences() {
  const [sequences, setSequences] = useState<SequenceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Solo la primera carga muestra el esqueleto. Si cada recarga (guardar,
  // activar, inscribir) desmontara la rejilla, el botón que abrió el diálogo
  // dejaría de existir y el foco caería al body (tester r2, misma causa que
  // H1 de Automatizaciones).
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const { ok, body } = await readJson(await fetch('/api/crm/sequences', { cache: 'no-store' }));
      if (!ok) throw new Error(messageOf(body, 'No se pudieron cargar las secuencias'));
      setSequences((body.data as SequenceView[]) ?? []);
      loadedOnce.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
    await load();
    return body.data as SequenceView;
  }, [load]);

  const toggle = useCallback(async (sequence: SequenceView) => {
    const { ok, body } = await readJson(
      await fetch(`/api/crm/sequences/${sequence.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !sequence.is_active }),
      }),
    );
    if (!ok) throw new Error(messageOf(body, 'No se pudo cambiar el estado'));
    await load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    const { ok, body } = await readJson(await fetch(`/api/crm/sequences/${id}`, { method: 'DELETE' }));
    if (!ok) throw new Error(messageOf(body, 'No se pudo eliminar la secuencia'));
    await load();
  }, [load]);

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

  return { sequences, loading, error, reload: load, save, toggle, remove, enroll };
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
