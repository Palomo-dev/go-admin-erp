/**
 * Métodos de pago en pantalla, sin React. Los métodos son **los de la
 * organización** (`organization_payment_methods` + `payment_methods`, que la
 * pantalla lee por su servicio): el kit nunca trae una lista fija. Aquí solo
 * se decide cuáles van en botones, cuáles en «Otro», su atajo por posición y
 * un icono de respaldo según el código.
 */
import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  Landmark,
  QrCode,
  ScrollText,
  Smartphone,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

export interface MetodoPagoOpcion {
  /** `payment_methods.code` («cash», «card», «transfer», «wompi», «nequi»…). */
  codigo: string;
  /** Nombre que configuró la organización. */
  nombre: string;
  icono?: LucideIcon;
  deshabilitado?: boolean;
  /** Por qué no se puede usar ahora («Sin caja abierta», «Wompi sin configurar»). */
  motivo?: string;
}

/**
 * Reparte los métodos: si caben en `maximo` botones, todos visibles; si no,
 * `maximo − 1` botones y el resto en «Otro». El orden es el de la organización.
 */
export function repartirMetodos<M extends MetodoPagoOpcion>(metodos: readonly M[], maximo = 4): { visibles: M[]; resto: M[] } {
  const tope = Math.max(1, Math.floor(maximo));
  if (metodos.length <= tope) return { visibles: [...metodos], resto: [] };
  return { visibles: metodos.slice(0, tope - 1), resto: metodos.slice(tope - 1) };
}

/** Atajo por posición de los botones visibles: Alt+1 … Alt+9. */
export function atajoMetodo(indice: number, prefijo = 'Alt'): string | undefined {
  return indice >= 0 && indice < 9 ? `${prefijo}+${indice + 1}` : undefined;
}

const ICONOS: readonly [RegExp, LucideIcon][] = [
  [/^(cash|efectivo|contado)$/, Banknote],
  // Antes que «tarjeta»: `credit_note` contiene «credit».
  [/(credit.?note|nota|saldo|anticipo)/, Landmark],
  [/(card|tarjeta|credit|debit|credito|debito|visa|master|datafono)/, CreditCard],
  [/(transfer|transferencia|pse|bank|banco|consignacion|ach|spei)/, ArrowLeftRight],
  [/(qr|wompi|bre.?b)/, QrCode],
  [/(nequi|daviplata|movil|mobile|yape|plin|mercado.?pago)/, Smartphone],
  [/(check|cheque)/, ScrollText],
];

/** Icono de respaldo si la organización no trae uno: por el código, sin tildes. */
export function iconoMetodoPago(codigo: string | null | undefined): LucideIcon {
  const c = (codigo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  for (const [patron, icono] of ICONOS) if (patron.test(c)) return icono;
  return WalletCards;
}

/** El método elegido está en «Otro». */
export function elegidoEnResto(resto: readonly MetodoPagoOpcion[], valor: string | null | undefined): MetodoPagoOpcion | null {
  if (!valor) return null;
  return resto.find((m) => m.codigo === valor) ?? null;
}
