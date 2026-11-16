import { FichaEmpleado } from '@/components/hrm/personas/ficha/FichaEmpleado';

/** Recursos humanos › Ficha única del empleado (Figma 20.3). `id` es la persona (o, en enlaces viejos, el vínculo). */
export default async function FichaEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FichaEmpleado id={id} />;
}
