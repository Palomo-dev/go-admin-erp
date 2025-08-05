/**
 * Componente para mostrar archivos adjuntos de una notificación
 */

'use client';

import React from 'react';
import { Download, FileText, Image, Video, Music, Archive, File } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';

interface Attachment {
  name: string;
  url: string;
  type: string;
  size?: number;
}

interface NotificationAttachmentsProps {
  attachments: Attachment[];
}

export function NotificationAttachments({ attachments }: NotificationAttachmentsProps) {
  const getFileIcon = (type: string, fileName: string) => {
    const lowerType = type.toLowerCase();
    const lowerName = fileName.toLowerCase();
    
    if (lowerType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(lowerName)) {
      return <Image className="h-5 w-5 text-blue-500" />;
    }
    
    if (lowerType.startsWith('video/') || /\.(mp4|avi|mov|wmv|flv|webm)$/i.test(lowerName)) {
      return <Video className="h-5 w-5 text-purple-500" />;
    }
    
    if (lowerType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(lowerName)) {
      return <Music className="h-5 w-5 text-green-500" />;
    }
    
    if (lowerType.includes('pdf') || /\.pdf$/i.test(lowerName)) {
      return <FileText className="h-5 w-5 text-red-500" />;
    }
    
    if (lowerType.includes('document') || lowerType.includes('word') || 
        /\.(doc|docx|odt)$/i.test(lowerName)) {
      return <FileText className="h-5 w-5 text-blue-600" />;
    }
    
    if (lowerType.includes('sheet') || lowerType.includes('excel') || 
        /\.(xls|xlsx|ods|csv)$/i.test(lowerName)) {
      return <FileText className="h-5 w-5 text-green-600" />;
    }
    
    if (lowerType.includes('zip') || lowerType.includes('rar') || 
        /\.(zip|rar|7z|tar|gz)$/i.test(lowerName)) {
      return <Archive className="h-5 w-5 text-orange-500" />;
    }
    
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    
    return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  const getFileTypeBadge = (type: string, fileName: string) => {
    const lowerType = type.toLowerCase();
    const lowerName = fileName.toLowerCase();
    
    if (lowerType.startsWith('image/')) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Imagen</Badge>;
    }
    
    if (lowerType.startsWith('video/')) {
      return <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Video</Badge>;
    }
    
    if (lowerType.startsWith('audio/')) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Audio</Badge>;
    }
    
    if (lowerType.includes('pdf')) {
      return <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">PDF</Badge>;
    }
    
    if (lowerType.includes('document') || lowerType.includes('word')) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Documento</Badge>;
    }
    
    if (lowerType.includes('sheet') || lowerType.includes('excel')) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Hoja de cálculo</Badge>;
    }
    
    return <Badge variant="outline">Archivo</Badge>;
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      // Abrir en nueva pestaña para descargar
      window.open(attachment.url, '_blank');
    } catch (error) {
      console.error('Error al descargar archivo:', error);
    }
  };

  const isImageFile = (type: string, fileName: string) => {
    const lowerType = type.toLowerCase();
    const lowerName = fileName.toLowerCase();
    return lowerType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(lowerName);
  };

  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          Archivos Adjuntos ({attachments.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {attachments.map((attachment, index) => (
            <div 
              key={index}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {getFileIcon(attachment.type, attachment.name)}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate" title={attachment.name}>
                      {attachment.name}
                    </p>
                    {getFileTypeBadge(attachment.type, attachment.name)}
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{attachment.type}</span>
                    {attachment.size && (
                      <>
                        <span>•</span>
                        <span>{formatFileSize(attachment.size)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-4">
                {/* Vista previa para imágenes */}
                {isImageFile(attachment.type, attachment.name) && (
                  <div className="hidden sm:block">
                    <img 
                      src={attachment.url} 
                      alt={attachment.name}
                      className="w-12 h-12 object-cover rounded border"
                      onError={(e) => {
                        // Ocultar si no se puede cargar
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                <Button
                  onClick={() => handleDownload(attachment)}
                  variant="outline"
                  size="sm"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
