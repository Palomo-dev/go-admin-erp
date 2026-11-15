import { FormularioCargo } from '@/components/hrm/estructura/cargos/FormularioCargo';

/** Recursos humanos › Cargos › Editar cargo (Figma 95-hrm-01-12). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FormularioCargo id={id} />;
}
