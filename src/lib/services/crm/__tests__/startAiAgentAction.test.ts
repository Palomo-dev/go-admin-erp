jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn() }));
jest.mock('@/lib/utils/orgContext', () => ({ hasOrgAdminOrPermission: jest.fn(async () => true) }));
import { executeAction } from '../automation/actions';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import type { ActionRunContext } from '../automation/actions';
const RULE = '10000000-0000-4000-8000-000000000001', RUN = '10000000-0000-4000-8000-000000000002', AGENT = '10000000-0000-4000-8000-000000000003';
let rows: Record<string, Record<string, unknown> | null>; let seen: { table: string; filters: [string, unknown][] }[]; let enqueue: jest.Mock; let run: ActionRunContext;
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(hasOrgAdminOrPermission).mockResolvedValue(true);
  rows = { automation_rules: { id: RULE, created_by: 'actor-bd', is_active: true, version: 3, actions: [{ type: 'start_ai_agent', voice_agent_id: AGENT }] }, automation_runs: { id: RUN, automation_rule_id: RULE, status: 'running', dry_run: false, rule_version: 3, event_id: 'event-bd', opportunity_id: null }, organization_members: { user_id: 'actor-bd', role_id: 99, is_super_admin: false }, voice_agents: { id: AGENT, is_active: true }, crm_events: { entity_type: 'customer', entity_id: 'customer-bd' }, customers: { id: 'customer-bd' }, outbound_jobs: null };
  seen = []; enqueue = jest.fn(async () => 'job-real');
  const supabase = { from: (table: string) => { const record = { table, filters: [] as [string, unknown][] }; seen.push(record); const q = { select: () => q, eq: (key: string, value: unknown) => { record.filters.push([key, value]); return q; }, order: () => q, limit: () => q, maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }; return q; } };
  run = { orgId: 120, supabase: supabase as unknown as ActionRunContext['supabase'], ctx: { customer: { id: 'SPOOF' }, opportunity: null } as unknown as ActionRunContext['ctx'], originKey: `rule:${RULE}:run:${RUN}`, actionIndex: 0, userId: 'SPOOF_ACTOR', enqueue };
});
test('leadnuevo encola ai_call canónico con actor/agente/cliente deBD, no ctx ni userIdspoof', async () => {
  expect(await executeAction({ type: 'start_ai_agent', voice_agent_id: AGENT }, run)).toMatchObject({ status: 'ok', job_id: 'job-real', queued: true });
  expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 120, kind: 'ai_call', dedupeKey: `ai_call:rule:${RULE}:run:${RUN}:action:0`, payload: expect.objectContaining({ voice_agent_id: AGENT, customer_id: 'customer-bd', actor_user_id: 'actor-bd' }) }));
  for (const record of seen) expect(record.filters).toContainEqual(['organization_id', 120]);
  expect(hasOrgAdminOrPermission).toHaveBeenCalledWith(expect.objectContaining({ userId: 'actor-bd', roleId: 99, organizationId: 120 }), 'crm.campaigns.manage');
});
test.each(['inactive-rule','inactive-agent','actor-denied','dry-run','old-version','agent-spoof','no-event'])('rechaza %s antes de encolar', async failure => {
  if (failure === 'inactive-rule') rows.automation_rules!.is_active = false;
  if (failure === 'inactive-agent') rows.voice_agents!.is_active = false;
  if (failure === 'actor-denied') jest.mocked(hasOrgAdminOrPermission).mockResolvedValue(false);
  if (failure === 'dry-run') rows.automation_runs!.dry_run = true;
  if (failure === 'old-version') rows.automation_runs!.rule_version = 2;
  if (failure === 'no-event') rows.crm_events = null;
  await expect(executeAction({ type: 'start_ai_agent', voice_agent_id: failure === 'agent-spoof' ? RUN : AGENT }, run)).rejects.toThrow();
  expect(enqueue).not.toHaveBeenCalled();
});
test('replay de trabajo terminado devuelve mismoID y no crea otra llamada', async () => {
  rows.outbound_jobs = { id: 'job-existing', status: 'done' };
  expect(await executeAction({ type: 'start_ai_agent', voice_agent_id: AGENT }, run)).toMatchObject({ job_id: 'job-existing', queued: false });
  expect(enqueue).not.toHaveBeenCalled();
});
