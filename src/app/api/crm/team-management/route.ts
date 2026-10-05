import { NextRequest,NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm,sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { readTeamManagement,readTerritoryCounts,writeTeamManagement } from '@/lib/services/crm/teamManagementService';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
 try {
  const ctx=await getServerOrgContext(request);readOrgBody(ctx,{}, {request});
  const data=await readTeamManagement(ctx);
  if (request.nextUrl.searchParams.get('view')==='territories') return NextResponse.json({success:true,data:await readTerritoryCounts(ctx,data.territories)});
  return NextResponse.json({success:true,data});
 } catch(error) {return respuestaErrorCrm(error,'GET /api/crm/team-management');}
}
export async function POST(request:NextRequest) {
 try {
  const ctx=await getServerOrgContext(request);
  const body=sinClavesDeOrganizacion(await readOrgBody(ctx,request));
  return NextResponse.json({success:true,data:await writeTeamManagement(ctx,body)});
 } catch(error) {return respuestaErrorCrm(error,'POST /api/crm/team-management');}
}
