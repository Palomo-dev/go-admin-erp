import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/configuracion?modulo=crm&seccion=canales&canal=${id}`);
}
