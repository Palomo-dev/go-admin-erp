import { proyectarCampana, type CampanaUnificadaRaw } from "../campaignsUnificadasLogica";
const now = new Date("2026-10-01T00:00:00Z");
const row = (v: Partial<CampanaUnificadaRaw> = {}): CampanaUnificadaRaw => ({
  id: "x", name: "Campaña", source: "voice", channel: "voice", status: "running",
  created_at: now.toISOString(), scheduled_at: null, stats: null, segment_name: "", content_name: null,
  emergency_stop: false, stopped_reason: null, rne_valid_until: "2026-10-10T00:00:00Z", rne_numbers_in_file: 2,
  voice_counts: {}, data_policy_url: "https://example.com/politica", ...v,
});
test("no cuenta buzones como conversaciones completadas ni como llamadas activas", () => {
  const r = proyectarCampana(row({ voice_counts: { completed: 200, voicemail: 4, transferred: 1, queued: 2, in_progress: 3, skipped: 1 } }), now);
  expect(r.progress).toEqual({ total: 211, done: 206, pct: 98 });
  expect(r.result).toEqual({ completed: 201, failed: 0, active: 3 });
});
test.each([null, "2026-09-30T23:59:59Z"])("RNE ausente o vencido bloquea la campaña activa: %s", rne_valid_until => {
  expect(proyectarCampana(row({ rne_valid_until }), now)).toMatchObject({ status: "blocked", blockedReasons: ["rne"] });
});
test("una política inválida bloquea; la parada conserva su motivo y tiene precedencia", () => {
  expect(proyectarCampana(row({ data_policy_url: "javascript:alert(1)" }), now).status).toBe("blocked");
  expect(proyectarCampana(row({ emergency_stop: true, stopped_reason: "Revisión del lote", rne_valid_until: null }), now)).toMatchObject({ status: "stopped", stoppedReason: "Revisión del lote" });
});
test("los borradores no aparecen como bloqueados aunque falte el RNE", () => {
  expect(proyectarCampana(row({ status: "draft", rne_valid_until: null }), now).status).toBe("draft");
});
test("mensajes usa el estado canónico y tolera contadores históricos parciales", () => {
  const r = proyectarCampana(row({ source: "message", channel: "email", status: "sending", stats: { state: "paused", counts: { sent: 5 } } as CampanaUnificadaRaw["stats"] }), now);
  expect(r.status).toBe("paused"); expect(r.progress.done).toBe(5); expect(Number.isFinite(r.progress.pct)).toBe(true);
});

test("una constancia futura sin números mantiene bloqueada la campaña", () => {
  expect(proyectarCampana(row({ rne_numbers_in_file: 0 }), now)).toMatchObject({ status: "blocked", blockedReasons: ["rne"] });
});
