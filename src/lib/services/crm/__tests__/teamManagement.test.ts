jest.mock('@/lib/utils/orgContext',()=>({hasOrgAdminOrPermission:jest.fn(async()=>true),OrgContextError:jest.requireActual('@/lib/utils/orgContextError').OrgContextError}));
jest.mock('@/lib/supabase/server-service',()=>({getServiceClient:jest.fn()}));
jest.mock('@/lib/services/organizationTimezoneService',()=>({getOrganizationTimezone:jest.fn(async()=>'America/Bogota')}));
jest.mock('@/lib/services/monedaOrganizacion',()=>({resolverContextoMoneda:jest.fn(async()=>({code:'USD',decimals:2,locale:'en'}))}));
import { buildTeamData,writeTeamManagement,teamMutationSchema,readTerritoryCounts,readTeamManagement } from '../teamManagementService';
import { matchingTerritories } from '../territoryAssignment';
import { simulateAssignment } from '../assignmentSimulationService';
import { fakeSupabase,makeDb,seed,U,ORG,OTHER,TEAM,VENDEDOR_A,VENDEDOR_B } from './leadAssignmentFake';
import { getServiceClient } from '@/lib/supabase/server-service';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
const ctx=(client:unknown)=>({organizationId:ORG,userId:VENDEDOR_A,roleId:2,isSuperAdmin:false,supabase:client as never});
const territory=(id:string,order:number,criteria:Record<string,unknown>)=>({id,name:id,sort_order:order,criteria});
const filter={op:'and',rules:[{field:'customer.city',operator:'eq',value:'Bogotá'}]};
afterEach(()=>jest.clearAllMocks());
describe('one canonical territory evaluator',()=>{
 it('uses Segment DSL and first order rather than ICP fit score or name',()=>{
  const rows=[territory(U(3),20,{filter}),territory(U(2),0,{filter})];
  expect(matchingTerritories(rows,{city:'Bogotá'},{},ORG,new Date()).map((row)=>row.id)).toEqual([U(2),U(3)]);
 });
 it('preserves legacy ICP rules while ordering them with new territories',()=>{
  const rows=[territory(U(1),0,{rules:[{field_key:'customers.city',operator:'eq',value:'Bogotá'}]}),territory(U(2),1,{filter})];
  expect(matchingTerritories(rows,{city:'Bogotá'},{},ORG,new Date())).toHaveLength(2);
 });
 it('does not treat an empty territory as matching everyone',()=>expect(matchingTerritories([territory(U(1),0,{filter:{op:'and',rules:[]}})],{},{},ORG,new Date())).toHaveLength(0));
});
describe('monthly quotas, currency and seller privacy',()=>{
 const raw=()=>({teams:[{id:TEAM,is_active:true}],members:[{id:U(2),sales_team_id:TEAM,user_id:VENDEDOR_A,name:'One',sales_role_id:null,role_name:null,territory_id:null,is_active:true,updated_at:'2026-10-01T00:00:00Z',quota_amount:100,quota_currency:'USD'},{id:U(3),sales_team_id:TEAM,user_id:VENDEDOR_B,name:'Two',sales_role_id:null,role_name:null,territory_id:null,is_active:true,updated_at:'2026-10-01T00:00:00Z',quota_amount:100,quota_currency:'USD'}],territories:[],roles:[],people:[{id:VENDEDOR_A,name:'One'},{id:VENDEDOR_B,name:'Two'}],won:[{salesperson_id:VENDEDOR_A,amount:420000,currency:'COP',closed_at:'2026-10-01T04:30:00Z'},{salesperson_id:VENDEDOR_B,amount:999,currency:'USD',closed_at:'2026-10-02T12:00:00Z'}],metrics:[VENDEDOR_A,VENDEDOR_B].map((user_id)=>({user_id,calls:3,meetings:2,won_count:1,lost_count:1,cycle_days:10})),assignment:null,ranking_enabled:true,rates:[{base_currency:'USD',target_currency:'COP',rate:4000,effective_date:'2026-09-30'},{base_currency:'USD',target_currency:'COP',rate:1,effective_date:'2026-10-01'}]});
 const options={user:VENDEDOR_A,canViewAll:false,canManage:false,canConfigure:false,today:'2026-10-02',timezone:'America/Bogota',currency:'USD'};
 it('uses the closing day in organization timezone, historical inverse FX and a raw quota of105%',()=>{
  const result=buildTeamData(raw() as never,options);expect(result.performance[0].won).toBe(105);expect(result.members[0].quota_pct).toBe(105);expect(result.performance[0].conversion).toBe(50);
 });
 it('returns own performance and only percentages for other sellers',()=>{
  const result=buildTeamData(raw() as never,options);expect(result.performance).toHaveLength(1);expect(result.members[1].quota_amount).toBeNull();expect(result.members[1].achieved).toBeNull();expect(result.ranking[0]).toEqual({user_id:VENDEDOR_B,name:'Two',quota_pct:999});expect(result.ranking[0]).not.toHaveProperty('won');
 });
 it('missing conversion cannot masquerade as0% or a partial won total',()=>{const snapshot=raw();snapshot.rates=[];const result=buildTeamData(snapshot as never,options);expect(result.performance[0]).toMatchObject({won:null,quota_pct:null,money_missing:true});});
 it('returns a true aggregate average with no individual identifiers beyond the seller own row',()=>{const result=buildTeamData(raw() as never,options);expect(result.performance).toHaveLength(1);expect(result.performance_average).toMatchObject({won:552,calls:3,meetings:2,conversion:50});expect(result.performance_average).not.toHaveProperty('user_id');});
 it('respects the organization ranking opt-out',()=>{const snapshot=raw();snapshot.ranking_enabled=false;expect(buildTeamData(snapshot as never,options).ranking).toEqual([]);});
});
describe('read-only simulation',()=>{
 it('rotates50 unowned leads through the real engine, excluding foreign/inactive sellers, with zero writes',async()=>{
  const db=makeDb(seed());db.tables.customers=[];
  for(let index=0;index<50;index++)db.tables.customers.push({id:U(1000+index),organization_id:ORG,status:'active',lifecycle_stage:'lead',lead_source:'manual',owner_id:null,lead_discarded_at:null,created_at:`2026-10-01T12:${String(index).padStart(2,'0')}:00Z`});
  db.tables.customers.push({id:U(2000),organization_id:OTHER,status:'active',lead_source:'manual',owner_id:null});
  const client=fakeSupabase(db);const rpc=client.rpc;
  client.rpc=((name:string,args:Record<string,unknown>)=>name==='crm_segment_context_page'?Promise.resolve({data:db.tables.customers.filter((row)=>row.organization_id===args.p_org&&(args.p_customers as string[]).includes(row.id as string)),error:null}):rpc(name,args)) as typeof rpc;
  const result=await simulateAssignment(ctx(client),{enabled:true,strategy:'round_robin',team_id:TEAM});
  expect(result.sample_count).toBe(50);expect(result.distribution.map((row)=>row.proposed).sort()).toEqual([25,25]);expect(db.writes).toEqual([]);
 });
 it('keeps a manually assigned owner and performs no mutation',async()=>{const db=makeDb(seed());db.tables.customers=[{id:U(600),organization_id:ORG,status:'active',lead_source:'manual',owner_id:VENDEDOR_B,lead_discarded_at:null}];const result=await simulateAssignment(ctx(fakeSupabase(db)),{enabled:true,strategy:'round_robin',team_id:TEAM});expect(result.preserved).toBe(1);expect(result.distribution[0]).toMatchObject({user_id:VENDEDOR_B,current:1,proposed:1});expect(db.writes).toEqual([]);});
 it('a failed source is an error, never an empty simulation',async()=>{const db=makeDb(seed());db.errors['customers:select']={message:'unavailable'};await expect(simulateAssignment(ctx(fakeSupabase(db)),{enabled:true,strategy:'round_robin',team_id:TEAM})).rejects.toMatchObject({message:'unavailable'});});
});
describe('tenant, permission, body and optimistic write contracts',()=>{
 it('allows a custom admin.full_access role to configure assignment via the canonical permission',async()=>{const rpc=jest.fn(async()=>({data:{enabled:true},error:null}));await expect(writeTeamManagement({...ctx({rpc}),roleId:9},{kind:'assignment',id:null,expected_updated_at:null,data:{enabled:true,strategy:'round_robin',team_id:null}})).resolves.toEqual({enabled:true});expect(hasOrgAdminOrPermission).toHaveBeenCalledWith(expect.objectContaining({roleId:9}));expect(rpc).toHaveBeenCalledTimes(1);});
 it('denies assignment configuration when the canonical admin permission is absent',async()=>{jest.mocked(hasOrgAdminOrPermission).mockResolvedValueOnce(true).mockResolvedValueOnce(false);const rpc=jest.fn();await expect(writeTeamManagement({...ctx({rpc}),roleId:9},{kind:'assignment',id:null,expected_updated_at:null,data:{enabled:true,strategy:'round_robin',team_id:null}})).rejects.toMatchObject({status:403});expect(rpc).not.toHaveBeenCalled();});
 it('the snapshot exposes custom admin configuration only with canonical permission',async()=>{const rpc=jest.fn(async()=>({data:{teams:[],members:[],territories:[],roles:[],people:[],won:[],metrics:[],assignment:null,ranking_enabled:false,rates:[]},error:null}));jest.mocked(getServiceClient).mockReturnValue({rpc} as never);const data=await readTeamManagement({...ctx({}),roleId:9});expect(data.can_configure).toBe(true);expect(hasOrgAdminOrPermission).toHaveBeenCalledWith(expect.objectContaining({roleId:9}));});
 it('requires permission before any RPC',async()=>{jest.mocked(hasOrgAdminOrPermission).mockResolvedValueOnce(false);const rpc=jest.fn();await expect(writeTeamManagement(ctx({rpc}),{})).rejects.toMatchObject({statusCode:403});expect(rpc).not.toHaveBeenCalled();});
 it('rejects stale edits without a version and unexpected fields',async()=>{const input={kind:'team',id:U(2),expected_updated_at:null,data:{name:'One',description:null,territory_id:null,is_active:true}};const rpc=jest.fn();await expect(writeTeamManagement(ctx({rpc}),input)).rejects.toMatchObject({code:'version_requerida'});expect(teamMutationSchema.safeParse({...input,data:{...input.data,organization_id:OTHER}}).success).toBe(false);expect(rpc).not.toHaveBeenCalled();});
 it('sends session actor/org and preserves RPC conflicts',async()=>{const rpc=jest.fn(async()=>({data:null,error:{code:'40001',message:'conflicto_version'}}));await expect(writeTeamManagement(ctx({rpc}),{kind:'team',id:U(2),expected_updated_at:'2026-10-01T00:00:00Z',data:{name:'One',description:null,territory_id:null,is_active:true}})).rejects.toMatchObject({code:'40001'});expect(rpc).toHaveBeenCalledWith('crm_team_management_write',expect.objectContaining({p_org:ORG,p_actor:VENDEDOR_A}));});
 it('territory counts cannot turn a failed page into zero customers',async()=>{const rpc=jest.fn(async()=>({data:null,error:{message:'unavailable'}}));await expect(readTerritoryCounts(ctx({rpc}),[])).rejects.toMatchObject({message:'unavailable'});});
});
