/**
 * F11 — onboarding: lógica pura sobre el esquema real (verificado por MCP
 * 2026-09-15): `onboarding_templates.steps` jsonb = `[{day,key,owner,title}]`,
 * `onboarding_steps` (sin `updated_at`, sin `assigned_to`), etapa ganada del
 * pipeline por `stages.is_won` (nunca por nombre).
 */

export interface TemplateStep {
  day: number | null;
  key: string | null;
  owner: string | null;
  title: string;
  description: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseTemplateSteps(json: unknown): TemplateStep[] {
  if (!Array.isArray(json)) return [];
  const out: TemplateStep[] = [];
  for (const item of json) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const title = typeof s.title === 'string' && s.title.trim() ? s.title.trim() : typeof s.name === 'string' && s.name.trim() ? s.name.trim() : '';
    if (!title) continue;
    out.push({
      day: typeof s.day === 'number' && Number.isFinite(s.day) && s.day >= 0 ? s.day : null,
      key: typeof s.key === 'string' && s.key ? s.key : null,
      owner: typeof s.owner === 'string' && s.owner ? s.owner : null,
      title,
      description: typeof s.description === 'string' && s.description ? s.description : null,
    });
  }
  return out;
}

export interface StepRowInsert {
  organization_id: number;
  instance_id: string;
  step_number: number;
  name: string;
  description: string | null;
  due_date: string;
  is_completed: false;
}

export function buildStepRows(input: {
  templateSteps: TemplateStep[];
  startedAt: Date;
  defaultDurationDays: number;
  orgId: number;
  instanceId: string;
}): StepRowInsert[] {
  const n = input.templateSteps.length;
  const duration = input.defaultDurationDays > 0 ? input.defaultDurationDays : 30;
  return input.templateSteps.map((s, idx) => {
    const day = s.day ?? Math.round((duration / Math.max(n, 1)) * (idx + 1));
    return {
      organization_id: input.orgId,
      instance_id: input.instanceId,
      step_number: idx + 1,
      name: s.title,
      description: s.description,
      due_date: new Date(input.startedAt.getTime() + day * DAY_MS).toISOString(),
      is_completed: false,
    };
  });
}

export interface OnboardingProgress {
  total: number;
  done: number;
  pct: number;
  allDone: boolean;
}

export function computeOnboardingProgress(steps: ReadonlyArray<{ is_completed: boolean }>): OnboardingProgress {
  const total = steps.length;
  const done = steps.filter((s) => s.is_completed).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0, allDone: total > 0 && done === total };
}

/** Solo con todos los pasos hechos (y al menos uno) se puede cerrar el onboarding. */
export function canCompleteOnboarding(steps: ReadonlyArray<{ is_completed: boolean }>): boolean {
  return computeOnboardingProgress(steps).allDone;
}

/** Responsable del paso: `owner` de la plantilla (por índice; si no cuadra, por título). */
export function resolveStepOwner(step: { step_number: number; name: string }, templateSteps: ReadonlyArray<TemplateStep>): string | null {
  const byIndex = templateSteps[step.step_number - 1];
  if (byIndex && byIndex.title === step.name) return byIndex.owner;
  const byTitle = templateSteps.find((t) => t.title === step.name);
  if (byTitle) return byTitle.owner;
  return byIndex?.owner ?? null;
}

export function ownerLabel(owner: string | null): string {
  if (!owner) return 'Sin responsable';
  if (owner === 'vendor') return 'Vendedor';
  if (owner === 'cs') return 'Customer success';
  return owner;
}

export function pickDefaultTemplate<T extends { id: string; name: string; is_active: boolean }>(templates: ReadonlyArray<T>): T | null {
  const active = templates.filter((t) => t.is_active).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return active[0] ?? null;
}

export function findWonStage<T extends { id: string; is_won: boolean | null; position: number }>(stages: ReadonlyArray<T>): T | null {
  return [...stages].filter((s) => s.is_won === true).sort((a, b) => a.position - b.position)[0] ?? null;
}

export function isOnboardingOpportunity(
  opp: { metadata?: unknown; pipeline?: { pipeline_type?: string | null } | null } | null | undefined,
): boolean {
  if (!opp) return false;
  const meta = opp.metadata;
  if (meta && typeof meta === 'object' && (meta as { type?: unknown }).type === 'onboarding') return true;
  return opp.pipeline?.pipeline_type === 'onboarding';
}

// ─── Checklist: estado de la casilla y foco (F11 r2, tester r1) ─────────────

export interface ChecklistStepControl {
  /**
   * `disabled` del DOM. NUNCA en la casilla que se está guardando: Chrome
   * quita el foco a un botón que pasa a `disabled` (verificado con clic real
   * en el arnés de r2: el foco caía al `body` a los 2 s). Esa casilla queda
   * enfocable, con `aria-busy` y `aria-disabled`, y su handler no hace nada.
   */
  disabled: boolean;
  /** `aria-disabled` + handler inerte: la casilla no cambia mientras algo se guarda o el onboarding está completo. */
  locked: boolean;
  /** Muestra el spinner AL LADO de la casilla (solo el paso que se está guardando). */
  busy: boolean;
}

/**
 * Al marcar un paso, r1 desmontaba el `Checkbox` y el foco caía al `body`.
 * La casilla sigue montada y enfocable; el spinner va al lado.
 */
export function checklistStepControl(input: { stepId: string; busyStepId: string | null; instanceCompleted: boolean }): ChecklistStepControl {
  const busy = input.busyStepId === input.stepId;
  const locked = input.instanceCompleted || input.busyStepId !== null;
  return { disabled: locked && !busy, locked, busy };
}

/** Tras «Completar onboarding» el botón se desmonta: el foco va al mensaje de estado; si falló, se queda en el botón. */
export function focusTargetAfterComplete(succeeded: boolean): 'status' | 'button' {
  return succeeded ? 'status' : 'button';
}
