/** @jest-environment jsdom */
import { fireEvent,screen,waitFor } from '@testing-library/react';
import { renderConIdioma,simularAncho } from '@/test-utils/renderConIdioma';
import { CabeceraMovilProvider,useCabeceraMovilActual,volverCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import type { TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import { EquipoPage } from '../EquipoPage';

const data:TeamManagementData={teams:[],members:[],territories:[],roles:[],people:[],performance:[],ranking:[],current_user:'user',can_manage:true,can_configure:true,can_view_all:true,config:{enabled:true,strategy:'round_robin',team_id:null},config_updated_at:null,period_start:'2026-10-01',period_end:'2026-10-31',timezone:'America/Bogota',base_currency:'USD',without_territory:0,ranking_enabled:true};
jest.mock('../useEquipo',()=>({useEquipo:()=>({data,loading:false,error:null,reload:jest.fn()})}));

const router={back:jest.fn(),push:jest.fn()};
function CabeceraNativa(){
 const pagina=useCabeceraMovilActual();
 return <aside><output aria-label="Título nativo">{pagina?.titulo}</output><output aria-label="Ruta de regreso">{pagina?.volverA}</output><output aria-label="Salida controlada">{pagina?.onVolver?'sí':'no'}</output><button type="button" onClick={()=>volverCabeceraMovil(pagina,5,router,'/app/crm')}>Volver nativo</button></aside>;
}

afterEach(()=>{simularAncho(1440);jest.clearAllMocks();});
test('native back returns from personal performance to teams and replaces the registered header without routing',async()=>{
 simularAncho(390);
 renderConIdioma(<CabeceraMovilProvider><EquipoPage/><CabeceraNativa/></CabeceraMovilProvider>);
 await waitFor(()=>expect(screen.getByLabelText('Título nativo').textContent).toBe('Equipo comercial'));
 for(let attempt=0;attempt<2;attempt++){
  fireEvent.click(screen.getByRole('radio',{name:'Desempeño'}));
  await waitFor(()=>expect(screen.getByLabelText('Título nativo').textContent).toBe('Mi desempeño'));
  expect(screen.getByLabelText('Ruta de regreso').textContent).toBe('/app/crm/equipo');
  expect(screen.getByLabelText('Salida controlada').textContent).toBe('sí');
  fireEvent.click(screen.getByRole('button',{name:'Volver nativo'}));
  await waitFor(()=>expect(screen.getByLabelText('Título nativo').textContent).toBe('Equipo comercial'));
  expect(screen.getByRole('radio',{name:'Equipos'}).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByLabelText('Ruta de regreso').textContent).toBe('');
  expect(screen.getByLabelText('Salida controlada').textContent).toBe('no');
 }
 expect(router.back).not.toHaveBeenCalled();
 expect(router.push).not.toHaveBeenCalled();
});
