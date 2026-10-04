/// <reference types="jest" />
import type {SupabaseClient} from '@supabase/supabase-js';
import {readObjectionInsights,mineObjectionResponses} from '../objectionInsightsService';
import type {CrmSesion} from '../crmRouteSupport';
jest.mock('@/lib/services/organizationTimezoneService',()=>({getOrganizationTimezone:jest.fn(async()=>'America/Bogota')}));
const ID='10000000-0000-4000-8000-000000000001';const empty={frequencies:[],weeks:[],calls:[],responses:[]};
const rpc=jest.fn(),ctx={organizationId:120,userId:ID,roleId:3,isSuperAdmin:false,supabase:{rpc}} as unknown as CrmSesion;
beforeEach(()=>{rpc.mockReset().mockResolvedValue({data:empty,error:null});jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-02T02:00:00Z'));});afterEach(()=>jest.useRealTimers());
test('90-day boundary comes from organization day, not host UTC; ordinary members need no invented calls permission',async()=>{
 expect(await readObjectionInsights(ctx,ID)).toEqual(empty);expect(rpc).toHaveBeenCalledWith('crm_objection_frequency',{p_org:120,p_since:expect.any(String),p_timezone:'America/Bogota',p_objection:ID});expect(Date.parse(rpc.mock.calls[0][1].p_since)).toBe(Date.parse('2026-07-03T05:00:00Z'));
});
test('source failure cannot become zero-frequency success',async()=>{const error={code:'08006',message:'connection_lost'};rpc.mockResolvedValue({data:null,error});await expect(readObjectionInsights(ctx)).rejects.toBe(error);});
test('malformed counts or missing result fail rather than displaying invented numbers',async()=>{rpc.mockResolvedValue({data:{...empty,frequencies:[{objection_id:ID,call_count:-1,advanced_count:0,opportunity_count:0,advanced_opportunity_count:0}]},error:null});await expect(readObjectionInsights(ctx)).rejects.toThrow();});
test('invalid catalog UUID does not perform I/O',async()=>{await expect(readObjectionInsights(ctx,'bad')).rejects.toMatchObject({status:400});expect(rpc).not.toHaveBeenCalled();});
function miner(...pages:unknown[]){const mock=jest.fn();pages.forEach(page=>mock.mockReturnValueOnce({abortSignal:()=>Promise.resolve(page)}));return{mock,sb:{rpc:mock} as unknown as SupabaseClient};}
test('mining pages with cursor through the canonical RPC, without provider calls',async()=>{const {mock,sb}=miner({data:{processed:100,written:2,next:ID},error:null},{data:{processed:1,written:1,next:ID},error:null});const signal=new AbortController().signal;expect(await mineObjectionResponses(sb,120,'since',signal,1000)).toEqual({processed:101,written:3,truncated:false});expect(mock.mock.calls[1][1]).toMatchObject({p_org:120,p_after:ID,p_limit:100});});
test('abort or exhausted budget is explicitly incomplete, with no RPC',async()=>{const {mock,sb}=miner();const aborted=new AbortController();aborted.abort();expect(await mineObjectionResponses(sb,120,'since',aborted.signal,1000)).toEqual({processed:0,written:0,truncated:true});expect(await mineObjectionResponses(sb,120,'since',new AbortController().signal,0)).toEqual({processed:0,written:0,truncated:true});expect(mock).not.toHaveBeenCalled();});
test('mining error and a stuck cursor propagate',async()=>{const error={message:'down'};const failed=miner({data:null,error});await expect(mineObjectionResponses(failed.sb,120,'since',new AbortController().signal,1000)).rejects.toBe(error);const stuck=miner({data:{processed:100,written:0,next:ID},error:null},{data:{processed:100,written:0,next:ID},error:null});await expect(mineObjectionResponses(stuck.sb,120,'since',new AbortController().signal,1000)).rejects.toThrow('cursor_mineria_invalido');});
