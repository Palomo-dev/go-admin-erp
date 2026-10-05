/** @jest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import es from "../../../../../messages/es.json";
import { ReferidosPage } from "../ReferidosPage";
import { ReferralProgramsSheet } from "../ReferralProgramsSheet";
import { RegisterReferralDialog } from "../RegisterReferralDialog";
import { ConvertReferralDialog } from "../ConvertReferralDialog";
import { ReferralRewards } from "../ReferralRewards";
import { useReferrals } from "../useReferrals";
import type {
  ReferralProgram,
  ReferralView,
} from "@/lib/services/crm/referralsService";

jest.mock("../useReferrals");
jest.mock("@/components/crm/red/useRedText", () => ({
  useRedText: () => ({
    locale: "es",
    tr: (s: string, v?: Record<string, string | number>) =>
      s.replace(/\{([^}]+)\}/g, (_, k) => String(v?.[k] ?? `{${k}}`)),
  }),
}));
jest.mock("@/components/shell/header/cabeceraMovil", () => ({
  useCabeceraMovil: () => {},
  useRegistrarBarraInferior: () => {},
}));
jest.mock("@/components/crm/acciones/useCatalogosCrm", () => ({
  useCatalogosCrm: () => ({
    usuarios: [{ id: "owner-1", nombre: "Ana Gómez" }],
    cargando: false,
    error: null,
    permisos: {},
    pipelines: [],
    etapas: [],
  }),
}));
jest.mock("@/components/crm/shared/useCustomerSearch", () => ({
  useCustomerSearch: () => ({
    hits: [
      {
        id: "customer-1",
        full_name: "Persona existente",
        email: "persona@example.test",
        phone: null,
      },
    ],
    loading: false,
    error: null,
  }),
}));
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({
  useFormatDate: () => ({
    timezone: "America/Bogota",
    formatDate: (s: string | null) => (s ? s.slice(0, 10) : "—"),
    formatDateTime: (s: string | null) => s ?? "—",
  }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...p
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
const program: ReferralProgram = {
  id: "program-1",
  organization_id: 120,
  name: "Programa activo",
  description: null,
  reward_type: "credit",
  reward_amount: 50000,
  reward_to: "both",
  is_active: true,
  created_at: "2026-10-02T15:00:00Z",
};
const referral: ReferralView = {
  id: "ref-1",
  organization_id: 120,
  program_id: program.id,
  referrer_customer_id: "referrer-1",
  referred_customer_id: null,
  referred_name: "Persona referida",
  referred_email: "persona@example.test",
  referred_phone: null,
  opportunity_id: null,
  status: "qualified",
  reward_paid: false,
  reward_paid_at: null,
  created_at: "2026-10-02T15:00:00Z",
  referrer: { id: "referrer-1", full_name: "Cliente que refiere" },
  referred: null,
  program,
  opportunity: null,
};
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="es" messages={es} timeZone="America/Bogota">
    {children}
  </NextIntlClientProvider>
);
const model = (extra = {}) => ({
  referrals: [],
  programs: [program],
  requests: [],
  currency: "COP",
  canManage: true,
  canRegister: true,
  stats: null,
  statsError: null,
  requestsError: null,
  loading: false,
  loaded: true,
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  register: jest.fn(),
  transition: jest.fn(),
  markPaid: jest.fn(),
  convert: jest.fn(),
  saveProgram: jest.fn(),
  deleteProgram: jest.fn(),
  ...extra,
});
beforeAll(() => {
  Object.defineProperty(global, "ResizeObserver", {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }),
  });
  Element.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => {
  jest.clearAllMocks();
  (useReferrals as jest.Mock).mockReturnValue(model());
});
afterEach(cleanup);
it("vacío inicial omite cifras y ofrece crear programa o registrar con permisos del servidor", () => {
  render(<ReferidosPage />, { wrapper });
  expect(screen.getByText("Aún no hay referidos")).toBeTruthy();
  expect(screen.queryByText("Referidos este mes")).toBeNull();
  expect(screen.getByRole("button", { name: "Crear programa" })).toBeTruthy();
});
it("error inicial muestra reintento y no otro estado vacío", async () => {
  const m = model({ loaded: false, error: "failed" });
  (useReferrals as jest.Mock).mockReturnValue(m);
  render(<ReferidosPage />, { wrapper });
  expect(screen.getByText("No se pudieron cargar los referidos")).toBeTruthy();
  expect(screen.queryByText("Aún no hay referidos")).toBeNull();
  expect(screen.queryByText("Referidos este mes")).toBeNull();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })),
  );
  expect(m.reload).toHaveBeenCalledTimes(1);
});
it("un programa sin canManage se lee sin selector de edición, menú de borrar ni alta", () => {
  render(
    <ReferralProgramsSheet
      open
      programs={[program]}
      currency="COP"
      canManage={false}
      onOpenChange={jest.fn()}
      onSave={jest.fn()}
      onDelete={jest.fn()}
      returnFocusFallback={() => null}
    />,
    { wrapper },
  );
  expect(screen.getByText("Programa activo")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Editar Programa/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Nuevo programa" })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("registro valida junto al correo y enfoca el error; no envía hasta corregirlo", async () => {
  const save = jest.fn().mockResolvedValue({ ...referral, status: "pending" }),
    close = jest.fn();
  render(
    <RegisterReferralDialog
      open
      preset={{ id: "referrer-1", name: "Cliente que refiere" }}
      programs={[program]}
      currency="COP"
      onOpenChange={close}
      onRegister={save}
      returnFocusFallback={() => null}
    />,
    { wrapper },
  );
  fireEvent.change(screen.getByLabelText(/Nombre de la persona referida/), {
    target: { value: "Persona referida" },
  });
  fireEvent.change(screen.getByLabelText("Correo (opcional)"), {
    target: { value: "persona@correo" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Registrar referido" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText("El correo no tiene un formato válido")).toBeTruthy();
  expect(document.activeElement?.id).toBe("referral-referred_email");
  fireEvent.change(screen.getByLabelText("Correo (opcional)"), {
    target: { value: "persona@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Registrar referido" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0]).toMatchObject({
    referrer_customer_id: "referrer-1",
    referred_name: "Persona referida",
    referred_email: "persona@example.test",
    program_id: program.id,
  });
  await waitFor(() => expect(close).toHaveBeenCalledWith(false));
});
it("conversión enlaza la coincidencia real y envía monto admitido, sin embudo ni etapa", async () => {
  const convert = jest.fn().mockResolvedValue({
    lead: { id: "customer-1", name: "Persona existente" },
  });
  render(
    <ConvertReferralDialog
      open
      referral={referral}
      currency="COP"
      onOpenChange={jest.fn()}
      onConvert={convert}
      returnFocusFallback={() => null}
    />,
    { wrapper },
  );
  expect(screen.getByText("Ya existe un cliente con este correo")).toBeTruthy();
  expect(screen.queryByLabelText("Embudo")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Enlazar esa ficha" }));
  fireEvent.change(screen.getByLabelText("Monto estimado (opcional)"), {
    target: { value: "8000000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Vincular ficha" }));
  await waitFor(() => expect(convert).toHaveBeenCalledTimes(1));
  expect(convert.mock.calls[0]).toEqual([
    "ref-1",
    {
      customer_id: "customer-1",
      amount: 8000000,
      currency: "COP",
    },
  ]);
});
it("monto negativo no alcanza la ruta de conversión", () => {
  const convert = jest.fn();
  render(
    <ConvertReferralDialog
      open
      referral={referral}
      onOpenChange={jest.fn()}
      onConvert={convert}
      returnFocusFallback={() => null}
    />,
    { wrapper },
  );
  fireEvent.change(screen.getByLabelText("Monto estimado (opcional)"), {
    target: { value: "-1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Crear lead" }));
  expect(convert).not.toHaveBeenCalled();
  expect(
    screen.getByText("El monto debe ser un número mayor o igual a 0."),
  ).toBeTruthy();
});
it("recompensas filtra pagadas y oculta registrar pago sin permiso de gestión", () => {
  const pending = { ...referral, status: "converted" as const },
    paid = {
      ...pending,
      id: "ref-2",
      referred_name: "Persona pagada",
      reward_paid: true,
      reward_paid_at: "2026-10-01T15:00:00Z",
    };
  render(
    <ReferralRewards
      referrals={[pending, paid]}
      currency="COP"
      stats={null}
      canManage={false}
      busyId={null}
      onPay={jest.fn()}
    />,
    { wrapper },
  );
  expect(screen.queryByRole("button", { name: "Registrar pago" })).toBeNull();
  expect(screen.queryAllByText("Persona pagada")).toHaveLength(0);
  fireEvent.click(screen.getByRole("radio", { name: "Pagadas · 1" }));
  expect(screen.getAllByText("Persona pagada").length).toBeGreaterThan(0);
  expect(screen.queryAllByText("Persona referida")).toHaveLength(0);
});
it("un fallo al registrar la recompensa conserva la confirmación y permite reintentar", async () => {
  const markPaid = jest.fn().mockRejectedValue(new Error("local_failed"));
  (useReferrals as jest.Mock).mockReturnValue(
    model({
      referrals: [
        {
          ...referral,
          status: "converted",
          referred_customer_id: "customer-1",
        },
      ],
      markPaid,
    }),
  );
  render(<ReferidosPage />, { wrapper });
  fireEvent.click(screen.getAllByRole("button", { name: "Registrar pago" })[0]);
  fireEvent.click(
    screen.getAllByRole("button", { name: "Registrar pago" }).at(-1)!,
  );
  await waitFor(() => expect(markPaid).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    screen.getByText("¿Registrar la recompensa como pagada?"),
  ).toBeTruthy();
});
