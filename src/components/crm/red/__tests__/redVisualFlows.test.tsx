/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderConIdioma, simularAncho } from "@/test-utils/renderConIdioma";
import { PartnerSummary } from "../../partners/PartnerSummary";
import { PartnerDealList } from "../../partners/PartnerDealList";
import { ReferralToolbar } from "../../referidos/ReferralToolbar";
import type {
  PartnerTier,
  PartnerView,
  PartnerDealView,
} from "@/lib/services/crm/partnerService";
import { EMPTY_REFERRAL_FILTERS } from "@/lib/services/crm/referralModel";
import es from "../../../../../messages/es.json";
jest.mock("@/lib/supabase/config", () => ({ supabase: {} }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/app/crm/partners",
}));
jest.mock("@/lib/context/OrganizationTimezoneContext", () => ({
  useFormatDate: () => ({ formatDate: () => "01/10/2026" }),
}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
const tier: PartnerTier = {
  id: "silver",
  organization_id: 120,
  created_at: "2026-10-01T12:00:00Z",
  name: "Silver",
  min_deals: 3,
  min_revenue: 100,
  commission_rate: 10,
  benefits: ["Beneficio de prueba"],
};
const next = {
  ...tier,
  id: "gold",
  name: "Gold",
  min_deals: 10,
  min_revenue: 1000,
};
const partner: PartnerView = {
  id: "partner-fixture",
  organization_id: 120,
  created_at: "2026-10-01T12:00:00Z",
  name: "Partner de prueba",
  email: "partner@example.invalid",
  company_name: null,
  phone: null,
  tier_id: tier.id,
  tier: { id: tier.id, name: tier.name, commission_rate: 10 },
  commission_rate: 0,
  effective_rate: 10,
  is_active: true,
  deals_count: 5,
  commissions: {
    outstanding: 20,
    pending: 20,
    approved: 0,
    paid: 10,
    rejected: 0,
    count: 5,
  },
  commissions_currency: "COP",
  currency_mixed: false,
  revenue: {
    total: 500,
    base: "COP",
    sinTasa: [],
    cantidad: 5,
    grupos: [
      {
        moneda: "COP",
        monto: 500,
        cantidad: 5,
        convertido: 500,
        tasa: 1,
        fechaTasa: null,
      },
    ],
    convertidas: [],
  },
};
const deal: PartnerDealView = {
  id: "deal-fixture",
  organization_id: 120,
  opportunity_id: "opp-fixture",
  commission_paid_at: null,
  partner_id: partner.id,
  commission_status: "pending",
  commission_amount: 20,
  deal_type: "referral",
  created_at: "2026-10-01T12:00:00Z",
  opportunity: {
    id: "opp-fixture",
    name: "Oportunidad de prueba",
    amount: 200,
    currency: "COP",
    status: "open",
  },
};
let errors: jest.SpyInstance;
beforeEach(() => {
  simularAncho(1440);
  errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errors.mock.calls.filter((c) =>
    /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(
      String(c[0]?.message ?? c[0]),
    ),
  );
  errors.mockRestore();
  expect(intl).toEqual([]);
});
test.each(["es", "en", "fr", "pt"] as const)(
  "ficha muestra beneficios y ambos mínimos sin decidir promociones en %s",
  (idioma) => {
    renderConIdioma(<PartnerSummary partner={partner} tiers={[next, tier]} />, {
      idioma,
    });
    expect(screen.getByText("Beneficio de prueba")).toBeTruthy();
    const progress = screen.getAllByRole(
      "progressbar",
    ) as HTMLProgressElement[];
    expect(progress.map((p) => [p.value, p.max])).toEqual([
      [5, 10],
      [500, 1000],
    ]);
  },
);
test("FX ausente no muestra revenue parcial ni progreso monetario, conserva el progreso de deals", () => {
  renderConIdioma(
    <PartnerSummary
      partner={{
        ...partner,
        revenue: {
          ...partner.revenue!,
          total: 12345,
          sinTasa: [
            {
              moneda: "USD",
              monto: 2,
              cantidad: 1,
              fechaTasa: null,
              tasa: null,
              convertido: null,
            },
          ],
        },
      }}
      tiers={[tier, next]}
    />,
  );
  expect(screen.queryByText(/12[.,]345/)).toBeNull();
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
});
test("sin configuración de tiers presenta ausencia honesta", () => {
  renderConIdioma(<PartnerSummary partner={partner} tiers={[]} />);
  expect(screen.getByText(es.crm.red.no_levels)).toBeTruthy();
  expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
});
test("ficha reutiliza gestión de deals y permisos: lector no puede aprobar, gestor confirma antes del writer", async () => {
  const onTransition = jest.fn(async () => ({
    ...deal,
    commission_status: "approved" as const,
  }));
  const onEdit = jest.fn();
  const loadDeals = jest.fn(async () => [deal]);
  const props = {
    open: true,
    presentation: "page" as const,
    partner,
    tiers: [tier, next],
    canRegister: false,
    onOpenChange: jest.fn(),
    loadDeals,
    onRegister: jest.fn(),
    onTransition,
    returnFocusFallback: () => null,
    onEdit,
  };
  const rendered = renderConIdioma(
    <PartnerDealList {...props} canManage={false} />,
  );
  await screen.findAllByText("Oportunidad de prueba");
  expect(screen.queryByRole("button", { name: /^Aprobar$/ })).toBeNull();
  expect(onTransition).not.toHaveBeenCalled();
  rendered.unmount();
  renderConIdioma(<PartnerDealList {...props} canManage />);
  await screen.findAllByText("Oportunidad de prueba");
  fireEvent.click(screen.getByRole("button", { name: /^Editar$/ }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getAllByRole("button", { name: /^Aprobar$/ })[0]);
  expect(onTransition).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("alertdialog").querySelector("button:last-child")!,
  );
  await waitFor(() =>
    expect(onTransition).toHaveBeenCalledWith(partner.id, deal.id, "approved"),
  );
});
test("filtros de referido conservan q y cambian estado, búsqueda responde al escribir", () => {
  const onChange = jest.fn();
  renderConIdioma(
    <ReferralToolbar
      filters={EMPTY_REFERRAL_FILTERS}
      counts={{
        pending: 1,
        contacted: 1,
        qualified: 1,
        converted: 1,
        rejected: 0,
      }}
      total={4}
      shown={4}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: /Calificado/ }));
  expect(onChange).toHaveBeenLastCalledWith({
    ...EMPTY_REFERRAL_FILTERS,
    status: "qualified",
  });
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "persona" },
  });
  expect(onChange).toHaveBeenLastCalledWith({
    ...EMPTY_REFERRAL_FILTERS,
    q: "persona",
  });
});

test("ficha inactiva no abre registro desde un enlace directo ni ofrece el writer", async () => {
  const onRegister = jest.fn();
  renderConIdioma(
    <PartnerDealList
      open
      presentation="page"
      initialRegister
      partner={{ ...partner, is_active: false }}
      tiers={[tier, next]}
      canRegister
      canManage={false}
      onOpenChange={jest.fn()}
      loadDeals={async () => [deal]}
      onRegister={onRegister}
      onTransition={jest.fn()}
      returnFocusFallback={() => null}
    />,
  );
  await screen.findAllByText("Oportunidad de prueba");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Registrar deal$/ })).toBeNull();
  expect(onRegister).not.toHaveBeenCalled();
});
