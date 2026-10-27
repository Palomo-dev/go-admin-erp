'use client';

import React, { useState, useEffect, useRef } from 'react';
import {Scale, Calendar, CheckCircle, AlertCircle} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReportesContablesService, BalanceSheetRow, type ModoBalance } from '../ReportesContablesService';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { BranchBadge } from '@/components/inventario/BranchBadge';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatNumeroMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { importesPropios, type NivelPuc } from '@/lib/finanzas/reportes/nivelesPuc';
import { COMPARATIVO_POR_DEFECTO, TITULO_SITUACION_FINANCIERA, corteComparativo, importesPorCodigo } from '@/lib/finanzas/reportes/estadosNiif';
import { BotonesExportar, FilasNivel, SelectorNivel, filasEnNivel } from '../NivelReporte';

// Cifra contable en la moneda base de la organizacion (los reportes contables
// se llevan en moneda base): sin simbolo, con los decimales y el formato de esa
// moneda; '-' cuando es cero.
function crearFormatoCifra(moneda: ContextoMoneda): (value: number) => string {
  return (value) => (Math.abs(value) < 0.01 ? '-' : formatNumeroMoneda(value, moneda));
}

function renderRow(
  row: BalanceSheetRow,
  formatCifra: (value: number) => string,
  level: number = 0,
  comparativo?: Map<string, number> | null,
): React.ReactNode {
  const indent = level * 20;
  const isParent = row.children.length > 0;

  return (
    <React.Fragment key={row.account_code}>
      <tr className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
        <td className="py-2 px-3" style={{ paddingLeft: `${12 + indent}px` }}>
          <span className="font-mono text-xs text-gray-500 dark:text-gray-500 mr-2">{row.account_code}</span>
          <span className={`${isParent ? 'font-bold' : 'font-normal'} text-gray-900 dark:text-white`}>{row.name}</span>
        </td>
        <td className="py-2 px-3 text-right font-mono text-gray-900 dark:text-white">{formatCifra(row.amount)}</td>
        {comparativo && (
          <td className="py-2 px-3 text-right font-mono text-gray-500 dark:text-gray-400">{formatCifra(comparativo.get(row.account_code) ?? 0)}</td>
        )}
      </tr>
      {row.children.map(child => renderRow(child, formatCifra, level + 1, comparativo))}
    </React.Fragment>
  );
}

