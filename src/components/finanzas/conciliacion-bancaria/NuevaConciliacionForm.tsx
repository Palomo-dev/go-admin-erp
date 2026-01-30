'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, ArrowRightLeft, Save, Calendar, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConciliacionService } from './ConciliacionService';
import { BankAccount } from '../bancos/BancosService';
import { formatCurrency } from '@/utils/Utils';

export function NuevaConciliacionForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [formData, setFormData] = useState({
    bank_account_id: '',
    period_start: '',
    period_end: '',
    statement_balance: ''
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await ConciliacionService.obtenerCuentasBancarias();
      setAccounts(data.filter(a => a.is_active));
    } catch (error) {
      console.error('Error cargando cuentas:', error);
      toast.error('Error al cargar las cuentas bancarias');
    }
  };

  const handleAccountChange = (accountId: string) => {
    const account = accounts.find(a => a.id.toString() === accountId);
    setSelectedAccount(account || null);
    setFormData({ ...formData, bank_account_id: accountId });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.bank_account_id) {
      toast.error('Selecciona una cuenta bancaria');
      return;
    }
    if (!formData.period_start || !formData.period_end) {
      toast.error('Selecciona el período de conciliación');
      return;
    }
    if (new Date(formData.period_start) > new Date(formData.period_end)) {
      toast.error('La fecha de inicio debe ser anterior a la fecha de fin');
      return;
    }

    try {
      setIsLoading(true);
      const reconciliation = await ConciliacionService.crearConciliacion({
        bank_account_id: parseInt(formData.bank_account_id),
        period_start: formData.period_start,
        period_end: formData.period_end,
        opening_balance: selectedAccount?.balance || 0,
        statement_balance: formData.statement_balance ? parseFloat(formData.statement_balance) : undefined
      });

      toast.success('Conciliación creada exitosamente');
      router.push(`/app/finanzas/conciliacion-bancaria/${reconciliation.id}`);
    } catch (error) {
      console.error('Error creando conciliación:', error);
      toast.error('Error al crear la conciliación');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/app/finanzas/conciliacion-bancaria">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <ArrowRightLeft className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Nueva Conciliación Bancaria
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Finanzas / Conciliación Bancaria / Nueva
            </p>
          </div>
        </div>

        {/* Formulario */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Datos de la Conciliación</CardTitle>
            <CardDescription className="dark:text-gray-400">
              Configura el período y cuenta para la conciliación
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Cuenta Bancaria */}
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Cuenta Bancaria *</Label>
                <Select
                  value={formData.bank_account_id}
                  onValueChange={handleAccountChange}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue placeholder="Seleccionar cuenta" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-800">
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id.toString()}>
                        {acc.name} - {acc.bank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Info de cuenta seleccionada */}
              {selectedAccount && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-3 mb-2">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      Saldo Actual en Sistema
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(selectedAccount.balance, selectedAccount.currency || 'COP')}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Este será el saldo de apertura de la conciliación
                  </p>
                </div>
              )}

              {/* Período */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    <Calendar className="h-4 w-4 inline mr-2" />
                    Fecha Inicio *
                  </Label>
                  <Input
                    type="date"
                    value={formData.period_start}
                    onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                    className="dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">
                    <Calendar className="h-4 w-4 inline mr-2" />
                    Fecha Fin *
                  </Label>
                  <Input
                    type="date"
                    value={formData.period_end}
                    onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                    className="dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
              </div>

              {/* Saldo del Extracto */}
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Saldo según Extracto Bancario
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Ingresa el saldo del extracto bancario"
                  value={formData.statement_balance}
                  onChange={(e) => setFormData({ ...formData, statement_balance: e.target.value })}
                  className="dark:bg-gray-900 dark:border-gray-600"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Este es el saldo que aparece en tu extracto bancario para el período seleccionado
                </p>
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/app/finanzas/conciliacion-bancaria')}
                  className="dark:border-gray-600"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isLoading ? 'Creando...' : 'Crear Conciliación'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
