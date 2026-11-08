import { InvitacionRecibidaPagina } from '@/components/inventario/consignaciones/InvitacionRecibidaPagina';

/** Invitación de vínculo entre organizaciones (Figma R7). Enlace de un solo uso; la base guarda solo su hash. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitacionRecibidaPagina token={token} />;
}
