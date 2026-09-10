'use client';

import { useState } from 'react';
import { Loader2, Plus, StickyNote } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { toast } from '@/components/ui/use-toast';

/**
 * QuickNoteDialog (F9) — nota rápida (tabla `notes`) vía POST /api/crm/notes.
 */
export interface QuickNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relatedType: 'opportunity' | 'customer';
  relatedId: string;
  initialBody?: string;
  onCreated?: (row: { id: string }) => void;
}

export function QuickNoteDialog({ open, onOpenChange, relatedType, relatedId, initialBody, onCreated }: QuickNoteDialogProps) {
  const [body, setBody] = useState(initialBody ?? '');
  const [saving, setSaving] = useState(false);
  const hasText = body.replace(/<[^>]*>/g, '').trim().length > 0;

  const handleSave = async () => {
    if (!hasText) return;
    setSaving(true);
    try {
      const res = await fetch('/api/crm/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ related_type: relatedType, related_id: relatedId, body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
      toast({ title: 'Nota guardada' });
      onCreated?.(json.data);
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'No se pudo guardar la nota', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <StickyNote className="h-5 w-5 text-amber-500" />
            Nueva nota
          </DialogTitle>
          <DialogDescription>Se guarda en {relatedType === 'opportunity' ? 'la oportunidad' : 'el cliente'} y aparece en el timeline.</DialogDescription>
        </DialogHeader>
        <div className="py-1">
          <RichTextEditor value={body} onChange={setBody} placeholder="Escribe una nota…" minHeight={120} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSave} disabled={saving || !hasText}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
