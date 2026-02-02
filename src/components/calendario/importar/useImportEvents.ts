'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';
import { ImportableEvent, ImportResult, ParsedRow, ColumnMapping } from './types';

interface UseImportEventsProps {
  organizationId: number | null;
}

export function useImportEvents({ organizationId }: UseImportEventsProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const parseCSV = useCallback((content: string): string[][] => {
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    });
  }, []);

  const mapRowToEvent = useCallback((
    row: Record<string, string>,
    mappings: ColumnMapping[]
  ): ImportableEvent | null => {
    const event: Partial<ImportableEvent> = {};
    
    for (const mapping of mappings) {
      if (mapping.targetField && row[mapping.csvColumn]) {
        const value = row[mapping.csvColumn];
        
        if (mapping.targetField === 'all_day') {
          event.all_day = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'sí';
        } else if (mapping.targetField === 'start_at' || mapping.targetField === 'end_at') {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            event[mapping.targetField] = date.toISOString();
          }
        } else {
          (event as Record<string, unknown>)[mapping.targetField] = value;
        }
      }
    }
    
    if (!event.title || !event.start_at || !event.end_at) {
      return null;
    }
    
    return event as ImportableEvent;
  }, []);

  const validateRows = useCallback((
    rows: Record<string, string>[],
    mappings: ColumnMapping[]
  ): ParsedRow[] => {
    return rows.map((row, index) => {
      const errors: string[] = [];
      
      const titleMapping = mappings.find(m => m.targetField === 'title');
      const startMapping = mappings.find(m => m.targetField === 'start_at');
      const endMapping = mappings.find(m => m.targetField === 'end_at');
      
      if (!titleMapping || !row[titleMapping.csvColumn]) {
        errors.push('Falta el título');
      }
      
      if (!startMapping || !row[startMapping.csvColumn]) {
        errors.push('Falta la fecha de inicio');
      } else {
        const date = new Date(row[startMapping.csvColumn]);
        if (isNaN(date.getTime())) {
          errors.push('Fecha de inicio inválida');
        }
      }
      
      if (!endMapping || !row[endMapping.csvColumn]) {
        errors.push('Falta la fecha de fin');
      } else {
        const date = new Date(row[endMapping.csvColumn]);
        if (isNaN(date.getTime())) {
          errors.push('Fecha de fin inválida');
        }
      }
      
      return {
        rowNumber: index + 2,
        data: row,
        errors,
        isValid: errors.length === 0,
      };
    });
  }, []);

  const importEvents = useCallback(async (
    rows: Record<string, string>[],
    mappings: ColumnMapping[]
  ): Promise<ImportResult> => {
    if (!organizationId) {
      return { success: 0, failed: rows.length, errors: [{ row: 0, error: 'No hay organización seleccionada' }] };
    }

    setIsImporting(true);
    setProgress(0);

    const result: ImportResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    const batchSize = 50;
    const totalBatches = Math.ceil(rows.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, rows.length);
      const batch = rows.slice(batchStart, batchEnd);

      const eventsToInsert = batch
        .map((row, index) => {
          const event = mapRowToEvent(row, mappings);
          if (!event) {
            result.failed++;
            result.errors.push({ row: batchStart + index + 2, error: 'Datos incompletos' });
            return null;
          }
          return {
            organization_id: organizationId,
            title: event.title,
            description: event.description || null,
            location: event.location || null,
            start_at: event.start_at,
            end_at: event.end_at,
            all_day: event.all_day || false,
            color: event.color || '#3B82F6',
            event_type: event.event_type || 'custom',
            status: event.status || 'confirmed',
            metadata: { imported: true, import_date: new Date().toISOString() },
          };
        })
        .filter(Boolean);

      if (eventsToInsert.length > 0) {
        const { error } = await supabase
          .from('calendar_events')
          .insert(eventsToInsert);

        if (error) {
          result.failed += eventsToInsert.length;
          result.errors.push({ row: batchStart + 2, error: error.message });
        } else {
          result.success += eventsToInsert.length;
        }
      }

      setProgress(Math.round(((batchIndex + 1) / totalBatches) * 100));
    }

    setIsImporting(false);
    return result;
  }, [organizationId, mapRowToEvent]);

  const generateTemplate = useCallback(() => {
    const headers = ['title', 'description', 'location', 'start_at', 'end_at', 'all_day', 'color', 'event_type'];
    const exampleRow = [
      'Reunión de equipo',
      'Revisión semanal del proyecto',
      'Sala de conferencias',
      '2026-02-01T09:00:00',
      '2026-02-01T10:00:00',
      'false',
      '#3B82F6',
      'meeting',
    ];

    const csv = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_eventos.csv';
    a.click();
    
    URL.revokeObjectURL(url);
  }, []);

  return {
    isImporting,
    progress,
    parseCSV,
    validateRows,
    importEvents,
    generateTemplate,
  };
}
