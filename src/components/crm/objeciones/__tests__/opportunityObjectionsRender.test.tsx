/** @jest-environment jsdom */
/// <reference types="jest" />
import {fireEvent,screen,waitFor} from '@testing-library/react';
import {renderConIdioma,type IdiomaPrueba} from '@/test-utils/renderConIdioma';
import {OpportunityObjectionsBlock} from '../OpportunityObjectionsBlock';
import type {Objection,OpportunityObjection} from '@/lib/services/crm/objectionService';
const objection={id:'10000000-0000-4000-8000-000000000001',organization_id:120,title:'Synthetic concern',category:'precio',detection_signals:[],recommended_response:'Synthetic guidance',discovery_questions:['Synthetic question'],is_active:true,related_case_studies:null,vertical_id:null,sort_order:0,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'} satisfies Objection;
let state:{linked:OpportunityObjection[];catalog:Objection[];loading:boolean;error:unknown;canRegister:boolean;register:jest.Mock;resolve:jest.Mock;reload:jest.Mock};
jest.mock('../useOpportunityObjections',()=>({useOpportunityObjections:()=>state}));
jest.mock('@/components/ui/use-toast',()=>({toast:jest.fn()}));
beforeEach(()=>{state={linked:[],catalog:[objection],loading:false,error:null,canRegister:true,register:jest.fn(async()=> 'link'),resolve:jest.fn(),reload:jest.fn()};});
describe.each<IdiomaPrueba>(['es','en','fr','pt'])('Opportunity objection in %s',idioma=>{
 test('picker labels, recommendation and note are translated; selection calls the same registration flow',async()=>{renderConIdioma(<OpportunityObjectionsBlock opportunityId="route"/>,{idioma});const label={es:'Registrar objeción',en:'Register objection',fr:'Enregistrer l’objection',pt:'Registrar objeção'}[idioma];fireEvent.click(screen.getByRole('button',{name:label}));const dialog=screen.getByRole('dialog');expect(dialog.textContent).toContain('Synthetic guidance');expect(dialog.textContent).not.toContain('crm.objecionesNuevo');fireEvent.change(screen.getByRole('textbox',{name:{es:'Nota (opcional)',en:'Note (optional)',fr:'Note (facultative)',pt:'Nota (opcional)'}[idioma]}),{target:{value:'Synthetic note'}});fireEvent.click(screen.getByRole('option'));await waitFor(()=>expect(state.register).toHaveBeenCalledWith(objection.id,'Synthetic note'));});
 test('permission or initial failure disables registration',()=>{state.canRegister=false;const {container}=renderConIdioma(<OpportunityObjectionsBlock opportunityId="route"/>,{idioma});expect(container.querySelector('button')?.disabled).toBe(true);expect(container.textContent).not.toContain('crm.objecionesNuevo');});
 test('read failure has translated retry, not an invented empty result',()=>{state.error=new Error('down');state.canRegister=false;renderConIdioma(<OpportunityObjectionsBlock opportunityId="route"/>,{idioma});const retry={es:'Reintentar',en:'Retry',fr:'Réessayer',pt:'Tentar novamente'}[idioma];fireEvent.click(screen.getByRole('button',{name:retry}));expect(state.reload).toHaveBeenCalled();});
});
