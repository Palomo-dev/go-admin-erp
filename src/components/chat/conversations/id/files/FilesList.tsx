'use client';

import React, { useState } from 'react';
import { Search, Filter, Loader2, FileX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import FileCard from './FileCard';
import { ConversationFile } from '@/lib/services/conversationFilesService';

interface FilesListProps {
  files: ConversationFile[];
  loading: boolean;
  onDownload: (file: ConversationFile) => Promise<void>;
  onCopyLink: (file: ConversationFile) => Promise<void>;
  onDelete?: (file: ConversationFile) => Promise<void>;
  canDelete?: boolean;
}

export default function FilesList({
  files,
  loading,
  onDownload,
  onCopyLink,
  onDelete,
  canDelete = false
}: FilesListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [senderFilter, setSenderFilter] = useState<string>('all');

  const getFileCategory = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'spreadsheet';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'archive';
    return 'other';
  };

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.file_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || getFileCategory(file.mime_type) === typeFilter;
    const matchesSender = senderFilter === 'all' || file.message?.role === senderFilter;
    
    return matchesSearch && matchesType && matchesSender;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar archivos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="image">Imágenes</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
            <SelectItem value="audio">Audios</SelectItem>
            <SelectItem value="pdf">PDFs</SelectItem>
            <SelectItem value="document">Documentos</SelectItem>
            <SelectItem value="spreadsheet">Hojas de cálculo</SelectItem>
            <SelectItem value="archive">Comprimidos</SelectItem>
            <SelectItem value="other">Otros</SelectItem>
          </SelectContent>
        </Select>

        <Select value={senderFilter} onValueChange={setSenderFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Enviado por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="customer">Cliente</SelectItem>
            <SelectItem value="agent">Agente</SelectItem>
            <SelectItem value="ai">IA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Files List */}
      {filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <FileX className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            {files.length === 0 ? 'No hay archivos' : 'No se encontraron archivos'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {files.length === 0 
              ? 'Aún no se han compartido archivos en esta conversación'
              : 'Intenta ajustar los filtros de búsqueda'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onDownload={onDownload}
              onCopyLink={onCopyLink}
              onDelete={onDelete}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {files.length > 0 && (
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
          Mostrando {filteredFiles.length} de {files.length} archivos
        </div>
      )}
    </div>
  );
}
