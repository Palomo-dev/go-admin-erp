/** @jest-environment jsdom */
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderConIdioma, type IdiomaPrueba } from "@/test-utils/renderConIdioma";
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { fetchJson } from "@/lib/utils/fetchJson";
import { CampaignRnePanel } from "../CampaignRnePanel";

jest.mock('@/components/crm/acciones/apiCrm', () => ({ ...jest.requireActual('@/components/crm/acciones/apiCrm'), pedirCrm: jest.fn() }));
jest.mock("@/lib/utils/fetchJson", () => ({ fetchJson: jest.fn() }));
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({
  useFormatDate: () => ({ formatDateTime: () => "01/10/2026 10:00" }),
}));
const respuesta = (numbers_in_file: number) => ({
  success: true, puede_verificar: true,
  data: { checked_at: "2026-10-01T00:00:00Z", valid_until: "2999-01-01T00:00:00Z",
    numbers_in_file, checked_targets: 2, excluded_targets: 0, skipped_calls: 0, file_name: "rne.csv", vigente: true },
});
describe.each<IdiomaPrueba>(["es", "en", "fr", "pt"])("RNE en %s", idioma => {
  test("una constancia sin números pide reimportar aunque la fecha sea futura", async () => {
    jest.mocked(fetchJson).mockResolvedValue(respuesta(0));
    const { container } = renderConIdioma(<CampaignRnePanel campaignId="fixture" />, { idioma });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(container.textContent).not.toContain("vozRne.");
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });
  test("una importación completa mantiene el estado verificado sin alerta", async () => {
    jest.mocked(fetchJson).mockResolvedValue(respuesta(2));
    renderConIdioma(<CampaignRnePanel campaignId="fixture" />, { idioma });
    await screen.findByRole("button");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

const conflict = { es: 'fue modificada', en: 'has changed', fr: 'a été modifiée', pt: 'foi modificada' };
describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('RNE con versión propia en %s', idioma => {
  test('envía la versión vista y explica el conflicto sin bloquear el formulario', async () => {
    jest.mocked(fetchJson).mockResolvedValue(respuesta(2));
    jest.mocked(pedirCrm).mockRejectedValue(new ErrorApiCrm(409, 'campana_modificada', 'mensaje interno'));
    const changed = jest.fn();
    const { container } = renderConIdioma(<CampaignRnePanel campaignId="fixture" expectedUpdatedAt="2026-10-01T00:00:00.123456+00:00" onChanged={changed} />, { idioma });
    await screen.findByRole('button');
    const file = new File(['+12025550199'], 'Fixture.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => '+12025550199' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(conflict[idioma]));
    expect(pedirCrm).toHaveBeenCalledWith('/api/crm/voice-agents/campaigns/fixture/rne', {
      method: 'POST', cuerpo: { nombre_archivo: 'Fixture.csv', contenido: '+12025550199', expected_updated_at: '2026-10-01T00:00:00.123456+00:00' },
    });
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
});
