'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Save, FileText } from 'lucide-react';

interface NotesTabProps {
  initialNotes: string;
  onSave: (notes: string) => Promise<void>;
}

export function NotesTab({ initialNotes, onSave }: NotesTabProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (value: string) => {
    setNotes(value);
    setHasChanges(value !== initialNotes);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(notes);
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving notes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Notas Internas
          </h3>
        </div>

        <Textarea
          placeholder="Agrega notas internas sobre esta reserva..."
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          rows={10}
          className="resize-none"
        />

        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasChanges ? 'Hay cambios sin guardar' : 'No hay cambios pendientes'}
          </p>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar Notas'}
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Nota:</strong> Estas notas son internas y no serán visibles para el huésped.
        </p>
      </Card>
    </div>
  );
}
