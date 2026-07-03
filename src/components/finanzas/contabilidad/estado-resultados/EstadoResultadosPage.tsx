'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReportesContablesService, IncomeStatementRow } from '../ReportesContablesService';

function formatCurrency(value: number): string {
  if (Math.abs(value) < 0.01) return '-';
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function renderRow(row: IncomeStatementRow, level: number = 0): React.ReactNode {
  const indent = level * 20;
  const isParent = row.children.length > 0;

  return (
    <React.Fragment key={row.account_code}>
      <tr className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
        <td className="py-2 px-3" style={{ paddingLeft: `${12 + indent}px` }}>
          <span className={`font-mono text-xs text-gray-500 dark:text-gray-500 mr-2`}>{row.account_code}</span>
          <span className={`${isParent ? 'font-bold' : 'font-normal'} text-gray-900 dark:text-white`}>{row.name}</span>
        </td>
        <td className="py-2 px-3 text-right font-mono text-gray-900 dark:text-white">{formatCurrency(row.amount)}</td>
      </tr>
      {row.children.map(child => renderRow(child, level + 1))}
    </React.Fragment>
  );
}

export function EstadoResultadosPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState<{ income: IncomeStatementRow[]; expenses: IncomeStatementRow[]; totalIncome: number; totalExpenses: number; netIncome: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const result = await ReportesContablesService.getIncomeStatement(startDate, endDate);
      setData(result);
    } catch (error) {
      console.error('Error cargando estado de resultados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-xl">
          <TrendingUp className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estado de Resultados</h1>
          <p className="text-gray-500 dark:text-gray-400">Ingresos y gastos del periodo</p>
        </div>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha Fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <Button onClick={loadData} className="bg-blue-600 hover:bg-blue-700">
              <Calendar className="h-4 w-4 mr-2" />
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Ingresos
            </CardTitle>
            <CardDescription className="dark:text-gray-400">Total: {formatCurrency(data.totalIncome)}</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {data.income.map(row => renderRow(row))}
                <tr className="border-t-2 dark:border-gray-600 font-bold">
                  <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL INGRESOS</td>
                  <td className="py-3 px-3 text-right font-mono text-green-600 dark:text-green-400">{formatCurrency(data.totalIncome)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Gastos
            </CardTitle>
            <CardDescription className="dark:text-gray-400">Total: {formatCurrency(data.totalExpenses)}</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {data.expenses.map(row => renderRow(row))}
                <tr className="border-t-2 dark:border-gray-600 font-bold">
                  <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL GASTOS</td>
                  <td className="py-3 px-3 text-right font-mono text-red-600 dark:text-red-400">{formatCurrency(data.totalExpenses)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className={`dark:bg-gray-800 dark:border-gray-700 ${data.netIncome >= 0 ? 'border-green-300 dark:border-green-700' : 'border-red-300 dark:border-red-700'}`}>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {data.netIncome >= 0 ? (
                <TrendingUp className="h-8 w-8 text-green-600" />
              ) : (
                <TrendingDown className="h-8 w-8 text-red-600" />
              )}
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Resultado del Periodo</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {data.netIncome >= 0 ? 'Utilidad' : 'Perdida'}
                </p>
              </div>
            </div>
            <p className={`text-3xl font-bold font-mono ${data.netIncome >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(Math.abs(data.netIncome))}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
