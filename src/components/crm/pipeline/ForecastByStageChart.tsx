"use client";

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { usePipelineForecast } from './usePipelineForecast';
import { agruparEtapasPronostico, type DatosEtapaPronostico } from './forecastEtapasPresentacion';

interface ForecastByStageChartProps {
  pipelineId: string;
  className?: string;
}

interface TooltipProps {
  baseCurrency?: string;
  active?: boolean;
  payload?: Array<{
    payload: DatosEtapaPronostico & { value: number };
  }>;
}

const CustomTooltip: React.FC<TooltipProps> = ({ active, payload, baseCurrency }) => {
  const t = useTranslations('crm.pronostico.pipelineAnalitica');
  const { paraDocumento } = useMonedaOrganizacion();
  const formatear = (importe: number) => formatMoneda(importe, paraDocumento(baseCurrency));
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-md shadow-md">
        <p className="font-medium text-gray-800 dark:text-gray-200">{data.name}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('probabilidad')}: {Math.round(Number(data.probability))}%
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('total')}: {formatear(data.amount)}
        </p>
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
          {t('pronostico')}: {formatear(data.forecastAmount)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('porcentajeDelPronostico', { n: data.percentage.toFixed(1) })}
        </p>
      </div>
    );
  }
  return null;
};

const ForecastByStageChart: React.FC<ForecastByStageChartProps> = ({ pipelineId, className }) => {
  const t = useTranslations('crm.pronostico.pipelineAnalitica');
  const { paraDocumento } = useMonedaOrganizacion();
  const { loading, error, forecast, retry } = usePipelineForecast(pipelineId);
  const stageData = useMemo(
    () => agruparEtapasPronostico(forecast?.monthlyForecasts ?? [], 'probability'),
    [forecast],
  );
  const totalForecast = forecast?.totals.weightedAmount ?? 0;
  const formatear = (importe: number) => formatMoneda(importe, paraDocumento(forecast?.baseCurrency));

  if (loading) {
    return (
      <Card className={`p-4 space-y-4 h-80 ${className}`}>
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-60 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-6 h-80 flex flex-col items-center justify-center gap-3 ${className ?? ''}`} role="alert">
        <p>{t(error === 'organization' ? 'sinOrganizacion' : 'errorCarga')}</p>
        <Button variant="outline" onClick={retry}>{t('reintentar')}</Button>
      </Card>
    );
  }

  // Si no hay datos
  if (stageData.length === 0) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-center h-80 text-center">
          <div>
            <Filter className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">{t('vacio')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('vacioDetalle')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Preparar datos para el gráfico
  const chartData = stageData.map(stage => ({
    ...stage,
    value: stage.forecastAmount
  }));

  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <Filter className="h-5 w-5 text-blue-500 dark:text-blue-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            {t('embudoTitulo')}
          </h3>
        </div>
        <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
          {formatear(totalForecast)}
        </div>
      </div>

      <div className="h-64 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((entry) => (
                <Cell 
                  key={entry.id}
                  fill={entry.color}
                  className="dark:opacity-80"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip baseCurrency={forecast?.baseCurrency} />} />
            <Legend 
              layout="vertical" 
              verticalAlign="middle" 
              align="right"
              formatter={(value, entry) => {
                const payload = entry?.payload as DatosEtapaPronostico | undefined;
                return (
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {value} ({payload ? Math.round(Number(payload.probability)) : 0}%)
                  </span>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla de resumen */}
      <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2">{t('etapa')}</th>
              <th className="pb-2 text-right">{t('pronostico')}</th>
              <th className="pb-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {stageData.map(stage => (
              <tr key={stage.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="py-2 flex items-center">
                  <span 
                    className="w-3 h-3 rounded-full mr-2" 
                    style={{ backgroundColor: stage.color }}
                  ></span>
                  {stage.name}
                </td>
                <td className="py-2 text-right">{formatear(stage.forecastAmount)}</td>
                <td className="py-2 text-right">{stage.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default ForecastByStageChart;
