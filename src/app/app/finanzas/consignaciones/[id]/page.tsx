import { permanentRedirect } from 'next/navigation';

/** Consignaciones se mudó a Inventario: la liquidación de una nota entregada vive en /app/inventario/consignaciones/[id]. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/app/inventario/consignaciones/${encodeURIComponent(id)}`);
}
