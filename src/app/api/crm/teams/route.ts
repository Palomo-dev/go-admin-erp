import { NextRequest,NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS,exigirPermisoCrm,respuestaErrorCrm,sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { getSalesTeams } from '@/lib/services/crm/salesStructureService';
import { compatibleTeamWrite } from '@/lib/services/crm/teamManagementCompatibility';
export async function GET(request:NextRequest){try{const ctx=await getServerOrgContext(request);readOrgBody(ctx,{}, {request});await exigirPermisoCrm(ctx,[CRM_PERMISOS.oportunidadesVer],'leer equipos');return NextResponse.json({success:true,data:await getSalesTeams(ctx.organizationId,ctx.supabase)});}catch(error){return respuestaErrorCrm(error,'GET /api/crm/teams');}}
export async function POST(request:NextRequest){try{const ctx=await getServerOrgContext(request);const data=await compatibleTeamWrite(ctx,'team',sinClavesDeOrganizacion(await readOrgBody(ctx,request)));return NextResponse.json({success:true,data},{status:201});}catch(error){return respuestaErrorCrm(error,'POST /api/crm/teams');}}
