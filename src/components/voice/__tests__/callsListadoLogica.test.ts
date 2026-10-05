import {
  parametrosLlamadas,
  EMPTY_FILTERS,
  csvLlamadas,
} from "../callsListadoLogica";
import { normalizarFechasLlamadas } from "@/lib/services/crm/callFiltersLogica";
import type { CallListRow } from "@/lib/services/crm/callManagementService";
it.each([
  ["2026-03-08", 23],
  ["2026-11-01", 25],
])("incluye el día DST %s completo (%i horas)", (day, hours) => {
  const range = normalizarFechasLlamadas(
    { from_date: day, to_date: day },
    "America/New_York",
  );
  expect(
    (Date.parse(range.to_date!) - Date.parse(range.from_date!)) / 3600000,
  ).toBe(hours);
  expect(range.to_date_exclusive).toBe(true);
});
it("instantes existentes conservan el offset", () => {
  const filters = {
    from_date: "2026-09-30T03:00:00-03:00",
    to_date: "2026-09-30T04:00:00-03:00",
  };
  expect(normalizarFechasLlamadas(filters, "Asia/Tokyo")).toEqual(filters);
});
it("paginación y días sin conversión del navegador", () => {
  const params = parametrosLlamadas(
    {
      ...EMPTY_FILTERS,
      fromDate: "2026-09-30",
      q: "  promesa entrega ",
      mine: true,
    },
    3,
    25,
  );
  expect(Object.fromEntries(params)).toEqual({
    from_date: "2026-09-30",
    q: "promesa entrega",
    user_id: "me",
    offset: "50",
    limit: "25",
  });
});
it("CSV conserva comillas, neutraliza fórmulas y formatea fecha en la zona suministrada", () => {
  const row = {
    started_at: "2026-10-01T01:00:00Z",
    customer: { full_name: '=HYPERLINK("x")' },
    to_number: "+12025550197",
    direction: "outbound",
    mode: "manual",
  } as CallListRow;
  const csv = csvLlamadas([row], ["fecha"], () => "30/09/2026 20:00");
  expect(csv).toContain("30/09/2026 20:00");
  expect(csv).toContain('\'=HYPERLINK(""x"")');
  expect(csv).toContain("'+12025550197");
});
