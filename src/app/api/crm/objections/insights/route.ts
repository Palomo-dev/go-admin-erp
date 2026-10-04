import { NextResponse } from 'next/server';
import { getServerOrgContext,readOrgBody } from '@/lib/utils/orgContext';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { readObjectionInsights } from '@/lib/services/crm/objectionInsightsService';
export async function GET(request:Request){
 try{
  const ctx=await getServerOrgContext(request);readOrgBody(ctx,{}, {request});
  const id=new URL(request.url).searchParams.get('id');
  return NextResponse.json({success:true,data:await readObjectionInsights(ctx,id)});
 }catch(error){return respuestaErrorCrm(error,'objections.insights');}
}
