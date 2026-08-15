'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RefreshCw,
  Plus,
  Trash2,
  Building2,
  Info,
  Inbox,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

// --- Tipos ---

// Tipo de cuenta bancaria
type AccountType = 'savings' | 'checking';

// Tipo de documento del titular
type HolderIdType = 'CC' | 'CE' | 'NIT' | 'PEP';

// Cuenta bancaria contable existente (bank_accounts)
interface BankAccount {
  id: number;
  name: string;
  bank_name: string;
  account_number: string;
  account_type: AccountType;
}

// Cuenta bancaria vinculada devuelta por el JOIN en listAccounts
interface LinkedBankAccount {
  id: number;
  name: string;
  bank_name: string;
  account_number: string;
  account_type: AccountType;
  currency: string;
}

// Cuenta de dispersion registrada por la organizacion
interface PayoutAccount {
  id: string;
  bank_name: string;
  account_type: AccountType;
  account_number: string;
  account_holder_name: string;
  account_holder_id_type: HolderIdType;
  account_holder_id: string;
  breb_key_value?: string | null;
  verified: boolean;
  created_at?: string;
  // Cuenta contable vinculada (JOIN con bank_accounts)
  bank_account?: LinkedBankAccount | null;
  bank_account_id?: number | null;
}

// Datos del formulario para crear una cuenta
interface AccountForm {
  bank_name: string;
  account_type: AccountType;
  account_number: string;
  account_holder_name: string;
  account_holder_id_type: HolderIdType;
  account_holder_id: string;
  breb_key_value: string;
  // ID de la cuenta contable vinculada (opcional)
  bank_account_id: number | null;
}

// Estado inicial del formulario
const INITIAL_FORM: AccountForm = {
  bank_name: '',
  account_type: 'savings',
  account_number: '',
  account_holder_name: '',
  account_holder_id_type: 'CC',
  account_holder_id: '',
  breb_key_value: '',
  bank_account_id: null,
};

// Opciones de tipo de cuenta
const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  savings: 'Ahorros',
  checking: 'Corriente',
};

