/** @jest-environment jsdom */
/// <reference types="jest" />
import {fireEvent,screen,waitFor,within} from '@testing-library/react';
import {renderConIdioma,simularAncho} from '@/test-utils/renderConIdioma';
import {CabeceraMovilProvider,useCabeceraMovilActual} from '@/components/shell/header/cabeceraMovil';
import {ObjecionesPage} from '../ObjecionesPage';
import type {Objection} from '@/lib/services/crm/objectionService';
const ID='10000000-0000-4000-8000-000000000001';
const row:Objection={id:ID,organization_id:120,title:'Synthetic active',category:'precio',detection_signals:['Expensive'],recommended_response:'Keep the original response',discovery_questions:[],related_case_studies:null,vertical_id:null,is_active:true,sort_order:0,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'};
let canManage=true;const save=jest.fn(),reload=jest.fn();
jest.mock('../useObjections',()=>({useObjections:()=>({objections:[row,{...row,id:'10000000-0000-4000-8000-000000000002',title:'Synthetic inactive',is_active:false}],loading:false,error:null,canManage,reload,save,toggle:jest.fn()})}));
jest.mock('../useObjectionInsights',()=>({useObjectionInsights:()=>({data:{frequencies:[],weeks:[],calls:[],responses:[{response_text:'Imported response',used_count:1,advanced_count:1}]},loading:false,error:null,reload:jest.fn()})}));
jest.mock('@/components/voice',()=>({useSoftphone:()=>({available:false})}));
jest.mock('@/components/voice/CallLinkPanel',()=>({CallLinkPanel:()=>null}));
function MobileOutlet(){const header=useCabeceraMovilActual();return <section aria-label="Native mobile action outlet">{header?.accion}</section>;}
function renderPage(){return renderConIdioma(<CabeceraMovilProvider><ObjecionesPage/><MobileOutlet/></CabeceraMovilProvider>);}
function openMobileMenu(){fireEvent.click(within(screen.getByRole('region',{name:'Native mobile action outlet'})).getByRole('button'));return screen.getByRole('menu');}
beforeEach(()=>{simularAncho(390);canManage=true;save.mockReset().mockResolvedValue(row);reload.mockReset();});
afterEach(()=>simularAncho(1440));
test('the real mobile header context exposes creation and native status filtering',async()=>{
 renderPage();fireEvent.click(within(openMobileMenu()).getByRole('menuitem',{name:'Nueva objeción'}));expect(await screen.findByRole('dialog',{name:'Nueva objeción'})).toBeTruthy();
 fireEvent.click(within(screen.getByRole('dialog',{name:'Nueva objeción'})).getByRole('button',{name:'Cancelar'}));
 fireEvent.click(within(openMobileMenu()).getByRole('menuitem',{name:'Inactiva'}));
 await waitFor(()=>expect(screen.queryAllByRole('button',{name:'Synthetic active'})).toHaveLength(0));expect(screen.getAllByRole('button',{name:'Synthetic inactive'})).not.toHaveLength(0);
});
test('mobile draft actions save through the existing writer and cannot open the old editor or change status while dirty',async()=>{
 renderPage();fireEvent.click(screen.getAllByRole('button',{name:'Synthetic active'})[0]);fireEvent.click(screen.getByRole('button',{name:'Agregar al borrador de respuesta'}));
 const menu=openMobileMenu();expect(within(menu).getByRole('menuitem',{name:'Editar objeción'}).getAttribute('aria-disabled')).toBe('true');expect(within(menu).getByRole('menuitem',{name:'Desactivar'}).getAttribute('aria-disabled')).toBe('true');
 fireEvent.click(within(menu).getByRole('menuitem',{name:'Guardar cambios'}));
 await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));expect(save).toHaveBeenCalledWith(expect.objectContaining({recommended_response:'Keep the original response\n\nImported response'}),ID);
});
test('a read-only mobile actor can close the inline detail and cannot edit or save',async()=>{
 canManage=false;renderPage();fireEvent.click(screen.getAllByRole('button',{name:'Synthetic active'})[0]);const menu=openMobileMenu();expect(within(menu).queryByRole('menuitem',{name:'Guardar cambios'})).toBeNull();expect(within(menu).queryByRole('menuitem',{name:'Editar objeción'})).toBeNull();
 fireEvent.click(within(menu).getByRole('menuitem',{name:'Cerrar'}));await waitFor(()=>expect(screen.queryByRole('region',{name:'Synthetic active'})).toBeNull());expect(save).not.toHaveBeenCalled();
});
test('mobile exports reuse the catalog export component in the visible content toolbar',()=>{
 const {container}=renderPage();expect(container.querySelector('.lg\\:hidden button')?.textContent).toBe('Exportar');
});
