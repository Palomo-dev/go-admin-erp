/**
 * Costo estimado por mensaje de WhatsApp desde `provider_pricing` (D6, sin
 * hardcode). SKUs reales (DB F0): meta/wa_{marketing|utility}_{co|mx},
 * twilio/whatsapp_fee.
 */

import { getUnitCost } from '@/lib/services/crm/pricingService';
import { countryFromPhone } from './channelService';
import type { HsmCategory, WhatsAppProvider } from './types';

export interface CostInfo {
  unit_cost_usd: number | null;
  /** Texto para la UI ("gratis (dentro de la ventana)", "≈ $0.0125"). */
  label: string;
  free: boolean;
  priced: boolean;
  country: string;
}

export async function estimateMessageCost(params: {
  provider: WhatsAppProvider;
  category: HsmCategory | null;
  recipient: string | null;
  windowOpen: boolean;
  isTemplate: boolean;
}): Promise<CostInfo> {
  const country = params.recipient ? countryFromPhone(params.recipient) : 'other';
  const fee = params.provider === 'twilio' ? (await getUnitCost('twilio', 'whatsapp_fee')) ?? 0 : 0;

  // Texto libre o utility dentro de la ventana: Meta no cobra (desde 1-jul-2025).
  if (!params.isTemplate || (params.category === 'utility' && params.windowOpen)) {
    if (params.provider === 'baileys') return { unit_cost_usd: 0, label: 'sin costo (canal QR)', free: true, priced: true, country };
    const total = fee;
    return { unit_cost_usd: total, label: total > 0 ? `≈ $${total.toFixed(4)} (fee Twilio)` : 'gratis (dentro de la ventana)', free: total === 0, priced: true, country };
  }
  const cat = params.category === 'authentication' ? 'utility' : (params.category ?? 'utility');
  const cc = country === 'co' || country === 'mx' ? country : 'co';
  const meta = await getUnitCost('meta', `wa_${cat}_${cc}`);
  if (meta === null) return { unit_cost_usd: null, label: 'sin precio en provider_pricing', free: false, priced: false, country };
  const total = meta + fee;
  return { unit_cost_usd: total, label: `≈ $${total.toFixed(4)} USD${country !== 'co' && country !== 'mx' ? ' (tarifa CO de referencia)' : ''}`, free: false, priced: true, country };
}
