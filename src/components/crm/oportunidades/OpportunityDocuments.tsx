'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  File,
  Trash2,
  Download,
  Loader2,
  Paperclip,
} from 'lucide-react';

interface OpportunityDocumentsProps {
  opportunityId: string;
  organizationId: number;
}

interface DocItem {
  id: string;
  name: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  uploaded_by: string | null;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="h-4 w-4 text-gray-500" />;
  if (mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (mimeType.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
  if (mimeType.includes('word') || mimeType.includes('document')) return <FileText className="h-4 w-4 text-blue-600" />;
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return <FileText className="h-4 w-4 text-green-600" />;
  return <File className="h-4 w-4 text-gray-500" />;
}

export function OpportunityDocuments({ opportunityId, organizationId }: OpportunityDocumentsProps) {
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docName, setDocName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, file_path, file_type, file_size, mime_type, created_at, uploaded_by')
        .eq('related_type', 'opportunity')
        .eq('related_id', opportunityId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments((data || []) as DocItem[]);
    } catch (err) {
      console.error('Error cargando documentos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!docName) setDocName(file.name);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({ title: 'Selecciona un archivo', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${opportunityId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const bucketPath = `opportunity-docs/${fileName}`;

      // 1. Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('crm')
        .upload(bucketPath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 2. Registrar en tabla documents
      const { error: dbError } = await supabase.from('documents').insert({
        organization_id: organizationId,
        name: docName || selectedFile.name,
        file_path: bucketPath,
        file_type: fileExt || 'unknown',
        file_size: selectedFile.size,
        mime_type: selectedFile.type,
        related_type: 'opportunity',
        related_id: opportunityId,
        tags: [],
        is_confidential: false,
      });

      if (dbError) throw dbError;

      toast({ title: 'Documento subido' });
      setDocName('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadDocuments();
    } catch (err) {
      console.error('Error subiendo documento:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo subir el documento',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocItem) => {
    try {
      const { data, error } = await supabase.storage
        .from('crm')
        .createSignedUrl(doc.file_path, 3600);

      if (error || !data?.signedUrl) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error('Error descargando:', err);
      toast({ title: 'Error al descargar', variant: 'destructive' });
    }
  };

  const handleDelete = async (doc: DocItem) => {
    if (!confirm(`¿Eliminar "${doc.name}"?`)) return;
    try {
      // Eliminar del storage
      await supabase.storage.from('crm').remove([doc.file_path]);
      // Eliminar de la tabla
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;
      toast({ title: 'Documento eliminado' });
      loadDocuments();
    } catch (err) {
      console.error('Error eliminando:', err);
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3 border border-gray-100 dark:border-gray-800">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Nombre del documento</label>
            <Input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="Nombre descriptivo..."
              className="text-sm h-9"
            />
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-9 text-xs"
          >
            <Paperclip className="h-3.5 w-3.5 mr-1.5" />
            {selectedFile ? selectedFile.name : 'Seleccionar archivo'}
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white ml-auto"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            Subir
          </Button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="h-6 w-6 text-gray-400 animate-spin mx-auto" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay documentos subidos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800"
            >
              <div className="shrink-0 w-9 h-9 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                {getFileIcon(doc.mime_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleDownload(doc)}
                  className="p-1.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(doc)}
                  className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
