/** Adapters for existing configuration/API clients. Every mutation uses the same audited RPC. */
import { z } from 'zod';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { writeTeamManagement } from './teamManagementService';
import { CRM_PERMISOS,exigirPermisoCrm,type CrmSesion } from './crmRouteSupport';
import { CrmHttpError,exigirUuid } from './crmErrors';
const version={expected_updated_at:z.string().datetime({offset:true}).nullable().optional()};
const schemas={
 team:z.object({...version,name:z.string().optional(),description:z.string().nullable().optional(),is_active:z.boolean().optional(),territory_id:z.string().uuid().nullable().optional()}).strict(),
 member:z.object({...version,user_id:z.string().uuid().optional(),sales_role_id:z.string().uuid().nullable().optional(),territory_id:z.string().uuid().nullable().optional(),quota_amount:z.number().finite().nullable().optional(),quota_currency:z.string().optional(),is_active:z.boolean().optional()}).strict(),
 territory:z.object({...version,name:z.string().optional(),criteria:z.record(z.unknown()).optional(),sort_order:z.number().int().optional(),is_active:z.boolean().optional()}).strict(),
};
export async function compatibleTeamWrite(ctx:CrmSesion,kind:keyof typeof schemas,input:unknown,id:string|null=null,teamId:string|null=null,archive=false){
 await exigirPermisoCrm(ctx,[CRM_PERMISOS.leadsAsignar],'gestionar estructura comercial');
 if(id)exigirUuid(id);if(teamId)exigirUuid(teamId);
 const parsed=schemas[kind].safeParse(input);
 if(!parsed.success)throw new CrmHttpError(400,'datos_invalidos','Revisa los datos comerciales');
 const body=parsed.data as Record<string,unknown>,table={team:'sales_teams',member:'sales_team_members',territory:'territories'}[kind];
 let current:Record<string,unknown>={};
 if(id){
  let query=ctx.supabase.from(table).select('*').eq('id',id).eq('organization_id',ctx.organizationId);
  if(kind==='member'&&teamId)query=query.eq('sales_team_id',teamId);
  const result=await query.maybeSingle();if(result.error)throw result.error;if(!result.data)throw new CrmHttpError(404,'registro_no_encontrado','Registro no encontrado');current=result.data;
 }
 const merged:Record<string,unknown>={...current,...body,is_active:archive?false:body.is_active??current.is_active??true};
 const data=kind==='team'?{name:merged.name,description:merged.description??null,is_active:merged.is_active,territory_id:merged.territory_id??null}:
  kind==='territory'?{name:merged.name,criteria:merged.criteria??{},is_active:merged.is_active,sort_order:merged.sort_order??0}:
  {sales_team_id:teamId??merged.sales_team_id,user_id:merged.user_id,sales_role_id:merged.sales_role_id??null,territory_id:merged.territory_id??null,quota_amount:merged.quota_amount??null,quota_currency:merged.quota_currency??(await resolverContextoMoneda(ctx.supabase,ctx.organizationId)).code,is_active:merged.is_active};
 return writeTeamManagement(ctx,{kind,id,expected_updated_at:body.expected_updated_at??current.updated_at??null,data});
}
