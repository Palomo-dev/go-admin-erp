import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Gestión de documentos y carpetas (Fase 9 - Ficha 360°).
 *
 * Tablas:
 *   - document_folders: id, organization_id, name, parent_id, related_type, related_id
 *   - documents: id, organization_id, folder_id, name, description, file_path,
 *       file_type, file_size, mime_type, uploaded_by, related_type, related_id,
 *       tags, is_confidential
 *
 * Storage bucket: crm-documents
 * Ruta de almacenamiento: {orgId}/{relatedType}/{relatedId}/{timestamp}-{filename}
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type DocumentRelatedType =
  | 'opportunity'
  | 'customer'
  | 'quotation'
  | 'call'
  | 'contract';

export interface CRMDocument {
  id: string;
  organization_id: number;
  folder_id: string | null;
  name: string;
  description: string | null;
  file_path: string;
  file_type: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  related_type: string;
  related_id: string;
  tags: string[];
  is_confidential: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentFolder {
  id: string;
  organization_id: number;
  name: string;
  parent_id: string | null;
  related_type: string | null;
  related_id: string | null;
  created_at: string;
}

export interface UploadDocumentInput {
  folder_id?: string | null;
  name: string;
  description?: string | null;
  related_type: DocumentRelatedType;
  related_id: string;
  tags?: string[];
  is_confidential?: boolean;
  uploaded_by?: string | null;
}

export interface UpdateDocumentInput {
  name?: string;
  description?: string | null;
  folder_id?: string | null;
  tags?: string[];
  is_confidential?: boolean;
}

export interface CreateFolderInput {
  name: string;
  parent_id?: string | null;
  related_type?: string | null;
  related_id?: string | null;
}

export interface DocumentFilters {
  related_type?: string;
  related_id?: string;
  folder_id?: string;
  is_confidential?: boolean;
  limit?: number;
  offset?: number;
}

export interface FolderFilters {
  related_type?: string;
  related_id?: string;
  parent_id?: string | null;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista documentos de una organización con filtros opcionales.
 */
export async function getDocuments(
  orgId: number,
  supabase: SupabaseClient,
  filters?: DocumentFilters
): Promise<CRMDocument[]> {
  let query = supabase
    .from('documents')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.related_type) {
    query = query.eq('related_type', filters.related_type);
  }
  if (filters?.related_id) {
    query = query.eq('related_id', filters.related_id);
  }
  if (filters?.folder_id) {
    query = query.eq('folder_id', filters.folder_id);
  }
  if (filters?.is_confidential !== undefined) {
    query = query.eq('is_confidential', filters.is_confidential);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.range(filters.offset, (filters.offset + (filters.limit || 50)) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('documentService.getDocuments - error:', error.message);
    return [];
  }

  return (data || []) as CRMDocument[];
}

/**
 * Obtiene un documento por ID dentro de la organización.
 */
export async function getDocument(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<CRMDocument | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    console.warn('documentService.getDocument - error:', error.message);
    return null;
  }

