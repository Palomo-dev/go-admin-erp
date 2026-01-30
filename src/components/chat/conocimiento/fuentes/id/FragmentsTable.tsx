'use client';

import { useState } from 'react';
import { 
  FileText, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Power, 
  Check,
  X,
  Search,
  Plus,
  Tag,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { KnowledgeFragment } from '@/lib/services/knowledgeService';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface FragmentsTableProps {
  fragments: KnowledgeFragment[];
  loading: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onEdit: (fragment: KnowledgeFragment) => void;
  onDelete: (fragment: KnowledgeFragment) => void;
  onToggle: (fragment: KnowledgeFragment) => void;
  onCreateFragment: () => void;
  onViewDetail?: (fragment: KnowledgeFragment) => void;
  isAdmin?: boolean;
}

export default function FragmentsTable({
  fragments,
  loading,
  searchTerm,
  onSearchChange,
  onEdit,
  onDelete,
  onToggle,
  onCreateFragment,
  onViewDetail,
  isAdmin = true
}: FragmentsTableProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const allTags = Array.from(
    new Set(fragments.flatMap(f => f.tags || []))
  ).sort();

  const filteredFragments = fragments.filter(fragment => {
    const matchesSearch = !searchTerm || 
      fragment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fragment.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTags = selectedTags.length === 0 ||
      selectedTags.every(tag => (fragment.tags || []).includes(tag));

    return matchesSearch && matchesTags;
  });

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card className="border-gray-200 dark:border-gray-700">
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar fragmentos por título o contenido..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
          />
        </div>
        <Button 
          onClick={onCreateFragment}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Fragmento
        </Button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Tag className="h-4 w-4" />
            Filtrar por etiquetas:
          </span>
          {allTags.map(tag => (
            <Badge
              key={tag}
              variant={selectedTags.includes(tag) ? 'default' : 'outline'}
              className={`cursor-pointer transition-colors ${
                selectedTags.includes(tag)
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
              {selectedTags.includes(tag) && (
                <X className="h-3 w-3 ml-1" />
              )}
            </Badge>
          ))}
          {selectedTags.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedTags([])}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      {filteredFragments.length === 0 ? (
        <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {searchTerm || selectedTags.length > 0 
                ? 'No se encontraron fragmentos' 
                : 'Sin fragmentos'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {searchTerm || selectedTags.length > 0
                ? 'Intenta con otros términos de búsqueda o filtros'
                : 'Comienza agregando fragmentos de conocimiento a esta fuente'}
            </p>
            {!searchTerm && selectedTags.length === 0 && (
              <Button 
                onClick={onCreateFragment}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Primer Fragmento
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 dark:border-gray-700">
                <TableHead className="text-gray-600 dark:text-gray-400">Título</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400">Etiquetas</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400 text-center">Estado</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400 text-center">Indexado</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400">Actualizado</TableHead>
                <TableHead className="text-gray-600 dark:text-gray-400 w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFragments.map((fragment) => (
                <TableRow 
                  key={fragment.id}
                  className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <TableCell>
                    <div 
                      className={`flex items-start gap-3 ${onViewDetail ? 'cursor-pointer' : ''}`}
                      onClick={() => onViewDetail?.(fragment)}
                    >
                      <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-gray-900 dark:text-white truncate ${onViewDetail ? 'hover:text-blue-600 dark:hover:text-blue-400' : ''}`}>
                          {fragment.title}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                          {fragment.content.substring(0, 100)}...
                        </p>
                      </div>
                    </div>
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
                        <Badge 
                          variant="outline"
                          className="text-xs border-gray-300 dark:border-gray-600"
                        >
                          +{fragment.tags!.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant={fragment.is_active ? 'default' : 'secondary'}
                      className={fragment.is_active 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }
                    >
                      {fragment.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {fragment.has_embedding ? (
                      <div className="flex justify-center">
                        <div className="p-1 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                          <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-center">
                        <div className="p-1 bg-gray-100 dark:bg-gray-800 rounded-full">
                          <X className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(new Date(fragment.updated_at), { 
                      addSuffix: true, 
                      locale: es 
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onEdit(fragment)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggle(fragment)}>
                          <Power className="h-4 w-4 mr-2" />
                          {fragment.is_active ? 'Desactivar' : 'Activar'}
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => onDelete(fragment)}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="text-sm text-gray-500 dark:text-gray-400">
        Mostrando {filteredFragments.length} de {fragments.length} fragmentos
      </div>
    </div>
  );
}
