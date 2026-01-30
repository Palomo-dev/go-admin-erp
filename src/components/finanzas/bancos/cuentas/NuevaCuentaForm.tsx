'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Save } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BancosService } from '../BancosService';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Cuenta Corriente' },
  { value: 'savings', label: 'Cuenta de Ahorros' },
  { value: 'credit', label: 'Línea de Crédito' },
  { value: 'investment', label: 'Cuenta de Inversión' },
];

const COMMON_BANKS = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Occidente',
  'Banco Popular',
  'Banco Caja Social',
  'Scotiabank Colpatria',
  'Banco Agrario',
  'Banco AV Villas',
  'Banco Falabella',
  'Banco Pichincha',
  'Banco Itaú',
  'Otro',
];

export function NuevaCuentaForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [currencies, setCurrencies] = useState<{ code: string; name: string; symbol: string }[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    bank_name: '',
    account_number: '',
    account_type: 'checking',
    currency: 'COP',
    initial_balance: '',
  });

  useEffect(() => {
    loadCurrencies();
  }, []);

  const loadCurrencies = async () => {
    try {
      const data = await BancosService.obtenerMonedasOrganizacion();
      setCurrencies(data);
    } catch (error) {
      console.error('Error cargando monedas:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('El nombre de la cuenta es requerido');
      return;
    }

    if (!formData.bank_name) {
      toast.error('Selecciona un banco');
      return;
    }

    try {
      setIsLoading(true);
      await BancosService.crearCuentaBancaria({
        name: formData.name,
        bank_name: formData.bank_name,
        account_number: formData.account_number || null,
        account_type: formData.account_type,
        currency: formData.currency,
        initial_balance: formData.initial_balance ? parseFloat(formData.initial_balance) : 0,
      });

      toast.success('Cuenta bancaria creada exitosamente');
      router.push('/app/finanzas/bancos');
    } catch (error) {
      console.error('Error creando cuenta:', error);
      toast.error('Error al crear la cuenta bancaria');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/app/finanzas/bancos">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Nueva Cuenta Bancaria
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Finanzas / Bancos / Nueva Cuenta
            </p>
          </div>
        </div>

        {/* Formulario */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Información de la Cuenta</CardTitle>
          <CardDescription className="dark:text-gray-400">
            Ingresa los datos de la nueva cuenta bancaria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nombre de la cuenta */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
                Nombre de la Cuenta *
              </Label>
              <Input
                id="name"
                placeholder="Ej: Cuenta Principal Bancolombia"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>

            {/* Banco */}
            <div className="space-y-2">
              <Label htmlFor="bank_name" className="text-gray-700 dark:text-gray-300">
                Banco *
              </Label>
              <Select
                value={formData.bank_name}
                onValueChange={(value) => setFormData({ ...formData, bank_name: value })}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar banco" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800">
                  {COMMON_BANKS.map((bank) => (
                    <SelectItem key={bank} value={bank}>
                      {bank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Número de cuenta */}
            <div className="space-y-2">
              <Label htmlFor="account_number" className="text-gray-700 dark:text-gray-300">
                Número de Cuenta
              </Label>
              <Input
                id="account_number"
                placeholder="Ej: 1234567890"
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>

            {/* Tipo de cuenta y Moneda */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="account_type" className="text-gray-700 dark:text-gray-300">
                  Tipo de Cuenta
                </Label>
                <Select
                  value={formData.account_type}
                  onValueChange={(value) => setFormData({ ...formData, account_type: value })}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-800">
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency" className="text-gray-700 dark:text-gray-300">
                  Moneda
                </Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue placeholder="Seleccionar moneda" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-800">
                    {currencies.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.code} - {currency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Saldo inicial */}
            <div className="space-y-2">
              <Label htmlFor="initial_balance" className="text-gray-700 dark:text-gray-300">
                Saldo Inicial
              </Label>
              <Input
                id="initial_balance"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.initial_balance}
                onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Este será el saldo de apertura de la cuenta
              </p>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/app/finanzas/bancos')}
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
                {isLoading ? 'Guardando...' : 'Crear Cuenta'}
              </Button>
            </div>
          </form>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
