import { redirect } from 'next/navigation';

/** El detalle de un área se abre sobre el organigrama (hoja de detalle). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/hrm/areas?area=${encodeURIComponent(id)}`);
}
