'use client';

import React, { useState, useEffect } from 'react';
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
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="dark:text-white">Información Básica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Selector de Proveedor */}
        <div className="space-y-2">
          <Label className="dark:text-gray-300">Proveedor</Label>
          <SupplierSelector
            value={formData.supplier_id}
            onValueChange={(value) => onInputChange('supplier_id', value)}
            proveedores={proveedores}
            onProveedorCreado={onProveedorCreado}
          />
          {errors.supplier_id && (
            <p className="text-sm text-red-600">{errors.supplier_id}</p>
          )}
        </div>

        {/* Información de la Factura */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="number_ext" className="dark:text-gray-300">
              Número de Factura
            </Label>
            <div className="relative flex space-x-2 items-start">
              <div className="relative flex-1">
                <Input
                  id="number_ext"
                  value={formData.number_ext}
                  onChange={(e) => handleInvoiceNumberChange(e.target.value)}
                  placeholder="Ej: COMP-2024-0001"
                  className="dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateInvoiceNumber}
                disabled={isGeneratingNumber}
                className="h-9 w-9"
                title="Generar número automáticamente"
              >
                <RefreshCw className={`h-4 w-4 ${isGeneratingNumber ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {(errors.number_ext || invoiceNumberError) && (
              <p className="text-sm text-red-600">
                {errors.number_ext || invoiceNumberError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency" className="dark:text-gray-300">
              Moneda
            </Label>
            <Select 
              value={formData.currency} 
              onValueChange={(value) => onInputChange('currency', value)}
            >
              <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                <SelectValue placeholder="Seleccionar moneda" />
              </SelectTrigger>
              <SelectContent>
                {monedas.map((moneda) => (
                  <SelectItem 
                    key={moneda.currency_code} 
                    value={moneda.currency_code}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="issue_date" className="dark:text-gray-300">
              Fecha de Emisión
            </Label>
            <Input
              id="issue_date"
              type="date"
              value={formData.issue_date}
              onChange={(e) => onInputChange('issue_date', e.target.value)}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
            {errors.issue_date && (
              <p className="text-sm text-red-600">{errors.issue_date}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_terms" className="dark:text-gray-300">
              Términos de Pago
            </Label>
            <div className="flex flex-col space-y-2">
              <Select 
                value={isCustomPaymentTerm ? "custom" : formData.payment_terms.toString()}
                onValueChange={(value) => {
                  if (value === "custom") {
                    setIsCustomPaymentTerm(true);
                    return;
                  }
                  
                  setIsCustomPaymentTerm(false);
                  const days = parseInt(value);
                  onInputChange('payment_terms', days);
                  
                  // Actualizar la fecha de vencimiento automáticamente
                  updateDueDate(days);
                }}
              >
                <SelectTrigger className="w-full dark:bg-gray-700 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar términos">
                    {isCustomPaymentTerm 
                      ? `Personalizado: ${formData.payment_terms} días` 
                      : (formData.payment_terms === 0 ? 'Contado' : `${formData.payment_terms} días`)}
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
                    value={formData.payment_terms}
                    onChange={(e) => {
                      const days = parseInt(e.target.value) || 1;
                      onInputChange('payment_terms', days);
                      
                      // Actualizar fecha de vencimiento
                      updateDueDate(days);
                    }}
                    className="w-24 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm dark:text-gray-300">días</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date" className="dark:text-gray-300">
              Fecha de Vencimiento
            </Label>
            <Input
              id="due_date"
              type="date"
              value={formData.due_date}
              onChange={(e) => onInputChange('due_date', e.target.value)}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
        </div>

        {/* Notas */}
        <div className="space-y-2">
          <Label htmlFor="notes" className="dark:text-gray-300">
            Notas adicionales
          </Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => onInputChange('notes', e.target.value)}
            placeholder="Términos especiales, condiciones, etc."
            className="dark:bg-gray-700 dark:border-gray-600"
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
