'use client';

import { useState } from 'react';
import { Search, Layers, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Pipeline } from './types';

interface PipelineSearchSelectProps {
  pipelines: Pipeline[];
  selectedPipelineId: string;
  onSelect: (pipelineId: string) => void;
  label?: string;
}

export function PipelineSearchSelect({
  pipelines,
  selectedPipelineId,
  onSelect,
  label = 'Pipeline'
}: PipelineSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);

  const filteredPipelines = pipelines.filter(pipeline => {
    if (!searchTerm) return true;
    return pipeline.name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleSelect = (pipelineId: string) => {
    onSelect(pipelineId);
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-gray-700 dark:text-gray-300">{label} *</Label>
      )}
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-[44px] px-3 py-2 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {selectedPipeline ? (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {selectedPipeline.name}
                    </p>
                    {selectedPipeline.is_default && (
                      <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                        Por defecto
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Layers className="h-4 w-4" />
                <span>Selecciona un pipeline</span>
              </div>
            )}
            <Search className="h-4 w-4 shrink-0 text-gray-400 ml-2" />
          </Button>
        </PopoverTrigger>
        
        <PopoverContent className="w-[320px] p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700" align="start">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar pipeline..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                autoFocus
              />
            </div>
          </div>
          
          <ScrollArea className="h-[220px]">
            <div className="p-2 space-y-1">
              {filteredPipelines.length > 0 ? (
                filteredPipelines.map((pipeline) => (
                  <div
                    key={pipeline.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      pipeline.id === selectedPipelineId 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700' 
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => handleSelect(pipeline.id)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          {pipeline.name}
                        </p>
                        {pipeline.is_default && (
                          <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                            Default
                          </Badge>
                        )}
                      </div>
                    </div>
                    {pipeline.id === selectedPipelineId && (
                      <Check className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    )}
                  </div>
                ))
              ) : (
                <div className="py-8 text-center">
                  <Layers className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No se encontraron pipelines
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
