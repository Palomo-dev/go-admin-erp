'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { POSService } from '@/lib/services/posService';
import {
  calculateCartTaxes,
  type OrganizationTax as TaxUtilOrganizationTax,
  type TaxCalculationItem,
  type TaxResult,
} from '@/lib/utils/taxCalculations';

export interface MesaTaxItem {
  product_id?: number;
  quantity: number;
  unit_price: number;
  total: number;
  tax_amount?: number;
  tax_excluded?: boolean;
}

export interface MesaTaxBreakdownRow extends TaxResult {}

export interface UseMesaTaxesResult {
  organizationTaxes: TaxUtilOrganizationTax[];
  appliedTaxes: { [key: string]: boolean };
  taxIncluded: boolean;
  taxBreakdown: MesaTaxBreakdownRow[];
  hasProductSpecificTaxes: boolean;
  loading: boolean;
  subtotal: number;
  taxTotal: number;
  total: number;
  setTaxIncluded: (value: boolean) => void;
  toggleTax: (taxId: string) => void;
  setAppliedTaxes: (taxes: { [key: string]: boolean }) => void;
}

export function useMesaTaxes(items: MesaTaxItem[]): UseMesaTaxesResult {
  const [organizationTaxes, setOrganizationTaxes] = useState<TaxUtilOrganizationTax[]>([]);
  const [appliedTaxes, setAppliedTaxesState] = useState<{ [key: string]: boolean }>({});
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [taxBreakdown, setTaxBreakdown] = useState<MesaTaxBreakdownRow[]>([]);
  const [hasProductSpecificTaxes, setHasProductSpecificTaxes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calculatedTotals, setCalculatedTotals] = useState({
    subtotal: 0,
    taxTotal: 0,
    total: 0,
  });

  // Cargar impuestos de la organización
  useEffect(() => {
    const loadTaxes = async () => {
      try {
        setLoading(true);
        const taxes = await POSService.getOrganizationTaxes();
        const formatted: TaxUtilOrganizationTax[] = (taxes || []).map((t: any) => ({
          id: String(t.id),
          name: t.name,
          rate: parseFloat(t.rate?.toString() || '0'),
          is_default: t.is_default ?? false,
          is_active: t.is_active ?? true,
        }));
        setOrganizationTaxes(formatted);

        // Inicializar impuestos aplicados con los por defecto
        const initial: { [key: string]: boolean } = {};
        formatted.forEach((t) => {
          initial[t.id] = t.is_default;
        });
        setAppliedTaxesState(initial);
      } catch (error) {
        console.error('Error loading organization taxes:', error);
      } finally {
        setLoading(false);
      }
    };
    loadTaxes();
  }, []);

  // Calcular desglose de impuestos
  useEffect(() => {
    if (loading || organizationTaxes.length === 0 || items.length === 0) {
      setTaxBreakdown([]);
      setCalculatedTotals({ subtotal: 0, taxTotal: 0, total: 0 });
      setHasProductSpecificTaxes(false);
      return;
    }

    const calculate = async () => {
      let hasProductTaxes = false;
      let combinedSubtotal = 0;
      let combinedTaxAmount = 0;
      let combinedFinalTotal = 0;
      const combinedBreakdown: { [taxId: string]: MesaTaxBreakdownRow } = {};

      for (const item of items) {
        try {
          // Si el item tiene impuesto excluido, sumar sin impuestos
          if (item.tax_excluded) {
            const lineTotal = item.quantity * item.unit_price;
            combinedSubtotal += lineTotal;
            combinedFinalTotal += lineTotal;
            continue;
          }

          const taxItem: TaxCalculationItem = {
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            product_id: Number(item.product_id || 0),
          };

          let result;
          const productId = Number(item.product_id || 0);

          if (productId > 0) {
            const productTaxes = await POSService.getProductTaxes(productId);

            if (productTaxes && productTaxes.length > 0) {
              hasProductTaxes = true;
              const productApplied: { [key: string]: boolean } = {};
              const productOrgTaxes: TaxUtilOrganizationTax[] = [];

              let itemTaxIncluded = taxIncluded;

              productTaxes.forEach((relation: any) => {
                if (relation.organization_taxes && relation.organization_taxes.is_active) {
                  const taxId = String(relation.organization_taxes.id);
                  productApplied[taxId] = true;
                  if (relation.organization_taxes.tax_included === true) {
                    itemTaxIncluded = true;
                  }
                  productOrgTaxes.push({
                    id: taxId,
                    name: relation.organization_taxes.name,
                    rate: parseFloat(relation.organization_taxes.rate?.toString() || '0'),
                    is_default: relation.organization_taxes.is_default ?? false,
                    is_active: relation.organization_taxes.is_active ?? true,
                  });
                }
              });

              result = calculateCartTaxes([taxItem], productApplied, productOrgTaxes, itemTaxIncluded);
            } else {
              const anyTaxIncluded = organizationTaxes.some(
                (tax) => appliedTaxes[tax.id] && (tax as any).tax_included
              );
              const effectiveTaxIncluded = taxIncluded || anyTaxIncluded;

              result = calculateCartTaxes([taxItem], appliedTaxes, organizationTaxes, effectiveTaxIncluded);
            }
          } else {
            result = calculateCartTaxes([taxItem], appliedTaxes, organizationTaxes, taxIncluded);
          }

          combinedSubtotal += result.subtotal;
          combinedTaxAmount += result.totalTaxAmount;
          combinedFinalTotal += result.finalTotal;

          result.taxBreakdown.forEach((tax) => {
            if (combinedBreakdown[tax.taxId]) {
              combinedBreakdown[tax.taxId].baseAmount += tax.baseAmount;
              combinedBreakdown[tax.taxId].taxAmount += tax.taxAmount;
            } else {
              combinedBreakdown[tax.taxId] = { ...tax };
            }
          });
        } catch (error) {
          console.error('Error processing item taxes:', error);
          const lineTotal = item.quantity * item.unit_price;
          combinedSubtotal += lineTotal;
          combinedFinalTotal += lineTotal;
        }
      }

      setHasProductSpecificTaxes(hasProductTaxes);
      setTaxBreakdown(Object.values(combinedBreakdown));
      setCalculatedTotals({
        subtotal: Math.round(combinedSubtotal * 100) / 100,
        taxTotal: Math.round(combinedTaxAmount * 100) / 100,
        total: Math.round(combinedFinalTotal * 100) / 100,
      });
    };

    calculate();
  }, [items, organizationTaxes, appliedTaxes, taxIncluded, loading]);

  const toggleTax = useCallback((taxId: string) => {
    setAppliedTaxesState((prev) => {
      const next = { ...prev, [taxId]: !prev[taxId] };
      return next;
    });
  }, []);

  const setAppliedTaxes = useCallback((taxes: { [key: string]: boolean }) => {
    setAppliedTaxesState(taxes);
  }, []);

  return {
    organizationTaxes,
    appliedTaxes,
    taxIncluded,
    taxBreakdown,
    hasProductSpecificTaxes,
    loading,
    subtotal: calculatedTotals.subtotal,
    taxTotal: calculatedTotals.taxTotal,
    total: calculatedTotals.total,
    setTaxIncluded,
    toggleTax,
    setAppliedTaxes,
  };
}
