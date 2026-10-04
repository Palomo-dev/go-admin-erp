import { NextRequest,NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm,sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { simulateAssignment } from '@/lib/services/crm/assignmentSimulationService';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
 try {
  const ctx=await getServerOrgContext(request);
  const input=sinClavesDeOrganizacion(await readOrgBody(ctx,request));
  return NextResponse.json({success:true,data:await simulateAssignment(ctx,input)});
 } catch(error){return respuestaErrorCrm(error,'POST /api/crm/assignment/simulate');}
}
