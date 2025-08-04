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
    console.log('=== DEBUG handleTaxIncludedChange ===');
    console.log('tax_included cambió a:', included);
    setFormData(prev => ({ ...prev, tax_included: included }));
  }, []);

  const handleTaxCalculationChange = useCallback((calculation: TaxCalculationResult & { appliedTaxes: {[key: string]: boolean} }) => {
    console.log('=== DEBUG handleTaxCalculationChange ===');
    console.log('Nueva calculación recibida:', calculation);
    
    setTaxCalculation({
      subtotal: calculation.subtotal,
      totalTaxAmount: calculation.totalTaxAmount,
      finalTotal: calculation.finalTotal,
      taxBreakdown: calculation.taxBreakdown
    });
    
    setAppliedTaxes(calculation.appliedTaxes);
    console.log('Estados actualizados - taxCalculation y appliedTaxes');
  }, []);

  // Función para convertir items de factura a items de cálculo de impuestos
  const convertToTaxCalculationItems = (items: InvoiceItemForm[]): import('@/lib/utils/taxCalculations').TaxCalculationItem[] => {
    return items.map(item => ({
      quantity: typeof item.qty === 'string' ? parseFloat(item.qty) || 0 : item.qty || 0,
      unit_price: typeof item.unit_price === 'string' ? parseFloat(item.unit_price) || 0 : item.unit_price || 0,
      product_id: item.product_id || 0 // Valor por defecto si no hay product_id
    }));
  };

  const calcularTotales = () => {
    // Debug: verificar estado de los items (temporalmente comentado para evitar loops)
    // console.log('=== DEBUG calcularTotales ===');
    // console.log('formData.items:', formData.items);
    // console.log('formData.items contenido completo:', JSON.stringify(formData.items, null, 2));
    // console.log('taxCalculation:', taxCalculation);
    // console.log('appliedTaxes:', appliedTaxes);
    
    // Si tenemos cálculos avanzados de impuestos Y son válidos, usar esos
    const hasValidAdvancedCalculation = (
      (taxCalculation.taxBreakdown.length > 0 || Object.keys(appliedTaxes).length > 0) &&
      !isNaN(taxCalculation.subtotal) && 
      !isNaN(taxCalculation.totalTaxAmount) && 
      !isNaN(taxCalculation.finalTotal)
    );
    
    if (hasValidAdvancedCalculation) {
      // console.log('Usando cálculos avanzados de impuestos (válidos)');
      return {
        subtotal: taxCalculation.subtotal,
        taxTotal: taxCalculation.totalTaxAmount,
        total: taxCalculation.finalTotal
      };
    }
    
    // Si los cálculos avanzados devolvieron NaN, informar y usar fallback
    if (taxCalculation.taxBreakdown.length > 0 || Object.keys(appliedTaxes).length > 0) {
      // console.log('⚠️  Cálculos avanzados devolvieron NaN, usando cálculo básico como fallback');
    }
    
    // Fallback: cálculo básico original
    // console.log('Usando cálculo básico, items count:', formData.items.length);
    
    const subtotal = formData.items.reduce((sum, item, index) => {
      const qty = item.qty != null ? (isNaN(parseFloat(item.qty.toString())) ? 0 : parseFloat(item.qty.toString())) : 0;
      const unitPrice = item.unit_price != null ? (isNaN(parseFloat(item.unit_price.toString())) ? 0 : parseFloat(item.unit_price.toString())) : 0;
      const discount = item.discount_amount != null ? (isNaN(parseFloat(item.discount_amount.toString())) ? 0 : parseFloat(item.discount_amount.toString())) : 0;
      
      const lineTotal = qty * unitPrice - discount;
      // console.log(`Item ${index}:`, { qty, unitPrice, discount, lineTotal });
      // console.log(`Item ${index} original:`, { 
      //   qtyOrig: item.qty, 
      //   unitPriceOrig: item.unit_price, 
      //   discountOrig: item.discount_amount,
      //   taxRateOrig: item.tax_rate
      // });
      
      return sum + lineTotal;
    }, 0);

    const taxTotal = formData.items.reduce((sum, item) => {
      const qty = item.qty != null ? (isNaN(parseFloat(item.qty.toString())) ? 0 : parseFloat(item.qty.toString())) : 0;
      const unitPrice = item.unit_price != null ? (isNaN(parseFloat(item.unit_price.toString())) ? 0 : parseFloat(item.unit_price.toString())) : 0;
      const discount = item.discount_amount != null ? (isNaN(parseFloat(item.discount_amount.toString())) ? 0 : parseFloat(item.discount_amount.toString())) : 0;
      const taxRate = item.tax_rate != null ? (isNaN(parseFloat(item.tax_rate.toString())) ? 0 : parseFloat(item.tax_rate.toString())) : 0;
      
      const lineSubtotal = qty * unitPrice - discount;
      return sum + (lineSubtotal * taxRate / 100);
    }, 0);

    const total = formData.tax_included ? subtotal : subtotal + taxTotal;
    
    // console.log('Resultados:', { subtotal, taxTotal, total, tax_included: formData.tax_included });
    // console.log('=== FIN DEBUG ===');

    return {
      subtotal,
      taxTotal,
      total,
      tax_included: formData.tax_included || false
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
        // Modo creación: crear nueva factura
        const factura = await FacturasCompraService.crearFactura(formData);
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

  // Memoizar cálculo de totales para que se actualice cuando cambien los items
  const { subtotal, taxTotal, total } = useMemo(() => {
    console.log('=== useMemo RECALCULANDO TOTALES ===');
    console.log('formData.items en useMemo:', formData.items.length);
    const result = calcularTotales();
    console.log('Totales calculados:', result);
    console.log('=== FIN useMemo RECALCULO ===');
    return result;
  }, [formData.items, formData.tax_included, taxCalculation, appliedTaxes]);

  // Memoizar items para impuestos para evitar re-renders infinitos
  const taxCalculationItems = useMemo(() => 
    formData.items.map(item => ({
      quantity: item.qty,
      unit_price: item.unit_price,
      product_id: 0 // Los items de facturas compra no tienen product_id necesariamente
    })), [formData.items]
  );

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {esEdicion ? 'Editar Factura de Compra' : 'Nueva Factura de Compra'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {esEdicion ? 'Modificar los datos de la factura' : 'Registre una nueva factura de proveedor'}
            </p>
          </div>
        </div>
        
        <FormActions
          saving={saving}
          esEdicion={esEdicion}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
          items={convertToTaxCalculationItems(formData.items)}
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
        <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
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
