'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { OrganizationPaymentMethod } from '@/components/finanzas/metodos-pago/payment-method-types';

type FormaPagoSelectorProps = {
  formaPago: string;
  onChange: (formaPago: string) => void;
};

export function FormaPagoSelector({ formaPago, onChange }: FormaPagoSelectorProps) {
  const [metodosPago, setMetodosPago] = useState<OrganizationPaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const organizationId = getOrganizationId();
  
  // Cargar métodos de pago activos para la organización actual
  useEffect(() => {
    if (organizationId) {
      cargarMetodosPago();
    }
  }, [organizationId]);
  
  // Función para cargar métodos de pago desde Supabase
  const cargarMetodosPago = async () => {
    try {
      setIsLoading(true);
      
      // Consultar métodos de pago activos para la organización junto con sus detalles
      const { data, error } = await supabase
        .from('organization_payment_methods')
        .select(`
          id,
          organization_id,
          payment_method_code,
          is_active,
          settings
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('id');
      
      if (error) throw error;
      
      // Obtener detalles de los métodos de pago
      let metodosFormateados: OrganizationPaymentMethod[] = [];
      
      if (data && data.length > 0) {
        // Para cada método de pago de la organización, obtener los detalles del método
        for (const item of data) {
          // Obtener datos del método de pago base
          const { data: paymentMethodData } = await supabase
            .from('payment_methods')
            .select('name, requires_reference')
            .eq('code', item.payment_method_code)
            .single();
          
          metodosFormateados.push({
            id: item.id,
            organization_id: organizationId,
            payment_method_code: item.payment_method_code,
            is_active: item.is_active,
            settings: item.settings,
            payment_method: {
              code: item.payment_method_code,
              name: paymentMethodData?.name || item.payment_method_code,
              requires_reference: paymentMethodData?.requires_reference || false,
              is_active: true,
              is_system: true
            }
          });
        }
      }
      
      setMetodosPago(metodosFormateados);
      
      // Si no hay un método seleccionado y hay métodos disponibles, seleccionar el primero
      if (!formaPago && metodosFormateados.length > 0) {
        onChange(metodosFormateados[0].payment_method_code);
      }
      
    } catch (error) {
      console.error('Error al cargar métodos de pago:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los métodos de pago. Por favor, inténtelo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="payment-method" className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Forma de Pago
      </Label>
      <Select 
        value={formaPago} 
        onValueChange={onChange}
        disabled={isLoading || metodosPago.length === 0}
      >
        <SelectTrigger 
          id="payment-method"
          className="
            w-full text-sm
            bg-white dark:bg-gray-900
            border-gray-300 dark:border-gray-600
            text-gray-900 dark:text-gray-100
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <SelectValue placeholder="Seleccionar forma de pago" />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          {isLoading ? (
            <SelectItem value="_loading" disabled className="text-gray-500 dark:text-gray-400">
              Cargando métodos...
            </SelectItem>
          ) : metodosPago.length === 0 ? (
            <SelectItem value="_empty" disabled className="text-gray-500 dark:text-gray-400">
              No hay métodos de pago disponibles
            </SelectItem>
          ) : (
            metodosPago.map(metodo => (
              <SelectItem 
                key={metodo.payment_method_code} 
                value={metodo.payment_method_code || '_unknown'}
                className="text-gray-900 dark:text-gray-100"
              >
                {metodo.payment_method?.name || metodo.payment_method_code}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
