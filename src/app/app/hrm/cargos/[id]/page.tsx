import { DetalleCargo } from '@/components/hrm/estructura/cargos/DetalleCargo';

/** Recursos humanos › Cargos › perfil del cargo (Figma 95-hrm-01-04). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleCargo id={id} />;
}
