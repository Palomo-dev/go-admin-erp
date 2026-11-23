import { NovedadPantalla } from '@/components/logistica/misEnvios/NovedadPantalla';

/** Logística › Mis envíos › No se pudo entregar (Figma 2802:10390). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NovedadPantalla shipmentId={id} />;
}
