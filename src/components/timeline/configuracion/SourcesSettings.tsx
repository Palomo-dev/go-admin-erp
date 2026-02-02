'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Layers, CheckSquare, Square } from 'lucide-react';
import { SOURCE_TABLE_LABELS, SOURCE_TABLE_COLORS } from '@/lib/services/timelineService';
import type { TimelineSettings } from '@/lib/services/timelineSettingsService';
import { cn } from '@/utils/Utils';

interface SourcesSettingsProps {
  settings: TimelineSettings;
  availableSources: string[];
  onChange: (visibleSources: string[]) => void;
}

export function SourcesSettings({ settings, availableSources, onChange }: SourcesSettingsProps) {
  const handleToggleSource = (source: string) => {
    const newSources = settings.visibleSources.includes(source)
      ? settings.visibleSources.filter(s => s !== source)
      : [...settings.visibleSources, source];
    onChange(newSources);
  };

  const handleSelectAll = () => {
    onChange(availableSources);
  };

  const handleDeselectAll = () => {
    onChange([]);
  };

  const allSelected = settings.visibleSources.length === availableSources.length;
  const noneSelected = settings.visibleSources.length === 0;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-500" />
              Fuentes Visibles
            </CardTitle>
            <CardDescription>
              Selecciona qué tipos de eventos se muestran por defecto en el timeline.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">
            {settings.visibleSources.length} de {availableSources.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Acciones rápidas */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={allSelected}
            className="text-xs"
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1" />
            Seleccionar todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeselectAll}
            disabled={noneSelected}
            className="text-xs"
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            Deseleccionar todas
          </Button>
        </div>

        {/* Lista de fuentes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {availableSources.map((source) => {
            const isChecked = settings.visibleSources.includes(source);
            return (
              <div
                key={source}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  isChecked
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
                onClick={() => handleToggleSource(source)}
              >
                <Checkbox
                  id={source}
                  checked={isChecked}
                  onCheckedChange={() => handleToggleSource(source)}
                />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={source}
                    className="text-sm font-medium cursor-pointer block"
                  >
                    {SOURCE_TABLE_LABELS[source] || source}
                  </Label>
                  <code className="text-xs text-gray-400 dark:text-gray-500">
                    {source}
                  </code>
                </div>
                <Badge 
                  variant="secondary" 
                  className={cn('text-xs', SOURCE_TABLE_COLORS[source])}
                >
                  {source.split('_')[0]}
                </Badge>
              </div>
            );
          })}
        </div>

        {/* Advertencia si ninguna seleccionada */}
        {noneSelected && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              <strong>Advertencia:</strong> No hay fuentes seleccionadas. El timeline no mostrará eventos.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
