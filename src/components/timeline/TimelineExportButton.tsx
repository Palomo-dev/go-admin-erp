'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import type { TimelineFilters } from '@/lib/services/timelineService';
import timelineService from '@/lib/services/timelineService';

interface TimelineExportButtonProps {
  organizationId: number;
  filters: TimelineFilters;
  disabled?: boolean;
}

export function TimelineExportButton({
  organizationId,
  filters,
  disabled,
}: TimelineExportButtonProps) {
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const { toast } = useToast();

  const handleExportJSON = async () => {
    try {
      setExporting('json');
      const data = await timelineService.exportToJSON(organizationId, filters);
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timeline-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación exitosa',
        description: `Se exportaron ${data.length} eventos en formato JSON`,
      });
    } catch (error) {
      console.error('Error exporting JSON:', error);
      toast({
        title: 'Error',
        description: 'No se pudo exportar los datos',
        variant: 'destructive',
      });
    } finally {
      setExporting(null);
    }
  };

  const handleExportCSV = async () => {
    try {
      setExporting('csv');
      const csv = await timelineService.exportToCSV(organizationId, filters);
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timeline-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Exportación exitosa',
        description: 'Se exportaron los eventos en formato CSV',
      });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast({
        title: 'Error',
        description: 'No se pudo exportar los datos',
        variant: 'destructive',
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || exporting !== null}
          className="border-gray-300 dark:border-gray-600"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleExportJSON} disabled={exporting !== null}>
          <FileJson className="h-4 w-4 mr-2" />
          Exportar JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportCSV} disabled={exporting !== null}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Exportar CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
