'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NuevaFacturaCompraForm, SupplierBase, OrganizationPaymentMethod, OrganizationCurrency } from '../types';
import { SupplierSelector } from './SupplierSelector';

interface InformacionBasicaFormProps {
  formData: NuevaFacturaCompraForm;
  proveedores: SupplierBase[];
  metodosPago: OrganizationPaymentMethod[];
  monedas: OrganizationCurrency[];
  errors: Record<string, string>;
  onInputChange: (field: keyof NuevaFacturaCompraForm, value: any) => void;
  onProveedorCreado: (nuevoProveedor: SupplierBase) => void;
}

export function InformacionBasicaForm({
  formData,
  proveedores,
  metodosPago,
  monedas,
  errors,
  onInputChange,
  onProveedorCreado
}: InformacionBasicaFormProps) {
  // Estado para manejo de términos de pago personalizado
  const [isCustomPaymentTerm, setIsCustomPaymentTerm] = useState<boolean>(false);
  
  // Estado para generación automática del número de factura
  const [isGeneratingNumber, setIsGeneratingNumber] = useState<boolean>(false);
  const [invoiceNumberError, setInvoiceNumberError] = useState<string>('');
  
  // Callback memoizado para evitar loops infinitos en SupplierSelector
  const handleSupplierChange = useCallback((value: number | null) => {
    onInputChange('supplier_id', value);
  }, [onInputChange]);
  
  // Callbacks memoizados para todos los campos del formulario
  const handleInvoiceNumberInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleInvoiceNumberChange(e.target.value);
  }, []);

  const handleCurrencyChange = useCallback((value: string) => {
    onInputChange('currency', value);
  }, [onInputChange]);

  const handleIssueDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onInputChange('issue_date', e.target.value);
  }, [onInputChange]);

  const handlePaymentTermsChange = useCallback((value: string) => {
    if (value === "custom") {
      setIsCustomPaymentTerm(true);
      return;
    }
    
    setIsCustomPaymentTerm(false);
    const days = parseInt(value);
    onInputChange('payment_terms', days);
    
    // Actualizar la fecha de vencimiento automáticamente
    updateDueDate(days);
  }, [onInputChange]);

  const handleCustomPaymentTermsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const days = parseInt(e.target.value) || 1;
    onInputChange('payment_terms', days);
    
    // Actualizar fecha de vencimiento
    updateDueDate(days);
  }, [onInputChange]);

  const handleDueDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onInputChange('due_date', e.target.value);
  }, [onInputChange]);

  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange('notes', e.target.value);
  }, [onInputChange]);
  
  // Función para generar número de factura automáticamente
  const generateInvoiceNumber = async () => {
    setIsGeneratingNumber(true);
    
    try {
      const currentYear = new Date().getFullYear();
      const organizationId = getOrganizationId();
      const branchId = getCurrentBranchId();
      const prefix = `COMP-${currentYear}`;
      
      // Obtener el último número de factura del año actual para esta organización
      const { data, error } = await supabase
        .from('invoice_purchase')
        .select('number_ext')
        .eq('organization_id', organizationId)
        .like('number_ext', `${prefix}-%`)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error al consultar facturas:', error);
        throw error;
      }
      
      let nextNumber = 1;
      
      if (data && data.length > 0) {
        const lastInvoiceNumber = data[0].number_ext;
        const numberPart = lastInvoiceNumber.split('-')[2];
        nextNumber = parseInt(numberPart) + 1;
      }
      
      const newInvoiceNumber = `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
      onInputChange('number_ext', newInvoiceNumber);
      
    } catch (error) {
      console.error('Error generando número de factura:', error);
    } finally {
      setIsGeneratingNumber(false);
    }
  };
  
  // Función para verificar si el número de factura ya existe
  const checkInvoiceNumberExists = async (invoiceNumber: string) => {
    if (!invoiceNumber.trim()) return false;
    
    try {
      const organizationId = getOrganizationId();
      const { data, error } = await supabase
        .from('invoice_purchase')
        .select('id')
        .eq('number_ext', invoiceNumber)
        .eq('organization_id', organizationId)
        .limit(1);
      
      if (error) {
        console.error('Error verificando número de factura:', error);
        return false;
      }
      
      return data && data.length > 0;
    } catch (error) {
      console.error('Error en verificación:', error);
      return false;
    }
  };
  
  // Efecto para generar número automáticamente al cargar el componente
  useEffect(() => {
    if (!formData.number_ext) {
      generateInvoiceNumber();
    }
  }, []);
  
  // Función para manejar cambios en el número de factura y verificar duplicados
  const handleInvoiceNumberChange = async (value: string) => {
    onInputChange('number_ext', value);
    
    if (value.trim()) {
      const exists = await checkInvoiceNumberExists(value);
      if (exists) {
        setInvoiceNumberError('Este número de factura ya existe');
      } else {
        setInvoiceNumberError('');
      }
    } else {
      setInvoiceNumberError('');
    }
  };
  
  // Función para actualizar fecha de vencimiento basada en los días
  const updateDueDate = (days: number) => {
    if (formData.issue_date) {
      const issueDate = new Date(formData.issue_date);
      const newDueDate = new Date(issueDate);
      newDueDate.setDate(newDueDate.getDate() + days);
      onInputChange('due_date', newDueDate.toISOString().split('T')[0]);
    }
  };
  
  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
      <CardHeader className="pb-3 sm:pb-6">
        <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">Información Básica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6 pt-0">
        {/* Selector de Proveedor */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Proveedor *</Label>
          <SupplierSelector
            value={formData.supplier_id}
            onValueChange={handleSupplierChange}
            proveedores={proveedores}
            onProveedorCreado={onProveedorCreado}
          />
          {errors.supplier_id && (
            <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{errors.supplier_id}</p>
          )}
        </div>

        {/* Información de la Factura */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="number_ext" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Número de Factura *
            </Label>
            <div className="relative flex gap-2 items-start">
              <div className="relative flex-1">
                <Input
                  id="number_ext"
                  value={formData.number_ext}
                  onChange={handleInvoiceNumberInputChange}
                  placeholder="Ej: COMP-2024-0001"
                  className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateInvoiceNumber}
                disabled={isGeneratingNumber}
                className="h-8 sm:h-9 w-8 sm:w-9 p-0 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                title="Generar número automáticamente"
              >
                <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isGeneratingNumber ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {(errors.number_ext || invoiceNumberError) && (
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">
                {errors.number_ext || invoiceNumberError}
              </p>
            )}
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="currency" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Moneda *
            </Label>
            <Select 
              value={formData.currency} 
              onValueChange={handleCurrencyChange}
            >
              <SelectTrigger className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                <SelectValue placeholder="Seleccionar moneda" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {monedas.map((moneda) => (
                  <SelectItem 
                    key={moneda.currency_code} 
                    value={moneda.currency_code}
                    className="text-sm dark:text-gray-100 dark:focus:bg-gray-700"
                  >
                    {moneda.currency_code} - {moneda.currencies?.name || moneda.currency_code}
                    {moneda.is_base && ' (Base)'}
                    {moneda.currencies?.symbol && ` ${moneda.currencies.symbol}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Fechas y términos de pago */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="issue_date" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Fecha de Emisión *
            </Label>
            <Input
              id="issue_date"
              type="date"
              value={formData.issue_date}
              onChange={handleIssueDateChange}
              className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
            {errors.issue_date && (
              <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{errors.issue_date}</p>
            )}
          </div>

          <div className="space-y-1.5 sm:space-y-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="payment_terms" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Términos de Pago
            </Label>
            <div className="flex flex-col gap-2">
              <Select 
                value={isCustomPaymentTerm ? "custom" : formData.payment_terms.toString()}
                onValueChange={handlePaymentTermsChange}
              >
                <SelectTrigger className="h-8 sm:h-9 w-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                  <SelectValue placeholder="Seleccionar términos">
                    {isCustomPaymentTerm 
                      ? `Personalizado: ${formData.payment_terms} días` 
                      : (formData.payment_terms === 0 ? 'Contado' : `${formData.payment_terms} días`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="0" className="text-sm dark:text-gray-100 dark:focus:bg-gray-700">Contado</SelectItem>
                  <SelectItem value="15" className="text-sm dark:text-gray-100 dark:focus:bg-gray-700">15 días</SelectItem>
                  <SelectItem value="30" className="text-sm dark:text-gray-100 dark:focus:bg-gray-700">30 días</SelectItem>
                  <SelectItem value="45" className="text-sm dark:text-gray-100 dark:focus:bg-gray-700">45 días</SelectItem>
                  <SelectItem value="60" className="text-sm dark:text-gray-100 dark:focus:bg-gray-700">60 días</SelectItem>
                  <SelectItem value="90" className="text-sm dark:text-gray-100 dark:focus:bg-gray-700">90 días</SelectItem>
                  <SelectItem value="custom" className="text-sm dark:text-gray-100 dark:focus:bg-gray-700">Personalizado</SelectItem>
                </SelectContent>
              </Select>
              
              {isCustomPaymentTerm && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={formData.payment_terms}
                    onChange={handleCustomPaymentTermsChange}
                    className="h-8 w-20 sm:w-24 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                  <span className="text-xs sm:text-sm text-gray-900 dark:text-gray-300">días</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5 sm:space-y-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="due_date" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Fecha de Vencimiento
            </Label>
            <Input
              id="due_date"
              type="date"
              value={formData.due_date}
              onChange={handleDueDateChange}
              className="h-8 sm:h-9 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Notas */}
        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="notes" className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            Notas adicionales
          </Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={handleNotesChange}
            placeholder="Términos especiales, condiciones, etc."
            className="text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-500 min-h-[60px] sm:min-h-[72px]"
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
