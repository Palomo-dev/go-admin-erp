'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  getDownloadUrl,
} from '@/lib/services/crm/documentService';
import type { CRMDocument, DocumentRelatedType } from '@/lib/services/crm/documentService';
import {
  Upload,
  FileText,
  File,
  Image as ImageIcon,
  Download,
  Trash2,
  Loader2,
  Paperclip,
} from 'lucide-react';

interface DocumentUploaderProps {
  organizationId: number;
  relatedType: DocumentRelatedType;
  relatedId: string;
  title?: string;
  compact?: boolean;
}

export function DocumentUploader({
  organizationId,
  relatedType,
  relatedId,
  title = 'Documentos',
  compact = false,
}: DocumentUploaderProps) {
  const [documents, setDocuments] = useState<CRMDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await getDocuments(organizationId, supabase, {
        related_type: relatedType,
        related_id: relatedId,
      });
      setDocuments(docs);
    } catch (err) {
      console.error('Error cargando documentos:', err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, relatedType, relatedId]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadDocument(organizationId, {
          name: file.name,
          related_type: relatedType,
          related_id: relatedId,
        }, file, supabase);
      }
      toast({
        title: 'Documentos subidos',
        description: `${files.length} archivo(s) subido(s) correctamente`,
      });
      await loadDocuments();
    } catch (err) {
      console.error('Error subiendo documentos:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo subir el archivo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [organizationId, relatedType, relatedId, loadDocuments]);

  const handleDelete = useCallback(async (docId: string) => {
    try {
      await deleteDocument(docId, organizationId, supabase);
      toast({ title: 'Documento eliminado' });
      await loadDocuments();
    } catch (err) {
      console.error('Error eliminando documento:', err);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el documento',
        variant: 'destructive',
      });
    }
  }, [organizationId, loadDocuments]);

  const handleDownload = useCallback(async (docId: string) => {
    try {
      const url = await getDownloadUrl(docId, organizationId, supabase);
      if (url) {
        window.open(url, '_blank');
      } else {
        toast({ title: 'Error', description: 'No se pudo generar el enlace de descarga', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo descargar el documento', variant: 'destructive' });
    }
  }, [organizationId]);

  // Cargar documentos al montar
  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const getFileIcon = (mimeType: string | null, fileType: string) => {
    if (mimeType?.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    if (mimeType === 'application/pdf' || fileType === 'pdf') return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" />
            {documents.length} documento(s)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Subir
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : documents.length > 0 ? (
          <div className="space-y-1">
            {documents.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/30 group"
              >
                <span className="text-gray-400 shrink-0">{getFileIcon(doc.mime_type, doc.file_type)}</span>
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{doc.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDownload(doc.id)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    title="Descargar"
                  >
                    <Download className="h-3 w-3 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
            {documents.length > 5 && (
              <p className="text-[10px] text-gray-400 pl-2">+{documents.length - 5} más...</p>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-gray-400 pl-2">Sin documentos</p>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-gray-400" />
            {title}
            {documents.length > 0 && (
              <span className="text-xs font-normal text-gray-500">({documents.length})</span>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            Subir archivo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Dropzone visual */}
        {documents.length === 0 && !loading && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
          >
            <Upload className="h-6 w-6 text-gray-400 mx-auto mb-2" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Arrastra archivos aqui o haz click para subir
            </p>
            <p className="text-[10px] text-gray-400 mt-1">PDF, imagenes, contratos, etc.</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : documents.length > 0 ? (
          <div className="space-y-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-2.5 rounded-md border border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 group"
              >
                <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 text-blue-500">
                  {getFileIcon(doc.mime_type, doc.file_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                    {doc.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">{formatFileSize(doc.file_size)}</span>
                    {doc.is_confidential && (
                      <span className="text-[10px] text-amber-500">confidencial</span>
                    )}
                    <span className="text-[10px] text-gray-400">
                      {new Date(doc.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDownload(doc.id)}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500"
                    title="Descargar"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default DocumentUploader;
