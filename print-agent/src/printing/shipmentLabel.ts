/**
 * Rotulo de envio que pintan las dos salidas del agente (ESC/POS y HTML).
 *
 * El ERP manda los textos ya resueltos en `payload.label` (version 2, `rotuloEnvio.ts` ›
 * `textosRotulo`): idioma de la organizacion, montos, fechas y peso formateados. Un payload sin
 * `label` (clientes viejos, la muestra de Configuracion › Impresiones) se arma aqui con los campos
 * clasicos y los textos en espanol, con las mismas reglas: un solo numero (la guia, no el
 * tracking interno), sin productos ni precios, y «PAGADO · NO COBRAR» cuando no hay que cobrar.
 *
 * TypeScript puro, sin Node ni DOM (ver index.ts).
 */
import type { ShipmentGuidePrintPayload, ShipmentLabelPayload } from './types';
import { moneyFormatter } from './money';

function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]).join('');
  return (letters || '·').toUpperCase();
}

export function resolveShipmentLabel(payload: ShipmentGuidePrintPayload): ShipmentLabelPayload {
  if (payload.label && payload.label.version === 2) return payload.label;
  const number = payload.shipmentNumber || payload.trackingNumber || payload.shipmentId;
  const cod = payload.codAmount && payload.codAmount > 0 ? moneyFormatter(payload, { symbol: true })(payload.codAmount) : null;
  const packages = Math.max(1, Math.floor(payload.packageCount || 1));
  return {
    version: 2,
    senderLabel: 'REMITENTE',
    storeName: payload.businessName || null,
    initials: initialsOf(payload.businessName),
    logoUrl: null,
    branchLine: [payload.senderName, payload.senderPhone ? `Tel. ${payload.senderPhone}` : null].filter(Boolean).join(' · ') || null,
    receiverLabel: 'PARA · DESTINATARIO',
    receiverName: payload.receiverName || null,
    address: payload.receiverAddress || null,
    neighborhood: null,
    destination: payload.receiverCity ? payload.receiverCity.toUpperCase() : null,
    phone: payload.receiverPhone ? `Tel. ${payload.receiverPhone}` : null,
    instructions: payload.receiverInstructions ? `Indicaciones: ${payload.receiverInstructions}` : null,
    packageLabel: 'PAQUETE',
    packageText: `1 de ${packages}`,
    weightLabel: 'PESO',
    weightText: payload.weightKg ? `${payload.weightKg} kg` : null,
    deliveryLabel: 'ENTREGA',
    deliveryText: null,
    carrierGuideLabel: 'GUÍA DE LA TRANSPORTADORA',
    carrierGuideText: null,
    carrierGuideCode: null,
    charge: cod
      ? { kind: 'collect', title: 'COBRAR AL ENTREGAR', amount: cod, note: 'No entregue sin cobrar.' }
      : { kind: 'paid', title: 'PAGADO · NO COBRAR', note: 'El cliente ya pagó. No reciba dinero.' },
    handling: payload.isFragile ? 'FRÁGIL · MANIPULAR CON CUIDADO · ESTE LADO ARRIBA' : null,
    guideNumber: number,
    guideLabel: 'GUÍA',
    qrData: number,
    qrCaption: null,
    qrCaptionLong: null,
    footer: null,
    cutLabel: 'corte',
  };
}
