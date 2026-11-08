import { DetalleRecibida } from '@/components/inventario/consignaciones/DetalleRecibida';

/** Nota recibida: existencias del consignante, condiciones, cuentas de orden y liquidaciones (Figma R3, M2). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleRecibida notaId={id} />;
}
