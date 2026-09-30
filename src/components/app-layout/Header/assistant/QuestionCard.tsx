'use client';

import React, { useEffect, useId, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MessageSquare, PenLine } from 'lucide-react';
import type { PendingQuestion } from '@/lib/ai/assistant/clientTypes';
import { opcionPorTecla } from '@/lib/ai/assistant/panelUi';

interface Props {
  question: PendingQuestion;
  /** El usuario tocó una opción: se manda como su mensaje. */
  onAnswer: (texto: string) => void;
  /** "Otro": se cierra la tarjeta y se enfoca el composer. */
  onOther: () => void;
  /** En escritorio la tarjeta toma el foco al aparecer, para que A/B/C funcionen ya. */
  enfocar?: boolean;
}

/**
 * Pregunta con opciones, al estilo de Claude: A, B, C… y «Otro» (Figma
 * `AsistentePregunta` 662:16001, pantalla 05 `667:36162`). Sustituye al
 * formulario de campos —decisión del dueño—: tocar una opción la envía como
 * respuesta y el modelo sigue con ese dato.
 *
 * Teclado (Figma: «Atajo: pulsa A, B o C»): con el foco en la tarjeta, la letra
 * elige la opción; «O» escribe «Otro». Sin
 * modificadores: Ctrl+C sigue copiando. Es un `radiogroup` implícito hecho de
 * botones: cada uno se puede alcanzar con Tab y leer completo.
 */
/** «A, B o C» en el idioma de la persona; sin `Intl.ListFormat`, con comas. */
function listaDisyuntiva(elementos: string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { type: 'disjunction' }).format(elementos);
  } catch {
    return elementos.join(', ');
  }
}

export default function QuestionCard({ question, onAnswer, onOther, enfocar = false }: Props) {
  const t = useTranslations('asistente.pregunta');
  const ref = useRef<HTMLElement>(null);
  const idAtajo = useId();

  useEffect(() => {
    if (enfocar) ref.current?.focus({ preventScroll: true });
  }, [enfocar]);

  const locale = useLocale();
  const letras = listaDisyuntiva(question.options.map((o) => o.key), locale);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Las teclas de los botones internos (Enter/Espacio) siguen su curso.
    const opcion = opcionPorTecla(e, question.options);
    if (opcion) {
      e.preventDefault();
      onAnswer(opcion.label);
      return;
    }
    if (question.allowOther && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toUpperCase() === 'O') {
      e.preventDefault();
      onOther();
    }
  };

  return (
    <section
      ref={ref}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-label={t('etiqueta')}
      aria-describedby={idAtajo}
      className="overflow-hidden rounded-xl border border-line-brand bg-surface outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex items-start gap-2 bg-brand-tint px-4 py-3">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-sm font-medium leading-5 text-fg">{question.question}</p>
      </div>
      <div className="flex flex-col gap-2 p-3" role="group" aria-label={t('opciones')}>
        {question.options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onAnswer(o.label)}
            aria-keyshortcuts={o.key}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-action text-xs font-semibold text-fg-on-brand">
              {o.key}
            </span>
            <span className="min-w-0 whitespace-normal">{o.label}</span>
          </button>
        ))}
        {question.allowOther && (
          <button
            type="button"
            onClick={onOther}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-fg-secondary outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <PenLine className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {t('otro')}
          </button>
        )}
        <p id={idAtajo} className="px-1 text-xs font-medium text-fg-muted">
          {t('atajo', { letras })}
        </p>
      </div>
    </section>
  );
}
