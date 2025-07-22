'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';
import { InvoiceItem } from './NuevaFacturaForm';

// Tipo para un impuesto de la organización
type OrganizationTax = {
  id: number;
  code: string;
  name: string;
  rate: number;
  is_default: boolean;
};

// Tipo para la información calculada de un impuesto
type TaxInfo = {
  rate: number;
  base: number;
  amount: number;
  name: string;
  included: boolean;
};

// Props del componente
interface ImpuestosFacturaProps {
  organizationId: number;
  items: InvoiceItem[];
  taxIncluded: boolean;
  onTaxIncludedChange: (value: boolean) => void;
  onAppliedTaxesChange: (appliedTaxes: {[key: string]: boolean}) => void;
  onTaxTotalsChange: (taxTotals: {[key: string]: TaxInfo}) => void;
  onSubtotalCalculated: (subtotal: number) => void;
  onTaxTotalCalculated: (taxTotal: number) => void;
  onTotalCalculated: (total: number) => void;
}

export function ImpuestosFactura({
  organizationId,
  items,
  taxIncluded,
  onTaxIncludedChange,
  onAppliedTaxesChange,
  onTaxTotalsChange,
  onSubtotalCalculated,
  onTaxTotalCalculated,
  onTotalCalculated
}: ImpuestosFacturaProps) {
  // Estados para impuestos
  const [organizationTaxes, setOrganizationTaxes] = useState<OrganizationTax[]>([]);
  const [defaultTax, setDefaultTax] = useState<OrganizationTax | null>(null);
  const [applyDefaultTax, setApplyDefaultTax] = useState<boolean>(true);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});
  
  // Cálculos derivados - separamos base imponible y subtotal
  
  // Acumuladores para los cálculos finales
  let calculatedSubtotal = 0;
  let calculatedTaxTotal = 0;
  let calculatedTotal = 0;
  
  // Calcular los impuestos aplicados (tanto incluidos como no incluidos)
  const appliedTaxTotals: {[key: string]: TaxInfo} = {};
  
  // Log detallado para verificar estado de impuestos
  console.log(`========== CÁLCULO DE TOTALES ==========`);
  console.log(`Estado de impuestos incluidos: ${taxIncluded ? 'INCLUIDOS' : 'NO INCLUIDOS'}`);
  console.log(`=======================================`);
  
  // Variable para rastrear ítems con impuestos no incluidos
  let noIncluidos = 0;
  
  // Reiniciamos los acumuladores para los nuevos cálculos
  calculatedSubtotal = 0;
  calculatedTaxTotal = 0;
  calculatedTotal = 0;
  
  // Procesar cada ítem para calcular subtotal, impuestos y total
  items.forEach((item, index) => {
    const lineTotal = item.unit_price * item.qty;
    let baseImponible = lineTotal;
    let itemTaxAmount = 0;
    let itemTotal = lineTotal;
    let impuestosAplicados = false;
    
    console.log(`
========== ÍTEM #${index+1} (${item.product_name || 'Sin nombre'}) ==========`);
    console.log(`• Precio unitario: ${item.unit_price.toFixed(2)}`);
    console.log(`• Cantidad: ${item.qty}`);
    console.log(`• Total línea (bruto): ${lineTotal.toFixed(2)}`);

    // Calcular el factor total de impuestos para este ítem cuando están incluidos
    let sumaTasasIncluidas = 0;
    if (taxIncluded) {
      organizationTaxes.forEach(tax => {
        const isApplied = appliedTaxes[tax.code] || (tax.is_default && applyDefaultTax);
        if (isApplied && tax.rate > 0) {
          sumaTasasIncluidas += tax.rate;
        }
      });
      
      if (sumaTasasIncluidas > 0) {
        // Ajustar la base imponible si hay impuestos incluidos
        baseImponible = lineTotal / (1 + (sumaTasasIncluidas / 100));
        baseImponible = Math.round(baseImponible * 100) / 100; // Redondeamos a 2 decimales
        console.log(`• Base imponible ajustada (con factor ${(1 + (sumaTasasIncluidas / 100)).toFixed(4)}): ${baseImponible.toFixed(2)}`);
      }
    }
    
    // Procesar cada impuesto que aplica al ítem
    organizationTaxes.forEach(tax => {
      const isApplied = appliedTaxes[tax.code] || (tax.is_default && applyDefaultTax);
      
      // Si este impuesto está seleccionado, lo aplicamos
      if (isApplied) {
        const taxKey = tax.code;
        let taxBase = baseImponible;
        let taxAmount = 0;
        
        // Calcular el monto del impuesto
        if (tax.rate !== 0) { // Verificar que la tasa no sea cero
          taxAmount = taxBase * (tax.rate / 100);
          taxAmount = Math.round(taxAmount * 100) / 100; // Redondear a 2 decimales
          
          if (taxIncluded) {
            console.log(`• Impuesto ${tax.name} (${tax.rate}%): ${taxAmount.toFixed(2)} (incluido en el precio)`);
          } else {
            console.log(`• Impuesto ${tax.name} (${tax.rate}%): ${taxAmount.toFixed(2)} (añadido al precio)`);
            // Si no está incluido, actualizamos el total del ítem
            itemTotal += taxAmount;
            noIncluidos++;
          }
          
          impuestosAplicados = true;
          
          // Agregar o actualizar el total para este código de impuesto
          if (!appliedTaxTotals[taxKey]) {
            appliedTaxTotals[taxKey] = {
              rate: tax.rate,
              base: 0,
              amount: 0,
              name: tax.name,
              included: taxIncluded
            };
          }
          
          appliedTaxTotals[taxKey].base += taxBase;
          appliedTaxTotals[taxKey].amount += taxAmount;
          
          // Acumular para los totales finales
          itemTaxAmount += taxAmount;
        }
      }
    });
    
    // Acumular totales para este ítem
    calculatedSubtotal += baseImponible;
    calculatedTaxTotal += itemTaxAmount;
    
    if (taxIncluded) {
      // Si los impuestos están incluidos, el total es el precio original
      calculatedTotal += lineTotal;
      console.log(`• Total ítem (con impuestos incluidos): ${lineTotal.toFixed(2)}`);
    } else {
      // Si los impuestos no están incluidos, el total es base + impuestos
      calculatedTotal += itemTotal;
      console.log(`• Total ítem (con impuestos añadidos): ${itemTotal.toFixed(2)}`);
    }
    
    // Si no se aplicaron impuestos, mostrar mensaje
    if (!impuestosAplicados) {
      console.log(`• Sin impuestos aplicados para este ítem`);
    }
    
    console.log(`==================================================`);
    
    console.log(`Ítem #${index+1} (${item.product_name || 'Sin nombre'}) - SIN IMPUESTO:`);
    console.log(`  • Precio unitario: ${item.unit_price.toFixed(2)}`);
    console.log(`  • Cantidad: ${item.qty}`);
    console.log(`  • Total línea: ${lineTotal.toFixed(2)}`);
  });
  
  // Mostrar resumen de cálculos
  console.log(`\n======== RESUMEN DE CÁLCULOS =========`);
  console.log(`• Modo impuestos: ${taxIncluded ? 'INCLUIDOS EN PRECIO' : 'AÑADIDOS AL PRECIO'}`);
  console.log(`• Subtotal calculado: ${calculatedSubtotal.toFixed(2)}`);
  console.log(`• Total impuestos: ${calculatedTaxTotal.toFixed(2)}`);
  console.log(`• Total factura: ${calculatedTotal.toFixed(2)}`);
  console.log(`• Verificación: ${taxIncluded ? 'El total debe ser igual a la suma de precios originales' : 'El total debe ser subtotal + impuestos'}`);
  console.log(`=====================================\n`);
  
  // Los impuestos ya se procesaron a nivel de ítems, no necesitamos procesarlos como generales
  // Mostramos resumen de impuestos aplicados
  console.log(`\n======== RESUMEN DE IMPUESTOS APLICADOS ========`);
  Object.keys(appliedTaxTotals).forEach(taxKey => {
    const tax = appliedTaxTotals[taxKey];
    console.log(`• ${tax.name} (${tax.rate}%): Base: ${tax.base.toFixed(2)}, Monto: ${tax.amount.toFixed(2)}, ${tax.included ? 'Incluido' : 'No incluido'}`);
  });
  
  // Verificar el cálculo total
  console.log(`Verificando impuestos aplicados:`, appliedTaxTotals);
  
  // Actualizamos estados calculados para componentes
  const subtotal = calculatedSubtotal;
  const taxTotal = calculatedTaxTotal;
  
  // Asegurar que el total sea calculado correctamente
  // En modo impuestos incluidos, el total debe ser igual al precio original
  // En modo impuestos no incluidos, el total debe ser subtotal + impuestos
  const total = taxIncluded ? calculatedTotal : (calculatedSubtotal + calculatedTaxTotal);
  
  // Inicializar appliedTaxes cuando se cargan los impuestos de la organización
  useEffect(() => {
    const initialAppliedTaxes: {[key: string]: boolean} = {};
    organizationTaxes.forEach(tax => {
      // Solo aplicamos automáticamente el impuesto por defecto
      initialAppliedTaxes[tax.code] = tax.is_default;
    });
    setAppliedTaxes(initialAppliedTaxes);
    onAppliedTaxesChange(initialAppliedTaxes);
  }, [organizationTaxes, onAppliedTaxesChange]);
  
  // Usamos useRef para almacenar los valores anteriores sin causar re-renders
  const prevValuesRef = useRef({
    subtotal: 0,
    taxTotal: 0,
    total: 0,
    appliedTaxTotals: {}
  });

  // Efecto específico para cuando cambia taxIncluded
  useEffect(() => {
    console.log(`Estado de impuestos incluidos cambió a: ${taxIncluded ? 'INCLUIDOS' : 'NO INCLUIDOS'}`);
    
    // Al cambiar el estado de taxIncluded, forzamos una actualización inmediata
    // para asegurar que los cálculos reflejen el nuevo estado
    prevValuesRef.current = {
      subtotal: -1, // Valor que forzará la actualización
      taxTotal: -1,
      total: -1,
      appliedTaxTotals: {}
    };
    
    // Mostramos el detalle del cambio para depuración
    if (taxIncluded) {
      console.log('Modo impuestos incluidos: El subtotal mostrará el precio base sin impuestos');
    } else {
      console.log('Modo impuestos no incluidos: El subtotal es el precio bruto y se suman impuestos al total');
    }
    
    // La próxima vez que se ejecute el efecto principal, detectará el cambio
    // y actualizará los valores
    
    // IMPORTANTE: Forzamos la reconstrucción de totales inmediatamente después de cambiar
    // el estado para que la interfaz se actualice correctamente
    const timer = setTimeout(() => {
      onSubtotalCalculated(calculatedSubtotal);
      onTaxTotalCalculated(calculatedTaxTotal);
      onTotalCalculated(calculatedTotal);
      onTaxTotalsChange(appliedTaxTotals);
    }, 50);
    
    return () => clearTimeout(timer);
  }, [taxIncluded]);

  // Efecto para actualizar totales y subtotales en el componente padre
  // Solo enviamos actualizaciones cuando realmente hay cambios
  useEffect(() => {
    // Comparamos valores actuales con previos para evitar actualizaciones innecesarias
    const prevValues = prevValuesRef.current;
    
    // Verificamos si hay cambios significativos
    const hasSubtotalChanged = Math.abs(prevValues.subtotal - subtotal) > 0.001;
    const hasTaxTotalChanged = Math.abs(prevValues.taxTotal - taxTotal) > 0.001;
    const hasTotalChanged = Math.abs(prevValues.total - total) > 0.001;
    const hasTaxTotalsChanged = JSON.stringify(prevValues.appliedTaxTotals) !== JSON.stringify(appliedTaxTotals);
    
    // Solo notificamos si hay cambios reales
    if (hasSubtotalChanged || hasTaxTotalChanged || hasTotalChanged || hasTaxTotalsChanged) {
      // Actualizamos valores de referencia
      prevValuesRef.current = {
        subtotal,
        taxTotal,
        total,
        appliedTaxTotals
      };
      
      // Notificamos al padre
      const detalleCalculo = taxIncluded ? 
        "(impuestos incluidos en el precio original)" : 
        "(impuestos añadidos al precio base)";
        
      console.log(`Actualizando valores en el padre ${detalleCalculo}`, { 
        subtotal, 
        taxTotal, 
        total 
      });
      
      onSubtotalCalculated(subtotal);
      onTaxTotalCalculated(taxTotal);
      onTotalCalculated(total);
      onTaxTotalsChange(appliedTaxTotals);
    }
  }, [subtotal, taxTotal, total, appliedTaxTotals, taxIncluded, onSubtotalCalculated, onTaxTotalCalculated, onTotalCalculated, onTaxTotalsChange]);
  
  // Cargar impuestos de la organización
  useEffect(() => {
    if (organizationId) {
      loadOrganizationTaxes();
    }
  }, [organizationId]);
  
  // Función para cargar los impuestos de la organización
  const loadOrganizationTaxes = async () => {
    try {
      const { data: taxesData, error: taxesError } = await supabase
        .from('organization_taxes')
        .select('*, tax_templates!inner(code, name)')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
        
      if (taxesError) throw taxesError;
      
      if (taxesData && taxesData.length > 0) {
        // Formatear datos para usar en el componente
        const formattedTaxes = taxesData.map(tax => ({
          id: tax.id,
          code: tax.tax_templates.code,
          name: tax.name,
          rate: tax.rate,
          is_default: tax.is_default
        }));
        
        setOrganizationTaxes(formattedTaxes);
        
        // Establecer impuesto por defecto
        const defaultTaxItem = formattedTaxes.find(tax => tax.is_default);
        if (defaultTaxItem) {
          setDefaultTax(defaultTaxItem);
        }
      }
    } catch (error) {
      console.error('Error al cargar impuestos:', error);
    }
  };
  
  // Manejar cambio en appliedTaxes
  const handleAppliedTaxesChange = (taxCode: string, isChecked: boolean, isDefault: boolean) => {
    if (isDefault) {
      setApplyDefaultTax(isChecked);
    } else {
      const newAppliedTaxes = {
        ...appliedTaxes,
        [taxCode]: isChecked
      };
      setAppliedTaxes(newAppliedTaxes);
      onAppliedTaxesChange(newAppliedTaxes);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 items-end">
        <div className="grid grid-cols-2 gap-2 min-w-[200px]">
          <span className="text-right">Subtotal:</span>
          <span className="text-right font-medium">
            ${subtotal.toFixed(2)}
            {taxIncluded && (
              <span className="text-xs text-gray-500 ml-1">(impuestos incluidos)</span>
            )}
          </span>
        </div>
        
        {/* Selector de impuestos de la organización */}
        <div className="flex flex-col gap-2 min-w-[320px]">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Impuestos aplicables:</span>
            <div className="flex items-center gap-1">
              <input 
                type="checkbox" 
                id="taxIncluded" 
                checked={taxIncluded} 
                onChange={(e) => onTaxIncludedChange(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="taxIncluded" className="text-sm">Impuestos incluidos en precios</label>
            </div>
          </div>
          
          {/* Lista de todos los impuestos disponibles */}
          <div className="flex flex-col gap-1 border rounded-md p-2 bg-gray-50">
            {organizationTaxes.length > 0 ? (
              organizationTaxes.map(tax => {
                const isDefault = tax.is_default;
                const isChecked = isDefault ? applyDefaultTax : !!appliedTaxes[tax.code];
                
                return (
                  <div key={tax.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <input 
                        type="checkbox" 
                        id={`tax-${tax.code}`} 
                        checked={isChecked} 
                        onChange={(e) => handleAppliedTaxesChange(tax.code, e.target.checked, isDefault)}
                        className="h-4 w-4"
                      />
                      <label htmlFor={`tax-${tax.code}`} className="text-sm">
                        {tax.name} ({tax.rate}%)
                      </label>
                    </div>
                    {isDefault && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        Predeterminado
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-1">
                No hay impuestos configurados
              </p>
            )}
          </div>
        </div>
        
        {/* Mostrar todos los impuestos aplicados con sus montos */}
        {Object.keys(appliedTaxTotals).length > 0 && (
          <div className="grid grid-cols-2 gap-1 min-w-[250px] border-t border-b py-1 my-1">
            {Object.entries(appliedTaxTotals).map(([code, taxInfo]) => (
              <React.Fragment key={code}>
                <span className="text-right text-sm">
                  {taxInfo.name} ({taxInfo.rate}%):
                  {taxInfo.included && (
                    <span className="text-xs text-blue-500 ml-1">(incluido)</span>
                  )}
                </span>
                <span className="text-right text-sm font-medium">${taxInfo.amount.toFixed(2)}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-2 min-w-[200px]">
          <span className="text-right">Total Impuestos:</span>
          <span className="text-right font-medium">${taxTotal.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 min-w-[200px] pt-1 border-t">
          <span className="text-right font-medium">Total:</span>
          <span className="text-right font-medium">
            ${total.toFixed(2)}
            {noIncluidos > 0 && taxIncluded && (
              <span className="text-xs text-amber-600 ml-1">
                (incluye ${subtotal.toFixed(2)} + impuestos)
              </span>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
