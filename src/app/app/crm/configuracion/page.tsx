import { Metadata } from 'next';
import { ConfiguracionHub } from '@/components/crm/configuracion';

export const metadata: Metadata = {
  title: 'Configuración | CRM',
  description: 'Hub de configuración del CRM: canales, etiquetas, reglas',
};

export default function ConfiguracionPage() {
  return <ConfiguracionHub />;
}
