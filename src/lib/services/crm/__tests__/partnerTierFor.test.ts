/// <reference types="jest" />
/**
 * F12 — promoción automática de tier (puro). Se evalúa al registrar un deal:
 * el partner sube al tier más alto cuyos umbrales (`min_deals` Y
 * `min_revenue`) cumple. Nunca baja.
 */
import { partnerStats, rankTiers, partnerTierFor, tierPromotion } from '../partnerTierFor';

const T = (id: string, min_deals: number, min_revenue: number) => ({ id, name: id, min_deals, min_revenue, commission_rate: 10 });
const TIERS = [T('gold', 10, 50_000_000), T('bronze', 0, 0), T('silver', 3, 10_000_000)];

describe('partnerTierFor · estadísticas', () => {
  it('cuenta deals y suma el monto de la oportunidad, excluyendo rechazados', () => {
    expect(partnerStats([
      { commission_status: 'pending', amount: 1000 },
      { commission_status: 'paid', amount: '2000' },
      { commission_status: 'rejected', amount: 99999 },
      { commission_status: 'approved', amount: null },
    ])).toEqual({ deals: 3, revenue: 3000 });
  });
  it('sin deals -> ceros', () => {
    expect(partnerStats([])).toEqual({ deals: 0, revenue: 0 });
  });
});

describe('partnerTierFor · ranking y selección', () => {
  it('ordena de menor a mayor por revenue y luego por deals', () => {
    expect(rankTiers(TIERS).map((t) => t.id)).toEqual(['bronze', 'silver', 'gold']);
    expect(rankTiers([T('a', 5, 100), T('b', 2, 100)]).map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('elige el tier más alto cuyos DOS umbrales se cumplen', () => {
    expect(partnerTierFor({ deals: 3, revenue: 10_000_000 }, TIERS)?.id).toBe('silver');
    expect(partnerTierFor({ deals: 12, revenue: 60_000_000 }, TIERS)?.id).toBe('gold');
    // Muchos deals pero poco revenue: no llega a gold.
    expect(partnerTierFor({ deals: 12, revenue: 20_000_000 }, TIERS)?.id).toBe('silver');
    // Mucho revenue pero pocos deals: tampoco.
    expect(partnerTierFor({ deals: 2, revenue: 90_000_000 }, TIERS)?.id).toBe('bronze');
  });
  it('sin ningún tier alcanzable -> null', () => {
    expect(partnerTierFor({ deals: 0, revenue: 0 }, [T('x', 1, 1)])).toBeNull();
    expect(partnerTierFor({ deals: 5, revenue: 5 }, [])).toBeNull();
  });
  it('umbrales como texto (numeric de PostgREST) se interpretan', () => {
    const tiers = [{ id: 's', name: 's', min_deals: '3' as unknown as number, min_revenue: '100' as unknown as number, commission_rate: 1 }];
    expect(partnerTierFor({ deals: 3, revenue: 100 }, tiers)?.id).toBe('s');
    expect(partnerTierFor({ deals: 2, revenue: 100 }, tiers)).toBeNull();
  });
});

describe('partnerTierFor · promoción', () => {
  it('sin tier actual y alcanza bronze -> promociona a bronze', () => {
    expect(tierPromotion(null, { deals: 0, revenue: 0 }, TIERS)?.tierId).toBe('bronze');
  });
  it('de bronze a silver al cumplir umbrales', () => {
    expect(tierPromotion('bronze', { deals: 3, revenue: 10_000_000 }, TIERS)?.tierId).toBe('silver');
  });
  it('ya está en el tier alcanzable -> null (sin cambio)', () => {
    expect(tierPromotion('silver', { deals: 4, revenue: 12_000_000 }, TIERS)).toBeNull();
  });
  it('nunca degrada: en gold con pocas cifras sigue en gold', () => {
    expect(tierPromotion('gold', { deals: 0, revenue: 0 }, TIERS)).toBeNull();
  });
  it('tier actual desconocido (id huérfano, sin FK en la BD) se trata como sin tier', () => {
    expect(tierPromotion('huerfano', { deals: 3, revenue: 10_000_000 }, TIERS)?.tierId).toBe('silver');
  });
  it('puede saltar varios tiers de una vez', () => {
    expect(tierPromotion(null, { deals: 50, revenue: 99_000_000 }, TIERS)?.tierId).toBe('gold');
  });
});
