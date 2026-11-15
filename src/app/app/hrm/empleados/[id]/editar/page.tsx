import { redirect } from 'next/navigation';

/**
 * La edición vieja del empleado escribía salario, banco y seguridad social
 * desde el navegador. Se reemplaza por la ficha: datos personales se editan
 * directo y lo laboral va por «Registrar un cambio» (fase 1).
 */
export default async function EditarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/hrm/empleados/${encodeURIComponent(id)}`);
}
