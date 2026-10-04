"use client";

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer } from 'recharts';
import { usePipelineForecast } from './usePipelineForecast';
import { agruparEtapasPronostico } from './forecastEtapasPresentacion';

interface WeightedFunnelChartProps {
  pipelineId: string;
  className?: string;
}

const WeightedFunnelChart: React.FC<WeightedFunnelChartProps> = ({ pipelineId, className }) => {
  const t = useTranslations('crm.pronostico.pipelineAnalitica');
  const { paraDocumento } = useMonedaOrganizacion();
  const { loading, error, forecast, retry } = usePipelineForecast(pipelineId);
  const stageData = useMemo(
    () => agruparEtapasPronostico(forecast?.monthlyForecasts ?? [], 'position'),
    [forecast],
  );
  const totalWeightedAmount = forecast?.totals.weightedAmount ?? 0;
  const formatear = (importe: number) => formatMoneda(importe, paraDocumento(forecast?.baseCurrency));

  // Datos para el gráfico de embudo
  const funnelData = stageData.map(stage => ({
    name: stage.name,
    value: stage.forecastAmount,
    fill: stage.color,
    amount: stage.amount,
    count: stage.opportunityCount
  }));

  // Renderizar cargando
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 space-y-4 min-h-[250px]">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  // La carga falló: se explica y se ofrece reintentar.
  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-4 min-h-[250px] flex flex-col items-center justify-center gap-3" role="alert">
          <p>{t(error === 'organization' ? 'sinOrganizacion' : 'errorCarga')}</p>
          <Button variant="outline" onClick={retry}>{t('reintentar')}</Button>
        </CardContent>
      </Card>
    );
  }

  // Si no hay datos
  if (stageData.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[250px]">
          <Filter className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t('vacio')}</p>
          <p className="text-sm text-muted-foreground mt-1 text-center">{t('vacioDetalle')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{t('embudoTitulo')}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip 
                formatter={(value: number, name: string, props: { payload?: { amount?: number; count?: number; name?: string } }) => {
                  return [
                    <>
                      <div>
                        <p><strong>{t('total')}:</strong> {formatear(props.payload?.amount ?? 0)}</p>
                        <p><strong>{t('ponderado')}:</strong> {formatear(value)}</p>
                        <p><strong>{t('oportunidades')}:</strong> {props.payload?.count}</p>
                      </div>
                    </>,
                    props.payload?.name ?? name
                  ];
                }}
              />
              <Funnel
                dataKey="value"
                data={funnelData}
                isAnimationActive={true}
              >
                <LabelList 
                  position="right"
                  dataKey="name" 
                  fill="#666" 
                  stroke="none" 
                  fontSize={12}
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-center">
          <p className="text-sm text-muted-foreground">
            {t('ponderado')}: <span className="font-medium">{formatear(totalWeightedAmount)}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default WeightedFunnelChart;
