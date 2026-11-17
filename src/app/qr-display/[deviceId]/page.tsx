import { redirect } from 'next/navigation';

/** La pantalla del QR vieja (token de 5 min) pasa a la Pantalla de QR de M0 (QR de 30 s y un solo uso). */
export default async function Page({ params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  redirect(`/marcacion/pantalla/${encodeURIComponent(deviceId)}`);
}
