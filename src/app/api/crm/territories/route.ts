import { NextRequest,NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS,exigirPermisoCrm,respuestaErrorCrm,sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { compatibleTeamWrite } from '@/lib/services/crm/teamManagementCompatibility';
export async function GET(request:NextRequest){try{const ctx=await getServerOrgContext(request);readOrgBody(ctx,{}, {request});await exigirPermisoCrm(ctx,[CRM_PERMISOS.oportunidadesVer],'leer territorios');const result=await ctx.supabase.from('territories').select('*').eq('organization_id',ctx.organizationId).order('sort_order').order('id');if(result.error)throw result.error;return NextResponse.json({success:true,data:result.data});}catch(error){return respuestaErrorCrm(error,'GET /api/crm/territories');}}
export async function POST(request:NextRequest){try{const ctx=await getServerOrgContext(request);const data=await compatibleTeamWrite(ctx,'territory',sinClavesDeOrganizacion(await readOrgBody(ctx,request)));return NextResponse.json({success:true,data},{status:201});}catch(error){return respuestaErrorCrm(error,'POST /api/crm/territories');}}
