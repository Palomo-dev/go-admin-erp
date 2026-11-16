import { FormularioArea } from '@/components/hrm/estructura/areas/FormularioArea';

/** Recursos humanos › Áreas › Editar área (Figma 95-hrm-01-11). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FormularioArea id={id} />;
}
