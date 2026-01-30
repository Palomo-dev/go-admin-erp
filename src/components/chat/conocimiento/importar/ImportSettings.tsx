'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, Database, Zap, Tag } from 'lucide-react';
import { KnowledgeSource } from '@/lib/services/knowledgeService';

interface ImportSettingsProps {
  sources: KnowledgeSource[];
  selectedSourceId: string | null;
  generateEmbeddings: boolean;
  defaultTags: string[];
  onSourceChange: (sourceId: string | null) => void;
  onEmbeddingsChange: (generate: boolean) => void;
  onTagsChange: (tags: string[]) => void;
}

export default function ImportSettings({
  sources,
  selectedSourceId,
  generateEmbeddings,
  defaultTags,
  onSourceChange,
  onEmbeddingsChange,
  onTagsChange
}: ImportSettingsProps) {
  const handleTagInput = (value: string) => {
    const tags = value.split(',').map(t => t.trim()).filter(Boolean);
    onTagsChange(tags);
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Configuración de Importación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Database className="h-4 w-4" />
            Fuente de Conocimiento
          </Label>
          <Select 
            value={selectedSourceId || 'none'} 
            onValueChange={(value) => onSourceChange(value === 'none' ? null : value)}
          >
            <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
              <SelectValue placeholder="Selecciona una fuente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin fuente específica</SelectItem>
              {sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.icon && <span className="mr-2">{source.icon}</span>}
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Los fragmentos se asociarán a esta fuente
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Etiquetas por Defecto
          </Label>
          <input
            type="text"
            value={defaultTags.join(', ')}
            onChange={(e) => handleTagInput(e.target.value)}
            placeholder="tag1, tag2, tag3"
            className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Se agregarán a todos los fragmentos importados (separadas por coma)
          </p>
        </div>

        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Generar Embeddings</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Indexar automáticamente para búsqueda semántica
              </p>
            </div>
          </div>
          <Switch
            checked={generateEmbeddings}
            onCheckedChange={onEmbeddingsChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
