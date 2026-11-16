import { DetalleAusencia } from '@/components/hrm/ausencias/DetalleAusencia';

/** Recursos humanos › Ausencias › detalle de una incapacidad, licencia o permiso (Figma 20.14.3 y 20.14.4). */
export default async function DetalleAusenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleAusencia id={id} />;
}
