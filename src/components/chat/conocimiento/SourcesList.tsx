'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Database,
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  Power,
  Eye,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';
import type { KnowledgeSource } from '@/lib/services/knowledgeService';

interface SourcesListProps {
  sources: KnowledgeSource[];
  loading: boolean;
  onEdit: (source: KnowledgeSource) => void;
  onDelete: (source: KnowledgeSource) => void;
  onToggle: (source: KnowledgeSource) => void;
  onViewFragments: (source: KnowledgeSource) => void;
}

export default function SourcesList({
  sources,
  loading,
  onEdit,
  onDelete,
  onToggle,
  onViewFragments
}: SourcesListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="text-center py-12">
        <Database className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No hay fuentes de conocimiento
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Crea tu primera fuente para comenzar a agregar información
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sources.map((source) => (
        <Card
          key={source.id}
          className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
          onClick={() => onViewFragments(source)}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                source.is_active 
                  ? 'bg-blue-100 dark:bg-blue-900/30' 
                  : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                {source.icon ? (
                  <span className="text-xl">{source.icon}</span>
                ) : (
                  <Database className={`h-5 w-5 ${
                    source.is_active 
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`} />
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {source.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge 
                    variant="outline"
                    className={source.is_active 
                      ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
                      : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400'
                    }
                  >
                    {source.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                  {source.has_embeddings && (
                    <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      Indexada
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewFragments(source); }}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Fragmentos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(source); }}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggle(source); }}>
                  <Power className="h-4 w-4 mr-2" />
                  {source.is_active ? 'Desactivar' : 'Activar'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={(e) => { e.stopPropagation(); onDelete(source); }}
                  className="text-red-600 dark:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {source.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
              {source.description}
            </p>
          )}

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <FileText className="h-4 w-4" />
              <span>{source.fragment_count} fragmentos</span>
            </div>
            <div className="flex items-center gap-1">
              {source.has_embeddings ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
