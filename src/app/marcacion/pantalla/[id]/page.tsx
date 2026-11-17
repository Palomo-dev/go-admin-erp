import { PantallaQr } from '@/components/hrm/marcacion/PantallaQr';

/**
 * Pantalla de QR de la sede (Figma 20.29.1): fuera del shell de /app, a pantalla
 * completa para un televisor o monitor. El QR cambia cada 30 s y sirve una vez.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PantallaQr id={id} />;
}
