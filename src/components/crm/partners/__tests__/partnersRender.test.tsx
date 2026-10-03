/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderConIdioma, type IdiomaPrueba } from "@/test-utils/renderConIdioma";
import { PartnersPage } from "../PartnersPage";
import { RegisterDealDialog } from "../RegisterDealDialog";
import type { RegisterDealResult, PartnerView } from "@/lib/services/crm/partnerService";
const id="11111111-1111-4111-8111-111111111111";
const partner={id,name:"Partner de prueba",company_name:null,email:"persona@example.test",phone:null,tier_id:null,tier:null,commission_rate:10,effective_rate:10,is_active:true,organization_id:120,created_at:"2026-10-01T12:00:00Z",deals_count:0,commissions:{count:0,pending:0,approved:0,paid:0,rejected:0,outstanding:0},commissions_currency:"USD",currency_mixed:false,revenue:null} as PartnerView;
const reload=jest.fn(),save=jest.fn();
let phase="empty";
jest.mock("next/navigation",()=>({useRouter:()=>({push:jest.fn()}),usePathname:()=>"/app/crm/partners"}));
jest.mock("@/components/shell/header/cabeceraMovil",()=>({useCabeceraMovil:()=>undefined}));
jest.mock("@/lib/context/OrganizationTimezoneContext",()=>({useFormatDate:()=>({formatDate:()=>"01/01/2026",getToday:()=>"2026-10-02",formatDateTime:()=>"02/10/2026 12:00"}),useOrgTimezone:()=>({timezone:"America/Bogota"})}));
jest.mock("../usePartners",()=>({usePartners:()=>({partners:[],tiers:[],canManage:true,canRegister:true,stats:{counts:{total:99,active:99,deals:99},start:"2026-01-01T05:00:00Z"},statsError:null,loading:phase==="loading",loaded:phase!=="error",error:phase==="error"?"Error de lectura":null,reload,savePartner:save,deletePartner:save,saveTier:save,deleteTier:save,loadDeals:save,registerDeal:save,transitionDeal:save})}));
jest.mock("@/components/crm/automatizaciones/useOpportunitySearch",()=>({useOpportunitySearch:()=>({hits:[{id,name:"Oportunidad de prueba",amount:1000,currency:"USD",status:"open",stage_name:null,customer_name:null}],loading:false,error:null})}));
let consoleError:jest.SpyInstance;
beforeEach(()=>{phase="empty";jest.clearAllMocks();Object.defineProperty(window.crypto,"randomUUID",{configurable:true,value:jest.fn(()=>id)});consoleError=jest.spyOn(console,"error").mockImplementation(()=>undefined);});
afterEach(()=>{const intl=consoleError.mock.calls.filter(c=>/MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(String(c[0])));consoleError.mockRestore();expect(intl).toEqual([]);});
describe.each(["es","en","fr","pt"] as IdiomaPrueba[])("Partners %s",idioma=>{
  it("vacío no conserva métricas de la red y permite crear/configurar",()=>{const{container}=renderConIdioma(<PartnersPage/>,{idioma});expect(container.textContent).not.toContain("99");expect(container.querySelector('table')).toBeNull();expect(screen.getAllByRole("button").length).toBeGreaterThan(2);});
  it("carga inicial sólo contiene skeleton, nunca anuncia un vacío",()=>{phase="loading";const{container}=renderConIdioma(<PartnersPage/>,{idioma});expect(container.querySelectorAll("tbody tr")).toHaveLength(5);expect(container.querySelector('[role="status"]')).toBeNull();});
  it("error inicial reintenta y no presenta cifras del cache ni tabla vacía",()=>{phase="error";const{container}=renderConIdioma(<PartnersPage/>,{idioma});expect(container.textContent).not.toContain("99");expect(screen.getByRole("alert")).toBeTruthy();const retry=screen.getByRole("alert").querySelector("button")!;fireEvent.click(retry);expect(reload).toHaveBeenCalledTimes(1);});
  it("lectura sin administración no envía ajuste y guarda un solo intento",async()=>{
    let complete:(v:RegisterDealResult)=>void=()=>{};const register=jest.fn(()=>new Promise<RegisterDealResult>(resolve=>{complete=resolve;}));
    renderConIdioma(<RegisterDealDialog open partner={partner} canAdjust={false} onOpenChange={()=>{}} onRegister={register} returnFocusFallback={()=>null}/>,{idioma});
    fireEvent.click(screen.getByRole("combobox"));fireEvent.click(screen.getByRole("button",{name:"Oportunidad de prueba"}));const commission=document.getElementById("deal-commission") as HTMLInputElement;expect(commission.disabled).toBe(true);const submit=document.querySelector('button[type="submit"]')!;fireEvent.click(submit);fireEvent.click(submit);expect(register).toHaveBeenCalledTimes(1);expect(register).toHaveBeenCalledWith(id,{opportunity_id:id,deal_type:"referral",idempotency_key:id});complete({deal:{commission_amount:100,opportunity:{currency:"USD"}},commission_rate:10,promoted_to:null} as RegisterDealResult);await waitFor(()=>expect((submit as HTMLButtonElement).disabled).toBe(false));
  });
});
