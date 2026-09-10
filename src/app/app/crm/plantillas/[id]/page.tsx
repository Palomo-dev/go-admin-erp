import type { Metadata } from 'next';
import { TemplateEditorPage } from '@/components/crm/plantillas/TemplateEditorPage';

export const metadata: Metadata = {
  title: 'Editar plantilla | CRM',
};

export default async function EditarPlantillaRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TemplateEditorPage templateId={id} />;
}
