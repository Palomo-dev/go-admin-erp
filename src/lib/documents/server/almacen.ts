/**
 * Copia archivada de un PDF del motor, en bucket PRIVADO.
 *
 * El bucket `invoices` era público (cualquiera con la URL leía el PDF) y sus
 * políticas dejaban a cualquier usuario autenticado subir, sobrescribir o
 * borrar objetos de cualquier organización. La migración
 * `20260926090000_documentos_bucket_invoices_privado` lo vuelve privado y
 * retira esas políticas: solo el servidor (service role, con la organización
 * ya validada) escribe, y la lectura es por URL firmada de corta duración.
 *
 * Ruta: `<organization_id>/<tipo>/<id>.pdf` — la organización es la de la
 * sesión, nunca un valor de la petición. Los objetos viejos
 * (`facturas-venta/<uuid>.pdf`) no se tocan.
 */

import { getServiceClient } from '@/lib/supabase/server-service';
import type { TipoDocumento } from '../tipos';

export const BUCKET_DOCUMENTOS = 'invoices';
/** Vida de la URL firmada: suficiente para abrir o descargar, no para compartir. */
export const SEGUNDOS_URL_FIRMADA = 300;

export function rutaCopia(organizationId: number, tipo: TipoDocumento, id: string): string {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error('Organización inválida');
  if (!/^[0-9a-zA-Z-]{1,64}$/.test(id)) throw new Error('Id de documento inválido');
  return `${organizationId}/${tipo}/${id}.pdf`;
}

/** Sube (o reemplaza) la copia y devuelve una URL firmada de corta duración. */
export async function guardarCopiaPrivada(
  organizationId: number,
  tipo: TipoDocumento,
  id: string,
  pdf: Uint8Array,
): Promise<{ ruta: string; urlFirmada: string; expiraEnSegundos: number }> {
  const ruta = rutaCopia(organizationId, tipo, id);
  const admin = getServiceClient();
  const { error } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(ruta, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`No se pudo guardar la copia del documento: ${error.message}`);
  const { data, error: errorFirma } = await admin.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(ruta, SEGUNDOS_URL_FIRMADA);
  if (errorFirma || !data?.signedUrl) throw new Error('No se pudo firmar la URL de la copia');
  return { ruta, urlFirmada: data.signedUrl, expiraEnSegundos: SEGUNDOS_URL_FIRMADA };
}
