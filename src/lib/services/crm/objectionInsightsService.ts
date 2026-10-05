import { z } from 'zod';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { addDaysPlain } from './quotaProgress';
import { plainDateToInstant,todayInTz } from '@/lib/utils/dateDisplay';
import { exigirUuid } from './crmErrors';
import type { CrmSesion } from './crmRouteSupport';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ObjectionInsights {
 frequencies:{objection_id:string;call_count:number;advanced_count:number;opportunity_count:number;advanced_opportunity_count:number}[];
 weeks:{week:string;call_count:number}[];
 calls:{call_id:string;started_at:string;advanced:boolean;start_ms:number|null;customer_name:string;seller_name:string}[];
 responses:{response_text:string;used_count:number;advanced_count:number}[];
}
const counter=z.number().int().nonnegative();
const insightsSchema=z.object({
 frequencies:z.array(z.object({objection_id:z.string().uuid(),call_count:counter,advanced_count:counter,opportunity_count:counter,advanced_opportunity_count:counter})),
 weeks:z.array(z.object({week:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),call_count:counter})),
 calls:z.array(z.object({call_id:z.string().uuid(),started_at:z.string(),advanced:z.boolean(),start_ms:counter.nullable(),customer_name:z.string(),seller_name:z.string()})),
 responses:z.array(z.object({response_text:z.string(),used_count:counter,advanced_count:counter})),
});
export async function readObjectionInsights(ctx:CrmSesion,id:string|null=null):Promise<ObjectionInsights> {
 if(id)exigirUuid(id,'id');
 const timezone=await getOrganizationTimezone(ctx.organizationId,ctx.supabase);
 const since=plainDateToInstant(addDaysPlain(todayInTz(timezone),-90),timezone,'00:00');
 const {data,error}=await ctx.supabase.rpc('crm_objection_frequency',{p_org:ctx.organizationId,p_since:since,p_timezone:timezone,p_objection:id});
 if(error)throw error;
 return insightsSchema.parse(data);
}
/** A bounded, idempotent local mining job. No external AI or billable provider. */
export async function mineObjectionResponses(sb:SupabaseClient,org:number,since:string,signal:AbortSignal,budgetMs:number) {
 const deadline=Date.now()+Math.max(0,budgetMs);let cursor:string|null=null,processed=0,written=0;
 while(!signal.aborted&&Date.now()<deadline){
  const {data,error}=await sb.rpc('crm_objection_mine',{p_org:org,p_since:since,p_after:cursor,p_limit:100}).abortSignal(signal);
  if(error)throw error;
  const result=z.object({processed:counter.max(100),written:counter,next:z.string().uuid().nullable()}).parse(data);
  processed+=result.processed;written+=result.written;
  if(result.processed<100)return{processed,written,truncated:false};
  if(!result.next||result.next===cursor)throw new Error('cursor_mineria_invalido');
  cursor=result.next;
 }
 return{processed,written,truncated:true};
}
