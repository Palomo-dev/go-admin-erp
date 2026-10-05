import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { UUID_RE } from '../crmErrors';
import { ActionError, validateStartAiAgentAction, type AutomationAction, type ActionRunContext, type EnqueueFn } from './actions';

/** Productor de ai_call; dispatchAgentCall conserva todas las barreras y el cobro. */
export async function enqueueAutomationAgent(action: AutomationAction, run: ActionRunContext, enqueue: EnqueueFn) {
  const { orgId, supabase } = run;
  const match = /^rule:([0-9a-f-]{36}):run:([0-9a-f-]{36})$/i.exec(run.originKey);
  if (!match || !UUID_RE.test(match[1]) || !UUID_RE.test(match[2]) || !Number.isInteger(run.actionIndex) || run.actionIndex < 0) throw new ActionError('start_ai_agent', 'persisted_rule_required');
  const [ruleRes, runRes] = await Promise.all([
    supabase.from('automation_rules').select('id, created_by, is_active, actions, version').eq('organization_id', orgId).eq('id', match[1]).maybeSingle(),
    supabase.from('automation_runs').select('id, automation_rule_id, status, dry_run, rule_version, opportunity_id, event_id').eq('organization_id', orgId).eq('id', match[2]).maybeSingle(),
  ]);
  if (ruleRes.error) throw ruleRes.error; if (runRes.error) throw runRes.error;
  const rule = ruleRes.data, savedRun = runRes.data;
  if (!rule?.is_active || !rule.created_by || !savedRun || savedRun.automation_rule_id !== rule.id || savedRun.dry_run || savedRun.status !== 'running' || savedRun.rule_version !== rule.version) throw new ActionError('start_ai_agent', 'rule_not_current');
  const saved = Array.isArray(rule.actions) ? rule.actions[run.actionIndex] as AutomationAction | undefined : undefined;
  if (!saved || saved.type !== 'start_ai_agent') throw new ActionError('start_ai_agent', 'action_not_persisted');
  const agentId = validateStartAiAgentAction(saved);
  if (agentId !== validateStartAiAgentAction(action)) throw new ActionError('start_ai_agent', 'agent_mismatch');
  const actorRes = await supabase.from('organization_members').select('user_id, role_id, is_super_admin').eq('organization_id', orgId).eq('user_id', rule.created_by).eq('is_active', true).maybeSingle();
  if (actorRes.error) throw actorRes.error;
  const actor = actorRes.data;
  if (!actor || !(await hasOrgAdminOrPermission({ userId: actor.user_id, organizationId: orgId, roleId: actor.role_id, isSuperAdmin: actor.is_super_admin === true, supabase }, 'crm.campaigns.manage'))) throw new ActionError('start_ai_agent', 'actor_forbidden');
  const agentRes = await supabase.from('voice_agents').select('id, is_active').eq('organization_id', orgId).eq('id', agentId).maybeSingle();
  if (agentRes.error) throw agentRes.error;
  if (!agentRes.data?.is_active) throw new ActionError('start_ai_agent', 'agent_inactive');
  let opportunityId: string | null = savedRun.opportunity_id; let customerId: string | null = null;
  if (savedRun.event_id) {
    const event = await supabase.from('crm_events').select('entity_type, entity_id').eq('organization_id', orgId).eq('id', savedRun.event_id).maybeSingle();
    if (event.error) throw event.error;
    if (!event.data) throw new ActionError('start_ai_agent', 'event_not_found');
    if (event.data.entity_type === 'customer') customerId = event.data.entity_id;
    else if (event.data.entity_type === 'opportunity') opportunityId = event.data.entity_id;
  }
  if (opportunityId) {
    const opp = await supabase.from('opportunities').select('id, customer_id, status').eq('organization_id', orgId).eq('id', opportunityId).maybeSingle();
    if (opp.error) throw opp.error;
    if (!opp.data || opp.data.status !== 'open') throw new ActionError('start_ai_agent', 'opportunity_unavailable');
    if (customerId && customerId !== opp.data.customer_id) throw new ActionError('start_ai_agent', 'customer_mismatch');
    customerId = opp.data.customer_id;
  }
  if (!customerId) throw new ActionError('start_ai_agent', 'customer_required');
  const customer = await supabase.from('customers').select('id').eq('organization_id', orgId).eq('id', customerId).maybeSingle();
  if (customer.error) throw customer.error;
  if (!customer.data) throw new ActionError('start_ai_agent', 'customer_unavailable');
  const dedupeKey = `ai_call:${run.originKey}:action:${run.actionIndex}`;
  const existing = await supabase.from('outbound_jobs').select('id, status').eq('organization_id', orgId).eq('kind', 'ai_call').eq('dedupe_key', dedupeKey).order('created_at').limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === 'dead') throw new ActionError('start_ai_agent', 'job_failed');
  const jobId = existing.data?.id ?? await enqueue({ organizationId: orgId, kind: 'ai_call', dedupeKey, payload: { voice_agent_id: agentId, customer_id: customerId, opportunity_id: opportunityId, source: 'automation', automation_rule_id: rule.id, automation_run_id: savedRun.id, actor_user_id: actor.user_id } });
  return { type: 'start_ai_agent', status: 'ok' as const, queued: !existing.data, job_id: jobId, voice_agent_id: agentId };
}
