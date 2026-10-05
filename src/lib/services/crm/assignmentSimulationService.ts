import { z } from 'zod';
import { assignLead, type AssignmentSimulationState } from './assignmentService';
import { CRM_PERMISOS, exigirPermisoCrm, type CrmSesion } from './crmRouteSupport';
import { CrmHttpError } from './crmErrors';
import type { AssignmentSimulation } from './teamManagementModel';
export const assignmentSimulationSchema=z.object({ enabled:z.boolean(),strategy:z.enum(['round_robin','territory','load_balance']),team_id:z.string().uuid().nullable() }).strict();
/** Preview preserves every existing owner; unknown historical provenance never implies manual reassignment. */
export async function simulateAssignment(ctx:CrmSesion,input:unknown):Promise<AssignmentSimulation> {
 await exigirPermisoCrm(ctx,[CRM_PERMISOS.leadsAsignar],'simular asignación');
 const parsed=assignmentSimulationSchema.safeParse(input);
 if (!parsed.success) throw new CrmHttpError(400,'datos_invalidos','Revisa la estrategia');
 const config=parsed.data;
 const [leads,people]=await Promise.all([
  ctx.supabase.from('customers').select('id,owner_id,metadata,company_size,branches_count,current_software,lifecycle_stage,city,vertical_id').eq('organization_id',ctx.organizationId).not('lead_source','is',null).is('lead_discarded_at',null).neq('status','merged').order('created_at',{ascending:false}).order('id').limit(50),
  ctx.supabase.from('organization_members').select('user_id,profiles:user_id(first_name,last_name,email)').eq('organization_id',ctx.organizationId).eq('is_active',true),
 ]);
 if (leads.error) throw leads.error;if (people.error) throw people.error;
 let team=config.team_id;
 if (!team && config.enabled) {
  const result=await ctx.supabase.from('sales_teams').select('id').eq('organization_id',ctx.organizationId).eq('is_active',true).order('created_at').order('id').limit(1).maybeSingle();
  if(result.error)throw result.error;team=result.data?.id ?? null;
 }
 if (team) {
  const result=await ctx.supabase.from('sales_teams').select('id').eq('organization_id',ctx.organizationId).eq('id',team).eq('is_active',true).maybeSingle();
  if(result.error)throw result.error;if(!result.data)throw new CrmHttpError(400,'equipo_invalido','Selecciona un equipo activo');
 }
 const byUser=new Map<string,AssignmentSimulation['distribution'][number]>();
 for(const person of people.data ?? []) {
  const profile=Array.isArray(person.profiles)?person.profiles[0]:person.profiles;
  byUser.set(person.user_id,{user_id:person.user_id,name:[profile?.first_name,profile?.last_name].filter(Boolean).join(' ')||profile?.email||person.user_id,current:0,proposed:0});
 }
 const state:AssignmentSimulationState={fallbackCount:0};let preserved=0,unassigned=0;
 for(const lead of leads.data ?? []) {
  if(lead.owner_id) {
   const owner=byUser.get(lead.owner_id);
   if(owner){owner.current++;owner.proposed++;}preserved++;continue;
  }
  if(!config.enabled||!team){unassigned++;continue;}
  const context=await ctx.supabase.rpc('crm_segment_context_page',{p_org:ctx.organizationId,p_customers:[lead.id],p_limit:1});
  if(context.error)throw context.error;
  if(!Array.isArray(context.data)||!context.data[0])throw new Error('simulation_context_invalido');
  const metadata=lead.metadata?.lead ?? {};
  const result=await assignLead({organizationId:ctx.organizationId,customerId:lead.id,teamId:team,strategy:config.strategy,simulation:state,customerData:{...lead,...context.data[0]},opportunityData:{amount:metadata.valor_estimado?.monto,currency:metadata.valor_estimado?.moneda,deal_type:metadata.deal_type}},ctx.supabase);
  const owner=byUser.get(result.userId);if(!owner)throw new Error('simulation_owner_invalido');owner.proposed++;
 }
 return {sample_count:leads.data?.length ?? 0,preserved,unassigned,fallback_count:state.fallbackCount,distribution:[...byUser.values()].filter((user)=>user.current||user.proposed)};
}
