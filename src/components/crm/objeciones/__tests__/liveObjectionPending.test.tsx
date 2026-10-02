/** @jest-environment jsdom */
/// <reference types="jest" />
import {act,fireEvent,screen,waitFor} from '@testing-library/react';
import {renderConIdioma} from '@/test-utils/renderConIdioma';
import {LiveObjectionContext} from '../LiveObjectionContext';
import {pedirCrm} from '../../acciones/apiCrm';
import type {Objection} from '@/lib/services/crm/objectionService';
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',OP='20000000-0000-4000-8000-000000000001';
let phone:Record<string,unknown>;
jest.mock('@/components/voice',()=>({useSoftphone:()=>phone}));
jest.mock('@/components/voice/CallLinkPanel',()=>({CallLinkPanel:()=>null}));
jest.mock('../../acciones/apiCrm',()=>({...jest.requireActual('../../acciones/apiCrm'),pedirCrm:jest.fn()}));
const rows:Objection[]=[{id:A,title:'Objection A',category:'precio',detection_signals:[],discovery_questions:[],recommended_response:'Response A',is_active:true},{id:B,title:'Objection B',category:'confianza',detection_signals:[],discovery_questions:[],recommended_response:'Response B',is_active:true}].map(row=>({...row,organization_id:120,related_case_studies:null,vertical_id:null,sort_order:0,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}));
function deferred(){let resolve!:(value:unknown)=>void,reject!:(error:unknown)=>void;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function search(text:string){fireEvent.change(screen.getByRole('searchbox'),{target:{value:text}});}
beforeEach(()=>{phone={available:true,callStatus:'connected',activeCallId:'call-a',activeCall:{callSid:'sid-a',number:'+000',connectedAt:Date.now(),opportunityId:OP}};jest.mocked(pedirCrm).mockReset();});
test('registering A, selecting B and returning to pending A cannot duplicate A or mark B as registered',async()=>{
 const request=deferred();jest.mocked(pedirCrm).mockReturnValue(request.promise as ReturnType<typeof pedirCrm>);renderConIdioma(<LiveObjectionContext objections={rows}/>);
 search('Objection A');fireEvent.click(screen.getByRole('button',{name:'Registrar objeción'}));search('Objection B');search('Objection A');
 const button=screen.getByRole('button',{name:'Registrar objeción'});expect(button.hasAttribute('disabled')).toBe(true);fireEvent.click(button);expect(pedirCrm).toHaveBeenCalledTimes(1);
 search('Objection B');await act(async()=>request.resolve({data:{},extra:{}}));expect(screen.queryByRole('button',{name:'Objeción registrada'})).toBeNull();expect(screen.getByText('Response B')).toBeTruthy();expect(screen.getByRole('button',{name:'Registrar objeción'}).hasAttribute('disabled')).toBe(false);
 expect(pedirCrm).toHaveBeenCalledWith(`/api/crm/objections/opportunity/${OP}`,{method:'POST',cuerpo:{objection_id:A}});
});
test('changing call, visible catalog row or linked opportunity cannot carry the previous registration state',async()=>{
 const request=deferred();jest.mocked(pedirCrm).mockReturnValue(request.promise as ReturnType<typeof pedirCrm>);const view=renderConIdioma(<LiveObjectionContext objections={rows}/>);fireEvent.click(screen.getByRole('button',{name:'Registrar objeción'}));
 phone={...phone,activeCallId:'call-b',activeCall:{callSid:'sid-b',number:'+000',connectedAt:Date.now(),opportunityId:OP}};view.rerender(<LiveObjectionContext objections={rows}/>);
 await act(async()=>request.resolve({data:{},extra:{}}));expect(screen.queryByRole('button',{name:'Objeción registrada'})).toBeNull();expect(screen.getByRole('button',{name:'Registrar objeción'}).hasAttribute('disabled')).toBe(false);expect(pedirCrm).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Registrar objeción'}));await screen.findByRole('button',{name:'Objeción registrada'});
 view.rerender(<LiveObjectionContext objections={[rows[1]]}/>);expect(screen.queryByRole('button',{name:'Objeción registrada'})).toBeNull();expect(screen.getByText('Response B')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Registrar objeción'}));await screen.findByRole('button',{name:'Objeción registrada'});
 phone={...phone,activeCall:{callSid:'sid-b',number:'+000',connectedAt:Date.now(),opportunityId:'20000000-0000-4000-8000-000000000002'}};view.rerender(<LiveObjectionContext objections={[rows[1]]}/>);
 expect(screen.queryByRole('button',{name:'Objeción registrada'})).toBeNull();expect(screen.getByRole('button',{name:'Registrar objeción'}).hasAttribute('disabled')).toBe(false);expect(pedirCrm).toHaveBeenCalledTimes(3);
});
test('an old failure after an organization change is ignored without aborting or repeating the POST',async()=>{
 const request=deferred();jest.mocked(pedirCrm).mockReturnValue(request.promise as ReturnType<typeof pedirCrm>);renderConIdioma(<LiveObjectionContext objections={rows}/>);fireEvent.click(screen.getByRole('button',{name:'Registrar objeción'}));act(()=>window.dispatchEvent(new Event('organization-changed')));
 await act(async()=>request.reject(new Error('previous organization')));await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());expect(pedirCrm).toHaveBeenCalledTimes(1);expect(jest.mocked(pedirCrm).mock.calls[0][1]).toEqual({method:'POST',cuerpo:{objection_id:A}});
});
