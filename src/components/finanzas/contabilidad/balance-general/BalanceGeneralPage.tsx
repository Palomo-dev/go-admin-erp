'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Scale, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReportesContablesService, BalanceSheetRow } from '../ReportesContablesService';

function formatCurrency(value: number): string {
  if (Math.abs(value) < 0.01) return '-';
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function renderRow(row: BalanceSheetRow, level: number = 0): React.ReactNode {
  const indent = level * 20;
  const isParent = row.children.length > 0;

  return (
    <React.Fragment key={row.account_code}>
      <tr className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
        <td className="py-2 px-3" style={{ paddingLeft: `${12 + indent}px` }}>
          <span className="font-mono text-xs text-gray-500 dark:text-gray-500 mr-2">{row.account_code}</span>
          <span className={`${isParent ? 'font-bold' : 'font-normal'} text-gray-900 dark:text-white`}>{row.name}</span>
        </td>
        <td className="py-2 px-3 text-right font-mono text-gray-900 dark:text-white">{formatCurrency(row.amount)}</td>
      </tr>
      {row.children.map(child => renderRow(child, level + 1))}
    </React.Fragment>
  );
}

export function BalanceGeneralPage() {
  const today = new Date().toISOString().split('T')[0];
  const [asOfDate, setAsOfDate] = useState(today);
  const [data, setData] = useState<{ assets: BalanceSheetRow[]; liabilities: BalanceSheetRow[]; equity: BalanceSheetRow[]; totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const result = await ReportesContablesService.getBalanceSheet(asOfDate);
      setData(result);
    } catch (error) {
      console.error('Error cargando balance general:', error);
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
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
          <Scale className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Balance General</h1>
          <p className="text-gray-500 dark:text-gray-400">Estado de situacion financiera</p>
        </div>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha de Corte</Label>
              <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <Button onClick={loadData} className="bg-blue-600 hover:bg-blue-700">
              <Calendar className="h-4 w-4 mr-2" />
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className={`flex items-center gap-3 p-4 rounded-lg ${data.balanced ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
        {data.balanced ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <AlertCircle className="h-5 w-5 text-red-600" />
        )}
        <p className={`text-sm font-medium ${data.balanced ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
          {data.balanced ? 'Balance cuadrado: Activos = Pasivos + Patrimonio' : `Balance descuadrado: Diferencia de ${formatCurrency(Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)))}`}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Activos</CardTitle>
            <CardDescription className="dark:text-gray-400">Total: {formatCurrency(data.totalAssets)}</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {data.assets.map(row => renderRow(row))}
                <tr className="border-t-2 dark:border-gray-600 font-bold">
                  <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL ACTIVOS</td>
                  <td className="py-3 px-3 text-right font-mono text-blue-600 dark:text-blue-400">{formatCurrency(data.totalAssets)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Pasivos</CardTitle>
              <CardDescription className="dark:text-gray-400">Total: {formatCurrency(data.totalLiabilities)}</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {data.liabilities.map(row => renderRow(row))}
                  <tr className="border-t-2 dark:border-gray-600 font-bold">
                    <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL PASIVOS</td>
                    <td className="py-3 px-3 text-right font-mono text-red-600 dark:text-red-400">{formatCurrency(data.totalLiabilities)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Patrimonio</CardTitle>
              <CardDescription className="dark:text-gray-400">Total: {formatCurrency(data.totalEquity)}</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {data.equity.map(row => renderRow(row))}
                  <tr className="border-t-2 dark:border-gray-600 font-bold">
                    <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL PATRIMONIO</td>
                    <td className="py-3 px-3 text-right font-mono text-purple-600 dark:text-purple-400">{formatCurrency(data.totalEquity)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700 border-2">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 dark:text-white">PASIVOS + PATRIMONIO</span>
                <span className="font-bold font-mono text-lg text-gray-900 dark:text-white">{formatCurrency(data.totalLiabilities + data.totalEquity)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
