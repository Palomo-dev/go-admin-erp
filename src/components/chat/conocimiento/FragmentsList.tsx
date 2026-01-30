'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  Search,
  Tag,
  CheckCircle,
  XCircle,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft
} from 'lucide-react';
import type { KnowledgeFragment, KnowledgeSource } from '@/lib/services/knowledgeService';
import { useState } from 'react';

interface FragmentsListProps {
  fragments: KnowledgeFragment[];
  loading: boolean;
  source?: KnowledgeSource | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onEdit: (fragment: KnowledgeFragment) => void;
  onDelete: (fragment: KnowledgeFragment) => void;
  onBack?: () => void;
  onCreateFragment: () => void;
}

export default function FragmentsList({
  fragments,
  loading,
  source,
  searchTerm,
  onSearchChange,
  onEdit,
  onDelete,
  onBack,
  onCreateFragment
}: FragmentsListProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const allTags = Array.from(
    new Set(fragments.flatMap(f => f.tags || []))
  ).sort();

  const filteredFragments = fragments.filter(fragment => {
    if (selectedTags.length > 0) {
      const hasAllTags = selectedTags.every(tag => 
        (fragment.tags || []).includes(tag)
      );
      if (!hasAllTags) return false;
    }
    return true;
  });

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {source ? `Fragmentos de "${source.name}"` : 'Todos los Fragmentos'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filteredFragments.length} fragmentos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar fragmentos..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 w-64 bg-white dark:bg-gray-800"
            />
          </div>
          <Button
            onClick={onCreateFragment}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Nuevo Fragmento
          </Button>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-4 w-4 text-gray-500" />
          {allTags.map(tag => (
            <Badge
              key={tag}
              variant="outline"
              className={`cursor-pointer transition-colors ${
                selectedTags.includes(tag)
                  ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Badge>
          ))}
          {selectedTags.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTags([])}
              className="text-xs"
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : filteredFragments.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No hay fragmentos
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {searchTerm || selectedTags.length > 0
              ? 'No se encontraron fragmentos con los filtros aplicados'
              : 'Crea tu primer fragmento de conocimiento'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFragments.map((fragment) => (
            <Card
              key={fragment.id}
              className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">
                      {fragment.title}
                    </h3>
                    {fragment.has_embedding ? (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    {!fragment.is_active && (
                      <Badge variant="outline" className="text-xs">
                        Inactivo
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-3">
                    {fragment.content}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {(fragment.tags || []).length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {fragment.tags.slice(0, 3).map(tag => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs px-1.5 py-0"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {fragment.tags.length > 3 && (
                          <span>+{fragment.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {fragment.positive_feedback}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsDown className="h-3 w-3" />
                        {fragment.negative_feedback}
                      </span>
                    </div>
                    <span>Prioridad: {fragment.priority}</span>
                    <span>Usos: {fragment.usage_count}</span>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(fragment)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onDelete(fragment)}
                      className="text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
