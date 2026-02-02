'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Plus, Send, Loader2 } from 'lucide-react';

export interface SessionNote {
  id: string;
  content: string;
  created_at: string;
  created_by?: string;
}

interface SessionNotesProps {
  notes: SessionNote[];
  isLoading: boolean;
  onAddNote: (content: string) => Promise<void>;
}

export function SessionNotes({ notes, isLoading, onAddNote }: SessionNotesProps) {
  const [showForm, setShowForm] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!newNote.trim()) return;

    setIsSaving(true);
    try {
      await onAddNote(newNote.trim());
      setNewNote('');
      setShowForm(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Notas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Notas
        </CardTitle>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar Nota
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <Textarea
              placeholder="Escribe una nota..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[80px] bg-white dark:bg-gray-800"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setNewNote('');
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!newNote.trim() || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        )}

        {notes.length === 0 && !showForm ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            No hay notas registradas
          </p>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                  {note.content}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(note.created_at).toLocaleString('es-ES', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                  {note.created_by && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">•</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {note.created_by}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
