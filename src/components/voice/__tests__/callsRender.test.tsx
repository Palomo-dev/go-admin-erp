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
let count = 0;
jest.mock("@/lib/hooks/useOrganization", () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
}));
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({
  useFormatDate: () => ({
    getToday: () => "2026-09-30",
    formatDateTime: () => "30/09/2026 20:00",
  }),
}));
jest.mock("../useCallsData", () => ({
  useCallsData: () => ({
    loading,
    error,
    forbidden,
    result: error
      ? null
      : {
          data: [],
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
  }),
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
  count = 0;
  errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
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
    it.each(["empty", "loading", "error", "forbidden", "ready"])(
      "estado %s",
      (state) => {
        loading = state === "loading";
        error = ["error", "forbidden"].includes(state);
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
