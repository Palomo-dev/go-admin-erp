/**
 * Logística › Envíos › detalle. Reemplaza a /app/transporte/envios/[id] (redirección 308 en
 * next.config.js). La pantalla vive en `src/components/logistica/envio`.
 */
import { DetalleEnvioPage } from '@/components/logistica/envio/DetalleEnvioPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleEnvioPage id={id} />;
}
