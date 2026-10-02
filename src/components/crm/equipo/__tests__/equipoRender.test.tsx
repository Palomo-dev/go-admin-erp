/** @jest-environment jsdom */
import { fireEvent,screen } from '@testing-library/react';
import { renderConIdioma,type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { EquipoPage } from '../EquipoPage';
import { AsignarTab } from '../tabs/AsignarTab';
import { PerformanceTab } from '../tabs/PerformanceTab';
import { ErrorApiCrm } from '../../acciones/apiCrm';
import type { TeamManagementData } from '@/lib/services/crm/teamManagementModel';
jest.mock('@/components/shell/header/cabeceraMovil',()=>({useCabeceraMovil:()=>undefined}));
jest.mock('../apiEquipo',()=>({readEquipo:jest.fn(),saveEquipo:jest.fn(),simulateEquipo:jest.fn()}));
let state:{data:TeamManagementData|null;loading:boolean;error:unknown;reload:jest.Mock};
jest.mock('../useEquipo',()=>({useEquipo:()=>state}));
const data=():TeamManagementData=>({teams:[],members:[],territories:[],roles:[],people:[],performance:[],ranking:[],current_user:'user',can_manage:true,can_configure:true,can_view_all:true,config:{enabled:true,strategy:'round_robin',team_id:null},config_updated_at:null,period_start:'2026-10-01',period_end:'2026-10-31',timezone:'America/Bogota',base_currency:'USD',without_territory:0,ranking_enabled:true});
beforeEach(()=>{state={data:data(),loading:false,error:null,reload:jest.fn()};});
describe.each<IdiomaPrueba>(['es','en','fr','pt'])('Equipo in %s',idioma=>{
 test('empty team offers a working creation dialog with translated fields',()=>{const {container}=renderConIdioma(<EquipoPage/>,{idioma});expect(container.textContent).not.toContain('crm.equipoNuevo');const buttons=container.querySelectorAll('button');const create=[...buttons].find((button)=>button.textContent===({es:'Nuevo equipo',en:'New team',fr:'Nouvelle équipe',pt:'Nova equipe'}[idioma]));expect(create).toBeTruthy();fireEvent.click(create!);expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('textbox',{name:new RegExp('^'+({es:'Nombre',en:'Name',fr:'Nom',pt:'Nome'}[idioma]))})).toBeTruthy();expect(container.textContent).not.toContain('crm.equipoNuevo');});
 test.each(['loading','error','forbidden'])('%s state has no mutation controls',mode=>{state={data:null,loading:mode==='loading',error:mode==='loading'?null:new ErrorApiCrm(mode==='forbidden'?403:500,'fixture','fixture'),reload:jest.fn()};const {container}=renderConIdioma(<EquipoPage/>,{idioma});expect(container.textContent).not.toContain('crm.equipoNuevo');expect(container.querySelectorAll('button')).toHaveLength(mode==='error'?5:4);});
 test('a seller sees percentages in ranking and no other seller amount',()=>{const fixture=data();fixture.can_view_all=false;fixture.performance=[{user_id:'user',name:'Me',won:105,currency:'USD',calls:3,meetings:2,won_count:1,lost_count:1,cycle_days:10,conversion:50,quota_pct:105,money_missing:false}];fixture.ranking=[{user_id:'other',name:'Other',quota_pct:200},{user_id:'user',name:'Me',quota_pct:105}];const {container}=renderConIdioma(<PerformanceTab data={fixture}/>,{idioma});expect(container.textContent).toContain('105');expect(container.textContent).toContain('200%');expect(container.textContent).not.toContain('crm.equipoNuevo');expect(container.textContent).not.toContain('999');});
 test('territory assignment is disabled until an active territory exists',()=>{const {container}=renderConIdioma(<AsignarTab data={data()} onSaved={jest.fn()}/>,{idioma});const radios=container.querySelectorAll('input[type="radio"]');expect(radios).toHaveLength(3);expect(radios[1].hasAttribute('disabled')).toBe(true);expect(container.textContent).not.toContain('crm.equipoNuevo');});
 test('configuration actions are disabled for a nonadministrator',()=>{const fixture=data();fixture.can_configure=false;const {container}=renderConIdioma(<AsignarTab data={fixture} onSaved={jest.fn()}/>,{idioma});expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(3);for(const radio of container.querySelectorAll('input[type="radio"]'))expect(radio.hasAttribute('disabled')).toBe(true);expect(container.querySelector('select')?.hasAttribute('disabled')).toBe(true);});
});
