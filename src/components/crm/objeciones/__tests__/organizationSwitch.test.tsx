/** @jest-environment jsdom */
/// <reference types="jest" />
import {act,renderHook,waitFor} from '@testing-library/react';
import {useObjections} from '../useObjections';
import {useOpportunityObjections} from '../useOpportunityObjections';
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const response=(data:unknown,extra:Record<string,unknown>={})=>({ok:true,json:async()=>({data,...extra})}) as Response;
const row=(id:string)=>({id,organization_id:id==='old'?120:121,title:id,category:'precio',detection_signals:[],discovery_questions:[]});
let originalFetch:typeof fetch;beforeEach(()=>originalFetch=global.fetch);afterEach(()=>global.fetch=originalFetch);
test('old-organization read rejection cannot replace the new loaded list with an error',async()=>{
 const old=deferred<Response>();global.fetch=jest.fn().mockReturnValueOnce(old.promise).mockResolvedValue(response([row('new')],{canManage:true}));const {result}=renderHook(()=>useObjections());
 act(()=>window.dispatchEvent(new Event('organization-changed')));await waitFor(()=>expect(result.current.objections[0]?.id).toBe('new'));await act(async()=>old.reject(new Error('old request failed')));expect(result.current.error).toBeNull();expect(result.current.objections[0].id).toBe('new');
});
test('late catalog mutation does not insert an old organization row into the new list',async()=>{
 const write=deferred<Response>();global.fetch=jest.fn().mockResolvedValueOnce(response([row('old')],{canManage:true})).mockReturnValueOnce(write.promise).mockResolvedValue(response([row('new')],{canManage:true}));const {result}=renderHook(()=>useObjections());await waitFor(()=>expect(result.current.objections[0]?.id).toBe('old'));
 let saved!:Promise<unknown>;act(()=>{saved=result.current.save({title:'old',category:'precio'},'old');window.dispatchEvent(new Event('organization-changed'));});await waitFor(()=>expect(result.current.objections[0]?.id).toBe('new'));await act(async()=>{write.resolve(response(row('old')));await saved;});expect(result.current.objections.map(row=>row.id)).toEqual(['new']);
});
test('opportunity links and catalog start concurrently and reject stale tenant results',async()=>{
 const oldLinks=deferred<Response>(),oldCatalog=deferred<Response>();global.fetch=jest.fn().mockReturnValueOnce(oldLinks.promise).mockReturnValueOnce(oldCatalog.promise).mockResolvedValue(response([],{canRegister:false}));const {result}=renderHook(()=>useOpportunityObjections('opportunity'));expect(global.fetch).toHaveBeenCalledTimes(2);
 act(()=>window.dispatchEvent(new Event('organization-changed')));await waitFor(()=>expect(result.current.loading).toBe(false));await act(async()=>{oldLinks.resolve(response([{id:'old-link'}],{canRegister:true}));oldCatalog.resolve(response([row('old')]));});expect(result.current.linked).toEqual([]);expect(result.current.catalog).toEqual([]);expect(result.current.canRegister).toBe(false);
});
