import type { SupabaseClient } from "@supabase/supabase-js";
import { registerPartnerDealAtomic } from "../partnerDealAtomicService";
const id = "11111111-1111-4111-8111-111111111111";
const base = () => ({
  partner: {
    id,
    organization_id: 120,
    is_active: true,
    commission_rate: 10,
    tier_id: null,
  },
  opportunity: {
    id,
    name: "Oportunidad de prueba",
    amount: 1000,
    currency: "USD",
    status: "open",
  },
  tiers: [],
  deals: [],
  base_currency: "USD",
  timezone: "America/Bogota",
  calendar: null,
  rates: [],
});
function fixtures() {
  const chain: { select: jest.Mock; eq: jest.Mock; maybeSingle: jest.Mock } = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: { id, branch_id: 1 }, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  const session = {
    from: jest.fn(() => chain),
    rpc: jest.fn().mockResolvedValue({ data: true, error: null }),
  };
  const response = {
    deal: { id, commission_amount: 25, opportunity: base().opportunity },
    commission_rate: 10,
    promoted_to: null,
    promotion_blocked: null,
    revenue: null,
  };
  const rpc = jest.fn<Promise<{data: unknown; error: unknown}>, [string, Record<string, unknown>?]>(async (fn: string) => ({
    data:
      fn === "fn_crm_partner_deal_receipt"
        ? null
        : fn === "fn_crm_partner_deal_base"
          ? base()
          : fn === "fn_crm_registrar_partner_deal_auditado"
            ? response
            : { deal: { id }, tier_id: null },
    error: null as unknown,
  }));
  return { session, writer: { rpc }, rpc, response, chain };
}
describe("registro nativo de comisión ajustada", () => {
  it("sin campos opcionales conserva writer y cálculo nativos", async () => {
    const f = fixtures();
    await registerPartnerDealAtomic(
      id,
      120,
      { opportunity_id: id, deal_type: "referral" },
      "actor",
      f.session as unknown as SupabaseClient,
      f.writer as unknown as SupabaseClient,
    );
    expect(f.rpc.mock.calls.map((c) => c[0])).toEqual([
      "fn_crm_partner_deal_base",
      "fn_crm_registrar_partner_deal",
    ]);
    expect(f.rpc).toHaveBeenLastCalledWith(
      "fn_crm_registrar_partner_deal",
      expect.objectContaining({
        p_commission: 100,
        p_expected: base(),
        p_tier: null,
      }),
    );
  });
  it("ajuste explícito preserva cálculo/promoción, contexto CAS y DTO confirmado", async () => {
    const f = fixtures();
    const result = await registerPartnerDealAtomic(
      id,
      120,
      {
        opportunity_id: id,
        deal_type: "referral",
        commission_amount: 25,
        idempotency_key: id,
      },
      "actor",
      f.session as unknown as SupabaseClient,
      f.writer as unknown as SupabaseClient,
    );
    expect(result).toEqual(f.response);
    expect(f.rpc).toHaveBeenLastCalledWith(
      "fn_crm_registrar_partner_deal_auditado",
      expect.objectContaining({
        p_actor: "actor",
        p_key: id,
        p_requested: 25,
        p_suggested: 100,
        p_commission: 25,
        p_expected: base(),
        p_metadata: expect.objectContaining({
          commission_rate: 10,
          promoted_to: null,
          promotion_blocked: null,
        }),
      }),
    );
  });
  it("replay recupera el DTO original antes de recontar datos nuevos o buscar duplicados", async () => {
    const f = fixtures();
    f.rpc.mockResolvedValueOnce({ data: f.response, error: null });
    expect(
      await registerPartnerDealAtomic(
        id,
        120,
        {
          opportunity_id: id,
          deal_type: "referral",
          commission_amount: 25,
          idempotency_key: id,
        },
        "actor",
        f.session as unknown as SupabaseClient,
        f.writer as unknown as SupabaseClient,
      ),
    ).toEqual(f.response);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.session.rpc).toHaveBeenCalledWith("app_branch_access", {
      p_branch_id: 1,
    });
  });
  it("un replay confirmado entre las dos lecturas recupera el receipt sin segundo writer", async () => {
    const f = fixtures();
    f.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { ...base(), deals: [{ opportunity_id: id }] },
        error: null,
      })
      .mockResolvedValueOnce({ data: f.response, error: null });
    expect(
      await registerPartnerDealAtomic(
        id,
        120,
        { opportunity_id: id, deal_type: "referral", idempotency_key: id },
        "actor",
        f.session as unknown as SupabaseClient,
        f.writer as unknown as SupabaseClient,
      ),
    ).toEqual(f.response);
    expect(f.rpc.mock.calls.map((c) => c[0])).toEqual([
      "fn_crm_partner_deal_receipt",
      "fn_crm_partner_deal_base",
      "fn_crm_partner_deal_receipt",
    ]);
  });
  it("una clave reutilizada con datos distintos se propaga sin confirmar otro deal", async () => {
    const f = fixtures();
    const conflict = {
      code: "P0001",
      message: "reintento_con_datos_distintos",
    };
    f.rpc.mockResolvedValueOnce({ data: null, error: conflict });
    await expect(
      registerPartnerDealAtomic(
        id,
        120,
        {
          opportunity_id: id,
          deal_type: "referral",
          commission_amount: 25,
          idempotency_key: id,
        },
        "actor",
        f.session as unknown as SupabaseClient,
        f.writer as unknown as SupabaseClient,
      ),
    ).rejects.toEqual(conflict);
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("una sucursal ajena impide incluso consultar el receipt de servicio", async () => {
    const f = fixtures();
    f.session.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(
      registerPartnerDealAtomic(
        id,
        120,
        {
          opportunity_id: id,
          deal_type: "referral",
          commission_amount: 25,
          idempotency_key: id,
        },
        "actor",
        f.session as unknown as SupabaseClient,
        f.writer as unknown as SupabaseClient,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "BRANCH_FORBIDDEN" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("cero ajustado no se confunde con comisión omitida", async () => {
    const f = fixtures();
    await registerPartnerDealAtomic(
      id,
      120,
      {
        opportunity_id: id,
        deal_type: "referral",
        commission_amount: 0,
        idempotency_key: id,
      },
      "actor",
      f.session as unknown as SupabaseClient,
      f.writer as unknown as SupabaseClient,
    );
    expect(f.rpc).toHaveBeenLastCalledWith(
      "fn_crm_registrar_partner_deal_auditado",
      expect.objectContaining({
        p_requested: 0,
        p_commission: 0,
        p_suggested: 100,
      }),
    );
  });
});
