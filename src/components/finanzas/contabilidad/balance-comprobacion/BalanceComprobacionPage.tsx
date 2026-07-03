'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, FileText, Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReportesContablesService, TrialBalanceRow } from '../ReportesContablesService';

const TYPE_LABELS: Record<string, string> = {
  asset: 'Activo',
  liability: 'Pasivo',
  equity: 'Patrimonio',
  income: 'Ingreso',
  expense: 'Gasto',
};

function formatCurrency(value: number): string {
  if (Math.abs(value) < 0.01) return '-';
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

export function BalanceComprobacionPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(today);
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await ReportesContablesService.getTrialBalance(startDate, endDate);
      setRows(data);
    } catch (error) {
      console.error('Error cargando balance:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totals = rows.reduce(
    (acc, r) => ({
      initial_debit: acc.initial_debit + r.initial_debit,
      initial_credit: acc.initial_credit + r.initial_credit,
      period_debit: acc.period_debit + r.period_debit,
      period_credit: acc.period_credit + r.period_credit,
      final_debit: acc.final_debit + r.final_debit,
      final_credit: acc.final_credit + r.final_credit,
    }),
    { initial_debit: 0, initial_credit: 0, period_debit: 0, period_credit: 0, final_debit: 0, final_credit: 0 }
  );

  const exportCSV = () => {
    const headers = ['Codigo', 'Nombre', 'Tipo', 'Saldo Ini Debito', 'Saldo Ini Credito', 'Mov Debito', 'Mov Credito', 'Saldo Fin Debito', 'Saldo Fin Credito'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [r.account_code, `"${r.name}"`, TYPE_LABELS[r.type] || r.type, r.initial_debit, r.initial_credit, r.period_debit, r.period_credit, r.final_debit, r.final_credit].join(',')),
      ['', 'TOTALES', '', totals.initial_debit, totals.initial_credit, totals.period_debit, totals.period_credit, totals.final_debit, totals.final_credit].join(','),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance-comprobacion-${startDate}-${endDate}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Balance de Comprobacion</h1>
            <p className="text-gray-500 dark:text-gray-400">Saldos y movimientos por cuenta</p>
          </div>
        </div>
        <Button onClick={exportCSV} variant="outline" className="dark:border-gray-600">
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300"> Fecha Fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <Button onClick={loadData} className="bg-blue-600 hover:bg-blue-700">
              <Calendar className="h-4 w-4 mr-2" />
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Detalle por Cuenta</CardTitle>
          <CardDescription className="dark:text-gray-400">{rows.length} cuentas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-gray-600 dark:text-gray-400">
                  <th className="text-left py-2 px-3 font-medium">Codigo</th>
                  <th className="text-left py-2 px-3 font-medium">Cuenta</th>
                  <th className="text-left py-2 px-3 font-medium">Tipo</th>
                  <th className="text-right py-2 px-3 font-medium">Saldo Ini. Debito</th>
                  <th className="text-right py-2 px-3 font-medium">Saldo Ini. Credito</th>
                  <th className="text-right py-2 px-3 font-medium">Mov. Debito</th>
                  <th className="text-right py-2 px-3 font-medium">Mov. Credito</th>
                  <th className="text-right py-2 px-3 font-medium">Saldo Fin. Debito</th>
                  <th className="text-right py-2 px-3 font-medium">Saldo Fin. Credito</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.account_code} className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-2 px-3 font-mono text-gray-600 dark:text-gray-400">{row.account_code}</td>
                    <td className="py-2 px-3 text-gray-900 dark:text-white">{row.name}</td>
                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{TYPE_LABELS[row.type] || row.type}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(row.initial_debit)}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(row.initial_credit)}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(row.period_debit)}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(row.period_credit)}</td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-gray-900 dark:text-white">{formatCurrency(row.final_debit)}</td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-gray-900 dark:text-white">{formatCurrency(row.final_credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 dark:border-gray-600 font-bold text-gray-900 dark:text-white">
                  <td colSpan={3} className="py-3 px-3">TOTALES</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(totals.initial_debit)}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(totals.initial_credit)}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(totals.period_debit)}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(totals.period_credit)}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(totals.final_debit)}</td>
                  <td className="py-3 px-3 text-right font-mono">{formatCurrency(totals.final_credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
