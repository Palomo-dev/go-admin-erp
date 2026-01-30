'use client';

import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  StickyNote, 
  Plus, 
  Pin, 
  PinOff, 
  Trash2, 
  Loader2,
  Send
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ConversationNote } from '@/lib/services/conversationDetailService';

interface NotesPanelProps {
  notes: ConversationNote[];
  loading?: boolean;
  onAddNote: (note: string) => Promise<void>;
  onTogglePin: (noteId: string, isPinned: boolean) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}

export default function NotesPanel({
  notes,
  loading,
  onAddNote,
  onTogglePin,
  onDeleteNote
}: NotesPanelProps) {
  const [newNote, setNewNote] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      setIsAdding(true);
      await onAddNote(newNote.trim());
      setNewNote('');
      setShowForm(false);
    } catch (error) {
      console.error('Error agregando nota:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleAddNote();
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Notas Internas
            {notes.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {notes.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="h-8 w-8 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col">
        {/* Formulario para agregar nota */}
        {showForm && (
          <div className="mb-4 space-y-2">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe una nota interna..."
              className="min-h-[80px] resize-none"
              disabled={isAdding}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Ctrl + Enter para enviar
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setNewNote('');
                  }}
                  disabled={isAdding}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || isAdding}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Agregar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de notas */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8">
              <StickyNote className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay notas internas
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowForm(true)}
                className="mt-2 text-blue-600"
              >
                Agregar primera nota
              </Button>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  'p-3 rounded-lg border transition-colors',
                  note.is_pinned
                    ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                    : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                )}
              >
                {/* Header de la nota */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {note.is_pinned && (
                      <Pin className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(note.created_at), {
                        addSuffix: true,
                        locale: es
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => onTogglePin(note.id, !note.is_pinned)}
                      title={note.is_pinned ? 'Desfijar nota' : 'Fijar nota'}
                    >
                      {note.is_pinned ? (
                        <PinOff className="h-3 w-3 text-yellow-600" />
                      ) : (
                        <Pin className="h-3 w-3 text-gray-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => onDeleteNote(note.id)}
                      title="Eliminar nota"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Contenido de la nota */}
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {note.note}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
