import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getDocuments,
  uploadDocument,
  getDocumentFolders,
  createDocumentFolder,
  type DocumentRelatedType,
} from '@/lib/services/crm/documentService';

/**
 * GET /api/crm/documents — Lista documentos con filtros opcionales.
 * Query params: related_type, related_id, folder_id, is_confidential, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const filters: Record<string, unknown> = {};
    const relatedType = searchParams.get('related_type');
    const relatedId = searchParams.get('related_id');
    const folderId = searchParams.get('folder_id');
    const isConfidential = searchParams.get('is_confidential');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    if (relatedType) filters.related_type = relatedType;
    if (relatedId) filters.related_id = relatedId;
    if (folderId) filters.folder_id = folderId;
    if (isConfidential !== null) filters.is_confidential = isConfidential === 'true';
    if (limit) filters.limit = parseInt(limit, 10);
    if (offset) filters.offset = parseInt(offset, 10);

    const documents = await getDocuments(ctx.organizationId, ctx.supabase, filters);

    // Si se pide folders también (query param include_folders=true)
    if (searchParams.get('include_folders') === 'true') {
      const folderFilters: Record<string, unknown> = {};
      if (relatedType) folderFilters.related_type = relatedType;
      if (relatedId) folderFilters.related_id = relatedId;
      const folders = await getDocumentFolders(ctx.organizationId, ctx.supabase, folderFilters);
      return NextResponse.json({ success: true, data: documents, folders }, { status: 200 });
    }

    return NextResponse.json({ success: true, data: documents }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Documents] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/documents — Sube un documento (multipart/form-data) o crea una carpeta.
 *
 * Si el body es multipart/form-data:
 *   - file: File
 *   - name, description, related_type, related_id, tags (comma-separated), is_confidential, folder_id
 *
 * Si el body es JSON con { action: 'create_folder', name, parent_id, related_type, related_id }:
 *   - Crea una carpeta de documentos.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const contentType = request.headers.get('content-type') || '';

    // ─── Crear carpeta via JSON ──────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await request.json();

      if (body?.action === 'create_folder') {
        if (!body?.name) {
          return NextResponse.json(
            { success: false, error: 'Falta el nombre de la carpeta' },
            { status: 400 }
          );
        }
        const folder = await createDocumentFolder(
          ctx.organizationId,
          {
            name: body.name,
            parent_id: body.parent_id ?? null,
            related_type: body.related_type ?? null,
            related_id: body.related_id ?? null,
          },
          ctx.supabase
        );
        return NextResponse.json({ success: true, data: folder }, { status: 201 });
      }

      return NextResponse.json(
        { success: false, error: 'Acción no reconocida. Use multipart/form-data para subir archivos.' },
        { status: 400 }
      );
    }

    // ─── Subir archivo via multipart/form-data ───────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string | null;
    const relatedType = formData.get('related_type') as string | null;
    const relatedId = formData.get('related_id') as string | null;

    if (!file || !name || !relatedType || !relatedId) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: file, name, related_type, related_id' },
        { status: 400 }
      );
    }

    const description = (formData.get('description') as string | null) || null;
    const folderId = (formData.get('folder_id') as string | null) || null;
    const tagsStr = (formData.get('tags') as string | null) || '';
    const isConfidential = formData.get('is_confidential') === 'true';

    const document = await uploadDocument(
      ctx.organizationId,
      {
        name,
        description,
        folder_id: folderId,
        related_type: relatedType as DocumentRelatedType,
        related_id: relatedId,
        tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [],
        is_confidential: isConfidential,
        uploaded_by: ctx.userId,
      },
      file,
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Documents] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
