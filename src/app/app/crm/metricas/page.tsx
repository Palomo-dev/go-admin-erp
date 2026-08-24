import { Metadata } from 'next';
import { MetricasView } from '@/components/crm/metricas/MetricasView';

export const metadata: Metadata = {
  title: 'Métricas | CRM',
  description: 'Métricas comerciales avanzadas: win rate, ciclo de venta, ARPA, funnel y vendedores',
};

export default function MetricasRoute() {
  return <MetricasView />;
}
