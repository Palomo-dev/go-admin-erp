/** @jest-environment jsdom */
import { fireEvent, screen } from "@testing-library/react";
import {
  renderConIdioma,
  type IdiomaPrueba,
} from "@/test-utils/renderConIdioma";
import { ForecastDashboard } from "../ForecastDashboard";
import { ForecastAdjustmentDialog } from "../ForecastAdjustmentDialog";
import { calcularPronosticoMensual } from "@/lib/services/crm/forecastMensualLogica";
import {
  calcularPronostico,
  type ForecastSnapshot,
} from "@/lib/services/crm/forecastLogica";
import type { ForecastResponse } from "../useForecastData";
import { contextoMoneda } from "@/lib/utils/moneda";
jest.mock("@/lib/hooks/useOrganization", () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
}));
jest.mock("@/components/shell/header/cabeceraMovil", () => ({
  useCabeceraMovil: () => undefined,
}));
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({
  useFormatDate: () => ({
    getToday: () => "2026-09-30",
    formatDateTime: () => "30/09/2026 12:00",
    formatPlain: (v: string) => v,
  }),
}));
let loading: boolean;
let error: boolean;
let forbidden: boolean;
let data: ForecastResponse | null;
jest.mock("../useForecastData", () => ({
  useForecastData: () => ({ loading, error, forbidden, data }),
}));
const s: ForecastSnapshot = {
  period: "2026-Q3",
  start: "2026-07-01",
  end: "2026-10-01",
  date: "2026-09-30",
  timezone: "UTC",
  base: "USD",
  users: [{ id: "u", first_name: "Ejemplo", last_name: null }],
  opportunities: [],
  targets: [],
  teamQuotas: [],
  rates: [],
  adjustments: [],
  snapshotToken: "private",
  canViewAll: true,
  canAdjust: true,
  canEditAny: false,
  currentUser: "u",
};
const response = (): ForecastResponse => ({
  ...calcularPronostico(s),
  monthly: calcularPronosticoMensual(s),
  currentUserId: "u",
  moneda: contextoMoneda("USD"),
  sellers: s.users,
  teams: [],
  period: s.period,
  date: s.date,
  canViewAll: true,
  canAdjust: true,
  opportunities: [],
  opportunityCount: 0,
  adjustments: [],
});
let errors: jest.SpyInstance;
beforeEach(() => {
  loading = false;
  error = false;
  forbidden = false;
  data = response();
  errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errors.mock.calls.filter((c) =>
    /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INVALID_KEY/.test(
      String(c[0]),
    ),
  );
  errors.mockRestore();
  expect(intl).toEqual([]);
  expect(document.body.textContent).not.toMatch(/crm\.pronostico\./);
});
describe.each(["es", "en", "fr", "pt"] as IdiomaPrueba[])(
  "Pronóstico %s",
  (idioma) => {
    it.each(["ready", "loading", "error", "forbidden"])(
      "estado %s mantiene acciones y filtros",
      (state) => {
        loading = state === "loading";
        error = ["error", "forbidden"].includes(state);
        forbidden = state === "forbidden";
        if (loading || error) data = null;
        const { container } = renderConIdioma(
          <ForecastDashboard currency={null} />,
          { idioma },
        );
        expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
        if (loading)
          expect(container.querySelector(".animate-pulse")).not.toBeNull();
        if (!error)
          expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
      },
    );
    it("requiere motivo antes de habilitar el ajuste y entrega el detalle explícito", () => {
      const save = jest.fn();
      renderConIdioma(
        <ForecastAdjustmentDialog
          row={response().rows[0]}
          moneda={contextoMoneda("USD")}
          period="2026-Q3"
          busy={false}
          onClose={() => undefined}
          onSave={save}
        />,
        { idioma },
      );
      const buttons = screen.getAllByRole("button");
      const primary = buttons.find((b) => b.hasAttribute("disabled"));
      expect(primary).toBeDefined();
      fireEvent.change(
        screen.getAllByRole("textbox").find((e) => e.tagName === "TEXTAREA")!,
        {
          target: { value: "Acuerdo confirmado" },
        },
      );
      expect(primary!.hasAttribute("disabled")).toBe(false);
      fireEvent.click(primary!);
      expect(save).toHaveBeenCalledWith({
        amount_after: 0,
        reason_code: "verbal_agreement",
        reason_text: "Acuerdo confirmado",
      });
    });
  },
);
