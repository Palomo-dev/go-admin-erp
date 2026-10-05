/** @jest-environment jsdom */
import { fireEvent, screen } from "@testing-library/react";
import {
  renderConIdioma,
  type IdiomaPrueba,
} from "@/test-utils/renderConIdioma";
import { CallsTable } from "../CallsTable";
import { CallRow } from "../CallRow";
import type { CallListRow } from "@/lib/services/crm/callManagementService";
let loading = false;
let error = false;
let forbidden = false;
let errorCode: string | null = null;
let count = 0;
let rows: CallListRow[] = [];
let parametros = '';
jest.mock("@/lib/hooks/useOrganization", () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
}));
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({
  useFormatDate: () => ({
    getToday: () => "2026-09-30",
    formatDateTime: () => "30/09/2026 20:00",
    formatPlain: () => "30/09/2026",
  }),
}));
jest.mock("../useCallsData", () => ({
  useCallsData: (params: string) => { parametros = params; return ({
    loading,
    error,
    forbidden,
    errorCode,
    result: error
      ? null
      : {
          data: rows,
          count,
          stats: {
            totalToday: 205,
            avgDuration: 103,
            answered: 100,
            missed: 1,
            voiceSeconds: 60,
            remainingVoiceMinutes: 15,
            voiceConfigured: true,
          },
        },
  }); },
}));
jest.mock("../CallRowDetail", () => ({
  CallRowDetail: () => <div>detail</div>,
}));
jest.mock("../CallPlayer", () => ({
  CallPlayer: ({ recordingEnabled }: { recordingEnabled: boolean }) => (
    <span data-testid="player">{String(recordingEnabled)}</span>
  ),
}));
jest.mock("../CallButton", () => ({ CallButton: () => <button>call</button> }));
jest.mock("@/components/shell/header/cabeceraMovil", () => ({
  useCabeceraMovil: () => undefined,
}));
let errors: jest.SpyInstance;
beforeEach(() => {
  loading = false;
  error = false;
  forbidden = false;
  errorCode = null;
  count = 0;
  rows = [];
  errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
});
it('abre el detalle por fila y conserva los datos del atajo sin una columna de expansión', () => {
  const abrir = jest.fn();
  count = 1;
  rows = [{
    id: '10000000-0000-4000-8000-000000000001', created_at: '2026-10-01T01:00:00Z',
    mode: 'browser', direction: 'outbound', to_number: '+12025550197',
    status: 'completed', duration_seconds: 120, recordings: [], recording_enabled: false,
    customer: { id: '20000000-0000-4000-8000-000000000001', full_name: 'Contacto de prueba' },
    opportunity_id: '30000000-0000-4000-8000-000000000001', disposition_outcome: 'answered',
    analysis: { sentiment: 'positive' },
  } as unknown as CallListRow];
  renderConIdioma(<CallsTable onAbrirLlamada={abrir} />);
  expect(screen.getAllByRole('columnheader').map((el) => el.textContent)).toEqual(['Fecha', 'Cliente', 'Tipo', 'Quién', 'Duración', 'Resultado', 'Sentimiento', 'Grabación']);
  const row = screen.getAllByRole('row')[1];
  expect(row.dataset.phone).toBe('+12025550197');
  expect(row.dataset.customerId).toBe(rows[0].customer?.id);
  fireEvent.keyDown(row, { key: 'Enter' });
  expect(abrir).toHaveBeenCalledWith(rows[0].id);
  fireEvent.click(screen.getByRole('button', { name: 'Llamada con Contacto de prueba' }));
  expect(abrir).toHaveBeenCalledTimes(2);
});
it('un intervalo vacío conserva la consulta sin fechas y muestra un selector válido', () => {
  renderConIdioma(<CallsTable initialFilters={{ fromDate: '', toDate: '' }} />);
  const params = new URLSearchParams(parametros);
  expect(params.has('from_date')).toBe(false);
  expect(params.has('to_date')).toBe(false);
  expect(screen.getByRole('button', { name: /Período filtrado/ }).textContent).not.toMatch(/NaN|undefined/);
});
it('una fecha parcial permanece visible y se puede quitar sin inventar otro límite', () => {
  renderConIdioma(<CallsTable initialFilters={{ fromDate: '2026-09-30', toDate: '' }} />);
  expect(new URLSearchParams(parametros).get('from_date')).toBe('2026-09-30');
  expect(screen.getByText('Desde: 30/09/2026')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Quitar.*Desde/ }));
  expect(new URLSearchParams(parametros).has('from_date')).toBe(false);
});
it('el periodo inicial no convierte la ausencia de llamadas en un resultado filtrado', () => {
  renderConIdioma(<CallsTable />);
  expect(screen.getByText('Aún no hay llamadas')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Configurar telefonía' }).getAttribute('href')).toBe('/app/configuracion?modulo=crm&tab=proveedores');
  expect(screen.queryByRole('columnheader')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Resumen de llamadas' })).toBeNull();
});
it('la carga inicial no muestra cabecera de columnas ni cifras anteriores', () => {
  loading = true;
  renderConIdioma(<CallsTable />);
  expect(screen.queryByRole('columnheader')).toBeNull();
  expect(screen.queryByText('205')).toBeNull();
});
afterEach(() => {
  const intl = errors.mock.calls.filter((c) =>
    /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(String(c[0])),
  );
  errors.mockRestore();
  expect(intl).toEqual([]);
});
describe.each(["es", "en", "fr", "pt"] as IdiomaPrueba[])(
  "Llamadas %s",
  (idioma) => {
    it.each(["empty", "loading", "error", "timeout", "forbidden", "ready"])(
      "estado %s",
      (state) => {
        loading = state === "loading";
        error = ["error", "timeout", "forbidden"].includes(state);
        errorCode = state === "timeout" ? "REQUEST_TIMEOUT" : null;
        forbidden = state === "forbidden";
        count = state === "ready" ? 205 : 0;
        const { container } = renderConIdioma(<CallsTable />, { idioma });
        if (loading)
          expect(container.querySelector(".animate-pulse")).toBeTruthy();
        else if (state === "ready")
          expect(screen.getAllByText("205").length).toBeGreaterThan(0);
        else expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
        expect(container.textContent).not.toMatch(/crm\.llamadas\./);
      },
    );
  },
);
it('un timeout muestra el motivo de espera y conserva el reintento', () => {
  error = true;
  errorCode = 'REQUEST_TIMEOUT';
  renderConIdioma(<CallsTable />);
  expect(screen.getByText('La carga tardó más de lo esperado. Vuelve a intentarlo.')).toBeTruthy();
  expect(screen.queryByText('Revisa tu conexión e inténtalo de nuevo.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
});
it("Enter en un botón hijo no abre la fila; Enter en la fila sí", () => {
  const toggle = jest.fn();
  const call = {
    id: "test",
    created_at: "2026-10-01T01:00:00Z",
    mode: "manual",
    direction: "outbound",
    to_number: "+12025550197",
    status: "completed",
    recordings: [{ status: "ready" }],
    recording_enabled: false,
  } as CallListRow;
  renderConIdioma(
    <table>
      <tbody>
        <CallRow call={call} isOpen={false} onToggle={toggle} />
      </tbody>
    </table>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "call" }), {
    key: "Enter",
  });
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("row"), { key: "Enter" });
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("player").textContent).toBe("true");
  expect(screen.getByText("30/09/2026 20:00")).toBeTruthy();
});
