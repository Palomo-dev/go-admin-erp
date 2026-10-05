import { randomUUID } from 'crypto';
import { NextRequest,NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm,sinClavesDeOrganizacion,CRM_PERMISOS,exigirPermisoCrm } from '@/lib/services/crm/crmRouteSupport';
import { readTeamManagement,readTerritoryCounts,teamMutationSchema } from '@/lib/services/crm/teamManagementService';
import { normalizarFiltroSegmento } from '@/lib/services/crm/segmentosLogica';
import { CrmHttpError } from '@/lib/services/crm/crmErrors';
import type { TeamTerritory } from '@/lib/services/crm/teamManagementModel';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest){try{
 const ctx=await getServerOrgContext(request);await exigirPermisoCrm(ctx,[CRM_PERMISOS.leadsAsignar],'vista previa territorio');
 const parsed=teamMutationSchema.safeParse(sinClavesDeOrganizacion(await readOrgBody(ctx,request)));
 if(!parsed.success||parsed.data.kind!=='territory')throw new CrmHttpError(400,'datos_invalidos','Revisa el territorio');
 const body=parsed.data,snapshot=await readTeamManagement(ctx),id=body.id??randomUUID();
 if(body.id&&!snapshot.territories.some((territory)=>territory.id===body.id))throw new CrmHttpError(404,'territorio_no_encontrado','Territorio no encontrado');
 const { filter,...criteria }=body.data.criteria;
 const draft:TeamTerritory={...body.data,id,updated_at:body.expected_updated_at??'',criteria:{...criteria,...(filter?{filter:normalizarFiltroSegmento(filter)}:{})},customer_count:0,opportunity_count:0,overlap_count:0};
 const result=await readTerritoryCounts(ctx,[...snapshot.territories.filter((territory)=>territory.id!==id),draft]);
 return NextResponse.json({success:true,data:result.territories.find((territory)=>territory.id===id)});
}catch(error){return respuestaErrorCrm(error,'POST /api/crm/territories/preview');}}
