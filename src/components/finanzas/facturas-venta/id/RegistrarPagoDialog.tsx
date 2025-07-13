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
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface RegistrarPagoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factura: any;
  onSuccess?: () => void;
}

export function RegistrarPagoDialog({ open, onOpenChange, factura, onSuccess }: RegistrarPagoDialogProps) {
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  // Estados del formulario
  const [isLoading, setIsLoading] = useState(false);
  const [metodosPago, setMetodosPago] = useState<any[]>([]);
  const [metodoPago, setMetodoPago] = useState<string>('');
  const [monto, setMonto] = useState<string>('');
  const [referencia, setReferencia] = useState<string>('');

  // Cargar métodos de pago disponibles
  useEffect(() => {
    const cargarMetodosPago = async () => {
      if (!organizationId) return;

      try {
        const { data, error } = await supabase
          .from('payment_methods')
          .select('code, name')
          .eq('is_active', true)
          .or(`organization_id.eq.${organizationId},is_system.eq.true`);

        if (error) throw error;
        
        setMetodosPago(data || []);
        // Establecer método de pago predeterminado si existe
        if (data && data.length > 0) {
          setMetodoPago(data[0].code);
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
        title: "Error",
        description: "El monto debe ser un número mayor que cero",
        variant: "destructive",
      });
      return;
    }

    // Validar que el monto no sea mayor al saldo pendiente
    if (montoNumerico > factura.balance) {
      toast({
        title: "Error",
        description: `El monto no puede ser mayor al saldo pendiente (${formatCurrency(factura.balance)})`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Insertar el registro de pago
      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: organizationId,
          branch_id: factura.branch_id,
          source: 'invoice_sales',
          source_id: factura.id,
          method: metodoPago,
          amount: montoNumerico,
          currency: factura.currency || 'COP',
          reference: referencia || null,
          status: 'completed'
        })
        .select();

      if (paymentError) throw paymentError;

      // Actualizar el saldo y estado de la factura
      const nuevoSaldo = factura.balance - montoNumerico;
      const nuevoEstado = nuevoSaldo <= 0 ? 'paid' : nuevoSaldo < factura.total ? 'partial' : factura.status;
      
      const { error: updateError } = await supabase
        .from('invoice_sales')
        .update({
          balance: nuevoSaldo,
          status: nuevoEstado
        })
        .eq('id', factura.id);

      if (updateError) throw updateError;

      // Actualizar accounts_receivable si existe
      const { data: arData, error: arFindError } = await supabase
        .from('accounts_receivable')
        .select('id, balance')
        .eq('invoice_id', factura.id)
        .maybeSingle();

      if (!arFindError && arData) {
        const nuevoSaldoAR = arData.balance - montoNumerico;
        const { error: arUpdateError } = await supabase
          .from('accounts_receivable')
          .update({
            balance: nuevoSaldoAR,
            status: nuevoSaldoAR <= 0 ? 'current' : 'overdue'
          })
          .eq('id', arData.id);

        if (arUpdateError) console.error('Error al actualizar cuentas por cobrar:', arUpdateError);
      }

      toast({
        title: "Pago registrado",
        description: `Se ha registrado un pago por ${formatCurrency(montoNumerico)} exitosamente`,
      });

      // Cerrar el diálogo y llamar a onSuccess si está definido
      onOpenChange(false);
      if (onSuccess) onSuccess();

    } catch (error: any) {
      console.error('Error al registrar pago:', error);
      toast({
        title: "Error al registrar pago",
        description: error.message || "Ocurrió un error inesperado",
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
            />
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
