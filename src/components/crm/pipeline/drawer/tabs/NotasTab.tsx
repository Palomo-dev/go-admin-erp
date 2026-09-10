'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { toast } from '@/components/ui/use-toast';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import type { OpportunityNote } from '@/components/crm/oportunidades/types';
import type { DrawerTabProps } from './types';

/** Pestaña Notas (extraída de OpportunityDrawer :866-934): editor + lista con fijar/eliminar. */
const formatDateTime = (d: string) => new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function NotasTab({ opportunity, active }: DrawerTabProps) {
  const [notes, setNotes] = useState<OpportunityNote[] | null>(null);
  const [body, setBody] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setNotes(await opportunitiesService.getOpportunityNotes(opportunity.id));
  }, [opportunity.id]);

  useEffect(() => {
    if (active && notes === null) void load();
  }, [active, notes, load]);

  const add = async () => {
    if (!body.replace(/<[^>]*>/g, '').trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/crm/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ related_type: 'opportunity', related_id: opportunity.id, body }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.error || `Error ${res.status}`);
      setBody('');
      await load();
      toast({ title: 'Nota agregada' });
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo agregar la nota', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    try { await opportunitiesService.deleteNote(id); await load(); toast({ title: 'Nota eliminada' }); }
    catch { toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' }); }
  };
  const togglePin = async (id: string, pinned: boolean) => {
    try { await opportunitiesService.toggleNotePin(id, pinned); await load(); }
    catch { toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' }); }
  };

  if (!active) return null;

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <RichTextEditor value={body} onChange={setBody} placeholder="Escribe una nota..." minHeight={60} className="mb-2 bg-white dark:bg-gray-800" />
        <Button type="button" size="sm" onClick={add} disabled={adding || !body.replace(/<[^>]*>/g, '').trim()} className="w-full h-8 text-xs">
          {adding ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}Agregar nota
        </Button>
      </div>
      {notes === null ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No hay notas registradas.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className={`flex items-start gap-3 p-3 rounded-lg border ${note.is_pinned ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'}`}>
              <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><StickyNote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /></div>
              <div className="flex-1 min-w-0">
                <HtmlContentRenderer html={note.body} className="text-sm text-gray-700 dark:text-gray-300" />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {note.user?.first_name ? `${note.user.first_name} ${note.user.last_name ?? ''} · ` : ''}{formatDateTime(note.created_at)}{note.is_pinned && ' · Fijada'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => togglePin(note.id, note.is_pinned)} className="text-gray-400 hover:text-blue-500 p-1" title={note.is_pinned ? 'Desfijar' : 'Fijar'} aria-label={note.is_pinned ? 'Desfijar' : 'Fijar'}>
                      {note.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" onClick={() => remove(note.id)} className="text-gray-400 hover:text-red-500 p-1" title="Eliminar" aria-label="Eliminar nota"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
