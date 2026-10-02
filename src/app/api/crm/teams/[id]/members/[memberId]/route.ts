import { NextRequest,NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm,sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { compatibleTeamWrite } from '@/lib/services/crm/teamManagementCompatibility';
type Params={params:Promise<{id:string;memberId:string}>};
async function write(request:NextRequest,params:Params,archive:boolean){try{const ctx=await getServerOrgContext(request);const {id,memberId}=await params.params;const data=await compatibleTeamWrite(ctx,'member',sinClavesDeOrganizacion(await readOrgBody(ctx,request)),memberId,id,archive);return NextResponse.json({success:true,data});}catch(error){return respuestaErrorCrm(error,'/api/crm/teams/[id]/members/[memberId]');}}
export async function PATCH(request:NextRequest,params:Params){return write(request,params,false);}
export async function DELETE(request:NextRequest,params:Params){return write(request,params,true);}
