/**
 * Imprimir (o reimprimir) una comanda en las impresoras de sus estaciones,
 * con la copia del ítem y, en un ajuste, qué cambió. Un solo lugar para
 * Comandas y Pedidos online (regla 7).
 */
import { PrintJobsService } from '@/lib/services/printJobsService';
import type { KitchenTicket } from '@/lib/services/kitchenService';
import { itemsParaImprimir, ticketRondaDesdeRegistro, type RegistroComanda } from './lineasCarrito';

export interface TextosImpresion {
  ajuste: (id: string | number) => string;
  mas: (n: number) => string;
  menos: (n: number) => string;
  anular: string;
  notaCambiada: string;
  alergia: string;
  /** «ANULADA» delante del encabezado al cancelar. */
  anulada?: string;
}

export function imprimirComanda(c: KitchenTicket, textos: TextosImpresion, opciones: { anulada?: boolean } = {}) {
  const ronda = ticketRondaDesdeRegistro(c as unknown as RegistroComanda);
  const nombreMesa = c.table_sessions?.restaurant_tables?.name || (c.pedido_web ? `Web ${c.pedido_web.order_number}` : 'POS');
  const encabezado = ronda.ticket_type === 'adjustment' ? `${nombreMesa} · ${textos.ajuste(ronda.adjusts_ticket_id ?? '')}` : nombreMesa;
  return PrintJobsService.enqueueKitchenTicket(c.branch_id, {
    ticketId: c.id,
    tableName: opciones.anulada && textos.anulada ? `${textos.anulada} · ${encabezado}` : encabezado,
    serverName: c.table_sessions?.serverName || c.server_name || undefined,
    createdAt: c.created_at,
    items: itemsParaImprimir(ronda, {
      mesa: nombreMesa,
      ajuste: (original) => textos.ajuste(original ?? ''),
      mas: textos.mas,
      menos: textos.menos,
      anular: textos.anular,
      notaCambiada: textos.notaCambiada,
      alergia: textos.alergia,
    }),
  });
}

/** Textos de impresión desde `posCocina.impreso` (next-intl). */
export function textosImpresionDe(t: (k: string, v?: Record<string, string | number>) => string, anulada?: string): TextosImpresion {
  return {
    ajuste: (id) => t('impreso.ajuste', { id }),
    mas: (n) => t('impreso.mas', { cantidad: n }),
    menos: (n) => t('impreso.menos', { cantidad: n }),
    anular: t('impreso.anular'),
    notaCambiada: t('impreso.nota'),
    alergia: t('impreso.alergia'),
    anulada,
  };
}
