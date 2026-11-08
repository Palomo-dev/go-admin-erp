import { DocumentoPorAceptarPagina } from '@/components/inventario/consignaciones/DocumentoPorAceptarPagina';

/** Nota por aceptar (Figma R2) o liquidación recibida del consignatario (Figma R8). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentoPorAceptarPagina documentoId={id} />;
}
