import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** El plan de cuotas vive en el detalle de la CxP (plan F9); la URL vieja se conserva. */
export default async function CuotasPageRoute({ params }: PageProps) {
  const { id } = await params;
  redirect(`/app/finanzas/cuentas-por-pagar/${encodeURIComponent(id)}#cuotas`);
}