  return (data as CRMDocument) || null;
}

/**
 * Sube un archivo al bucket `crm-documents` y crea el registro en `documents`.
 */
export async function uploadDocument(
  orgId: number,
  data: UploadDocumentInput,
  file: File,
  supabase: SupabaseClient
): Promise<CRMDocument | null> {
  const timestamp = Date.now();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${orgId}/${data.related_type}/${data.related_id}/${timestamp}-${safeFileName}`;

  // 1. Subir archivo al bucket de Storage
  const { error: uploadError } = await supabase.storage
    .from('crm-documents')
    .upload(filePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    console.error('documentService.uploadDocument - storage error:', uploadError.message);
    throw new Error(`Error subiendo archivo: ${uploadError.message}`);
  }

  // 2. Determinar file_type desde la extensión
  const extension = safeFileName.split('.').pop()?.toLowerCase() || '';
  const fileType = extension || file.type.split('/')[1] || 'unknown';

  // 3. Crear registro en la tabla documents
  const { data: docRow, error: dbError } = await supabase
    .from('documents')
    .insert({
      organization_id: orgId,
      folder_id: data.folder_id ?? null,
      name: data.name,
      description: data.description ?? null,
      file_path: filePath,
      file_type: fileType,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: data.uploaded_by ?? null,
      related_type: data.related_type,
      related_id: data.related_id,
      tags: data.tags ?? [],
      is_confidential: data.is_confidential ?? false,
    })
    .select('*')
    .single();

  if (dbError) {
    // Rollback: eliminar archivo subido si falla el INSERT
    await supabase.storage.from('crm-documents').remove([filePath]);
    console.error('documentService.uploadDocument - db error:', dbError.message);
    throw new Error(`Error creando registro: ${dbError.message}`);
  }

  return docRow as CRMDocument;
}

/**
 * Actualiza la metadata de un documento (no el archivo).
 */
export async function updateDocument(
  id: string,
  orgId: number,
  data: UpdateDocumentInput,
  supabase: SupabaseClient
): Promise<CRMDocument | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.folder_id !== undefined) updateData.folder_id = data.folder_id;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.is_confidential !== undefined) updateData.is_confidential = data.is_confidential;

  const { data: result, error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('documentService.updateDocument - error:', error.message);
    throw new Error(`Error actualizando documento: ${error.message}`);
  }

  return (result as CRMDocument) || null;
}

/**
 * Elimina un documento: borra el archivo de Storage y el registro en BD.
 */
export async function deleteDocument(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  // 1. Obtener el documento para conocer el file_path
  const doc = await getDocument(id, orgId, supabase);
  if (!doc) {
    throw new Error('Documento no encontrado');
  }

  // 2. Eliminar archivo de Storage
  const { error: storageError } = await supabase.storage
    .from('crm-documents')
    .remove([doc.file_path]);

  if (storageError) {
    console.warn('documentService.deleteDocument - storage error:', storageError.message);
  }

  // 3. Eliminar registro de la BD
  const { error: dbError } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (dbError) {
    throw new Error(`Error eliminando documento: ${dbError.message}`);
  }
}

/**
 * Genera una URL firmada para descargar un documento.
 */
export async function getDownloadUrl(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<string | null> {
  const doc = await getDocument(id, orgId, supabase);
  if (!doc) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from('crm-documents')
    .createSignedUrl(doc.file_path, 3600); // 1 hora de validez

  if (error || !data) {
    console.error('documentService.getDownloadUrl - error:', error?.message);
    return null;
  }

  return data.signedUrl;
}

/**
 * Lista carpetas de documentos de una organización con filtros opcionales.
 */
export async function getDocumentFolders(
  orgId: number,
  supabase: SupabaseClient,
  filters?: FolderFilters
): Promise<DocumentFolder[]> {
  let query = supabase
    .from('document_folders')
    .select('*')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });

  if (filters?.related_type) {
    query = query.eq('related_type', filters.related_type);
  }
  if (filters?.related_id) {
    query = query.eq('related_id', filters.related_id);
  }
  if (filters?.parent_id !== undefined) {
    if (filters.parent_id === null) {
      query = query.is('parent_id', null);
    } else {
      query = query.eq('parent_id', filters.parent_id);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.warn('documentService.getDocumentFolders - error:', error.message);
    return [];
  }

  return (data || []) as DocumentFolder[];
}

/**
 * Crea una carpeta de documentos.
 */
export async function createDocumentFolder(
  orgId: number,
  data: CreateFolderInput,
  supabase: SupabaseClient
): Promise<DocumentFolder | null> {
  const { data: result, error } = await supabase
    .from('document_folders')
    .insert({
      organization_id: orgId,
      name: data.name,
      parent_id: data.parent_id ?? null,
      related_type: data.related_type ?? null,
      related_id: data.related_id ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('documentService.createDocumentFolder - error:', error.message);
    throw new Error(`Error creando carpeta: ${error.message}`);
  }

  return result as DocumentFolder;
}

/**
 * Elimina una carpeta de documentos.
 * Nota: los documentos dentro de la carpeta quedan con folder_id apuntando a una carpeta inexistente.
 * Se recomienda reasignar o eliminar los documentos antes de borrar la carpeta.
 */
export async function deleteDocumentFolder(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('document_folders')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) {
    throw new Error(`Error eliminando carpeta: ${error.message}`);
  }
}
