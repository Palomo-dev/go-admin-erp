'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Wallet,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// --------------------------------------------------------
// Tipos
// --------------------------------------------------------

interface PayWithOpenFinanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountPayableId: number;
  supplierName: string;
  amount: number;
  dueDate?: string;
  supplierId?: number;
  onPaymentComplete: () => void;
}

/** Cuenta bancaria activa para el selector */
interface BankAccountOption {
  id: number;
  name: string;
  bank_name: string | null;
  account_number: string | null;
  balance: number;
}

/** Resultado de validacion de cuenta */
interface ValidationData {
  valid: boolean;
  holderName?: string;
  accountNumber?: string;
  bankName?: string;
  warnings: string[];
}

// --------------------------------------------------------
// Componente
// --------------------------------------------------------

export function PayWithOpenFinanceDialog({
  open,
  onOpenChange,
  accountPayableId,
  supplierName,
  amount,
  dueDate,
  supplierId,
  onPaymentComplete,
}: PayWithOpenFinanceDialogProps) {
  const { toast } = useToast();

  // Estados
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationData | null>(null);
  const [paying, setPaying] = useState(false);

  // Cargar cuentas bancarias activas al abrir el dialog
  useEffect(() => {
    if (!open) return;
    cargarCuentasBancarias();
    // Reset al abrir
    setValidation(null);
    setSelectedBankAccountId('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cargar cuentas bancarias activas desde Supabase
  const cargarCuentasBancarias = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) {
        setBankAccounts([]);
        return;
      }

      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, name, bank_name, account_number, account_type, balance, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      const cuentas: BankAccountOption[] = (data || []).map((c: BankAccountOption & { is_active: boolean }) => ({
        id: c.id,
        name: c.name,
        bank_name: c.bank_name,
        account_number: c.account_number,
        balance: c.balance,
      }));
      setBankAccounts(cuentas);
    } catch (error) {
      console.error('Error al cargar cuentas bancarias:', error);
      setBankAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // Validar cuenta del proveedor
  const handleValidarCuenta = async () => {
    if (!supplierId) {
      toast({
        title: 'Error',
        description: 'No se encontro el ID del proveedor',
        variant: 'destructive',
      });
      return;
    }

    setValidating(true);
    setValidation(null);

    try {
      const response = await fetch('/api/integrations/open-finance/validate-supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al validar cuenta');
      }

      setValidation(data.data as ValidationData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al validar cuenta';
      toast({
        title: 'Error de validacion',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
    }
  };

  // Ejecutar pago
  const handlePagar = async () => {
    if (!selectedBankAccountId) {
      toast({
        title: 'Seleccionar cuenta',
        description: 'Debe seleccionar una cuenta bancaria origen',
        variant: 'destructive',
      });
      return;
    }

    setPaying(true);

    try {
      const response = await fetch('/api/integrations/open-finance/pay-supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountPayableId,
          bankAccountId: Number(selectedBankAccountId),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al procesar el pago');
      }

      toast({
        title: 'Pago iniciado',
        description: `Transferencia a ${supplierName} por ${formatCurrency(amount)} iniciada correctamente`,
      });

      onPaymentComplete();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al procesar el pago';
      toast({
        title: 'Error en el pago',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            Pagar con Open Finance
          </DialogTitle>
          <DialogDescription>
            Inicia una transferencia bancaria automatica al proveedor
          </DialogDescription>
        </DialogHeader>

        {/* Informacion de la cuenta por pagar */}
        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {supplierName}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Monto:</span>{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(amount)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Vencimiento:</span>{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {dueDate ? formatDate(dueDate) : 'Sin fecha'}
                </span>
              </div>
            </div>
          </div>

          {/* Selector de cuenta bancaria origen */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Cuenta bancaria origen
            </label>
            {loadingAccounts ? (
              <Skeleton className="h-10 w-full" />
            ) : bankAccounts.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No hay cuentas bancarias activas configuradas
              </p>
            ) : (
              <Select
                value={selectedBankAccountId}
                onValueChange={setSelectedBankAccountId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar cuenta bancaria" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((cuenta) => (
                    <SelectItem key={cuenta.id} value={String(cuenta.id)}>
                      {cuenta.name} - {cuenta.bank_name || 'Sin banco'}{' '}
                      ({formatCurrency(cuenta.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Boton validar cuenta del proveedor */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidarCuenta}
              disabled={validating || !supplierId}
              className="w-full"
            >
              {validating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Validar cuenta del proveedor
                </>
              )}
            </Button>
          </div>

          {/* Resultado de validacion */}
          {validation && (
            <div className="space-y-2">
              {validation.valid ? (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-700">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800 dark:text-green-400">
                    Cuenta validada
                  </AlertTitle>
                  <AlertDescription className="text-sm text-green-700 dark:text-green-500">
                    <div className="space-y-1">
                      {validation.holderName && (
                        <div>Titular: {validation.holderName}</div>
                      )}
                      {validation.bankName && (
                        <div>Banco: {validation.bankName}</div>
                      )}
                      {validation.accountNumber && (
                        <div>Cuenta: {validation.accountNumber}</div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Cuenta no validada</AlertTitle>
                  <AlertDescription className="text-sm">
                    <ul className="list-disc pl-4 space-y-1">
                      {validation.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Advertencias adicionales aunque sea valida */}
              {validation.valid && validation.warnings.length > 0 && (
                <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-sm text-yellow-700 dark:text-yellow-500">
                    <ul className="list-disc pl-4 space-y-1">
                      {validation.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={paying}
          >
            Cancelar
          </Button>
          <Button
            onClick={handlePagar}
            disabled={paying || !selectedBankAccountId || bankAccounts.length === 0}
          >
            {paying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4 mr-2" />
                Pagar {formatCurrency(amount)}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
