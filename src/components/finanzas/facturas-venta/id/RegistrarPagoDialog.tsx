'use client';

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription
} from '@/components/ui/alert';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface RegistrarPagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: any;
  onSuccess?: () => void;
}

// Interfaces para tipar correctamente los datos de Supabase
interface PaymentMethod {
  code: string;
  name: string;
  requires_reference?: boolean;
}

// Estructura de datos que devuelve Supabase al hacer el join
interface OrganizationPaymentMethodData {
  payment_method_code: string;
  id: number;
  organization_id: number;
  is_active: boolean;
  code: string;
  name: string;
  requires_reference?: boolean;
}

interface FormattedPaymentMethod {
  code: string;
  name: string;
  requires_reference?: boolean;
}

export function RegistrarPagoDialog({ open, onOpenChange, factura, onSuccess }: RegistrarPagoDialogProps) {
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  // Estados del formulario
  const [isLoading, setIsLoading] = useState(false);
  const [metodosPago, setMetodosPago] = useState<FormattedPaymentMethod[]>([]);
  const [metodoPago, setMetodoPago] = useState<string>('');
  const [monto, setMonto] = useState<string>('');
  const [referencia, setReferencia] = useState<string>('');
  const [montoExcedido, setMontoExcedido] = useState(false);

  // Cargar métodos de pago disponibles
  useEffect(() => {
    const cargarMetodosPago = async () => {
      if (!organizationId) return;

      try {
        // Consultar los métodos de pago de la organización uniendo con payment_methods
        const { data, error } = await supabase
          .from('organization_payment_methods')
          .select(`
            *,
            payment_methods:payment_method_code(*)
          `)
          .eq('organization_id', organizationId)
          .eq('is_active', true);

        if (error) throw error;
        
        // Transformar los datos para facilitar su uso
        const metodosPagoFormateados = data?.map((item): FormattedPaymentMethod => ({
          code: item.payment_method_code,
          name: item.payment_methods ? item.payment_methods.name : item.payment_method_code,
          requires_reference: item.payment_methods ? item.payment_methods.requires_reference : false
        })) || [];
        
        setMetodosPago(metodosPagoFormateados);
        // Establecer método de pago predeterminado si existe
        if (metodosPagoFormateados.length > 0) {
          setMetodoPago(metodosPagoFormateados[0].code);
        }
      } catch (error: any) {
        console.error('Error al cargar métodos de pago:', error);
      }
    };

    if (open) {
      cargarMetodosPago();
      // Establecer monto predeterminado con el saldo pendiente
      setMonto(factura.balance?.toString() || '0');
    }
  }, [open, organizationId]);

  // Manejar cambio en monto
  const handleMontoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Validar que sea un número válido
    if (/^\d*\.?\d*$/.test(value) || value === '') {
      setMonto(value);
      
      // Validar que el monto no exceda el saldo pendiente
      if (value && factura.balance) {
        const montoNumerico = parseFloat(value);
        const saldoPendiente = parseFloat(factura.balance);
        
        if (montoNumerico > saldoPendiente) {
          setMontoExcedido(true);
        } else {
          setMontoExcedido(false);
        }
      } else {
        setMontoExcedido(false);
      }
    }
  };

  // Función para registrar el pago
  const handleSubmit = async () => {
    if (!organizationId || !metodoPago || !monto) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    const montoNumerico = parseFloat(monto);
    if (isNaN(montoNumerico) || montoNumerico <= 0) {
      toast({
        title: "Error de validación",
        description: "El monto debe ser un número mayor a cero",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Convertir todos los UUIDs a string para evitar errores de tipo
      const facturaIdString = typeof factura.id === 'string' ? factura.id : factura.id?.toString() || '';
      const customerIdString = typeof factura.customer_id === 'string' ? factura.customer_id : factura.customer_id?.toString() || '';
      const saleIdString = typeof factura.sale_id === 'string' ? factura.sale_id : factura.sale_id?.toString() || '';

      console.log('Datos para registro de pago:', {
        organization_id: organizationId,
        branch_id: factura.branch_id,
        source: 'invoice_sales',
        source_id: facturaIdString,
        invoice_id: facturaIdString,
      });

      // Insertar el registro de pago
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: organizationId,
          branch_id: factura.branch_id,
          source: 'invoice_sales',
          source_id: facturaIdString, // Conversión explícita de UUID a string
          method: metodoPago,
          amount: montoNumerico,
          currency: factura.currency || 'COP',
          reference: referencia || null,
          status: 'completed'
        });

      if (paymentError) {
        console.error('Error al insertar pago:', paymentError);
        throw paymentError;
      }

      // Actualizar el saldo y estado de la factura
      const nuevoSaldo = factura.balance - montoNumerico;
      const nuevoEstado = nuevoSaldo <= 0 ? 'paid' : nuevoSaldo < factura.total ? 'partial' : factura.status;
      
      console.log('Actualizando factura:', {
        id: facturaIdString,
        balance: nuevoSaldo,
        status: nuevoEstado
      });

      const { error: updateError } = await supabase
        .from('invoice_sales')
        .update({
          balance: nuevoSaldo,
          status: nuevoEstado
        })
        .eq('id', facturaIdString);

      if (updateError) {
        console.error('Error al actualizar factura:', updateError);
        throw updateError;
      }

      // Si es factura en draft y registramos un pago parcial, creamos/actualizamos la cuenta por cobrar
      // O si la factura ya está emitida (issued, partial, paid)
      if (factura.status !== 'draft' || (factura.status === 'draft' && nuevoSaldo > 0)) {
        try {
          console.log('Llamando a create_account_receivable con ID:', facturaIdString);
          
          // Usamos la función RPC para crear/actualizar cuenta por cobrar
          const { data: createARData, error: createARError } = await supabase
            .rpc('create_account_receivable', { 
              invoice_id_param: facturaIdString
            });

          if (createARError) {
            console.error('Error al gestionar la cuenta por cobrar:', createARError);
            // No interrumpimos el flujo principal por error en cuenta por cobrar
          } else {
            console.log('Cuenta por cobrar gestionada correctamente con ID:', createARData);
          }
        } catch (arError) {
          console.error('Excepción al gestionar cuenta por cobrar:', arError);
          // Seguimos con el flujo normal
        }
      }

      toast({
        title: "Pago registrado",
        description: `Se ha registrado un pago por ${formatCurrency(montoNumerico)} exitosamente`,
      });

      // Cerrar el diálogo y llamar a onSuccess si está definido
      onOpenChange(false);
      if (onSuccess) onSuccess();

    } catch (error: any) {
      // Manejo detallado de errores para evitar el error vacío {}
      console.error('Error al registrar pago:', error);
      
      let mensajeError = "Ocurrió un error inesperado";
      
      if (error?.code) {
        if (error.code === '42883') {
          mensajeError = "Error de compatibilidad de tipos en la consulta. Por favor, contacte al soporte técnico.";
        } else if (error.code === '23503') {
          mensajeError = "Error de integridad referencial. Revise las relaciones entre tablas.";
        } else if (error.message) {
          mensajeError = error.message;
        }
      } else if (error?.message) {
        mensajeError = error.message;
      } else if (typeof error === 'string') {
        mensajeError = error;
      } else if (error && Object.keys(error).length === 0) {
        mensajeError = "Error desconocido en la operación. Por favor, intente nuevamente.";
      }
      
      toast({
        title: "Error al registrar pago",
        description: mensajeError,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Determinar si se requiere referencia según el método de pago
  const requiereReferencia = () => {
    const metodo = metodosPago.find(m => m.code === metodoPago);
    return metodo?.requires_reference || metodoPago === 'card' || metodoPago === 'transfer';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Registrar Pago</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid items-center gap-1.5">
            <Label htmlFor="factura">Factura</Label>
            <Input
              id="factura"
              value={`${factura.number} - ${formatCurrency(factura.total)}`}
              disabled
            />
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="saldo">Saldo Pendiente</Label>
            <Input
              id="saldo"
              value={formatCurrency(factura.balance)}
              disabled
            />
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="metodoPago">Método de Pago</Label>
            <Select value={metodoPago} onValueChange={setMetodoPago}>
              <SelectTrigger id="metodoPago">
                <SelectValue placeholder="Selecciona un método de pago" />
              </SelectTrigger>
              <SelectContent>
                {metodosPago.map((metodo) => (
                  <SelectItem key={metodo.code} value={metodo.code}>
                    {metodo.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid items-center gap-1.5">
            <Label htmlFor="monto">Monto a Pagar</Label>
            <Input
              id="monto"
              value={monto}
              onChange={handleMontoChange}
              placeholder="0.00"
              className={montoExcedido ? "border-red-500" : ""}
            />
            {montoExcedido && (
              <Alert 
                variant="destructive" 
                className="py-2 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 text-red-800 dark:text-red-300 transition-all animate-fadeIn"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                  <AlertDescription className="text-sm font-medium">
                    El monto ingresado ({formatCurrency(parseFloat(monto) || 0)}) excede el saldo pendiente ({formatCurrency(factura.balance || 0)})
                  </AlertDescription>
                </div>
              </Alert>
            )}
          </div>
          
          {requiereReferencia() && (
            <div className="grid items-center gap-1.5">
              <Label htmlFor="referencia">Referencia / Transacción</Label>
              <Input
                id="referencia"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Número de transacción, últimos 4 dígitos, etc."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar Pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
