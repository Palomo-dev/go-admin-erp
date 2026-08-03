/**
 * Utilidades para cálculos de impuestos
 * Lógica extraída de ImpuestosFactura.tsx para reutilización
 */

export interface TaxCalculationItem {
  quantity: number;
  unit_price: number;
  product_id: number;
  discount_amount?: number;
  tax_rate?: number;
  tax_included?: boolean;
  tax_code?: string | null;
}

export interface OrganizationTax {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
}

export interface TaxResult {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

export interface TaxCalculationResult {
  subtotal: number;
  totalTaxAmount: number;
  finalTotal: number;
  taxBreakdown: TaxResult[];
}

/**
 * Calcula los impuestos para un ítem individual
 * @param item - El ítem a calcular
 * @param appliedTaxes - Los impuestos aplicados (por ID)
 * @param organizationTaxes - Lista de impuestos disponibles
 * @param taxIncluded - Si los impuestos están incluidos en el precio
 * @returns Resultados de cálculo de impuestos
 */
export function calculateItemTaxes(
  item: TaxCalculationItem,
  appliedTaxes: {[key: string]: boolean},
  organizationTaxes: OrganizationTax[],
  taxIncluded: boolean = false
): TaxResult[] {
  const lineTotal = item.quantity * item.unit_price - (item.discount_amount || 0);
  let baseImponible = lineTotal;
  const results: TaxResult[] = [];

  // Si el item tiene su propio tax_rate, usarlo directamente
  const itemTaxRate = Number(item.tax_rate) || 0;
  const itemTaxIncluded = item.tax_included ?? taxIncluded;

  if (itemTaxRate > 0) {
    if (itemTaxIncluded) {
      baseImponible = lineTotal / (1 + (itemTaxRate / 100));
      baseImponible = Math.round(baseImponible * 100) / 100;
    }

    const taxAmount = Math.round(baseImponible * (itemTaxRate / 100) * 100) / 100;
    const taxId = item.tax_code || `TAX_${itemTaxRate}`;
    const orgTax = organizationTaxes.find(t => t.id === item.tax_code || t.name === item.tax_code);
    const taxName = orgTax?.name || item.tax_code || `Impuesto ${itemTaxRate}%`;

    results.push({
      taxId,
      name: taxName,
      rate: itemTaxRate,
      baseAmount: baseImponible,
      taxAmount
    });

    return results;
  }

  // Si el item no tiene tax_rate propio, usar impuestos de organización aplicados
  if (taxIncluded) {
    let sumaTasasIncluidas = 0;
    
    organizationTaxes.forEach(tax => {
      const isApplied = appliedTaxes[tax.id];
      if (isApplied && tax.rate > 0) {
        sumaTasasIncluidas += tax.rate;
      }
    });
    
    if (sumaTasasIncluidas > 0) {
      baseImponible = lineTotal / (1 + (sumaTasasIncluidas / 100));
      baseImponible = Math.round(baseImponible * 100) / 100;
    }
  }

  organizationTaxes.forEach(tax => {
    const isApplied = appliedTaxes[tax.id];
    
    if (isApplied && tax.rate > 0) {
      const taxAmount = baseImponible * (tax.rate / 100);
      const roundedTaxAmount = Math.round(taxAmount * 100) / 100;
      
      results.push({
        taxId: tax.id,
        name: tax.name,
        rate: tax.rate,
        baseAmount: baseImponible,
        taxAmount: roundedTaxAmount
      });
    }
  });

  return results;
}

/**
 * Calcula los totales de impuestos para múltiples ítems
 * @param items - Lista de ítems
 * @param appliedTaxes - Los impuestos aplicados (por ID)
 * @param organizationTaxes - Lista de impuestos disponibles
 * @param taxIncluded - Si los impuestos están incluidos en el precio
 * @returns Resultado completo del cálculo
 */
export function calculateCartTaxes(
  items: TaxCalculationItem[],
  appliedTaxes: {[key: string]: boolean},
  organizationTaxes: OrganizationTax[],
  taxIncluded: boolean = false
): TaxCalculationResult {
  const taxTotals: {[taxId: string]: TaxResult} = {};
  let calculatedSubtotal = 0;
  let calculatedTaxTotal = 0;
  let calculatedTotal = 0;

  items.forEach(item => {
    const lineTotal = item.quantity * item.unit_price - (item.discount_amount || 0);
    // Usar tax_included del item si está definido, sino el global
    const itemTaxIncluded = item.tax_included ?? taxIncluded;
    const itemTaxRate = Number(item.tax_rate) || 0;
    const itemTaxes = calculateItemTaxes(item, appliedTaxes, organizationTaxes, itemTaxIncluded);
    
    let itemTaxAmount = 0;
    
    // Acumular impuestos por tipo
    itemTaxes.forEach(taxResult => {
      if (!taxTotals[taxResult.taxId]) {
        taxTotals[taxResult.taxId] = {
          taxId: taxResult.taxId,
          name: taxResult.name,
          rate: taxResult.rate,
          baseAmount: 0,
          taxAmount: 0
        };
      }
      
      taxTotals[taxResult.taxId].baseAmount += taxResult.baseAmount;
      taxTotals[taxResult.taxId].taxAmount += taxResult.taxAmount;
      itemTaxAmount += taxResult.taxAmount;
    });
    
    // Calcular totales
    if (itemTaxIncluded) {
      // Si los impuestos están incluidos, el subtotal es la base imponible
      const itemSubtotal = itemTaxes.length > 0 ? itemTaxes[0].baseAmount : lineTotal;
      calculatedSubtotal += itemSubtotal;
      calculatedTotal += lineTotal; // El total es el precio original
    } else {
      // Si los impuestos no están incluidos
      calculatedSubtotal += lineTotal;
      calculatedTotal += lineTotal + itemTaxAmount;
    }
    
    calculatedTaxTotal += itemTaxAmount;
  });

  return {
    subtotal: Math.round(calculatedSubtotal * 100) / 100,
    totalTaxAmount: Math.round(calculatedTaxTotal * 100) / 100,
    finalTotal: Math.round(calculatedTotal * 100) / 100,
    taxBreakdown: Object.values(taxTotals)
  };
}

/**
 * Función de alto nivel para calcular impuestos de un carrito completo
 * Encapsula toda la lógica de obtener impuestos y aplicarlos
 * @param items - Items del carrito
 * @param organizationTaxes - Impuestos de la organización (opcional, se obtienen automáticamente si no se proporcionan)
 * @param posService - Instancia del servicio POS para obtener datos
 * @param taxIncluded - Si los impuestos están incluidos en el precio
 * @returns Promise con el resultado completo del cálculo
 */
export async function calculateCartTaxesComplete(
  items: TaxCalculationItem[],
  posService: any, // POSService instance
  taxIncluded: boolean = false,
  organizationTaxes?: OrganizationTax[]
): Promise<TaxCalculationResult & { appliedTaxes: {[key: string]: boolean} }> {
  
  console.log('🧮 Iniciando cálculo completo de impuestos...');
  
  // 1. Obtener impuestos de la organización si no se proporcionan
  const orgTaxes = organizationTaxes || await posService.getOrganizationTaxes();
  console.log('📋 Impuestos disponibles:', orgTaxes.length);
  
  // 2. Determinar impuestos aplicados
  const appliedTaxes: {[key: string]: boolean} = {};
  let hasProductSpecificTaxes = false;
  
  // Verificar si hay impuestos específicos de productos
  for (const item of items) {
    try {
      const productTaxes = await posService.getProductTaxes(item.product_id);
      if (productTaxes.length > 0) {
        hasProductSpecificTaxes = true;
        productTaxes.forEach((relation: any) => {
          appliedTaxes[relation.tax_id] = true;
        });
      }
    } catch (error) {
      console.warn(`No se pudieron obtener impuestos para producto ${item.product_id}:`, error);
    }
  }
  
  // Si no hay impuestos específicos, usar impuestos predeterminados de la organización
  if (!hasProductSpecificTaxes) {
    orgTaxes.forEach((tax: any) => {
      appliedTaxes[tax.id] = tax.is_default;
    });
  }
  
  console.log('✅ Impuestos aplicados:', appliedTaxes);
  
  // 3. Calcular totales usando la función base
  const calculation = calculateCartTaxes(
    items,
    appliedTaxes,
    orgTaxes,
    taxIncluded
  );
  
  console.log('💰 Cálculo completado:', {
    subtotal: calculation.subtotal,
    tax_total: calculation.totalTaxAmount,
    final_total: calculation.finalTotal,
    tax_included: taxIncluded,
    breakdown: calculation.taxBreakdown
  });
  
  // Debug detallado
  console.log('🔍 Debug detallado del cálculo:');
  console.log('  - Items recibidos:', items.map(item => ({
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_total: item.quantity * item.unit_price
  })));
  console.log('  - Impuestos aplicados:', appliedTaxes);
  console.log('  - taxIncluded:', taxIncluded);
  
  // Verificar si hay discrepancia entre los totales
  const itemsTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  console.log('  - Total items original:', itemsTotal);
  console.log('  - Subtotal calculado:', calculation.subtotal);
  console.log('  - Tax total calculado:', calculation.totalTaxAmount);
  console.log('  - Final total calculado:', calculation.finalTotal);
  
  if (taxIncluded && Math.abs(itemsTotal - calculation.finalTotal) > 0.01) {
    console.warn('⚠️ DISCREPANCIA DETECTADA: El total de items no coincide con el final total calculado');
    console.warn('  Items total:', itemsTotal);
    console.warn('  Final total:', calculation.finalTotal);
  }
  
  return {
    ...calculation,
    appliedTaxes
  };
}

/**
 * Función simplificada para obtener la configuración de impuestos incluidos
 * @param defaultValue - Valor por defecto si no se encuentra configuración
 * @returns boolean indicando si los impuestos están incluidos
 */
export function getTaxIncludedSetting(defaultValue: boolean = false): boolean {
  try {
    const posSettings = localStorage.getItem('pos-settings');
    if (posSettings) {
      const settings = JSON.parse(posSettings);
      return settings.taxIncluded || defaultValue;
    }
  } catch (error) {
    console.warn('No se pudo obtener configuración de impuestos:', error);
  }
  return defaultValue;
}

/**
 * Formatea los resultados de impuestos para logging o debugging
 * @param result - Resultado del cálculo de impuestos
 * @returns Objeto formateado para mostrar
 */
export function formatTaxCalculationForLog(result: TaxCalculationResult) {
  return {
    subtotal: `$${result.subtotal.toLocaleString()}`,
    tax_total: `$${result.totalTaxAmount.toLocaleString()}`,
    final_total: `$${result.finalTotal.toLocaleString()}`,
    taxes_applied: result.taxBreakdown.map(tax => `${tax.name}: $${tax.taxAmount.toLocaleString()}`).join(', ') || 'Ninguno'
  };
}
