'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ImportFragmentData } from '@/lib/services/knowledgeService';

interface PreviewTableProps {
  fragments: ImportFragmentData[];
  maxPreview?: number;
}

export default function PreviewTable({ 
  fragments, 
  maxPreview = 10 
}: PreviewTableProps) {
  const previewFragments = fragments.slice(0, maxPreview);
  const hasMore = fragments.length > maxPreview;

  if (fragments.length === 0) {
    return (
      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardContent className="py-12 text-center">
          <Eye className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            No hay fragmentos para previsualizar
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            Carga un archivo o pega texto para ver la vista previa
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Vista Previa
          </CardTitle>
          <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
            {fragments.length} fragmentos detectados
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 dark:border-gray-700">
                <TableHead className="text-gray-600 dark:text-gray-400 w-10">#</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400">Título</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400">Contenido</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400">Tags</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400 text-center w-20">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewFragments.map((fragment, index) => {
                const isValid = fragment.title?.trim() && fragment.content?.trim();
                return (
                  <TableRow 
                    key={index}
                    className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <TableCell className="text-gray-500 dark:text-gray-400 font-mono text-sm">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                        {fragment.title || <span className="text-red-500 italic">Sin título</span>}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-gray-600 dark:text-gray-400 text-sm truncate max-w-[300px]">
                        {fragment.content?.substring(0, 100) || <span className="text-red-500 italic">Sin contenido</span>}
                        {(fragment.content?.length || 0) > 100 && '...'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(fragment.tags || []).slice(0, 3).map((tag, idx) => (
                          <Badge 
                            key={idx} 
                            variant="outline"
                            className="text-xs border-gray-300 dark:border-gray-600"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {(fragment.tags || []).length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{fragment.tags!.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {isValid ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-yellow-500 mx-auto" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {hasMore && (
          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            ...y {fragments.length - maxPreview} fragmentos más
          </p>
        )}

        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>{fragments.filter(f => f.title?.trim() && f.content?.trim()).length} válidos</span>
          </div>
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <span>{fragments.filter(f => !f.title?.trim() || !f.content?.trim()).length} con errores</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
