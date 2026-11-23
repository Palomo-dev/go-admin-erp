/**
 * Transporte › Flota › Documentos (fase 1 «Documentos completos», migración 20261123234500).
 * Recibe el cliente de Supabase de la sesión (RLS por pertenencia y permisos de transporte).
 *
 * - Leer: `vehicle_documents` vigentes (`transporte.view`).
 * - Guardar: sube el archivo al bucket PRIVADO `transporte-documentos` en `<org>/<id>/<archivo>`
 *   y crea la fila (`transporte.manage`). La base archiva el anterior del mismo tipo y copia la
 *   fecha a `vehicles` / `driver_credentials` (las pantallas de siempre y el bloqueo de despacho
 *   la ven igual).
 * - Ver archivo: URL firmada de 5 minutos (nunca pública).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentoTabla, TipoDocumento } from '@/lib/transporte/documentosFlota';

export const BUCKET_DOCUMENTOS = 'transporte-documentos';
export const ARCHIVO_MAX_BYTES = 10 * 1024 * 1024;
export const TIPOS_ARCHIVO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

export async function listarDocumentos(db: SupabaseClient, organizationId: number): Promise<DocumentoTabla[]> {
  const { data, error } = await db
    .from('vehicle_documents')
    .select('id, vehicle_id, driver_credential_id, doc_type, number, issuer, category, expires_on, blocks_dispatch, file_path, file_name, notes')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as DocumentoTabla[];
}

export interface DatosDocumento {
  vehicleId?: string | null;
  driverCredentialId?: string | null;
  tipo: TipoDocumento;
  numero?: string | null;
  entidad?: string | null;
  categoria?: string | null;
  vence?: string | null;
  bloquea: boolean;
  notas?: string | null;
}

export class DocumentoError extends Error {
  constructor(public readonly codigo: 'archivo_grande' | 'archivo_tipo' | 'subida' | 'sin_permiso' | 'error') {
    super(codigo);
  }
}

/** Nombre seguro para la ruta del archivo (sin tildes ni barras). */
export function nombreArchivoSeguro(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return limpio || 'documento';
}

export function validarArchivo(archivo: Pick<File, 'size' | 'type'>): DocumentoError | null {
  if (archivo.size > ARCHIVO_MAX_BYTES) return new DocumentoError('archivo_grande');
  if (!(TIPOS_ARCHIVO as readonly string[]).includes(archivo.type)) return new DocumentoError('archivo_tipo');
  return null;
}

export async function guardarDocumento(db: SupabaseClient, organizationId: number, datos: DatosDocumento, archivo?: File | null): Promise<void> {
  const id = crypto.randomUUID();
  let filePath: string | null = null;
  if (archivo) {
    const invalido = validarArchivo(archivo);
    if (invalido) throw invalido;
    filePath = `${organizationId}/${id}/${nombreArchivoSeguro(archivo.name)}`;
    const { error } = await db.storage.from(BUCKET_DOCUMENTOS).upload(filePath, archivo, { contentType: archivo.type, upsert: false });
    if (error) throw new DocumentoError('subida');
  }
  const { error } = await db.from('vehicle_documents').insert({
    id,
    organization_id: organizationId,
    vehicle_id: datos.vehicleId ?? null,
    driver_credential_id: datos.driverCredentialId ?? null,
    doc_type: datos.tipo,
    number: datos.numero?.trim() || null,
    issuer: datos.entidad?.trim() || null,
    category: datos.categoria?.trim() || null,
    expires_on: datos.vence || null,
    blocks_dispatch: datos.bloquea,
    file_path: filePath,
    file_name: archivo?.name ?? null,
    notes: datos.notas?.trim() || null,
  });
  if (error) {
    // La fila no quedó: el archivo subido no debe quedar huérfano.
    if (filePath) await db.storage.from(BUCKET_DOCUMENTOS).remove([filePath]).catch(() => undefined);
    throw new DocumentoError(error.code === '42501' ? 'sin_permiso' : 'error');
  }
}

export async function archivarDocumento(db: SupabaseClient, organizationId: number, id: string): Promise<void> {
  const { error } = await db.from('vehicle_documents').update({ is_active: false }).eq('id', id).eq('organization_id', organizationId);
  if (error) throw new DocumentoError(error.code === '42501' ? 'sin_permiso' : 'error');
}

export async function urlArchivo(db: SupabaseClient, filePath: string): Promise<string> {
  const { data, error } = await db.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(filePath, 300);
  if (error || !data?.signedUrl) throw new DocumentoError('error');
  return data.signedUrl;
}
