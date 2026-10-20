'use client';

import React, { useState, useEffect, useId, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Check } from 'lucide-react';
import { ResumenTotales } from '@/components/kit/ResumenTotales';
import { clasesBadgeTono } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { POSService } from '@/lib/services/posService';
import { cartLinesSignature } from '@/lib/pos/display/emitter';
import { Cart } from './types';
import { etiquetaSelectorImpuestos, impuestosAplicadosIniciales, resumenImpuestos } from '@/lib/pos/venta/resumenImpuestos';
import { guardarPreferenciaImpuestos, impuestosDePreferencia, leerPreferenciaImpuestos } from '@/lib/pos/venta/preferenciaImpuestos';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { calcularLineaDelCarrito, desgloseDeLineas, totalesDeLineasDelCarrito } from '@/lib/pos/venta/calculoLineaCarrito';

interface OrganizationTax {
  id: string;
  organization_id: number;
  template_id?: number;
  name: string;
  rate: number;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  tax_included?: boolean;
  created_at: string;
  updated_at: string;
}

interface TaxBreakdown {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

interface TaxSummaryProps {
  cart: Cart;
  taxIncluded: boolean;
  onTaxIncludedChange: (included: boolean) => void;
  onAppliedTaxesChange?: (taxIds: string[]) => void;
  /**
   * `cartId` es el carrito con el que se calcularon: el padre debe ignorar
   * totales de otro carrito (ver CartView). `linesSignature` identifica las
   * LÍNEAS exactas con las que se calcularon (`cartLinesSignature`, los
   * mismos campos que compara `sameLines` en el emisor de la pantalla del
   * cliente): el padre descarta un reenvío de totales viejos cuando las
   * líneas ya cambiaron.
   */
  onTotalsChange?: (totals: { subtotal: number; totalTaxAmount: number; finalTotal: number; cartId: string; linesSignature: string }) => void;
  /**
   * POS: recordar los impuestos elegidos por organización y sucursal y
   * aplicarlos a los carritos nuevos (`preferenciaImpuestos.ts`).
   */
  recordarPreferencia?: boolean;
  className?: string;
}

/** Totales que TaxSummary comunica al padre (la forma del parámetro de `onTotalsChange`). */
export type TaxSummaryTotals = Parameters<NonNullable<TaxSummaryProps['onTotalsChange']>>[0];

export function TaxSummary({ 
  cart, 
  taxIncluded, 
  onTaxIncludedChange, 
  onAppliedTaxesChange,
  onTotalsChange,
  recordarPreferencia = false,
  className 
}: TaxSummaryProps) {
  const moneda = useMonedaOrganizacion();
  const t = useTranslations('posVenta.resumen');
  const idSwitch = useId();
  const [organizationTaxes, setOrganizationTaxes] = useState<OrganizationTax[]>([]);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});
  const [hasProductSpecificTaxes, setHasProductSpecificTaxes] = useState(false);
  const [taxSelectorOpen, setTaxSelectorOpen] = useState(false);
  // Firma de las líneas del carrito (id, cantidad, precio, descuento, nota, modificadores):
  // etiqueta cada resultado con las líneas exactas con las que se calculó.
  const linesSignature = useMemo(() => cartLinesSignature(cart), [cart]);
  const cuentas = useMemo(() => {
    const lineas = cart.items.map((item) => calcularLineaDelCarrito(item, [], taxIncluded));
    const totales = totalesDeLineasDelCarrito(lineas);
    return { totales, desglose: desgloseDeLineas(lineas) };
  }, [cart.items, taxIncluded]);
  const taxBreakdown: TaxBreakdown[] = useMemo(() => cuentas.desglose.map((fila) => ({
    taxId: `${fila.name}|${fila.rate}`,
    name: fila.name,
    rate: fila.rate,
    baseAmount: 0,
    taxAmount: fila.amount,
  })), [cuentas]);
  const calculatedTotals: TaxSummaryTotals = useMemo(() => ({
    subtotal: cuentas.totales.subtotal,
    totalTaxAmount: cuentas.totales.taxTotal,
    finalTotal: cuentas.totales.total,
    cartId: cart.id,
    linesSignature,
  }), [cuentas, cart.id, linesSignature]);
  // Mientras el carrito todavía no resolvió la tasa de una línea nueva, no
  // se pinta «sin impuestos» ni un total en cero: se queda el esqueleto.
  const calculandoLineas = cart.items.some((item) => item.tax_rate == null);

  // Cargar impuestos de la organización
  useEffect(() => {
    const loadOrganizationTaxes = async () => {
      try {
        const taxes = await POSService.getOrganizationTaxes();
        setOrganizationTaxes(taxes);
        
        // Inicializar impuestos aplicados: usar los del carrito si existen, sino los predeterminados
        // (src/lib/pos/venta/resumenImpuestos.ts).
        // Carrito sin selección propia en el POS: arranca con la última elección
        // del cajero en esta sucursal, si la hay.
        const deLaPreferencia = !cart.applied_tax_ids && recordarPreferencia
          ? impuestosDePreferencia(leerPreferenciaImpuestos(cart.organization_id, cart.branch_id), taxes.map((t: OrganizationTax) => t.id))
          : null;
        const { aplicados, predeterminadosAGuardar } = impuestosAplicadosIniciales(
          taxes as OrganizationTax[],
          cart.applied_tax_ids ?? deLaPreferencia ?? undefined,
        );
        setAppliedTaxes(aplicados);
        // Si el carrito aún no tiene selección, persistir la de la preferencia o los predeterminados
        if (deLaPreferencia) {
          onAppliedTaxesChange?.(deLaPreferencia);
        } else if (predeterminadosAGuardar) {
          onAppliedTaxesChange?.(predeterminadosAGuardar);
        }
        
      } catch (error) {
        console.error('Error loading organization taxes:', error);
      }
    };

    loadOrganizationTaxes();
    // Una sola vez por carrito: CartView monta TaxSummary con key={cart.id}.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El selector de impuestos de la organización solo aparece si ningún
  // producto trae los suyos (esos mandan sobre la selección del carrito).
  useEffect(() => {
    let cancelado = false;
    const ids = cart.items.map((item) => item.product_id);
    if (ids.length === 0) {
      setHasProductSpecificTaxes(false);
      return;
    }
    Promise.all(ids.map((id) => POSService.getProductTaxes(id).catch(() => [])))
      .then((listas) => {
        if (!cancelado) setHasProductSpecificTaxes(listas.some((lista) => lista.length > 0));
      })
      .catch(() => {
        if (!cancelado) setHasProductSpecificTaxes(false);
      });
    return () => { cancelado = true; };
  }, [cart.items]);

  // Comunicar totales al padre cuando cambien
  useEffect(() => {
    onTotalsChange?.(calculatedTotals);
  }, [calculatedTotals, onTotalsChange]);

  // El descuento ya está restado en la regla de la línea. No se vuelve a restar.
  const { subtotal, totalTaxAmount, finalTotal } = calculatedTotals;
  // Filas del Resumen (solo presentación de lo ya calculado): L27, src/lib/pos/venta/resumenImpuestos.ts.
  const resumen = resumenImpuestos({ subtotal, totalTaxAmount, finalTotal, discountTotal: cart.discount_total, taxBreakdown });
  const total = resumen.total;

  // El dibujo es `ResumenTotales` del kit (paso 7): Subtotal bruto ·
  // Descuento · un renglón por impuesto con su nombre y tarifa (informativo
  // si los precios los incluyen) · Total. El interruptor «Impuestos
  // incluidos» y el selector de impuestos de la organización van en la
  // cabecera. Nada de esto calcula: son las cifras de `calculatedTotals`.
  const selectorImpuestos = !hasProductSpecificTaxes && organizationTaxes.length > 0 && (
    <Popover open={taxSelectorOpen} onOpenChange={setTaxSelectorOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={taxSelectorOpen}
          aria-label={t('impuestosDisponibles')}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3 text-xs text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="truncate">
            {(() => {
              const etiqueta = etiquetaSelectorImpuestos(appliedTaxes, organizationTaxes);
              if (etiqueta.tipo === 'ninguno') return t('ningunImpuesto');
              if (etiqueta.tipo === 'uno') return t('unImpuesto', { nombre: etiqueta.nombre, tasa: etiqueta.tasa });
              return t('variosImpuestos', { n: etiqueta.cantidad });
            })()}
          </span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <p className="mb-2 px-1 text-xs text-fg-secondary">{t('seleccionaImpuestos')}</p>
        <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto" role="listbox" aria-multiselectable="true" aria-label={t('impuestosDisponibles')}>
          {organizationTaxes.map((tax) => (
            <li key={tax.id} role="option" aria-selected={!!appliedTaxes[tax.id]}>
              <button
                type="button"
                onClick={() => {
                  const next = { ...appliedTaxes, [tax.id]: !appliedTaxes[tax.id] };
                  setAppliedTaxes(next);
                  const selectedIds = Object.keys(next).filter(id => next[id]);
                  onAppliedTaxesChange?.(selectedIds);
                  if (recordarPreferencia) {
                    guardarPreferenciaImpuestos(cart.organization_id, cart.branch_id, { impuestos: selectedIds });
                  }
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center rounded border border-line-strong">
                  {appliedTaxes[tax.id] && <Check className="size-3 text-brand" />}
                </span>
                <span className="flex-1">{t('unImpuesto', { nombre: tax.name, tasa: tax.rate })}</span>
                {tax.is_default && <span className={clasesBadgeTono('neutro', 'suave', 'sm')}>{t('predeterminado')}</span>}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );

  // Figma `906:115587`: una sola fila con el Switch «Impuestos incluidos»,
  // «Impuestos disponibles» y el selector (se parte en dos si no cabe).
  const cabecera = (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
      <Switch id={idSwitch} checked={taxIncluded} onCheckedChange={onTaxIncludedChange} />
      <label htmlFor={idSwitch} className="cursor-pointer">
        {t('impuestosIncluidos')}
      </label>
      <span aria-hidden="true" className="ml-auto">
        {t('impuestosDisponibles')}
      </span>
      <div className="min-w-[8rem] flex-1">{selectorImpuestos}</div>
    </div>
  );

  return (
    <ResumenTotales
      className={className}
      moneda={moneda}
      cargando={calculandoLineas}
      etiqueta={t('titulo')}
      cabecera={cart.items.length > 0 ? cabecera : undefined}
      subtotal={cart.items.length > 0 ? resumen.subtotalBruto : 0}
      descuentos={resumen.mostrarDescuento ? [{ id: 'descuento', etiqueta: t('descuento'), importe: resumen.descuento }] : []}
      impuestos={taxBreakdown.map((tax) => ({ nombre: tax.name, tarifa: tax.rate, importe: tax.taxAmount }))}
      total={cart.items.length > 0 ? (calculandoLineas ? cart.total : total) : 0}
      impuestosIncluidos={taxIncluded}
      sinImpuestosConfigurados={cart.items.length > 0 && !calculandoLineas && resumen.sinImpuestosConfigurados}
    />
  );
}
