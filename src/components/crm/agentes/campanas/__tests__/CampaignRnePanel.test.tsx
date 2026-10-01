/** @jest-environment jsdom */
import { screen } from "@testing-library/react";
import { renderConIdioma, type IdiomaPrueba } from "@/test-utils/renderConIdioma";
import { fetchJson } from "@/lib/utils/fetchJson";
import { CampaignRnePanel } from "../CampaignRnePanel";

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
