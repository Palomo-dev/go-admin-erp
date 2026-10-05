import { NextRequest,NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm,sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { compatibleTeamWrite } from '@/lib/services/crm/teamManagementCompatibility';
type Params={params:Promise<{id:string}>};
async function write(request:NextRequest,params:Params,archive:boolean){try{const ctx=await getServerOrgContext(request);const {id}=await params.params;const data=await compatibleTeamWrite(ctx,'territory',sinClavesDeOrganizacion(await readOrgBody(ctx,request)),id,null,archive);return NextResponse.json({success:true,data});}catch(error){return respuestaErrorCrm(error,'/api/crm/territories/[id]');}}
export async function PATCH(request:NextRequest,params:Params){return write(request,params,false);}
export async function DELETE(request:NextRequest,params:Params){return write(request,params,true);}
