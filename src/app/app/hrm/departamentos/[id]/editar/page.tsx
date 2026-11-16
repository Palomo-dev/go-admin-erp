import { redirect } from 'next/navigation';

/** «Departamentos» pasó a llamarse «Áreas». */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/hrm/areas/${encodeURIComponent(id)}/editar`);
}
