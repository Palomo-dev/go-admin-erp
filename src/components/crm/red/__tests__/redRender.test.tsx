/** @jest-environment jsdom */
import {fireEvent,screen} from '@testing-library/react';
import {createTranslator} from 'next-intl';
import {renderConIdioma,simularAncho} from '@/test-utils/renderConIdioma';
import {ReferralTable} from '../../referidos/ReferralTable';
import {PartnerTable} from '../../partners/PartnerTable';
import {RedStats} from '../RedStats';
import {RED_COPY_KEYS} from '../redCopyKeys';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';
import type {ReferralView} from '@/lib/services/crm/referralsService';
import type {PartnerView} from '@/lib/services/crm/partnerService';
jest.mock('@/lib/supabase/config',()=>({supabase:{}}));
jest.mock('@/lib/context/OrganizationTimezoneContext',()=>({useFormatDate:()=>({formatDate:(value:string)=>value.slice(0,10),formatDateTime:(value:string|null)=>value??''})}));
const row = {id:'referral-fixture', referred_name:'Contacto de prueba', referred_email:'contact@example.test', referred_phone:null, status:'qualified', created_at:'2026-10-02T10:00:00Z', program:null, program_id:null, referrer:null, referred:null, opportunity:null, referred_customer_id:null,reward_paid:false} as ReferralView;
const partner = {id:'partner-fixture',name:'Consultor de prueba',email:'partner@example.test',tier:null,effective_rate:10,deals_count:0,commissions:{outstanding:0,paid:0,count:0},commissions_currency:null,currency_mixed:false,is_active:true,revenue:null} as PartnerView;
let errors:jest.SpyInstance;
beforeEach(()=>{simularAncho(1440); errors=jest.spyOn(console,'error').mockImplementation(()=>undefined);});
afterEach(()=>{const intl=errors.mock.calls.map(x=>String(x[0]?.message??x[0])).filter(x=>/MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(x)); errors.mockRestore(); expect(intl).toEqual([]);});
test.each(['es','en','fr','pt'] as const)('tablas, permisos y toda la copia se resuelven con Intl real en %s', idioma => {
  const messages={es,en,fr,pt}[idioma];const t=createTranslator({locale:idioma,messages:messages.crm.red as Record<string,string>});
  for(const key of Object.values(RED_COPY_KEYS)) expect(t(key,{p0:'Dato',p1:'Otro',p2:'',count:2,type:'Tipo',amount:' 15',note:'',recipient:'Persona'})).toBeTruthy();
  const onConvert=jest.fn();
  const base={rows:[row],total:1,page:1,size:25,onPage:jest.fn(),onSize:jest.fn(),currency:'COP',canManage:false,canRegister:false,busyId:null,onTransition:jest.fn(),onReject:jest.fn(),onConvert,onPay:jest.fn()};
  const view=renderConIdioma(<><ReferralTable {...base}/><PartnerTable rows={[partner]} tiers={[]} order={null} onSort={jest.fn()} total={1} page={1} size={25} onPage={jest.fn()} onSize={jest.fn()} canManage={false} canRegister={false} onEdit={jest.fn()} onDeals={jest.fn()} onDelete={jest.fn()}/></>,{idioma});
  expect(screen.getByRole('columnheader',{name:t(RED_COPY_KEYS['Referido'])})).toBeTruthy();
  expect(screen.queryByRole('button',{name:t(RED_COPY_KEYS['Convertir en lead'])})).toBeNull();
  expect(screen.queryByRole('button',{name:t(RED_COPY_KEYS['Eliminar partner'])})).toBeNull();
  view.unmount();
  renderConIdioma(<ReferralTable {...base} canRegister/>,{idioma});
  fireEvent.click(screen.getAllByRole('button',{name:t(RED_COPY_KEYS['Convertir en lead'])})[0]);
  expect(onConvert).toHaveBeenCalledTimes(1);expect(onConvert).toHaveBeenCalledWith(row);
});
test('tasas ausentes no presentan una suma parcial como comisión total',()=>{
  renderConIdioma(<RedStats kind="partners" loading={false} error={null} stats={{period:'year',start:'2026-01-01',end:'2027-01-01',timezone:'America/Bogota',base_currency:'COP',counts:{active:1,deals:2},currency_missing:false,commissions:{pending:{base:'COP',total:500,cantidad:2,grupos:[],convertidas:[],sinTasa:[{moneda:'USD',monto:200,cantidad:1,fechaTasa:null,tasa:null,convertido:null}]},paid:null}}}/>);
  expect(screen.queryByText(/500/)).toBeNull();expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
});
