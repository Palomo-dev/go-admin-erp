'use client';

import React, { useState } from 'react';
import {
  File,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Sheet,
  Download,
  Copy,
  Trash2,
  MoreVertical,
  ExternalLink,
  Loader2,
  User,
  Bot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { ConversationFile } from '@/lib/services/conversationFilesService';
import { formatDate } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

// Función helper para obtener URL pública de archivo
const getFilePublicUrl = (bucket: string, path: string): string => {
  if (!bucket || !path) return '';
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
};

interface FileCardProps {
  file: ConversationFile;
  onDownload: (file: ConversationFile) => Promise<void>;
  onCopyLink: (file: ConversationFile) => Promise<void>;
  onDelete?: (file: ConversationFile) => Promise<void>;
  canDelete?: boolean;
}

export default function FileCard({
  file,
  onDownload,
  onCopyLink,
  onDelete,
  canDelete = false
}: FileCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="h-8 w-8" />;
    if (mimeType.startsWith('video/')) return <Video className="h-8 w-8" />;
    if (mimeType.startsWith('audio/')) return <Music className="h-8 w-8" />;
    if (mimeType.includes('pdf')) return <FileText className="h-8 w-8" />;
    if (mimeType.includes('word') || mimeType.includes('document')) return <FileText className="h-8 w-8" />;
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return <Sheet className="h-8 w-8" />;
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return <Archive className="h-8 w-8" />;
    return <File className="h-8 w-8" />;
  };

  const getFileCategory = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'Imagen';
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'Documento';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Hoja de cálculo';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'Archivo comprimido';
    return 'Archivo';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSenderInfo = () => {
    if (!file.message) return { name: 'Desconocido', icon: <User className="h-3 w-3" /> };
    
    if (file.message.role === 'customer') {
      return {
        name: file.message.customer?.full_name || 'Cliente',
        icon: <User className="h-3 w-3" />
      };
    }
    if (file.message.role === 'agent') {
      return {
        name: 'Agente',
        icon: <User className="h-3 w-3" />
      };
    }
    if (file.message.role === 'ai') {
      return {
        name: 'IA',
        icon: <Bot className="h-3 w-3" />
      };
    }
    return { name: 'Sistema', icon: <User className="h-3 w-3" /> };
  };

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await onDownload(file);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    try {
      setIsDeleting(true);
      await onDelete(file);
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const sender = getSenderInfo();
  const isImage = file.mime_type.startsWith('image/');

  return (
    <>
      <Card className="group hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Preview / Icon */}
            <div className="flex-shrink-0">
              {isImage ? (
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                  <img
                    src={getFilePublicUrl(file.storage_bucket, file.storage_path)}
                    alt={file.file_name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  {getFileIcon(file.mime_type)}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 dark:text-white truncate" title={file.file_name}>
                {file.file_name}
              </h3>
              
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <Badge variant="outline" className="text-xs">
                  {getFileCategory(file.mime_type)}
                </Badge>
                <span>{formatFileSize(file.size_bytes)}</span>
              </div>

              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  {sender.icon}
                  <span>{sender.name}</span>
                </div>
                <span>•</span>
                <span>{formatDate(file.created_at)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-start gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Descargar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopyLink(file)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar enlace
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.open(getFilePublicUrl(file.storage_bucket, file.storage_path), '_blank')}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir en nueva pestaña
                  </DropdownMenuItem>
                  {canDelete && onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 dark:text-red-400"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar archivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El archivo "{file.file_name}" será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
