import { EntregarPantalla } from '@/components/logistica/misEnvios/EntregarPantalla';

/** Logística › Mis envíos › Entregar (Figma 2802:10233). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EntregarPantalla shipmentId={id} />;
}
