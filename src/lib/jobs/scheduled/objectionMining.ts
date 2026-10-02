import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobLogger } from '../types';
import { listCrmActiveOrgIds } from '../scheduledOrgs';
import { mineObjectionResponses } from '@/lib/services/crm/objectionInsightsService';
export async function runObjectionMining(sb:SupabaseClient,log:JobLogger,signal:AbortSignal,opts:{budgetMs:number}){
 const deadline=Date.now()+Math.max(0,opts.budgetMs);if(signal.aborted||opts.budgetMs<=0)return{processed:0,written:0,pending_org_ids:[],errors:[]};const selected=await listCrmActiveOrgIds(sb);if(selected.error)throw new Error(selected.error);const ids=selected.orgIds;
 let processed=0,written=0;const errors:{organization_id:number;error:string}[]=[],pending:number[]=[];
 const since=new Date(Date.now()-90*24*60*60*1000).toISOString();
 for(let index=0;index<ids.length;index++){
  if(signal.aborted||Date.now()>=deadline){pending.push(...ids.slice(index));break;}
  try{const result=await mineObjectionResponses(sb,ids[index],since,signal,deadline-Date.now());processed+=result.processed;written+=result.written;if(result.truncated)pending.push(ids[index]);}
  catch(error){errors.push({organization_id:ids[index],error:error instanceof Error?error.message:'mining_failed'});}
 }
 log.info('objection_mining_finished',{processed,written,pending_org_ids:pending,errors});
 return{processed,written,pending_org_ids:pending,errors};
}
