import { redirect } from 'next/navigation';

/** Ruta en inglés heredada: la vigente es /app/chat/conversaciones/[id]/actividad. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/chat/conversaciones/${encodeURIComponent(id)}/actividad`);
}
