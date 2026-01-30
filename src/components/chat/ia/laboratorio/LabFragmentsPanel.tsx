'use client';

import { useState } from 'react';
import { FileText, Search, Tag, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { RetrievedFragment } from '@/lib/services/aiLabService';

interface LabFragmentsPanelProps {
  fragments: RetrievedFragment[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  loading: boolean;
}

export default function LabFragmentsPanel({
  fragments,
  selectedIds,
  onSelectionChange,
  loading
}: LabFragmentsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredFragments = fragments.filter(f =>
    f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    onSelectionChange(filteredFragments.map(f => f.id));
  };

  const deselectAll = () => {
    onSelectionChange([]);
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.8) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (similarity >= 0.6) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (similarity >= 0.4) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Fragmentos Recuperados
            <Badge variant="secondary" className="ml-2">
              {selectedIds.length}/{fragments.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="text-xs"
            >
              Todos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={deselectAll}
              className="text-xs"
            >
              Ninguno
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar en fragmentos..."
            className="pl-10 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {loading ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              Cargando fragmentos...
            </div>
          ) : filteredFragments.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              No se encontraron fragmentos
            </div>
          ) : (
            filteredFragments.map((fragment) => (
              <div
                key={fragment.id}
                className={`border rounded-lg p-3 transition-colors ${
                  selectedIds.includes(fragment.id)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds.includes(fragment.id)}
                    onCheckedChange={() => toggleSelection(fragment.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {fragment.title}
                      </h4>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge className={`text-xs ${getSimilarityColor(fragment.similarity)}`}>
                          {Math.round(fragment.similarity * 100)}%
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          P{fragment.priority}
                        </Badge>
                      </div>
                    </div>
                    
                    <p className={`text-sm text-gray-600 dark:text-gray-400 mt-1 ${
                      expandedId === fragment.id ? '' : 'line-clamp-2'
                    }`}>
                      {fragment.content}
                    </p>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex flex-wrap gap-1">
                        {fragment.tags.slice(0, 3).map((tag, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {tag}
                          </span>
                        ))}
                        {fragment.tags.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{fragment.tags.length - 3}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === fragment.id ? null : fragment.id)}
                        className="text-xs h-6 px-2"
                      >
                        {expandedId === fragment.id ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Menos
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Más
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
