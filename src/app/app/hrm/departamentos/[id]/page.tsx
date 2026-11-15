import { redirect } from 'next/navigation';

/** «Departamentos» pasó a llamarse «Áreas»: el detalle abre sobre el organigrama. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/hrm/areas?area=${encodeURIComponent(id)}`);
}
