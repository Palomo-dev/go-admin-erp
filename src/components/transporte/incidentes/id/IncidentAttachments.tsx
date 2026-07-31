'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Paperclip,
  Upload,
  File,
  Image,
  FileText,
  Trash2,
  Download,
  Eye,
  Loader2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Attachment {
  name: string;
  url: string;
  type: string;
}

interface IncidentAttachmentsProps {
  attachments: Attachment[];
  onAddAttachment: (attachment: Attachment) => Promise<void>;
  onRemoveAttachment: (attachmentUrl: string) => Promise<void>;
}

export function IncidentAttachments({
  attachments,
  onAddAttachment,
  onRemoveAttachment,
}: IncidentAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<Attachment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-8 w-8 text-blue-500" />;
    if (type.includes('pdf')) return <FileText className="h-8 w-8 text-red-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // En un escenario real, aquí subirías el archivo a Supabase Storage
        // Por ahora, creamos una URL temporal para demostración
        const fakeUrl = URL.createObjectURL(file);
        
        await onAddAttachment({
          name: file.name,
          url: fakeUrl,
          type: file.type,
        });
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    if (!attachmentToDelete) return;
    
    setIsDeleting(true);
    try {
      await onRemoveAttachment(attachmentToDelete.url);
      setAttachmentToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const isImage = (type: string) => type.startsWith('image/');

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-blue-600" />
            Evidencias y Adjuntos
            {attachments.length > 0 && (
              <span className="text-sm font-normal text-gray-500">
                ({attachments.length})
              </span>
            )}
          </CardTitle>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="gap-2"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Subir archivo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {attachments.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 border-2 border-dashed rounded-lg">
              <Paperclip className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay archivos adjuntos</p>
              <p className="text-sm mt-1">Arrastra archivos aquí o haz clic en &quot;Subir archivo&quot;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {attachments.map((attachment, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {/* Preview para imágenes */}
                  {isImage(attachment.type) && (
                    <div className="mb-3 rounded overflow-hidden bg-white dark:bg-gray-900">
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="w-full h-32 object-cover"
                      />
                    </div>
                  )}

                  {/* Icono para otros tipos */}
                  {!isImage(attachment.type) && (
                    <div className="mb-3 flex justify-center py-4">
                      {getFileIcon(attachment.type)}
                    </div>
                  )}

                  {/* Info del archivo */}
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate mb-2">
                    {attachment.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    {attachment.type}
                  </p>

                  {/* Acciones */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(attachment.url, '_blank')}
                    >
                      {isImage(attachment.type) ? (
                        <Eye className="h-3 w-3 mr-1" />
                      ) : (
                        <Download className="h-3 w-3 mr-1" />
                      )}
                      Ver
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => setAttachmentToDelete(attachment)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de confirmación */}
      <AlertDialog open={!!attachmentToDelete} onOpenChange={() => setAttachmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar archivo?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar &quot;{attachmentToDelete?.name}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
