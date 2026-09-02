'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, Percent, DollarSign, AlertCircle } from 'lucide-react';
import { FacturasCompraService } from '../FacturasCompraService';
import { parseLocalDate, toLocalDateString, formatCurrency } from '@/utils/Utils';
import { 
  NuevaFacturaCompraForm, 
  InvoiceItemForm, 
  SupplierBase,
  OrganizationPaymentMethod,
  OrganizationCurrency,
  InvoicePurchase 
} from '../types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toastError } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InformacionBasicaForm } from './InformacionBasicaForm';
import { ItemsListForm } from './ItemsListForm';
import { ResumenFactura } from './ResumenFactura';
import { FormActions } from './FormActions';
import { ImpuestosFacturaCompra } from './ImpuestosFacturaCompra';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchSelect } from '@/components/ui/search-select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
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
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  
  // Detectar si estamos en inventario o finanzas
  const basePath = pathname?.includes('/inventario/')
    ? '/app/inventario/facturas-compra'
    : '/app/finanzas/facturas-compra';
  const [proveedores, setProveedores] = useState<SupplierBase[]>([]);
  const [metodosPago, setMetodosPago] = useState<OrganizationPaymentMethod[]>([]);
  const [monedas, setMonedas] = useState<OrganizationCurrency[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Confirmación de cancelación (reemplaza window.confirm nativo)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  
  // Estados para impuestos avanzados
  const [taxCalculation, setTaxCalculation] = useState<TaxCalculationResult>({
    subtotal: 0,
    totalTaxAmount: 0,
    finalTotal: 0,
    taxBreakdown: []
  });
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});

  // Estados para comisión
  const [salespersonId, setSalespersonId] = useState<string>('');
  const [commissionRate, setCommissionRate] = useState<number>(0);
  const [commissionType, setCommissionType] = useState<'salesperson' | 'intermediation_purchase' | 'none'>('salesperson');
  const [commissionMethod, setCommissionMethod] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [organizationMembers, setOrganizationMembers] = useState<{ id: string; name: string }[]>([]);

  // Función para obtener datos iniciales
  const obtenerDatosIniciales = (): NuevaFacturaCompraForm => {
    if (esEdicion && facturaInicial) {
      return {
        supplier_id: facturaInicial.supplier_id,
        number_ext: facturaInicial.number_ext,
        issue_date: facturaInicial.issue_date ? facturaInicial.issue_date.split('T')[0] : toLocalDateString(new Date()),
        due_date: facturaInicial.due_date ? facturaInicial.due_date.split('T')[0] : '',
        currency: facturaInicial.currency || 'COP',
        payment_terms: facturaInicial.payment_terms || 30,
        tax_included: facturaInicial.tax_included || false,
        notes: facturaInicial.notes || '',
        items: facturaInicial.items?.map((item: any) => ({
          product_id: item.product_id,
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || 19,
          discount_amount: item.discount_amount || 0,
          serial_numbers: item.serial_numbers || [],
          track_serial: item.products?.track_serial || false
        })) || [],
        salesperson_id: facturaInicial.salesperson_id || '',
        commission_rate: Number(facturaInicial.commission_rate) || 0,
        commission_type: facturaInicial.commission_type || 'salesperson',
        commission_method: (facturaInicial as any).commission_method || 'percentage'
      };
    }
    
    return {
      supplier_id: null,
      number_ext: '',
      issue_date: toLocalDateString(new Date()),
      due_date: '',
      currency: 'COP',
      payment_terms: 30,
      tax_included: false,
      notes: '',
      items: [],
      salesperson_id: '',
      commission_rate: 0,
      commission_type: 'salesperson',
      commission_method: 'percentage'
    };
  };

  const [formData, setFormData] = useState<NuevaFacturaCompraForm>(obtenerDatosIniciales());

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatosIniciales();
    calcularFechaVencimiento();
  }, []);

  // Cargar miembros de la organización para selector de comisionista
  useEffect(() => {
    const loadMembers = async () => {
      const orgId = await getOrganizationId();
      if (!orgId) return;
      try {
        const { data: members } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', orgId);

        if (members && members.length > 0) {
          const userIds = members.map(m => m.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);

          const profileMap = new Map((profiles || []).map(p => [p.id, p]));
          const formatted = members.map((m: any) => {
            const p = profileMap.get(m.user_id);
            return {
              id: m.user_id,
              name: `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Usuario'
            };
          });
          setOrganizationMembers(formatted);
        }
      } catch (e) {
        console.warn('Error cargando miembros:', e);
      }
    };
    loadMembers();
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
      const fechaEmision = parseLocalDate(formData.issue_date);
      fechaEmision.setDate(fechaEmision.getDate() + formData.payment_terms);
      const fechaVencimiento = toLocalDateString(fechaEmision);
      
      setFormData(prev => ({ ...prev, due_date: fechaVencimiento }));
    }
  };

  const handleInputChange = useCallback((field: keyof NuevaFacturaCompraForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Sincronizar estados de comisión con formData
    if (field === 'salesperson_id') setSalespersonId(value);
    if (field === 'commission_rate') setCommissionRate(Number(value) || 0);
    if (field === 'commission_type') setCommissionType(value);
    if (field === 'commission_method') setCommissionMethod(value);
    
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
        const { subtotal: calculatedSubtotal, taxTotal: calculatedTaxTotal, total: calculatedTotal } = calcularTotales();
        await onSubmit({
          ...formData,
          salesperson_id: salespersonId || undefined,
          commission_rate: commissionRate || 0,
          commission_type: salespersonId && salespersonId !== '__none__' && commissionRate > 0 ? commissionType : 'none',
          commission_method: salespersonId && salespersonId !== '__none__' && commissionRate > 0 ? commissionMethod : 'percentage',
          commission_amount: salespersonId && salespersonId !== '__none__' && commissionRate > 0
            ? (commissionMethod === 'fixed_amount' ? commissionRate : Math.round((calculatedSubtotal > 0 ? calculatedSubtotal : calculatedTotal) * commissionRate / 100 * 100) / 100)
            : 0,
          appliedTaxes,
          _calculatedTotals: {
            subtotal: calculatedSubtotal,
            taxTotal: calculatedTaxTotal,
            total: calculatedTotal
          }
        });
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
          salesperson_id: salespersonId && salespersonId !== '__none__' ? salespersonId : undefined,
          commission_rate: commissionRate || 0,
          commission_type: salespersonId && salespersonId !== '__none__' && commissionRate > 0 ? commissionType : 'none',
          commission_method: salespersonId && salespersonId !== '__none__' && commissionRate > 0 ? commissionMethod : 'percentage',
          commission_amount: salespersonId && salespersonId !== '__none__' && commissionRate > 0
            ? (commissionMethod === 'fixed_amount' ? commissionRate : Math.round((calculatedSubtotal > 0 ? calculatedSubtotal : calculatedTotal) * commissionRate / 100 * 100) / 100)
            : 0,
          // Pasar totales calculados explícitamente
          _calculatedTotals: {
            subtotal: calculatedSubtotal,
            taxTotal: calculatedTaxTotal,
            total: calculatedTotal
          }
        };
        
        const factura = await FacturasCompraService.crearFactura(facturaConTotales);
        router.push(`${basePath}/${factura.id}`);
      }
    } catch (error) {
      console.error(esEdicion ? 'Error actualizando factura:' : 'Error creando factura:', error);
      toastError(
        'Error',
        esEdicion
          ? 'No se pudo actualizar la factura. Por favor, inténtelo de nuevo.'
          : 'No se pudo crear la factura. Por favor, inténtelo de nuevo.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Abrir AlertDialog de confirmación en vez de window.confirm nativo.
    setShowCancelConfirm(true);
  };

  const confirmCancel = () => {
    setShowCancelConfirm(false);
    router.push(basePath);
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
      product_id: item.product_id || 0,
      discount_amount: typeof item.discount_amount === 'string' ? parseFloat(item.discount_amount) || 0 : item.discount_amount || 0,
      tax_rate: typeof item.tax_rate === 'string' ? parseFloat(item.tax_rate) || 0 : item.tax_rate || 0,
      tax_included: formData.tax_included,
      tax_code: item.tax_code || null
    })), [formData.items, formData.tax_included]
  );

  // Memoizar códigos de impuestos iniciales para edición
  const initialAppliedTaxCodes = useMemo(() => {
    if (esEdicion && facturaInicial) {
      // Prioridad 1: impuestos guardados en invoice_purchase_applied_taxes
      if (facturaInicial.applied_taxes && facturaInicial.applied_taxes.length > 0) {
        return facturaInicial.applied_taxes
          .filter((t: any) => t.is_applied)
          .map((t: any) => t.tax_code);
      }
      // Fallback para facturas viejas: usar tax_code de los items
      if (facturaInicial.items) {
        const taxCodes = [...new Set(facturaInicial.items.map((item: any) => item.tax_code).filter(Boolean))];
        if (taxCodes.length > 0) return taxCodes;
      }
    }
    return undefined;
  }, [esEdicion, facturaInicial]);

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
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white break-words whitespace-normal min-w-0">
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
          supplierId={formData.supplier_id}
        />

        {/* Configuración de impuestos */}
        <ImpuestosFacturaCompra
          items={taxCalculationItems}
          currency={formData.currency}
          taxIncluded={formData.tax_included}
          onTaxIncludedChange={handleTaxIncludedChange}
          onTaxCalculationChange={handleTaxCalculationChange}
          initialAppliedTaxCodes={initialAppliedTaxCodes}
        />

        {/* Sección de Comisión */}
        <div className="
          border border-gray-200 dark:border-gray-700
          bg-gray-50/50 dark:bg-gray-900/30
          p-3 sm:p-4
          rounded-lg
        ">
          <h3 className="text-sm sm:text-base font-semibold mb-3 text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <User className="h-4 w-4 text-blue-500" />
            Comisión (opcional)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
                Comisionista
              </Label>
              <SearchSelect
                options={organizationMembers.map((m) => ({ value: m.id, label: m.name }))}
                value={salespersonId}
                onValueChange={(v) => handleInputChange('salesperson_id', v)}
                placeholder="Seleccionar comisionista"
                searchPlaceholder="Buscar comisionista..."
                noneLabel="Sin asignar"
                noneValue="__none__"
                className="bg-white dark:bg-gray-900 dark:text-gray-200 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
                Comisión
              </Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                  {commissionMethod === 'percentage' ? <Percent className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
                </span>
                <Input
                  type="number"
                  min="0"
                  max={commissionMethod === 'percentage' ? "100" : undefined}
                  step={commissionMethod === 'percentage' ? "0.5" : "100"}
                  value={commissionRate || ''}
                  onChange={(e) => handleInputChange('commission_rate', Number(e.target.value) || 0)}
                  placeholder="0"
                  className={`
                    text-sm pl-8
                    bg-white dark:bg-gray-900
                    text-gray-900 dark:text-gray-100
                    ${commissionMethod === 'percentage' && commissionRate > 100
                      ? 'border-red-500 dark:border-red-500 text-red-600 dark:text-red-400'
                      : commissionMethod === 'fixed_amount' && commissionRate > (subtotal > 0 ? subtotal : total)
                      ? 'border-red-500 dark:border-red-500 text-red-600 dark:text-red-400'
                      : 'border-gray-300 dark:border-gray-600'
                    }
                  `
                  }
                />
                {((commissionMethod === 'percentage' && commissionRate > 100) ||
                  (commissionMethod === 'fixed_amount' && commissionRate > (subtotal > 0 ? subtotal : total))) && commissionRate > 0 && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-500 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                  </span>
                )}
              </div>
              <div className="flex gap-1 mt-1.5">
                <Button
                  type="button"
                  variant={commissionMethod === 'percentage' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCommissionMethod('percentage')}
                  className="h-7 px-2 text-xs"
                >
                  <Percent className="h-3 w-3 mr-1" /> Porcentaje
                </Button>
                <Button
                  type="button"
                  variant={commissionMethod === 'fixed_amount' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCommissionMethod('fixed_amount')}
                  className="h-7 px-2 text-xs"
                >
                  <DollarSign className="h-3 w-3 mr-1" /> Monto Fijo
                </Button>
              </div>
              {commissionMethod === 'percentage' && commissionRate > 100 && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  El porcentaje no puede superar 100%
                </p>
              )}
              {commissionMethod === 'fixed_amount' && commissionRate > (subtotal > 0 ? subtotal : total) && commissionRate > 0 && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  El monto supera el total de la factura
                </p>
              )}
            </div>
          </div>
          {salespersonId && salespersonId !== '__none__' && commissionRate > 0 && (
            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex justify-between items-center text-sm">
                <span className="text-blue-700 dark:text-blue-400">
                  Comisión estimada ({commissionMethod === 'percentage' ? `${commissionRate}%` : formatCurrency(commissionRate)}):
                </span>
                <span className="font-semibold text-blue-700 dark:text-blue-400">
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: formData.currency || 'COP' }).format(
                    commissionMethod === 'fixed_amount' ? commissionRate : (subtotal > 0 ? subtotal : total) * commissionRate / 100
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

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

      {/* Confirmación de cancelación (reemplaza window.confirm) */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar la factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Se perderán todos los cambios no guardados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>
              Sí, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
