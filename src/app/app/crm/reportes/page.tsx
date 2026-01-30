import { Metadata } from 'next';
import { ReportesPage } from '@/components/crm/reportes';

export const metadata: Metadata = {
  title: 'Reportes | CRM',
  description: 'Reportería del CRM: atención, ventas y marketing',
};

export default function ReportesRoute() {
  return <ReportesPage />;
}
