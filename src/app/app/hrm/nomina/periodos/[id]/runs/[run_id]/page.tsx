import { redirect } from 'next/navigation';

/**
 * La página vieja de una ejecución de nómina se reemplazó por el detalle del período
 * (Figma 20.17): cada versión de cálculo es inmutable y se ve desde el período.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/hrm/nomina/periodos/${encodeURIComponent(id)}`);
}
