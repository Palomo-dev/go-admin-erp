import { redirect } from 'next/navigation';

/** El detalle de un préstamo vive ahora bajo Nómina (Figma 20.21.2). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/hrm/nomina/prestamos/${encodeURIComponent(id)}`);
}
