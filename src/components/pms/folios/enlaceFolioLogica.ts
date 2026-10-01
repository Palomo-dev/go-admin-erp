/** El enlace identifica ambos registros; nunca concede acceso al folio. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function leerEnlaceFolio(params: Pick<URLSearchParams, 'get'> | null): { reservationId: string; folioId: string } | null {
  const reservationId = params?.get('reservation');
  const folioId = params?.get('folio');
  return reservationId && folioId && UUID.test(reservationId) && UUID.test(folioId)
    ? { reservationId, folioId } : null;
}