export default function CuentasDispersionPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const orgId = organization?.id;

  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(INITIAL_FORM);
  // Cuentas bancarias contables disponibles para vincular
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState<boolean>(false);

  // Carga las cuentas bancarias contables activas de la organizacion
  const loadBankAccounts = useCallback(async () => {
    if (!orgId) return;
    setLoadingBankAccounts(true);
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, name, bank_name, account_number, account_type')
        .eq('organization_id', orgId)
        .eq('is_active', true);
      if (error) {
        console.error('Error cargando cuentas bancarias:', error);
        return;
      }
      setBankAccounts((data ?? []) as BankAccount[]);
    } catch (error) {
      console.error('Error cargando cuentas bancarias:', error);
    } finally {
      setLoadingBankAccounts(false);
    }
  }, [orgId]);

  // Carga las cuentas de dispersion desde la API
  const loadAccounts = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/payfac/payout-accounts?organizationId=${orgId}`
      );
      if (!res.ok) throw new Error('Error al obtener cuentas');
      const json = await res.json();
      // La API devuelve { success, data }
      const data: PayoutAccount[] = json.data ?? json;
      setAccounts(data);
    } catch (error) {
      console.error('Error cargando cuentas de dispersion:', error);
      toast.error('No se pudieron cargar las cuentas de dispersion');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // Cargar cuentas al montar o cambiar organizacion
  useEffect(() => {
    if (orgId) {
      loadAccounts();
    }
  }, [orgId, loadAccounts]);

  // Crea una nueva cuenta de dispersion
  const createAccount = useCallback(async () => {
    if (!orgId) return;

    // Validacion basica de campos obligatorios
    if (
      !form.bank_name.trim() ||
      !form.account_number.trim() ||
      !form.account_holder_name.trim() ||
      !form.account_holder_id.trim()
    ) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string | number | null> = {
        organization_id: orgId,
        bank_name: form.bank_name.trim(),
        account_type: form.account_type,
        account_number: form.account_number.trim(),
        account_holder_name: form.account_holder_name.trim(),
        account_holder_id_type: form.account_holder_id_type,
        account_holder_id: form.account_holder_id.trim(),
        // Bre-B es opcional: enviar null si esta vacio
        breb_key_value: form.breb_key_value.trim() || null,
        // Vinculacion con cuenta contable (opcional)
        bank_account_id: form.bank_account_id ?? null,
      };

      const res = await fetch('/api/integrations/payfac/payout-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Error al crear cuenta');

      toast.success('Cuenta de dispersion creada correctamente');
      setForm(INITIAL_FORM);
      setDialogOpen(false);
      loadAccounts();
    } catch (error) {
      console.error('Error creando cuenta de dispersion:', error);
      toast.error('No se pudo crear la cuenta de dispersion');
    } finally {
      setSaving(false);
    }
  }, [orgId, form, loadAccounts]);

  // Elimina (desactiva) una cuenta de dispersion
  const deleteAccount = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(
          `/api/integrations/payfac/payout-accounts/${id}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error('Error al eliminar cuenta');

        toast.success('Cuenta eliminada correctamente');
        loadAccounts();
      } catch (error) {
        console.error('Error eliminando cuenta de dispersion:', error);
        toast.error('No se pudo eliminar la cuenta');
      } finally {
        setDeletingId(null);
      }
    },
    [loadAccounts]
  );

  // Actualiza un campo del formulario
  const updateField = <K extends keyof AccountForm>(
    key: K,
    value: AccountForm[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Spinner mientras carga la organizacion
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">
          Cargando organizacion...
        </span>
      </div>
    );
  }

  // Sin organizacion activa
  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">
          No hay organizacion activa
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Selecciona una organizacion para gestionar tus cuentas.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Cuentas de Dispersion
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Cuentas donde recibes tus dispersiones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={loadAccounts}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Refrescar
          </Button>
          <Button
            onClick={() => {
              setForm(INITIAL_FORM);
              // Cargar cuentas bancarias contables disponibles al abrir el dialog
              loadBankAccounts();
              setDialogOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nueva Cuenta
          </Button>
        </div>
      </div>

      {/* Banner informativo */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Estas cuentas son donde el ERP admin te envia tus dispersiones.
          Deben estar verificadas para recibir pagos automaticos via Bre-B.
        </p>
      </div>

      {/* Tabla de cuentas */}
      <Card className="dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Cuentas Registradas ({accounts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            // Estado de carga
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500 dark:text-gray-400">
                Cargando cuentas...
              </span>
            </div>
          ) : accounts.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                No hay cuentas de dispersion registradas
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Crea una cuenta para empezar a recibir tus dispersiones.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Numero</TableHead>
                  <TableHead>Titular</TableHead>
                  <TableHead>ID Titular</TableHead>
                  <TableHead>Cuenta contable vinculada</TableHead>
                  <TableHead>Verificado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {account.bank_name}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {ACCOUNT_TYPE_LABELS[account.account_type] ?? account.account_type}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-700 dark:text-gray-300">
                      {account.account_number}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {account.account_holder_name}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {account.account_holder_id_type}
                      </span>{' '}
                      {account.account_holder_id}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {account.bank_account ? (
                        <span className="text-sm">
                          {account.bank_account.name}
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {account.bank_account.bank_name} - {account.bank_account.account_number}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          No vinculada
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.verified ? (
                        <Badge
                          variant="success"
                          className="flex items-center gap-1 w-fit"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Verificada
                        </Badge>
                      ) : (
                        <Badge
                          variant="warning"
                          className="flex items-center gap-1 w-fit"
                        >
                          <ShieldAlert className="h-3 w-3" />
                          Pendiente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteAccount(account.id)}
                        disabled={deletingId === account.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        {deletingId === account.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span className="ml-1">Eliminar</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog para crear cuenta */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Cuenta de Dispersion</DialogTitle>
            <DialogDescription>
              Registra una cuenta bancaria para recibir tus dispersiones.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Vincular cuenta bancaria existente (opcional) */}
            <div className="space-y-2">
              <Label htmlFor="bank_account_link">
                Vincular cuenta bancaria existente (opcional)
              </Label>
              <Select
                value={form.bank_account_id ? String(form.bank_account_id) : 'none'}
                onValueChange={(v) => {
                  if (v === 'none') {
                    // Desvincular: limpiar el campo sin alterar los datos manuales
                    updateField('bank_account_id', null);
                    return;
                  }
                  const selected = bankAccounts.find((b) => b.id === Number(v));
                  if (selected) {
                    // Auto-llenar datos desde la cuenta bancaria seleccionada
                    setForm((prev) => ({
                      ...prev,
                      bank_account_id: selected.id,
                      bank_name: selected.bank_name,
                      account_number: selected.account_number,
                      account_type: selected.account_type,
                      // Usar el nombre de la cuenta como titular si esta vacio
                      account_holder_name:
                        prev.account_holder_name.trim() || selected.name,
                    }));
                  }
                }}
              >
                <SelectTrigger id="bank_account_link">
                  <SelectValue placeholder="Selecciona una cuenta existente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin vincular (ingresar manualmente)</SelectItem>
                  {loadingBankAccounts ? (
                    <SelectItem value="loading" disabled>
                      Cargando...
                    </SelectItem>
                  ) : (
                    bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name} - {b.bank_name} ({b.account_number})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Si seleccionas una cuenta existente, se auto-llenaran los datos bancarios.
              </p>
            </div>

            {/* Banco */}
            <div className="space-y-2">
              <Label htmlFor="bank_name">Banco *</Label>
              <Input
                id="bank_name"
                placeholder="Ej: Bancolombia, Davivienda..."
                value={form.bank_name}
                onChange={(e) => updateField('bank_name', e.target.value)}
              />
            </div>

            {/* Tipo de cuenta */}
            <div className="space-y-2">
              <Label htmlFor="account_type">Tipo de Cuenta *</Label>
              <Select
                value={form.account_type}
                onValueChange={(v) =>
                  updateField('account_type', v as AccountType)
                }
              >
                <SelectTrigger id="account_type">
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings">Ahorros</SelectItem>
                  <SelectItem value="checking">Corriente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Numero de cuenta */}
            <div className="space-y-2">
              <Label htmlFor="account_number">Numero de Cuenta *</Label>
              <Input
                id="account_number"
                placeholder="Numero de cuenta bancaria"
                value={form.account_number}
                onChange={(e) => updateField('account_number', e.target.value)}
              />
            </div>

            {/* Nombre del titular */}
            <div className="space-y-2">
              <Label htmlFor="account_holder_name">Titular *</Label>
              <Input
                id="account_holder_name"
                placeholder="Nombre completo del titular"
                value={form.account_holder_name}
                onChange={(e) =>
                  updateField('account_holder_name', e.target.value)
                }
              />
            </div>

            {/* Tipo de documento del titular */}
            <div className="space-y-2">
              <Label htmlFor="account_holder_id_type">
                Tipo de Documento *
              </Label>
              <Select
                value={form.account_holder_id_type}
                onValueChange={(v) =>
                  updateField('account_holder_id_type', v as HolderIdType)
                }
              >
                <SelectTrigger id="account_holder_id_type">
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CC">Cedula de Ciudadania</SelectItem>
                  <SelectItem value="CE">Cedula de Extranjeria</SelectItem>
                  <SelectItem value="NIT">NIT</SelectItem>
                  <SelectItem value="PEP">
                    Permiso Especial de Permanencia
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Numero de documento del titular */}
            <div className="space-y-2">
              <Label htmlFor="account_holder_id">Numero de Documento *</Label>
              <Input
                id="account_holder_id"
                placeholder="Numero de identificacion del titular"
                value={form.account_holder_id}
                onChange={(e) =>
                  updateField('account_holder_id', e.target.value)
                }
              />
            </div>

            {/* Clave Bre-B (opcional) */}
            <div className="space-y-2">
              <Label htmlFor="breb_key_value">
                Clave Bre-B (opcional)
              </Label>
              <Input
                id="breb_key_value"
                placeholder="Clave para dispersion automatica via Bre-B"
                value={form.breb_key_value}
                onChange={(e) => updateField('breb_key_value', e.target.value)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Si se configura, permite dispersion automatica via Bre-B.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={createAccount} disabled={saving}>
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
