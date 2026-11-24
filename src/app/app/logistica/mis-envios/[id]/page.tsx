import { ParadaPantalla } from '@/components/logistica/misEnvios/ParadaPantalla';

/** Logística › Mis envíos › parada (Figma 2801:4241). Solo se ve si el envío es del domiciliario. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ParadaPantalla shipmentId={id} />;
}
