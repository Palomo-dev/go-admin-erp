'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, FileJson, FileSpreadsheet } from 'lucide-react';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import { ExportFiltersForm } from './ExportFiltersForm';
import type { TimelineFilters } from '@/lib/services/timelineService';
import type { CreateExportInput } from '@/lib/services/timelineExportsService';

interface NewExportDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateExportInput) => Promise<void>;
}

export function NewExportDialog({ open, onClose, onSubmit }: NewExportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'filters'>('basic');
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [filters, setFilters] = useState<TimelineFilters>({
    startDate: startOfDay(subDays(new Date(), 7)).toISOString(),
    endDate: endOfDay(new Date()).toISOString(),
  });

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        format,
        filters,
      });
      handleClose();
    } catch (error) {
      console.error('Error creating export:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setFormat('json');
    setFilters({
      startDate: startOfDay(subDays(new Date(), 7)).toISOString(),
      endDate: endOfDay(new Date()).toISOString(),
    });
    setActiveTab('basic');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Exportación</DialogTitle>
          <DialogDescription>
            Configura los filtros y genera una exportación del timeline de auditoría.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'basic' | 'filters')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Información</TabsTrigger>
            <TabsTrigger value="filters">Filtros</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                placeholder="Ej: Auditoría Ventas Enero 2024"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Describe el propósito de esta exportación..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Formato */}
            <div className="space-y-2">
              <Label>Formato de exportación</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={format === 'json' ? 'default' : 'outline'}
                  className={format === 'json' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                  onClick={() => setFormat('json')}
                >
                  <FileJson className="h-4 w-4 mr-2" />
                  JSON
                </Button>
                <Button
                  type="button"
                  variant={format === 'csv' ? 'default' : 'outline'}
                  className={format === 'csv' ? 'bg-green-600 hover:bg-green-700' : ''}
                  onClick={() => setFormat('csv')}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  CSV
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {format === 'json' 
                  ? 'JSON incluye todos los campos y payloads completos.'
                  : 'CSV es ideal para análisis en hojas de cálculo.'}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="filters" className="mt-4">
            <ExportFiltersForm
              filters={filters}
              onFiltersChange={setFilters}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exportando...
              </>
            ) : (
              'Crear y Descargar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
