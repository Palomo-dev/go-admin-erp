import type { Metadata } from 'next';
import { TemplateEditorPage } from '@/components/crm/plantillas/TemplateEditorPage';

export const metadata: Metadata = {
  title: 'Nueva plantilla | CRM',
};

export default function NuevaPlantillaRoute() {
  return <TemplateEditorPage />;
}
