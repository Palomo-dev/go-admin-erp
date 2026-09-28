'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Check } from 'lucide-react';
import { ResumenTotales } from '@/components/kit/ResumenTotales';
import { POSService } from '@/lib/services/posService';
import { cartLinesSignature } from '@/lib/pos/display/emitter';
import { Cart } from './types';
import { etiquetaSelectorImpuestos, impuestosAplicadosIniciales, resumenImpuestos } from '@/lib/pos/venta/resumenImpuestos';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { 
  calculateCartTaxes, 
  type OrganizationTax as TaxUtilOrganizationTax,
  type TaxCalculationItem 
} from '@/lib/utils/taxCalculations';

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
  className 
}: TaxSummaryProps) {
  const moneda = useMonedaOrganizacion();
  const t = useTranslations('posVenta.resumen');
  const [organizationTaxes, setOrganizationTaxes] = useState<OrganizationTax[]>([]);
  const [taxBreakdown, setTaxBreakdown] = useState<TaxBreakdown[]>([]);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});
  const [loading, setLoading] = useState(true);
  const [hasProductSpecificTaxes, setHasProductSpecificTaxes] = useState(false);
  const [taxSelectorOpen, setTaxSelectorOpen] = useState(false);
  const [calculatedTotals, setCalculatedTotals] = useState<TaxSummaryTotals>({
    subtotal: 0,
    totalTaxAmount: 0,
    finalTotal: 0,
    cartId: cart.id,
    linesSignature: cartLinesSignature(cart),
  });

  // Firma de las líneas del carrito (id, cantidad, precio, descuento, nota, modificadores):
  // etiqueta cada resultado con las líneas exactas con las que se calculó. Es un string:
  // un carrito nuevo con las mismas líneas produce la misma firma y no dispara recálculo.
  const linesSignature = useMemo(() => cartLinesSignature(cart), [cart]);

  // Cargar impuestos de la organización
  useEffect(() => {
    const loadOrganizationTaxes = async () => {
      try {
        setLoading(true);
        const taxes = await POSService.getOrganizationTaxes();
        setOrganizationTaxes(taxes);
        
        // Inicializar impuestos aplicados: usar los del carrito si existen, sino los predeterminados
        // (src/lib/pos/venta/resumenImpuestos.ts).
        const { aplicados, predeterminadosAGuardar } = impuestosAplicadosIniciales(taxes as OrganizationTax[], cart.applied_tax_ids);
        setAppliedTaxes(aplicados);
        // Si el carrito aún no tiene selección, persistir los predeterminados
        if (predeterminadosAGuardar) {
          onAppliedTaxesChange?.(predeterminadosAGuardar);
        }
        
      } catch (error) {
        console.error('Error loading organization taxes:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOrganizationTaxes();
  }, []);

  // Calcular desglose de impuestos usando la utilidad
  useEffect(() => {
    // El cálculo es asíncrono: si el carrito cambia a mitad (cobro que
    // elimina el carrito y activa otro), el resultado viejo no debe pisar al
    // nuevo ni salir etiquetado con el id del carrito nuevo.
    let cancelled = false;
    const cartId = cart.id;
    const calculateTaxBreakdown = async () => {
      if (cart.items.length === 0 || organizationTaxes.length === 0) {
        setTaxBreakdown([]);
        setCalculatedTotals({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0, cartId, linesSignature });
        return;
      }

      let hasProductTaxes = false;
      let combinedSubtotal = 0;
      let combinedTaxAmount = 0;
      let combinedFinalTotal = 0;
      const combinedBreakdown: {[taxId: string]: TaxBreakdown} = {};
      
      // Procesar cada ítem del carrito
      for (const item of cart.items) {
        try {
          // Si el ítem tiene impuesto excluido, sumar sin impuestos
          if (item.tax_excluded) {
            const lineTotal = item.quantity * item.unit_price;
            combinedSubtotal += lineTotal;
            combinedFinalTotal += lineTotal;
            continue;
          }

          const productTaxes = await POSService.getProductTaxes(item.product_id);
          
          const taxItem: TaxCalculationItem = {
            quantity: item.quantity,
            unit_price: item.unit_price,
            product_id: item.product_id,
            discount_amount: item.discount_amount || 0,
            tax_rate: item.tax_rate || undefined,
            tax_included: item.tax_excluded ? false : (item.tax_included ?? taxIncluded ?? undefined)
          };
          
          let result;
          
          if (productTaxes.length > 0) {
            hasProductTaxes = true;
            // Usar impuestos específicos del producto
            const productAppliedTaxes: {[key: string]: boolean} = {};
            const productOrgTaxes: TaxUtilOrganizationTax[] = [];
            
            // Determinar si el impuesto está incluido: usar config del impuesto o el toggle global
            let itemTaxIncluded = taxIncluded;
            
            productTaxes.forEach(relation => {
              if (relation.organization_taxes && relation.organization_taxes.is_active) {
                productAppliedTaxes[relation.organization_taxes.id] = true;
                // Si algún impuesto del producto tiene tax_included configurado, usarlo
                if (relation.organization_taxes.tax_included === true) {
                  itemTaxIncluded = true;
                }
                productOrgTaxes.push({
                  id: relation.organization_taxes.id,
                  name: relation.organization_taxes.name,
                  rate: parseFloat(relation.organization_taxes.rate.toString()),
                  is_default: relation.organization_taxes.is_default,
                  is_active: relation.organization_taxes.is_active
                });
              }
            });
            
            result = calculateCartTaxes(
              [taxItem],
              productAppliedTaxes,
              productOrgTaxes,
              itemTaxIncluded
            );
          } else {
            // Usar impuestos de organización
            // Determinar si alguno de los impuestos aplicados tiene tax_included
            const anyTaxIncluded = organizationTaxes.some(tax => appliedTaxes[tax.id] && tax.tax_included);
            const effectiveTaxIncluded = taxIncluded || anyTaxIncluded;
            
            const orgTaxesForCalculation: TaxUtilOrganizationTax[] = organizationTaxes.map(tax => ({
              id: tax.id,
              name: tax.name,
              rate: parseFloat(tax.rate.toString()),
              is_default: tax.is_default,
              is_active: tax.is_active
            }));
            
            result = calculateCartTaxes(
              [taxItem],
              appliedTaxes,
              orgTaxesForCalculation,
              effectiveTaxIncluded
            );
          }
          
          // Acumular totales
          combinedSubtotal += result.subtotal;
          combinedTaxAmount += result.totalTaxAmount;
          combinedFinalTotal += result.finalTotal;
          
          // Combinar breakdown
          result.taxBreakdown.forEach(tax => {
            if (combinedBreakdown[tax.taxId]) {
              combinedBreakdown[tax.taxId].baseAmount += tax.baseAmount;
              combinedBreakdown[tax.taxId].taxAmount += tax.taxAmount;
            } else {
              combinedBreakdown[tax.taxId] = { ...tax };
            }
          });
          
        } catch (error) {
          console.error('Error processing item taxes:', error);
          // En caso de error, agregar el ítem sin impuestos
          const lineTotal = item.quantity * item.unit_price;
          combinedSubtotal += lineTotal;
          combinedFinalTotal += lineTotal;
        }
      }
      
      if (cancelled) return;
      // Actualizar estados
      setHasProductSpecificTaxes(hasProductTaxes);
      setTaxBreakdown(Object.values(combinedBreakdown));
      setCalculatedTotals({
        subtotal: Math.round(combinedSubtotal * 100) / 100,
        totalTaxAmount: Math.round(combinedTaxAmount * 100) / 100,
        finalTotal: Math.round(combinedFinalTotal * 100) / 100,
        cartId,
        linesSignature,
      });
    };

    calculateTaxBreakdown();
    return () => {
      cancelled = true;
    };
  }, [cart.id, cart.items, linesSignature, organizationTaxes, appliedTaxes, taxIncluded]);

  // Comunicar totales al padre cuando cambien
  useEffect(() => {
    onTotalsChange?.(calculatedTotals);
  }, [calculatedTotals, onTotalsChange]);

  // Usar los totales calculados correctamente
  // calculateCartTaxes ya resta el descuento en lineTotal, NO restarlo de nuevo
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
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center rounded border border-line-strong">
                  {appliedTaxes[tax.id] && <Check className="size-3 text-brand" />}
                </span>
                <span className="flex-1">{t('unImpuesto', { nombre: tax.name, tasa: tax.rate })}</span>
                {tax.is_default && (
                  <span className="inline-flex h-4 items-center rounded-full bg-subtle px-1.5 text-[10px] text-fg-secondary">{t('predeterminado')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );

  const cabecera = (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-fg-secondary">
        <span>{t('impuestosIncluidos')}</span>
        <span className="relative inline-flex items-center">
          <input
            type="checkbox"
            role="switch"
            checked={taxIncluded}
            onChange={(e) => onTaxIncludedChange(e.target.checked)}
            className="peer sr-only"
          />
          <span aria-hidden="true" className="h-4 w-8 rounded-full bg-line-strong transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-3 after:rounded-full after:bg-surface after:transition-transform peer-checked:bg-brand-action peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand" />
        </span>
      </label>
      {selectorImpuestos}
    </div>
  );

  return (
    <ResumenTotales
      className={className}
      moneda={moneda}
      cargando={loading}
      etiqueta={t('titulo')}
      cabecera={cart.items.length > 0 ? cabecera : undefined}
      subtotal={cart.items.length > 0 ? resumen.subtotalBruto : 0}
      descuentos={resumen.mostrarDescuento ? [{ id: 'descuento', etiqueta: t('descuento'), importe: resumen.descuento }] : []}
      impuestos={taxBreakdown.map((tax) => ({ nombre: tax.name, tarifa: tax.rate, importe: tax.taxAmount }))}
      total={cart.items.length > 0 ? total : 0}
      impuestosIncluidos={taxIncluded}
      sinImpuestosConfigurados={cart.items.length > 0 && resumen.sinImpuestosConfigurados}
    />
  );
}
