/** @jest-environment jsdom */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  renderConIdioma,
  type IdiomaPrueba,
} from "@/test-utils/renderConIdioma";
import { contextoMoneda } from "@/lib/utils/moneda";
import {
  getMonthlyForecast,
  getPipelineGoal,
  type ForecastResult,
} from "@/lib/services/forecastService";
import ForecastChart from "../ForecastChart";
import GoalCompletionWidget from "../GoalCompletionWidget";
import ForecastByStageChart from "../ForecastByStageChart";
import WeightedFunnelChart from "../WeightedFunnelChart";

jest.mock("@/lib/services/forecastService", () => ({
  getMonthlyForecast: jest.fn(),
  getPipelineGoal: jest.fn(),
}));
jest.mock("@/lib/hooks/useOrganization", () => ({
  useOrganization: () => ({ organization: { id: 120 }, isLoading: false }),
}));
const today = () => "2026-10-04";
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({
  useFormatDate: () => ({ getToday: today }),
}));
jest.mock("@/lib/hooks/useOrgCurrency", () => ({
  useMonedaOrganizacion: () => ({
    paraDocumento: (code?: string) =>
      contextoMoneda(code ?? "COP", { locale: "en-US" }),
  }),
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ name }: { name: string }) => <span>{name}</span>,
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pie: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="stages-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Cell: () => null,
  FunnelChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Funnel: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="funnel-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  LabelList: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));
const forecast = (weighted = 50): ForecastResult => ({
  baseCurrency: "USD",
  monthlyForecasts: [
    {
      month: "2026-10",
      monthName: "October 2026",
      totalValue: 100,
      weightedValue: weighted,
      opportunityCount: 1,
      opportunities: [],
    },
  ],
  totals: {
    totalAmount: 100,
    weightedAmount: weighted,
    opportunityCount: 1,
    currencyDistribution: { USD: 100 },
  },
});
const loadForecast = jest.mocked(getMonthlyForecast);
const loadGoal = jest.mocked(getPipelineGoal);
let errors: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  loadGoal.mockResolvedValue({
    goalAmount: 100,
    goalCurrency: "USD",
    goalPeriod: "monthly",
  });
  loadForecast.mockResolvedValue(forecast());
  errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errors.mock.calls.filter((call) =>
    /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INVALID_KEY/.test(
      String(call[0]),
    ),
  );
  errors.mockRestore();
  expect(intl).toEqual([]);
});

describe.each(["es", "en", "fr", "pt"] as IdiomaPrueba[])(
  "Pronóstico del pipeline %s",
  (idioma) => {
    it("el gráfico presenta el cálculo canónico en la moneda de la meta", async () => {
      renderConIdioma(<ForecastChart pipelineId="p" />, { idioma });
      const chart = await screen.findByTestId("chart");
      expect(JSON.parse(chart.getAttribute("data-chart")!)).toEqual([
        {
          name: "October 2026",
          totalAmount: 100,
          forecastAmount: 50,
          goal: 100,
        },
      ]);
      expect(loadForecast).toHaveBeenCalledWith(
        "p",
        expect.objectContaining({
          baseCurrency: "USD",
          includeWon: false,
          includeLost: false,
          locale: idioma,
        }),
      );
      expect(document.body.textContent).not.toMatch(/crm\.pronostico\./);
    });
    it("la meta compara sólo abiertas del período actual en su misma moneda", async () => {
      renderConIdioma(<GoalCompletionWidget pipelineId="p" />, { idioma });
      await screen.findByText("50.0%");
      expect(loadForecast).toHaveBeenCalledWith(
        "p",
        expect.objectContaining({
          baseCurrency: "USD",
          includeWon: false,
          startDay: "2026-10-01",
          endDay: "2026-11-01",
        }),
      );
      expect(screen.getAllByText(/\$50\.00/)).toHaveLength(1);
    });
    it("un fallo muestra error y reintento; no finge que faltan oportunidades o meta", async () => {
      loadForecast.mockResolvedValueOnce(null);
      renderConIdioma(<GoalCompletionWidget pipelineId="p" />, { idioma });
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBeTruthy();
      fireEvent.click(screen.getByRole("button"));
      await screen.findByText("50.0%");
      expect(loadForecast).toHaveBeenCalledTimes(2);
    });
    it("las gráficas por etapa usan los mismos importes ya convertidos y ponderados", async () => {
      const result = forecast();
      result.monthlyForecasts[0].opportunities = [
        {
          id: "o",
          name: "Oportunidad",
          amount: 400000,
          currency: "COP",
          convertedAmount: 100,
          expected_close_date: "2026-10-04",
          stage_id: "s",
          stage_name: "Propuesta",
          probability: 50,
          weightedAmount: 50,
          status: "open",
        },
      ];
      loadForecast.mockResolvedValue(result);
      renderConIdioma(
        <>
          <ForecastByStageChart pipelineId="p" />
          <WeightedFunnelChart pipelineId="p" />
        </>,
        { idioma },
      );
      const pie = await screen.findByTestId("stages-chart");
      const funnel = await screen.findByTestId("funnel-chart");
      const pieData = JSON.parse(pie.getAttribute("data-chart")!);
      const funnelData = JSON.parse(funnel.getAttribute("data-chart")!);
      expect(pieData[0]).toMatchObject({ amount: 100, value: 50 });
      expect(funnelData[0]).toMatchObject({ amount: 100, value: 50, count: 1 });
      expect(document.body.textContent).not.toMatch(/400[.,]000/);
    });
  },
);

it("ignora la respuesta de un pipeline anterior al navegar", async () => {
  let resolveOld!: (value: ForecastResult) => void;
  loadForecast.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const { rerender } = renderConIdioma(
    <GoalCompletionWidget pipelineId="anterior" />,
  );
  await waitFor(() => expect(loadForecast).toHaveBeenCalledTimes(1));
  rerender(<GoalCompletionWidget pipelineId="actual" />);
  await screen.findByText("50.0%");
  await act(async () => {
    resolveOld(forecast(999));
  });
  expect(screen.getByText("50.0%")).toBeTruthy();
  expect(screen.queryByText("100.0%")).toBeNull();
});

it("una meta sin moneda explícita usa la base resuelta del pronóstico al formatear", async () => {
  loadGoal.mockResolvedValue({
    goalAmount: 100,
    goalCurrency: null,
    goalPeriod: "monthly",
  });
  renderConIdioma(<GoalCompletionWidget pipelineId="p" />);
  await screen.findByText("50.0%");
  expect(loadForecast).toHaveBeenCalledWith(
    "p",
    expect.objectContaining({ baseCurrency: undefined }),
  );
  expect(screen.getAllByText(/\$50\.00/)).toHaveLength(1);
});
