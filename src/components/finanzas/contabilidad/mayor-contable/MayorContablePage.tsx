'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, BookOpen, Calendar, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReportesContablesService, LedgerAccount, ChartAccount } from '../ReportesContablesService';
import { ContabilidadService } from '../ContabilidadService';

function formatCurrency(value: number): string {
  if (Math.abs(value) < 0.01) return '-';
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

const TYPE_LABELS: Record<string, string> = {
  asset: 'Activo',
  liability: 'Pasivo',
  equity: 'Patrimonio',
  income: 'Ingreso',
  expense: 'Gasto',
};

export function MayorContablePage() {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(today);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [ledger, setLedger] = useState<LedgerAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await ContabilidadService.obtenerPlanCuentas();
      setAccounts(data);
      if (data.length > 0 && !selectedAccount) {
        setSelectedAccount(data[0].account_code);
      }
    } catch (error) {
      console.error('Error cargando cuentas:', error);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const loadLedger = async () => {
    if (!selectedAccount) return;
    try {
      setIsLoading(true);
      const data = await ReportesContablesService.getLedger(selectedAccount, startDate, endDate);
      setLedger(data);
    } catch (error) {
      console.error('Error cargando mayor:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccount) {
      loadLedger();
    }
  }, [selectedAccount]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
          <BookOpen className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mayor Contable</h1>
          <p className="text-gray-500 dark:text-gray-400">Movimientos detallados por cuenta</p>
        </div>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1">
              <Label className="text-gray-700 dark:text-gray-300">Cuenta</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {accounts.map(c => (
                    <SelectItem key={c.account_code} value={c.account_code}>
                      {c.account_code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <Button onClick={loadLedger} className="bg-blue-600 hover:bg-blue-700">
              <Search className="h-4 w-4 mr-2" />
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : ledger ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="py-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">Saldo Inicial</div>
                <div className="text-xl font-bold font-mono text-gray-900 dark:text-white">{formatCurrency(ledger.opening_balance)}</div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="py-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Debito</div>
                <div className="text-xl font-bold font-mono text-green-600 dark:text-green-400">{formatCurrency(ledger.total_debit)}</div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="py-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Credito</div>
                <div className="text-xl font-bold font-mono text-red-600 dark:text-red-400">{formatCurrency(ledger.total_credit)}</div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="py-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">Saldo Final</div>
                <div className="text-xl font-bold font-mono text-gray-900 dark:text-white">{formatCurrency(ledger.closing_balance)}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">
                {ledger.account_code} - {ledger.name}
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                {TYPE_LABELS[ledger.type] || ledger.type} | {ledger.entries.length} movimientos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ledger.entries.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay movimientos en este periodo</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-gray-600 dark:text-gray-400">
                        <th className="text-left py-2 px-3 font-medium">Fecha</th>
                        <th className="text-left py-2 px-3 font-medium">Asiento</th>
                        <th className="text-left py-2 px-3 font-medium">Descripcion</th>
                        <th className="text-left py-2 px-3 font-medium">Origen</th>
                        <th className="text-right py-2 px-3 font-medium">Debito</th>
                        <th className="text-right py-2 px-3 font-medium">Credito</th>
                        <th className="text-right py-2 px-3 font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b dark:border-gray-700/50 bg-gray-50 dark:bg-gray-700/20 font-medium">
                        <td colSpan={6} className="py-2 px-3 text-gray-600 dark:text-gray-400">Saldo Inicial</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-900 dark:text-white">{formatCurrency(ledger.opening_balance)}</td>
                      </tr>
                      {ledger.entries.map((entry, idx) => (
                        <tr key={idx} className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{new Date(entry.entry_date).toLocaleDateString('es-CO')}</td>
                          <td className="py-2 px-3 font-mono text-gray-500 dark:text-gray-500">#{entry.journal_entry_id}</td>
                          <td className="py-2 px-3 text-gray-900 dark:text-white">{entry.memo || '-'}</td>
                          <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{entry.source || '-'}</td>
                          <td className="py-2 px-3 text-right font-mono text-green-600 dark:text-green-400">{formatCurrency(entry.debit)}</td>
                          <td className="py-2 px-3 text-right font-mono text-red-600 dark:text-red-400">{formatCurrency(entry.credit)}</td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-gray-900 dark:text-white">{formatCurrency(entry.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="py-12">
            <p className="text-center text-gray-500">Seleccione una cuenta para ver el mayor contable</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