export function BalanceGeneralPage() {
  const formatCifra = crearFormatoCifra(useMonedaOrganizacion());
  // `entry_date` es timestamptz; el corte «a fecha de» se convierte al ultimo
  // instante del dia DENTRO del servicio. Aqui basta el dia de la zona de la
  // organizacion, y se pone cuando el contexto ya la sabe.
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const [asOfDate, setAsOfDate] = useState('');
  const [nivel, setNivel] = useState<NivelPuc>('auxiliar');
  const [modo, setModo] = useState<ModoBalance>('puc');
  const [data, setData] = useState<{ assets: BalanceSheetRow[]; liabilities: BalanceSheetRow[]; equity: BalanceSheetRow[]; totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // NIIF Pymes 3.14: comparativo con el cierre del ejercicio anterior, activado por defecto.
  const [conComparativo, setConComparativo] = useState(COMPARATIVO_POR_DEFECTO);
  const [previo, setPrevio] = useState<{ mapa: Map<string, number>; totalAssets: number; totalLiabilities: number; totalEquity: number; corte: string } | null>(null);

  const arrancado = useRef(false);

  useEffect(() => {
    if (tzLoading || arrancado.current) return;
    arrancado.current = true;
    const hoy = getToday();
    setAsOfDate(hoy);
    loadData(hoy, 'puc');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tzLoading, getToday]);

  const loadData = async (corte: string = asOfDate, presentacion: ModoBalance = modo) => {
    if (!corte) return;
    try {
      setIsLoading(true);
      const corteAnterior = corteComparativo(corte);
      const [result, anterior] = await Promise.all([
        ReportesContablesService.getBalanceSheet(corte, presentacion),
        ReportesContablesService.getBalanceSheet(corteAnterior, presentacion).catch(() => null),
      ]);
      setData(result);
      setPrevio(anterior ? {
        mapa: importesPorCodigo([...anterior.assets, ...anterior.liabilities, ...anterior.equity]),
        totalAssets: anterior.totalAssets,
        totalLiabilities: anterior.totalLiabilities,
        totalEquity: anterior.totalEquity,
        corte: corteAnterior,
      } : null);
    } catch (error) {
      console.error('Error cargando balance general:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  if (!data) return null;
  const comp = conComparativo && previo ? previo.mapa : null;
  const celdaPrevia = (valor: number) => comp && (
    <td className="py-3 px-3 text-right font-mono text-gray-500 dark:text-gray-400">{formatCifra(valor)}</td>
  );
  const encabezado = comp && (
    <tr className="text-xs text-gray-500 dark:text-gray-400">
      <th />
      <th className="px-3 text-right font-medium">{asOfDate}</th>
      <th className="px-3 text-right font-medium">{previo?.corte}</th>
    </tr>
  );

  const activos = filasEnNivel(data.assets, nivel);
  const pasivos = filasEnNivel(data.liabilities, nivel);
  const patrimonio = filasEnNivel(data.equity, nivel);
  const exportables: (string | number)[][] = [
    ...(activos ?? importesPropios(data.assets)).map((fila) => ['Activo', fila.codigo, fila.nombre, fila.importe] as (string | number)[]),
    ...(pasivos ?? importesPropios(data.liabilities)).map((fila) => ['Pasivo', fila.codigo, fila.nombre, fila.importe] as (string | number)[]),
    ...(patrimonio ?? importesPropios(data.equity)).map((fila) => ['Patrimonio', fila.codigo, fila.nombre, fila.importe] as (string | number)[]),
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
          <Scale className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{TITULO_SITUACION_FINANCIERA}</h1>
          <p className="text-gray-500 dark:text-gray-400">Activos, pasivos y patrimonio a la fecha de corte (antes «Balance general»)</p>
        </div>
      </div>

      <BranchBadge className="mb-3" />

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha de Corte</Label>
              <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <SelectorNivel valor={nivel} onChange={setNivel} />
            <label className="space-y-2 block">
              <span className="text-sm text-gray-700 dark:text-gray-300">Presentación</span>
              <select
                value={modo}
                onChange={(e) => setModo(e.target.value as ModoBalance)}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white"
              >
                <option value="puc">PUC</option>
                <option value="niif">NIIF</option>
              </select>
            </label>
            <label className="flex items-center gap-2 h-10 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={conComparativo} onChange={(e) => setConComparativo(e.target.checked)} />
              Comparativo con el cierre anterior
            </label>
            <BotonesExportar
              nombre={`situacion-financiera-${asOfDate}`}
              titulo={TITULO_SITUACION_FINANCIERA}
              columnas={['Seccion', 'Codigo', 'Nombre', 'Importe']}
              filas={exportables}
            />
            <Button onClick={() => loadData()} className="bg-blue-600 hover:bg-blue-700">
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
          {data.balanced ? 'Balance cuadrado: Activos = Pasivos + Patrimonio' : `Balance descuadrado: Diferencia de ${formatCifra(Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)))}`}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Activos</CardTitle>
            <CardDescription className="dark:text-gray-400">Total: {formatCifra(data.totalAssets)}</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>{encabezado}</thead>
              <tbody>
                {activos
                  ? <FilasNivel filas={activos} formatCifra={formatCifra} />
                  : data.assets.map(row => renderRow(row, formatCifra, 0, comp))}
                <tr className="border-t-2 dark:border-gray-600 font-bold">
                  <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL ACTIVOS</td>
                  <td className="py-3 px-3 text-right font-mono text-blue-600 dark:text-blue-400">{formatCifra(data.totalAssets)}</td>
                  {celdaPrevia(previo?.totalAssets ?? 0)}
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Pasivos</CardTitle>
              <CardDescription className="dark:text-gray-400">Total: {formatCifra(data.totalLiabilities)}</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>{encabezado}</thead>
                <tbody>
                  {pasivos
                    ? <FilasNivel filas={pasivos} formatCifra={formatCifra} />
                    : data.liabilities.map(row => renderRow(row, formatCifra, 0, comp))}
                  <tr className="border-t-2 dark:border-gray-600 font-bold">
                    <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL PASIVOS</td>
                    <td className="py-3 px-3 text-right font-mono text-red-600 dark:text-red-400">{formatCifra(data.totalLiabilities)}</td>
                  {celdaPrevia(previo?.totalLiabilities ?? 0)}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Patrimonio</CardTitle>
              <CardDescription className="dark:text-gray-400">Total: {formatCifra(data.totalEquity)}</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>{encabezado}</thead>
                <tbody>
                  {patrimonio
                    ? <FilasNivel filas={patrimonio} formatCifra={formatCifra} />
                    : data.equity.map(row => renderRow(row, formatCifra, 0, comp))}
                  <tr className="border-t-2 dark:border-gray-600 font-bold">
                    <td className="py-3 px-3 text-gray-900 dark:text-white">TOTAL PATRIMONIO</td>
                    <td className="py-3 px-3 text-right font-mono text-purple-600 dark:text-purple-400">{formatCifra(data.totalEquity)}</td>
                  {celdaPrevia(previo?.totalEquity ?? 0)}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700 border-2">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center justify-between">
                <span className="font-bold text-gray-900 dark:text-white">PASIVOS + PATRIMONIO</span>
                <span className="font-bold font-mono text-lg text-gray-900 dark:text-white">{formatCifra(data.totalLiabilities + data.totalEquity)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
