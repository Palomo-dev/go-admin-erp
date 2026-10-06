/**
 * Impresión de la mesa: pre-cuenta (80 mm en la estación de caja o el
 * navegador) y la comanda de la ronda (por estación o el navegador). Es la
 * misma lógica que tenía la pantalla de la mesa; se movió aquí sin cambiar
 * reglas para que la pantalla nueva la reutilice.
 */
import { PrintJobsService } from '@/lib/services/printJobsService';
import { PrintService } from '@/lib/services/printService';
import { PedidosService } from '@/components/pos/mesas/id/pedidosService';
import type { SaleItem } from '@/components/pos/mesas/id/types';
import type { TextosAjusteImpreso } from '@/lib/pos/cocina/lineasCarrito';

export interface DatosNegocio {
  organizacion?: Record<string, unknown> | null;
  sucursal?: { name?: string; address?: string; phone?: string } | null;
}

function negocio(d: DatosNegocio) {
  const o = (d.organizacion ?? {}) as Record<string, string | undefined>;
  return d.organizacion
    ? {
        name: o.name || '',
        nit: o.nit || o.tax_id || '',
        phone: o.phone || '',
        address: o.address || '',
        email: o.email || '',
        city: o.city || '',
        logoUrl: o.logo_url || undefined,
        fiscal_responsibilities: (d.organizacion as { fiscal_responsibilities?: string[] }).fiscal_responsibilities || undefined,
      }
    : undefined;
}

function sucursal(d: DatosNegocio) {
  return d.sucursal ? { name: d.sucursal.name || '', address: d.sucursal.address || '', phone: d.sucursal.phone || '' } : undefined;
}

function notasDe(item: SaleItem): Record<string, unknown> {
  if (typeof item.notes === 'string') {
    try {
      return JSON.parse(item.notes || '{}');
    } catch {
      return {};
    }
  }
  return (item.notes as Record<string, unknown>) || {};
}

/** Pre-cuenta: solo lo que falta por pagar (las líneas pagadas por partes no salen). */
export async function imprimirPreCuentaMesa(d: DatosNegocio & {
  branchId: number | null;
  tableId: string;
  mesa: string;
  mesero?: string | null;
  items: SaleItem[];
  subtotal: number;
  impuesto: number;
  descuento: number;
  total: number;
  timezone: string;
  /** Salta la impresora física (botón «Imprimir pre-cuenta»: PDF del navegador). */
  soloNavegador?: boolean;
}): Promise<'impresora' | 'navegador'> {
  const info = negocio(d);
  const suc = sucursal(d);
  if (d.branchId && !d.soloNavegador) {
    try {
      const { enqueued } = await PrintJobsService.enqueuePreCuenta(d.branchId, {
        tableId: d.tableId,
        tableName: d.mesa,
        serverName: d.mesero ?? undefined,
        createdAt: new Date().toISOString(),
        subtotal: d.subtotal,
        taxTotal: d.impuesto,
        discountTotal: d.descuento,
        total: d.total,
        items: d.items.map((item) => {
          const n = notasDe(item);
          return {
            productName: item.product?.name || (n.product_name as string) || 'Producto',
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            total: Number(item.total),
            taxAmount: Number(item.tax_amount),
            discountAmount: Number(item.discount_amount),
            variantData: item.product?.variant_data || null,
            modifiers: Array.isArray(n.modifiers)
              ? (n.modifiers as Array<{ name: string; extraPrice?: number }>).map((m) => ({ name: m.name, extraPrice: m.extraPrice || 0 }))
              : null,
          };
        }),
        businessName: info?.name,
        businessNit: info?.nit,
        businessPhone: info?.phone,
        businessAddress: info?.address,
        businessEmail: info?.email,
        businessCity: info?.city,
        businessFiscalResponsibilities: info?.fiscal_responsibilities,
        businessLogoUrl: info?.logoUrl,
        branchName: suc?.name,
        branchAddress: suc?.address,
        branchPhone: suc?.phone,
      });
      if (enqueued > 0) return 'impresora';
    } catch (err) {
      console.warn('No se pudo encolar la pre-cuenta:', err);
    }
  }
  PrintService.printPreCuenta(d.mesa, d.items, d.subtotal, d.impuesto, d.descuento, d.total, info, suc, d.mesero ?? undefined, undefined, d.timezone);
  return 'navegador';
}

/**
 * Comanda de la ronda recién enviada: se sellan como impresas y salen por la
 * impresora de cada estación; sin impresora, por el navegador. Devuelve si
 * alguna estación se quedó sin impresora (el aviso lo dice, T4).
 */
export async function imprimirRondaMesa(d: DatosNegocio & {
  sesionId: string;
  branchId: number | null;
  mesa: string;
  mesero?: string | null;
  textos: TextosAjusteImpreso;
}): Promise<{ impresas: number; sinImpresora: boolean }> {
  const tickets = await PedidosService.enviarComandaCocina(d.sesionId, d.textos);
  if (tickets.length === 0) return { impresas: 0, sinImpresora: false };
  const items = tickets.flatMap((t) => t.items);
  let enqueued = 0;
  if (d.branchId) {
    try {
      const r = await PrintJobsService.enqueueKitchenTicket(d.branchId, {
        ticketId: tickets[0].ticketId,
        tableName: d.mesa,
        serverName: d.mesero ?? undefined,
        createdAt: tickets[0].createdAt,
        items,
        businessName: negocio(d)?.name,
        branchName: sucursal(d)?.name,
      });
      enqueued = r.enqueued;
    } catch (err) {
      console.warn('No se pudo encolar la comanda:', err);
    }
  }
  if (enqueued === 0) {
    PrintService.printComanda(d.mesa, d.mesero ?? undefined, items, negocio(d), sucursal(d));
  }
  return { impresas: enqueued, sinImpresora: enqueued === 0 };
}
