/** @jest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import es from "../../../../../messages/es.json";
import en from "../../../../../messages/en.json";
import fr from "../../../../../messages/fr.json";
import pt from "../../../../../messages/pt.json";
import * as sequenceHooks from "../useSequences";
import { SecuenciasPage } from "../SecuenciasPage";
import "@/test-utils/renderConIdioma";
import { SequenceEditorDialog } from "../SequenceEditorDialog";
import { EnrollDialog } from "../EnrollDialog";
import { EnrollmentsSheet } from "../EnrollmentsSheet";
import { useSequenceText } from "../useSequenceText";
import { buildTimeline } from "@/lib/services/crm/sequenceTimeline";
let mockOrg = 1;
jest.mock("@/lib/hooks/useOrganization", () => ({
  useOrganization: () => ({ organization: mockOrg ? { id: mockOrg } : null }),
}));
jest.mock("@/components/crm/shared/useCrmLookups", () => ({
  useCrmLookups: () => ({
    templates: [],
    pipelines: [],
    stages: [],
    sequences: [],
    customers: [],
    opportunities: [],
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({
  useFormatDate: () => ({ formatDateTime: (v: string) => `TZ:${v}` }),
}));
const catalogs = { es, en, fr, pt },
  row: sequenceHooks.SequenceView = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Secuencia ejemplo",
    description: null,
    trigger_type: "manual",
    is_active: true,
    pause_on_reply: true,
    exit_conditions: ["won_lost"],
    steps: [
      {
        step_number: 1,
        channel: "email",
        delay_days: 0,
        action_config: { subject: "Asunto propio" },
      },
    ],
    updated_at: "2026-10-02T00:00:00Z",
    enrollment_stats: { active: 5, total: 9, replied: 2, response_rate: 2 / 9 },
  };
const summary: sequenceHooks.SequenceSummary = {
  active_enrollments: 300,
  paused_enrollments: 27,
  replied_enrollments: 13,
  meetings_30d: null,
  meetings_available: false,
  from: "2026-09-03T00:00:00Z",
  until: "2026-10-03T00:00:00Z",
  timezone: "America/Bogota",
};
function mount(
  node: React.ReactNode,
  locale: keyof typeof catalogs = "es",
  onError = jest.fn(),
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={catalogs[locale]}
      onError={onError}
    >
      {node}
    </NextIntlClientProvider>,
  );
}
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="es" messages={es}>
    {children}
  </NextIntlClientProvider>
);
function Probe() {
  const tr = useSequenceText(),
    t = useTranslations("crm.secuencias");
  return (
    <div>
      {Object.keys(es.crm.secuencias).map((key) => (
        <i key={key}>
          {t(key, { p0: "A", p1: "B", p2: "C", p3: "D", p4: "E" })}
        </i>
      ))}
      <b>
        {
          buildTimeline(
            [{ step_number: 1, channel: "call", delay_days: 2 }],
            tr,
          )[0].dayLabel
        }
      </b>
    </div>
  );
}
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest
      .fn()
      .mockImplementation(() => ({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
  });
});
beforeEach(() => {
  mockOrg = 1;
  jest.clearAllMocks();
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});
it.each(["es", "en", "fr", "pt"] as const)(
  "muestra cifras canónicas, reunión desconocida y readonly en %s",
  (locale) => {
    const onError = jest.fn(),
      toggle = jest.fn();
    jest
      .spyOn(sequenceHooks, "useSequences")
      .mockReturnValue({
        sequences: [row],
        loading: false,
        error: null,
        canManage: false,
        summary,
        organizationId: 1,
        reload: jest.fn(),
        save: jest.fn(),
        toggle,
        remove: jest.fn(),
        enroll: jest.fn(),
      });
    mount(
      <>
        <Probe />
        <SecuenciasPage />
      </>,
      locale,
      onError,
    );
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByText("300")).toBeTruthy();
    expect(screen.getByText("27")).toBeTruthy();
    expect(screen.getByText("13")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toBe(
      {
        es: "Las reuniones aún no están vinculadas a inscripciones; esta cifra no está disponible.",
        en: "Meetings are not yet linked to enrollments; this figure is unavailable.",
        fr: "Les réunions ne sont pas encore liées aux inscriptions ; ce chiffre est indisponible.",
        pt: "As reuniões ainda não estão vinculadas a inscrições; este número não está disponível.",
      }[locale],
    );
    expect(screen.getByRole("table")).toBeTruthy();
    const sw = screen.getByRole("switch") as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    fireEvent.click(sw);
    expect(toggle).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        { es: "Día 2", en: "Day 2", fr: "Jour 2", pt: "Dia 2" }[locale],
      ),
    ).toBeTruthy();
  },
);
it("guardar tiene una sola mutación y bloquea campos hasta respuesta real", async () => {
  let finish: (v: unknown) => void = () => {};
  const save = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
    close = jest.fn();
  mount(
    <SequenceEditorDialog
      open
      sequence={row}
      onOpenChange={close}
      onSave={save}
    />,
  );
  const button = screen.getByRole("button", { name: "Guardar cambios" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByLabelText("Nombre") as HTMLInputElement).closest("fieldset")
      ?.disabled,
  ).toBe(true);
  await act(async () => {
    finish({ id: row.id });
  });
  expect(close).toHaveBeenCalledWith(false);
  expect(save.mock.calls[0][0]).not.toHaveProperty("steps");
});
it("inscripción exige preview actual y confirmación explícita de mensajes reales", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          sequence: { is_active: true },
          steps: [
            {
              id: "step",
              step_number: 1,
              channel: "email",
              delay_days: 0,
              delay_hours: 0,
              name: null,
            },
          ],
          candidates: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Oportunidad ejemplo",
              amount: 0,
              currency: null,
              customer_name: "Contacto",
              customer_email: "contacto@example.invalid",
              already_enrolled: false,
            },
          ],
        },
      }),
    });
  const enroll = jest.fn().mockResolvedValue({ enrolled: 1, skipped: [] });
  mount(
    <EnrollDialog
      open
      sequence={row}
      onOpenChange={jest.fn()}
      onEnroll={enroll}
      onDone={jest.fn()}
    />,
  );
  await waitFor(() =>
    expect(screen.getByText("Oportunidad ejemplo")).toBeTruthy(),
  );
  fireEvent.click(screen.getByText("Oportunidad ejemplo"));
  const button = screen.getByRole("button", {
    name: "Confirmar inscripción y envíos",
  });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(enroll).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await waitFor(() => expect(enroll).toHaveBeenCalledTimes(1));
  expect(enroll).toHaveBeenCalledWith(
    row.id,
    "22222222-2222-4222-8222-222222222222",
  );
});
it("una respuesta atrasada de otra organización nunca reemplaza filas o capacidad", async () => {
  let oldReply: (r: Response) => void = () => {};
  const second = {
    ...row,
    id: "33333333-3333-4333-8333-333333333333",
    name: "Secuencia actual",
  };
  global.fetch = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldReply = resolve;
        }),
    )
    .mockResolvedValue({
      ok: true,
      json: async () => ({ data: [second], can_manage: false, summary }),
    });
  const v = renderHook(() => sequenceHooks.useSequences(), { wrapper });
  mockOrg = 2;
  v.rerender();
  expect(v.result.current.sequences).toEqual([]);
  await waitFor(() => expect(v.result.current.sequences).toEqual([second]));
  await act(async () => {
    oldReply({
      ok: true,
      json: async () => ({ data: [row], can_manage: true, summary }),
    } as Response);
  });
  expect(v.result.current.sequences).toEqual([second]);
  expect(v.result.current.canManage).toBe(false);
});
it("Escape consumido por un desplegable conserva el constructor y su borrador", () => {
  const close = jest.fn();
  mount(
    <SequenceEditorDialog
      open
      sequence={row}
      onOpenChange={close}
      onSave={jest.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Nombre"), {
    target: { value: "Borrador propio" },
  });
  const consumed = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  consumed.preventDefault();
  fireEvent(document, consumed);
  expect(close).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(
    "Borrador propio",
  );
  fireEvent.keyDown(document, { key: "Escape" });
  expect(close).toHaveBeenCalledWith(false);
});
it("un error de guardado conserva el borrador y muestra el error real", async () => {
  const close = jest.fn(),
    save = jest.fn().mockRejectedValue(new Error("Versión cambió"));
  mount(
    <SequenceEditorDialog
      open
      sequence={row}
      onOpenChange={close}
      onSave={save}
    />,
  );
  fireEvent.change(screen.getByLabelText("Nombre"), {
    target: { value: "Borrador propio" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("Versión cambió"),
  );
  expect(close).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(
    "Borrador propio",
  );
  expect(save).toHaveBeenCalledTimes(1);
});

it("inscritos en página conserva filtros, nombres y bloqueo de acciones de sólo lectura", async () => {
  const enroll = jest.fn(),
    close = jest.fn();
  jest.spyOn(sequenceHooks, "fetchEnrollments").mockResolvedValue([
    {
      id: "a",
      sequence_id: row.id,
      opportunity_id: null,
      customer_id: null,
      status: "active",
      customer_name: "Contacto A",
      opportunity_name: "Oportunidad A",
      enrolled_at: "2026-10-02T00:00:00Z",
      exit_reason: null,
    },
    {
      id: "b",
      sequence_id: row.id,
      opportunity_id: null,
      customer_id: null,
      status: "paused",
      customer_name: "Contacto B",
      opportunity_name: "Oportunidad B",
      enrolled_at: "2026-10-02T00:00:00Z",
      exit_reason: null,
      paused_reason: "customer_replied_whatsapp",
    },
  ]);
  mount(
    <EnrollmentsSheet
      presentacion="pagina"
      sequence={row}
      refreshKey={0}
      canManage={false}
      onOpenChange={close}
      onEnroll={enroll}
    />,
  );
  await waitFor(() => expect(screen.getByText("Contacto A")).toBeTruthy());
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Pausadas" }));
  expect(screen.queryByText("Contacto A")).toBeNull();
  expect(screen.getByText("Contacto B")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Inscribir oportunidad" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Volver" }));
  expect(close).toHaveBeenCalledWith(false);
  expect(enroll).not.toHaveBeenCalled();
});

it("paso actual resuelve sólo el ID real del catálogo de esta secuencia; históricos desconocidos quedan sin inventar", async () => {
  const currentStepId = "22222222-2222-4222-8222-222222222222";
  const sequence = {
    ...row,
    steps: [
      { id: currentStepId, step_number: 3, channel: "whatsapp", delay_days: 0 },
    ],
  };
  const base = {
    sequence_id: row.id,
    opportunity_id: null,
    customer_id: null,
    status: "active" as const,
    enrolled_at: "2026-10-02T00:00:00Z",
    exit_reason: null,
  };
  jest.spyOn(sequenceHooks, "fetchEnrollments").mockResolvedValue([
    {
      ...base,
      id: "33333333-3333-4333-8333-333333333333",
      customer_name: "Contacto actual",
      current_step_id: currentStepId,
    },
    {
      ...base,
      id: "44444444-4444-4444-8444-444444444444",
      customer_name: "Contacto histórico",
      current_step_id: "55555555-5555-4555-8555-555555555555",
    },
    {
      ...base,
      id: "66666666-6666-4666-8666-666666666666",
      sequence_id: "77777777-7777-4777-8777-777777777777",
      customer_name: "Contacto ajeno",
      current_step_id: currentStepId,
    },
  ]);
  mount(
    <EnrollmentsSheet
      presentacion="pagina"
      sequence={sequence}
      refreshKey={0}
      canManage={false}
      onOpenChange={jest.fn()}
      onEnroll={jest.fn()}
    />,
  );
  const table = within(screen.getByRole("table", { name: "Inscripciones" }));
  const activeRow = await table.findByRole("row", { name: /Contacto actual/ });
  const stepColumn = table.getAllByRole("columnheader").indexOf(
    table.getByRole("columnheader", { name: "Paso actual" }),
  );
  const currentStepCell = (customerName: string) =>
    within(table.getByRole("row", { name: new RegExp(customerName) }))
      .getAllByRole("cell")[stepColumn];
  expect(within(activeRow).getAllByRole("cell")[stepColumn].textContent).toBe("3 · WhatsApp");
  expect(currentStepCell("Contacto histórico").textContent).toBe("—");
  expect(currentStepCell("Contacto ajeno").textContent).toBe("—");
});
