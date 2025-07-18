'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { ClienteSelector } from './ClienteSelector';
import { ItemsFactura } from './ItemsFactura';
import { ImpuestosFactura } from './ImpuestosFactura';
import { FormaPagoSelector } from './FormaPagoSelector';
import { format } from 'date-fns';
import { Save, FileCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

// Tipo para un ítem de factura
export type InvoiceItem = {
  id?: string; // Cambiado a UUID (string en TypeScript)
  invoice_id?: string | null; // Campo mantenido por compatibilidad
  invoice_sales_id?: string | null; // Nuevo campo para relación con facturas de venta
  invoice_purchase_id?: string | null; // Nuevo campo para relación con facturas de compra
  invoice_type?: 'sale' | 'purchase'; // Tipo explícito para mayor seguridad
  product_id?: number | null; // Mantenemos product_id como número
  description: string;
  qty: number;
  unit_price: number;
  tax_code?: string | null;
  tax_rate?: number | null;
  tax_included: boolean; // Indica si el impuesto está incluido en el precio
  total_line: number;
  discount_amount?: number | null;
  product_name?: string; // Campo adicional para UI
};

// Tipo para una factura
interface Invoice {
  id?: string;
  organization_id: number;
  branch_id: number; // Campo obligatorio según el esquema de la DB
  customer_id: string | null; // Cambiado a string para UUID
  sale_id?: string; // Relación con la tabla sales
  number: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  balance: number | null;
  status: string;
  payment_terms: number | null;
  payment_method: string | null;
  notes: string | null;
  tax_included?: boolean; // Indicador si los impuestos están incluidos en los precios
  created_by?: string; // ID del usuario que crea la factura
};

export function NuevaFacturaForm() {
  const router = useRouter();
  const organizationId = getOrganizationId();

  // Estados para el formulario
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<number>(1); // Por defecto usamos la sucursal principal (ID 1)
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [isDuplicateNumber, setIsDuplicateNumber] = useState<boolean>(false);
  const [isValidatingNumber, setIsValidatingNumber] = useState<boolean>(false);
  const [issueDate, setIssueDate] = useState<Date | undefined>(new Date());
  const [dueDate, setDueDate] = useState<Date | undefined>(() => {
    // Inicializar fecha de vencimiento basada en fecha actual + 30 días
    const date = new Date();
    date.setDate(date.getDate() + 30); // Valor predeterminado
    return date;
  });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<number>(30); // Ahora usamos número de días
  const [isCustomPaymentTerm, setIsCustomPaymentTerm] = useState<boolean>(false);
  const [paymentMethodCode, setPaymentMethodCode] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Estados para impuestos
  const [taxIncluded, setTaxIncluded] = useState<boolean>(false);
  const [appliedTaxes, setAppliedTaxes] = useState<{[key: string]: boolean}>({});
  const [appliedTaxTotals, setAppliedTaxTotals] = useState<{[key: string]: any}>({});
  const [subtotal, setSubtotal] = useState<number>(0);
  const [taxTotal, setTaxTotal] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);

  // Función para verificar si el número de factura ya existe
  const checkDuplicateInvoiceNumber = useCallback(async (number: string) => {
    if (!number || !organizationId) return false;
    
    setIsValidatingNumber(true);
    try {
      const { data, error } = await supabase
        .from('invoice_sales')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('number', number)
        .limit(1);
        
      if (error) throw error;
      
      // Si hay resultados, significa que el número ya existe
      const isDuplicate = data && data.length > 0;
      setIsDuplicateNumber(isDuplicate);
      
      if (isDuplicate) {
        toast({
          title: "Número duplicado",
          description: "Este número de factura ya existe. Por favor, utilice otro número.",
          variant: "destructive",
        });
      }
      
      return isDuplicate;
    } catch (error) {
      console.error('Error al verificar duplicados:', error);
      return false;
    } finally {
      setIsValidatingNumber(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      generateInvoiceNumber();
    }
  }, [organizationId]);

  // Efecto para validar el número de factura cuando cambia
  useEffect(() => {
    // Usar un timer para no validar con cada pulsación
    const timer = setTimeout(() => {
      if (invoiceNumber && invoiceNumber.trim() !== '') {
        checkDuplicateInvoiceNumber(invoiceNumber);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [invoiceNumber, checkDuplicateInvoiceNumber]);

  // Función para generar número de factura
  const generateInvoiceNumber = async () => {
    try {
      // Consultar el número más alto de factura para la organización
      const { data, error } = await supabase
        .from('invoice_sales')
        .select('number')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (error) throw error;
      
      let nextNumber = 1;
      
      // Si hay facturas existentes, incrementar el número
      if (data && data.length > 0) {
        const lastNumber = data[0].number;
        // Extraer el número si tiene formato como 'FACT-0001'
        const match = lastNumber.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        } else if (!isNaN(parseInt(lastNumber, 10))) {
          nextNumber = parseInt(lastNumber, 10) + 1;
        }
      }
      
      // Formatear el número con ceros a la izquierda
      const formattedNumber = `FACT-${nextNumber.toString().padStart(4, '0')}`;
      setInvoiceNumber(formattedNumber);
      setIsDuplicateNumber(false); // Resetear el estado de duplicado al generar un nuevo número
    } catch (error) {
      console.error('Error al generar número de factura:', error);
      toast({
        title: "Error",
        description: "No se pudo generar el número de factura automáticamente.",
        variant: "destructive",
      });
    }
  };

  // Función para manejar cambios en los items
  const handleItemsChange = (newItems: InvoiceItem[]) => {
    setItems(newItems);
  };

  // Función para guardar la factura
  const handleSaveInvoice = async () => {
    // Validar que se tenga el número de factura
    if (!invoiceNumber) {
      toast({
        title: "Error",
        description: "Debe ingresar un número de factura.",
        variant: "destructive",
      });
      return;
    }
    
    // Obtener el ID del usuario actual
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    
    if (!currentUserId) {
      toast({
        title: "Error",
        description: "No se pudo obtener la información del usuario actual.",
        variant: "destructive",
      });
      return;
    }
    
    if (!organizationId) {
      toast({
        title: "Error",
        description: "No se pudo determinar la organización activa.",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedCustomerId) {
      toast({
        title: "Error",
        description: "Debe seleccionar un cliente para la factura.",
        variant: "destructive",
      });
      return;
    }
    
    if (items.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un ítem a la factura.",
        variant: "destructive",
      });
      return;
    }
    
    // Verificar si el número de factura está duplicado antes de guardar
    const isDuplicate = await checkDuplicateInvoiceNumber(invoiceNumber);
    if (isDuplicate) {
      return; // No continuar si el número está duplicado
    }
    
    try {
      setIsLoading(true);
      
      // 1. Primero crear el registro en sales
      const sale = {
        organization_id: Number(organizationId),
        branch_id: branchId,
        customer_id: selectedCustomerId || null,
        user_id: currentUserId,
        sale_date: issueDate?.toISOString() || new Date().toISOString(),
        subtotal: subtotal,
        tax_total: taxTotal,
        total: total,
        balance: total, // Al crear, el balance es igual al total
        status: 'pending', // Estado permitido por la restricción sales_status_check
        payment_status: 'pending', // Por defecto pendiente de pago
        notes: notes,
        discount_total: 0 // Valor por defecto
      };
      
      // Guardar venta en Supabase
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert(sale)
        .select()
        .single();
        
      if (saleError) throw saleError;
      
      // 2. Crear los items de venta
      const saleItemPromises = items.map(item => {
        return supabase
          .from('sale_items')
          .insert({
            sale_id: saleData.id,
            product_id: item.product_id,
            quantity: item.qty,
            unit_price: item.unit_price,
            total: item.total_line,
            tax_rate: item.tax_rate || 0,
            tax_amount: (item.total_line * (item.tax_rate || 0)) / 100,
            discount_amount: item.discount_amount || 0
          });
      });
      
      // Guardar items de venta
      const saleItemsResults = await Promise.all(saleItemPromises);
      
      // Verificar si alguna promesa tuvo error
      const saleItemsError = saleItemsResults.find(result => result.error);
      if (saleItemsError) throw saleItemsError.error;
      
      // 3. Crear objeto de factura con el sale_id
      const invoice: Invoice = {
        organization_id: Number(organizationId),
        branch_id: branchId,
        customer_id: selectedCustomerId || null,
        sale_id: saleData.id, // Vinculamos con la venta creada
        number: invoiceNumber,
        issue_date: issueDate?.toISOString().split('T')[0] || null,
        due_date: dueDate?.toISOString().split('T')[0] || null,
        currency: 'COP', // Por defecto, debe ser seleccionable
        subtotal: subtotal,
        tax_total: taxTotal,
        total: total,
        balance: total, // Al crear, el balance es igual al total
        status: 'draft', // Por defecto
        payment_terms: paymentTerms,
        payment_method: paymentMethodCode,
        notes: notes,
        tax_included: taxIncluded, // Agregamos el campo tax_included
        created_by: currentUserId, // Asignamos el ID del usuario actual
      };
      
      // 4. Guardar factura en Supabase
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoice_sales')
        .insert(invoice)
        .select()
        .single();
        
      if (invoiceError) throw invoiceError;
      
      // 5. Preparar ítems para guardar con el ID de la factura
      const itemPromises = items.map(item => {
        return supabase
          .from('invoice_items')
          .insert({
            invoice_sales_id: invoiceData.id, // Usamos el ID UUID de la factura
            invoice_id: invoiceData.id, // Por compatibilidad con código existente
            product_id: item.product_id,
            description: item.description,
            qty: item.qty,
            unit_price: item.unit_price,
            tax_code: item.tax_code,
            tax_rate: item.tax_rate,
            tax_included: item.tax_included || false, // Guardamos si el impuesto está incluido
            total_line: item.total_line,
            discount_amount: item.discount_amount || 0,
            invoice_type: 'sale' // Tipo de factura (venta)
          });
      });
      
      // 6. Guardar ítems de factura
      const itemsResults = await Promise.all(itemPromises);
      
      // Verificar si alguna promesa tuvo error
      const itemsError = itemsResults.find(result => result.error);
      if (itemsError) throw itemsError.error;
      
      toast({
        title: "Éxito",
        description: "La factura se ha creado correctamente.",
      });
      
      // Redireccionar a la vista de la factura
      // Aseguramos que el ID se maneje como string para compatibilidad con UUID
      router.push(`/app/finanzas/facturas-venta/${invoiceData.id.toString()}`);
      
      // Registro de diagnóstico
      console.log('Factura creada con UUID:', invoiceData.id);
      
    } catch (error) {
      console.error('Error al guardar la factura:', error);
      toast({
        title: "Error",
        description: `Ocurrió un error al guardar la factura: ${JSON.stringify(error)}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Información general de factura */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="invoice-number">Número de Factura</Label>
          <div className="relative flex space-x-2 items-start">
            <div className="relative flex-1">
              <Input 
                id="invoice-number" 
                value={invoiceNumber} 
                onChange={(e) => {
                  setInvoiceNumber(e.target.value);
                  // Resetear el estado de duplicado cuando el usuario cambia el valor
                  if (isDuplicateNumber) {
                    setIsDuplicateNumber(false);
                  }
                }}
                onBlur={() => checkDuplicateInvoiceNumber(invoiceNumber)}
                placeholder="Ej. FACT-0001" 
                className={isDuplicateNumber ? "border-red-500 focus:ring-red-500" : ""}
              />
              {isValidatingNumber && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                </div>
              )}
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => {
                generateInvoiceNumber();
                setIsDuplicateNumber(false);
              }}
              title="Generar número automáticamente"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {isDuplicateNumber && (
              <p className="text-xs text-red-500 mt-1 absolute -bottom-5 left-0">Este número de factura ya existe.</p>
            )}
          </div>
        </div>
        
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issue-date">Fecha de Emisión</Label>
          <DatePicker
            date={issueDate}
            onSelect={(date) => {
              setIssueDate(date);
              
              // Actualizar fecha de vencimiento cuando cambia la fecha de emisión
              if (date) {
                const newDueDate = new Date(date);
                newDueDate.setDate(newDueDate.getDate() + paymentTerms);
                setDueDate(newDueDate);
              }
            }}
          />
        </div>
        
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="due-date">Fecha de Vencimiento</Label>
          <DatePicker
            date={dueDate}
            onSelect={setDueDate}
          />
        </div>
      </div>
      
      {/* Selector de Cliente */}
      <div className="border p-4 rounded-md">
        <h3 className="font-medium mb-2">Datos del Cliente</h3>
        <ClienteSelector 
          selectedCustomerId={selectedCustomerId} 
          onCustomerChange={setSelectedCustomerId}
        />
      </div>
      
      {/* Items de Factura */}
      <div className="border p-4 rounded-md">
        <h3 className="font-medium mb-2">Items de la Factura</h3>
        <ItemsFactura 
          items={items} 
          onItemsChange={handleItemsChange}
          taxIncluded={taxIncluded}
        />
      </div>
      
      {/* El componente ImpuestosFactura se ha movido después de las condiciones de pago para evitar duplicación */}
      
      {/* Información de Pago */}
      <div className="border p-4 rounded-md">
        <h3 className="font-medium mb-2">Condiciones de Pago</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="payment-terms">Términos de Pago</Label>
            <div className="flex flex-col space-y-2">
              <Select 
                value={isCustomPaymentTerm ? "custom" : paymentTerms.toString()}
                onValueChange={(value) => {
                  if (value === "custom") {
                    setIsCustomPaymentTerm(true);
                    return;
                  }
                  
                  setIsCustomPaymentTerm(false);
                  const days = parseInt(value);
                  setPaymentTerms(days);
                  
                  // Actualizar la fecha de vencimiento basada en la fecha de emisión + días
                  if (issueDate) {
                    const newDueDate = new Date(issueDate);
                    newDueDate.setDate(newDueDate.getDate() + days);
                    setDueDate(newDueDate);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar términos">
                    {isCustomPaymentTerm 
                      ? `Personalizado: ${paymentTerms} días` 
                      : (paymentTerms === 0 ? 'Contado' : `${paymentTerms} días`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Contado</SelectItem>
                  <SelectItem value="15">15 días</SelectItem>
                  <SelectItem value="30">30 días</SelectItem>
                  <SelectItem value="45">45 días</SelectItem>
                  <SelectItem value="60">60 días</SelectItem>
                  <SelectItem value="90">90 días</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
              
              {isCustomPaymentTerm && (
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min="1"
                    value={paymentTerms}
                    onChange={(e) => {
                      const days = parseInt(e.target.value) || 1;
                      setPaymentTerms(days);
                      
                      // Actualizar fecha de vencimiento
                      if (issueDate) {
                        const newDueDate = new Date(issueDate);
                        newDueDate.setDate(newDueDate.getDate() + days);
                        setDueDate(newDueDate);
                      }
                    }}
                    className="w-24"
                  />
                  <span className="text-sm">días</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <FormaPagoSelector 
              formaPago={paymentMethodCode} 
              onChange={setPaymentMethodCode} 
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Input 
              id="notes" 
              value={notes} 
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas adicionales" 
            />
          </div>
        </div>
      </div>
      
      {/* Impuestos y Totales */}
      <ImpuestosFactura 
        organizationId={organizationId}
        items={items}
        taxIncluded={taxIncluded}
        onTaxIncludedChange={(value) => {
          setTaxIncluded(value);
          
          // Actualizar todos los ítems existentes para que usen el nuevo valor
          const updatedItems = items.map(item => ({
            ...item,
            tax_included: value
          }));
          
          setItems(updatedItems);
        }}
        onAppliedTaxesChange={setAppliedTaxes}
        onTaxTotalsChange={setAppliedTaxTotals}
        onSubtotalCalculated={setSubtotal}
        onTaxTotalCalculated={setTaxTotal}
        onTotalCalculated={setTotal}
      />
      
      {/* Botones de Acción */}
      <div className="flex justify-end gap-3 pt-4">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Cancelar
        </Button>
        <Button
          onClick={handleSaveInvoice}
          disabled={isLoading}
        >
          <Save className="w-4 h-4 mr-2" />
          {isLoading ? 'Guardando...' : 'Guardar Factura'}
        </Button>
      </div>
    </div>
  );
}
