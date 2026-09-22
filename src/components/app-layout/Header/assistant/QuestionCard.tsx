'use client';

import React from 'react';
import { MessageSquareMore, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PendingQuestion } from '@/lib/ai/assistant/clientTypes';

interface Props {
  question: PendingQuestion;
  /** El usuario tocó una opción: se manda como su mensaje. */
  onAnswer: (texto: string) => void;
  /** "Otro": se cierra la tarjeta y se enfoca el composer. */
  onOther: () => void;
}

/**
 * Pregunta con opciones, al estilo de Claude: A, B, C… y "Otro". Sustituye
 * al formulario de campos. Tocar una opción la envía como respuesta; el
 * modelo sigue con ese dato. Es la misma tarjeta que se lee en voz alta.
 */
export default function QuestionCard({ question, onAnswer, onOther }: Props) {
  return (
    <section
      aria-label="Pregunta del asistente"
      className="rounded-xl border border-blue-200 bg-blue-50/60 shadow-sm dark:border-blue-800 dark:bg-blue-900/20"
    >
      <div className="flex items-start gap-2 border-b border-blue-100 p-4 dark:border-blue-800">
        <MessageSquareMore className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{question.question}</p>
      </div>
      <div className="flex flex-col gap-2 p-3" role="group" aria-label="Opciones">
        {question.options.map((o) => (
          <Button
            key={o.key}
            variant="outline"
            onClick={() => onAnswer(o.label)}
            className="min-h-11 justify-start gap-3 bg-white text-left dark:bg-gray-800"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {o.key}
            </span>
            <span className="whitespace-normal">{o.label}</span>
          </Button>
        ))}
        {question.allowOther && (
          <Button variant="ghost" onClick={onOther} className="min-h-11 justify-start gap-3 text-gray-600 dark:text-gray-300">
            <PenLine className="h-4 w-4" aria-hidden="true" />
            Otro: lo escribo
          </Button>
        )}
      </div>
    </section>
  );
}
