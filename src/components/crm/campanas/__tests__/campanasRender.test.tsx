/** @jest-environment jsdom */
import { screen, fireEvent } from "@testing-library/react";
import { renderConIdioma, type IdiomaPrueba } from "@/test-utils/renderConIdioma";
import { CampanasPage } from "../CampanasPage";
import { CampanaVozDetallePage } from "../voz/CampanaVozDetallePage";
import type { CampanasRespuesta } from "../useCampanasData";
import type { VozCampanaDetalle } from "@/lib/services/crm/voiceCampaignDetailService";
jest.mock("@/lib/hooks/useOrganization", () => ({ useOrganization: () => ({ organization: { id: 120 } }) }));
jest.mock("@/components/shell/header/cabeceraMovil", () => ({ useCabeceraMovil: () => undefined }));
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({ useFormatDate: () => ({ formatDateTime: () => "30/09/2026 12:00" }) }));
jest.mock("@/components/crm/agentes/campanas/CampaignRnePanel", () => ({ CampaignRnePanel: () => <div>RNE</div> }));
let state: { loading: boolean; error: boolean; forbidden: boolean; data: CampanasRespuesta | VozCampanaDetalle | null };
jest.mock("../useCampanasData", () => ({ useCampanasData: () => state, useCampanasLectura: () => state }));
jest.mock("../CampanasService", () => ({ CampanasService: {} }));
const detalle = (): VozCampanaDetalle => ({
  campaign: { updated_at: "2026-10-01T00:00:00.123456Z", voice_agent_id: "agente", target_source: "manual_list", target_config: {}, id: "campaign", name: "Campaña de ejemplo", agent_name: "Agente de ejemplo", status: "paused", objective: null, emergency_stop: true, stopped_reason: "Revisar el lote", stopped_at: "2026-09-30T17:00:00Z", consecutive_failures: 10, max_calls_per_day: 50, max_calls_per_hour: 20, max_concurrent: 3, schedule: {}, rne_checked_at: null, rne_valid_until: null, rne_numbers_in_file: null },
  stats: { targets: 206, attempts: 206, today: 2, effective: 2, meetings: 1, conversation_minutes: 207, remaining_minutes: 30, active_total: 0, pending: 0, rescheduled: 0, outcomes: { completed: 206 } },
  active: [], history: [{ id: "call", customer_name: "Contacto de ejemplo", status: "completed", started_at: "2026-09-30T17:00:00Z", duration_seconds: 60 }],
  page: 1, timezone: "UTC", canManage: true, failureThreshold: 10,
});
beforeEach(() => { state = { loading: false, error: false, forbidden: false, data: { rows: [], total: 0, canManage: true } }; });
describe.each<IdiomaPrueba>(["es", "en", "fr", "pt"])("Campañas en %s", idioma => {
  test("vacío ofrece creación y configuración", () => {
    const { container } = renderConIdioma(<CampanasPage />, { idioma });
    expect(container.querySelector('a[href="/app/crm/campanas/nuevo"]')).toBeTruthy();
    const rneButton = screen.getAllByRole("button").find(b => /RNE/.test(b.textContent ?? ""));
    expect(rneButton).toBeTruthy(); fireEvent.click(rneButton!);
    expect(document.querySelector('a[href="/app/configuracion?modulo=crm&tab=telefonia"]')).toBeTruthy();
  });
  test.each(["loading", "error", "forbidden"])("estado %s", mode => {
    state = { loading: mode === "loading", error: mode !== "loading", forbidden: mode === "forbidden", data: null };
    const { container } = renderConIdioma(<CampanasPage />, { idioma });
    expect(container.textContent).not.toContain("crm.campanas");
    expect(container.querySelector('a[href="/app/crm/campanas/nuevo"]')).toBeNull();
  });
  test("detalle muestra auditoría de parada, historial real y cifras sin muestras inventadas", () => {
    state.data = detalle();
    const { container } = renderConIdioma(<CampanaVozDetallePage campaignId="campaign" />, { idioma });
    expect(screen.getByText("Revisar el lote")).toBeTruthy();
    expect(container.querySelector('a[href="/app/crm/llamadas?call=call"]')).toBeTruthy();
    expect(container.textContent).toContain("206");
    expect(container.textContent).toContain("207.0");
    expect(container.textContent).not.toContain("crm.campanasVoz");
  });
});
