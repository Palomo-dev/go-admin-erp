'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FacturasCompraService } from '../FacturasCompraService';
import { 
  NuevaFacturaCompraForm, 
  InvoiceItemForm, 
  SupplierBase,
  OrganizationPaymentMethod,
  OrganizationCurrency,
  InvoicePurchase 
} from '../types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InformacionBasicaForm } from './InformacionBasicaForm';
import { ItemsListForm } from './ItemsListForm';
import { ResumenFactura } from './ResumenFactura';
import { FormActions } from './FormActions';
import { ImpuestosFacturaCompra } from './ImpuestosFacturaCompra';
import { 
  calculateCartTaxes,
  type TaxCalculationItem,
  type TaxCalculationResult
} from '@/lib/utils/taxCalculations';

interface NuevaFacturaFormProps {
  facturaInicial?: InvoicePurchase | null;
  onSubmit?: (datosFactura: any) => void;
  saving?: boolean;
  esEdicion?: boolean;
}

export function NuevaFacturaForm({ 
  facturaInicial = null, 
  onSubmit,
  saving = false,
  esEdicion = false 
}: NuevaFacturaFormProps = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [proveedores, setProveedores] = useState<SupplierBase[]>([]);
  const [metodosPago, setMetodosPago] = useState<OrganizationPaymentMethod[]>([]);
  const [monedas, setMonedas] = useState<OrganizationCurrency[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Estados para impuestos avanzados
  const [taxCalculation, setTaxCalculation] = useState<TaxCalculationResult>({
    subtotal: 0,
    totalTaxAmount: 0,
    finalTotal: 0,
    taxBreakdown: []
  });
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});

  // Función para obtener datos iniciales
  const obtenerDatosIniciales = (): NuevaFacturaCompraForm => {
    if (esEdicion && facturaInicial) {
      return {
        supplier_id: facturaInicial.supplier_id,
        number_ext: facturaInicial.number_ext,
        issue_date: facturaInicial.issue_date ? facturaInicial.issue_date.split('T')[0] : new Date().toISOString().split('T')[0],
        due_date: facturaInicial.due_date ? facturaInicial.due_date.split('T')[0] : '',
        currency: facturaInicial.currency || 'COP',
        payment_terms: facturaInicial.payment_terms || 30,
        tax_included: facturaInicial.tax_included || false,
        notes: facturaInicial.notes || '',
        items: facturaInicial.items?.map((item: any) => ({
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || 19,
          discount_amount: item.discount_amount || 0
        })) || []
      };
    }
    
    return {
      supplier_id: null,
      number_ext: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: '',
      currency: 'COP',
      payment_terms: 30,
      tax_included: false,
      notes: '',
      items: []
    };
  };

  const [formData, setFormData] = useState<NuevaFacturaCompraForm>(obtenerDatosIniciales());

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatosIniciales();
    calcularFechaVencimiento();
  }, []);

  useEffect(() => {
    calcularFechaVencimiento();
  }, [formData.issue_date, formData.payment_terms]);

  const cargarDatosIniciales = async () => {
    try {
      const [proveedoresData, metodosData, monedasData] = await Promise.all([
        FacturasCompraService.obtenerProveedores(),
        FacturasCompraService.obtenerMetodosPago(),
        FacturasCompraService.obtenerMonedas()
      ]);
      
      setProveedores(proveedoresData);
      setMetodosPago(metodosData);
      setMonedas(monedasData);
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
    }
  };

  const calcularFechaVencimiento = () => {
    if (formData.issue_date && formData.payment_terms) {
      const fechaEmision = new Date(formData.issue_date);
      fechaEmision.setDate(fechaEmision.getDate() + formData.payment_terms);
      const fechaVencimiento = fechaEmision.toISOString().split('T')[0];
      
      setFormData(prev => ({ ...prev, due_date: fechaVencimiento }));
    }
  };

  const handleInputChange = useCallback((field: keyof NuevaFacturaCompraForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Limpiar error del campo si existe usando función que no depende de errors
    setErrors(prev => {
      if (prev[field]) {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      }
      return prev;
    });
  }, []);

  const handleItemChange = useCallback((index: number, field: keyof InvoiceItemForm, value: any) => {
    console.log('=== DEBUG handleItemChange ===');
    console.log('index:', index, 'field:', field, 'value:', value);
    console.log('formData.items.length:', formData.items.length);
    console.log('formData.items ANTES:', JSON.stringify(formData.items, null, 2));
    
    if (index >= formData.items.length) {
      console.error(`❌ Índice ${index} fuera de rango. Array tiene ${formData.items.length} items`);
      return;
    }
    
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    console.log('newItems DESPUÉS:', JSON.stringify(newItems, null, 2));
    
    setFormData(prev => ({ ...prev, items: newItems }));
    console.log('=== FIN DEBUG handleItemChange ===');
  }, [formData.items]);

  // Función para agregar items desde el catálogo de productos
  // Solo se usa internamente por ItemsListForm para sincronización
  const agregarItem = () => {
    console.log('=== DEBUG agregarItem ===');
    console.log('formData.items ANTES:', formData.items.length);
    console.log('formData completo ANTES:', formData);
    
    setFormData(prev => {
      const newItems = [...prev.items, {
        description: '',
        qty: 1,
        unit_price: 0,
        tax_rate: 19,
        discount_amount: 0
      }];
      
      console.log('prev.items:', prev.items.length);
      console.log('newItems:', newItems.length);
      console.log('Nuevo item agregado:', newItems[newItems.length - 1]);
      
      const newFormData = { ...prev, items: newItems };
      console.log('newFormData.items length:', newFormData.items.length);
      
      return newFormData;
    });
    
    console.log('=== FIN DEBUG agregarItem ===');
  };

  const eliminarItem = (index: number) => {
    const nuevosItems = formData.items.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, items: nuevosItems }));
  };
  
  // Función para agregar un item completo directamente (más eficiente)
  const agregarItemDirecto = useCallback((item: InvoiceItemForm) => {
    console.log('=== DEBUG agregarItemDirecto ===');
    console.log('Item recibido:', item);
    
    setFormData(prev => {
      const newItems = [...prev.items, item];
      console.log('Items ANTES:', prev.items.length);
      console.log('Items DESPUÉS:', newItems.length);
      console.log('Nuevo item completo:', item);
      
      const newFormData = { ...prev, items: newItems };
      return newFormData;
    });
    
    console.log('=== FIN DEBUG agregarItemDirecto ===');
  }, []);

  // Callbacks para impuestos memoizados
  const handleTaxIncludedChange = useCallback((included: boolean) => {
    setFormData(prev => ({ ...prev, tax_included: included }));
  }, []);

  const handleTaxCalculationChange = useCallback((calculation: TaxCalculationResult & { appliedTaxes: {[key: string]: boolean} }) => {
    console.log('=== RECIBIENDO CÁLCULOS DE IMPUESTOS EN FORMULARIO ===');
    console.log('Cálculo recibido:', calculation);
    
    setTaxCalculation({
      subtotal: calculation.subtotal,
      totalTaxAmount: calculation.totalTaxAmount,
      finalTotal: calculation.finalTotal,
      taxBreakdown: calculation.taxBreakdown
    });
    
    setAppliedTaxes(calculation.appliedTaxes);
    
    console.log('Estado de taxCalculation actualizado:', {
      subtotal: calculation.subtotal,
      totalTaxAmount: calculation.totalTaxAmount,
      finalTotal: calculation.finalTotal,
      taxBreakdown: calculation.taxBreakdown
    });
  }, []);

  const calcularTotales = () => {
    // Si tenemos cálculos avanzados de impuestos, usar esos
    const hasAdvancedCalculation = (
      taxCalculation.taxBreakdown.length > 0 && 
      !isNaN(taxCalculation.subtotal) && 
      !isNaN(taxCalculation.totalTaxAmount) && 
      !isNaN(taxCalculation.finalTotal)
    );
    
    if (hasAdvancedCalculation) {
      return {
        subtotal: taxCalculation.subtotal,
        taxTotal: taxCalculation.totalTaxAmount,
        total: taxCalculation.finalTotal
      };
    }
    
    // Cálculo básico simple para items sin impuestos avanzados
    const subtotal = formData.items.reduce((sum, item) => {
      const qty = parseFloat(item.qty?.toString() || '0') || 0;
      const unitPrice = parseFloat(item.unit_price?.toString() || '0') || 0;
      const discount = parseFloat(item.discount_amount?.toString() || '0') || 0;
      
      return sum + (qty * unitPrice - discount);
    }, 0);

    const taxTotal = formData.items.reduce((sum, item) => {
      const qty = parseFloat(item.qty?.toString() || '0') || 0;
      const unitPrice = parseFloat(item.unit_price?.toString() || '0') || 0;
      const discount = parseFloat(item.discount_amount?.toString() || '0') || 0;
      const taxRate = parseFloat(item.tax_rate?.toString() || '0') || 0;
      
      const lineSubtotal = qty * unitPrice - discount;
      return sum + (lineSubtotal * taxRate / 100);
    }, 0);

    const total = formData.tax_included ? subtotal : subtotal + taxTotal;

    return {
      subtotal,
      taxTotal,
      total
    };
  };

  const validarFormulario = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.supplier_id) {
      newErrors.supplier_id = 'Debe seleccionar un proveedor';
    }

    if (!formData.number_ext.trim()) {
      newErrors.number_ext = 'El número de factura es requerido';
    }

    if (!formData.issue_date) {
      newErrors.issue_date = 'La fecha de emisión es requerida';
    }

    if (!formData.due_date) {
      newErrors.due_date = 'La fecha de vencimiento es requerida';
    }

    // Validar items
    formData.items.forEach((item, index) => {
      if (!item.description.trim()) {
        newErrors[`item_${index}_description`] = 'La descripción es requerida';
      }
      if (item.qty <= 0) {
        newErrors[`item_${index}_qty`] = 'La cantidad debe ser mayor a 0';
      }
      if (item.unit_price < 0) {
        newErrors[`item_${index}_unit_price`] = 'El precio no puede ser negativo';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validarFormulario()) {
      return;
    }

    try {
      setLoading(true);
      
      if (esEdicion && onSubmit) {
        // Modo edición: usar la función onSubmit proporcionada
        await onSubmit(formData);
      } else {
        // Modo creación: crear nueva factura usando totales calculados
        const { subtotal: calculatedSubtotal, taxTotal: calculatedTaxTotal, total: calculatedTotal } = calcularTotales();
        
        console.log('=== CREANDO FACTURA CON TOTALES CALCULADOS ===');
        console.log('Subtotal calculado:', calculatedSubtotal);
        console.log('Total impuestos calculado:', calculatedTaxTotal);
        console.log('Total final calculado:', calculatedTotal);
        console.log('Tax calculation usado:', taxCalculation);
        
        // Crear objeto con totales calculados
        const facturaConTotales = {
          ...formData,
          // Pasar totales calculados explícitamente
          _calculatedTotals: {
            subtotal: calculatedSubtotal,
            taxTotal: calculatedTaxTotal,
            total: calculatedTotal
          }
        };
        
        const factura = await FacturasCompraService.crearFactura(facturaConTotales);
        router.push(`/app/finanzas/facturas-compra/${factura.id}`);
      }
    } catch (error) {
      console.error(esEdicion ? 'Error actualizando factura:' : 'Error creando factura:', error);
      alert(esEdicion ? 'Error al actualizar la factura. Por favor, inténtelo de nuevo.' : 'Error al crear la factura. Por favor, inténtelo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (confirm('¿Está seguro de que desea cancelar? Se perderán todos los cambios.')) {
      router.push('/app/finanzas/facturas-compra');
    }
  };

  // Memoizar cálculo de totales incluyendo taxCalculation y appliedTaxes
  const { subtotal, taxTotal, total } = useMemo(() => {
    const result = calcularTotales();
    return result;
  }, [formData.items, formData.tax_included, taxCalculation, appliedTaxes]);

  // Memoizar items para impuestos para evitar re-renders infinitos
  const taxCalculationItems = useMemo(() => 
    formData.items.map(item => ({
      quantity: typeof item.qty === 'string' ? parseFloat(item.qty) || 0 : item.qty || 0,
      unit_price: typeof item.unit_price === 'string' ? parseFloat(item.unit_price) || 0 : item.unit_price || 0,
      product_id: item.product_id || 0 // Valor por defecto si no hay product_id
    })), [formData.items]
  );

  return (
    <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 md:py-6 space-y-4 sm:space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="p-2 h-auto dark:hover:bg-gray-700 dark:text-gray-300"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
            <span className="hidden sm:inline">Volver</span>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white truncate">
              {esEdicion ? 'Editar Factura de Compra' : 'Nueva Factura de Compra'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {esEdicion ? 'Modificar los datos de la factura' : 'Registre una nueva factura de proveedor'}
            </p>
          </div>
        </div>
        
        <div className="hidden sm:block">
          <FormActions
            saving={saving}
            esEdicion={esEdicion}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Información básica */}
        <InformacionBasicaForm
          formData={formData}
          proveedores={proveedores}
          metodosPago={metodosPago}
          monedas={monedas}
          errors={errors}
          onInputChange={handleInputChange}
          onProveedorCreado={(nuevoProveedor: SupplierBase) => {
            setProveedores(prev => [...prev, nuevoProveedor]);
            handleInputChange('supplier_id', nuevoProveedor.id);
          }}
        />

        {/* Items de la factura */}
        <ItemsListForm
          items={formData.items}
          currency={formData.currency}
          errors={errors}
          onItemChange={handleItemChange}
          onAgregarItem={agregarItem}
          onEliminarItem={eliminarItem}
          onDirectAddItem={agregarItemDirecto}
        />

        {/* Configuración de impuestos */}
        <ImpuestosFacturaCompra
          items={taxCalculationItems}
          currency={formData.currency}
          taxIncluded={formData.tax_included}
          onTaxIncludedChange={handleTaxIncludedChange}
          onTaxCalculationChange={handleTaxCalculationChange}
        />

        {/* Resumen con desglose de impuestos */}
        <ResumenFactura
          subtotal={subtotal}
          taxTotal={taxTotal}
          total={total}
          currency={formData.currency}
          taxIncluded={formData.tax_included}
          taxBreakdown={taxCalculation.taxBreakdown}
        />

        {/* Botones de acción del formulario - Footer */}
        <div className="pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700">
          <FormActions
            saving={saving}
            esEdicion={esEdicion}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>
      </form>
    </div>
  );
}
