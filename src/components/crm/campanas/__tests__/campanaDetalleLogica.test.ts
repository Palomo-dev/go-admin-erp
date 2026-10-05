import { resumenCampana, campaignPauseKey } from '../id/campanaDetalleLogica';
import type { CampaignStatsResult } from '@/components/crm/whatsapp/api';
const base: CampaignStatsResult = {
  counts: { total: 25000, pending: 4000, queued: 1000, sent: 15000, delivered: 12000, read: 10000, replied: 5000, failed: 4000, skipped: 1000, cost: 10 },
  estimated_cost: 15, actual_cost: null, known_actual_cost: 10, actual_cost_complete: false, unpriced_contacts: 3000,
  by_error_code: {}, by_skip_reason: {}, timeline: [],
};
test('no suma estados acumulativos ni usa el total guardado antes de recalcular audiencia', () => {
  expect(resumenCampana(base)).toMatchObject({ total: 25000, processed: 20000, percentage: 80, remaining: 5000 });
});
test('un subtotal conocido no se convierte en costo real completo', () => {
  expect(resumenCampana(base)).toMatchObject({ actualCost: null, knownCost: 10, unpriced: 3000 });
});
test('cero confirmado sí se conserva; audiencia vacía no divide por cero', () => {
  expect(resumenCampana({ ...base, counts: { ...base.counts, total: 0 }, actual_cost: 0, actual_cost_complete: true, unpriced_contacts: 0 }))
    .toMatchObject({ actualCost: 0, percentage: 0 });
});
test('un código desconocido muestra una explicación general, sin filtrarse a la interfaz', () => {
  expect(campaignPauseKey('rne_required')).toBe('rne_required');
  expect(campaignPauseKey('tabla_interna:detail')).toBe('other');
});
