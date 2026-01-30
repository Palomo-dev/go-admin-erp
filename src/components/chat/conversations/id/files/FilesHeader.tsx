'use client';

import React from 'react';
import { ArrowLeft, HardDrive, FileText, Image, Video, Music, Archive } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileStats } from '@/lib/services/conversationFilesService';

interface FilesHeaderProps {
  conversationId: string;
  stats: FileStats | null;
  loading?: boolean;
}

export default function FilesHeader({ conversationId, stats, loading }: FilesHeaderProps) {
  const router = useRouter();

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const typeIcons: Record<string, React.ReactNode> = {
    image: <Image className="h-4 w-4" />,
    video: <Video className="h-4 w-4" />,
    audio: <Music className="h-4 w-4" />,
    pdf: <FileText className="h-4 w-4" />,
    document: <FileText className="h-4 w-4" />,
    archive: <Archive className="h-4 w-4" />,
    other: <FileText className="h-4 w-4" />
  };

  const typeLabels: Record<string, string> = {
    image: 'Imágenes',
    video: 'Videos',
    audio: 'Audios',
    pdf: 'PDFs',
    document: 'Documentos',
    spreadsheet: 'Hojas de cálculo',
    archive: 'Archivos',
    other: 'Otros'
  };

  return (
    <div className="border-b dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/app/chat/conversations/${conversationId}`)}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Archivos de la conversación
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Todos los archivos compartidos en esta conversación
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        {!loading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Total</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                      {stats.totalFiles}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg">
                    <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-purple-600 dark:text-purple-400">Tamaño</p>
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                      {formatSize(stats.totalSize)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {Object.entries(stats.byType).slice(0, 2).map(([type, count]) => (
              <Card 
                key={type} 
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400">
                      {typeIcons[type] || typeIcons.other}
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {typeLabels[type] || type}
                      </p>
                      <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                        {count}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Type badges */}
        {!loading && stats && Object.keys(stats.byType).length > 2 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(stats.byType).slice(2).map(([type, count]) => (
              <Badge 
                key={type} 
                variant="outline" 
                className="flex items-center gap-1"
              >
                {typeIcons[type] || typeIcons.other}
                {typeLabels[type] || type}: {count}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
