'use client';

/**
 * GO Asistente — turno en curso (Figma `AsistentePasos` 662:16000:
 * pensando / consultando / escribiendo; pantalla 04 `667:35749`).
 *
 * - **Pensando**: todavía no llegó nada. Tres puntos (quietos con
 *   `prefers-reduced-motion`).
 * - **Consultando**: los pasos reales del servidor (`tool_start`/`tool_end`),
 *   con ✓ al terminar y su resultado («→ 12»), o un giro mientras corre.
 * - **Escribiendo**: en cuanto llega el primer token los pasos se pliegan a
 *   «N pasos · Ver» y el texto se escribe con un cursor.
 *
 * Accesibilidad: esta burbuja NO es `aria-live` (releería el bloque entero en
 * cada token, §11.7). El panel anuncia solo el cambio de fase en una región
 * `status` aparte.
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import { CircleCheck, CircleX, Loader2 } from 'lucide-react';
import { faseDelTurno, pasoTerminado, type PasoTurno } from '@/lib/ai/assistant/panelUi';
import MarkdownRenderer from '../MarkdownRenderer';

function Paso({ paso }: { paso: PasoTurno }) {
  const hecho = pasoTerminado(paso);
  return (
    <li className="flex items-start gap-2 text-[13px] leading-[18px] text-fg-secondary">
      {!hecho ? (
        <Loader2 className="mt-px h-4 w-4 shrink-0 animate-spin text-brand motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
      ) : paso.ok === false ? (
        <CircleX className="mt-px h-4 w-4 shrink-0 text-danger-text" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <CircleCheck className="mt-px h-4 w-4 shrink-0 text-success-text" strokeWidth={1.5} aria-hidden="true" />
      )}
      <span className="min-w-0 break-words">
        {paso.label || paso.name}
        {paso.summary ? ` → ${paso.summary}` : ''}
      </span>
    </li>
  );
}

export default function TurnInProgress({ pasos, texto }: { pasos: PasoTurno[]; texto: string }) {
  const t = useTranslations('asistente.pasos');
  const fase = faseDelTurno(pasos, texto);

  return (
    <div className="w-full space-y-2 rounded-xl bg-subtle px-3 py-2.5" aria-busy="true">
      {fase === 'pensando' && (
        <div className="flex items-center gap-2 py-0.5 text-[13px] text-fg-secondary">
          <span className="flex gap-1" aria-hidden="true">
            {[0, 150, 300].map((retraso) => (
              <span
                key={retraso}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-muted motion-reduce:animate-none"
                style={{ animationDelay: `${retraso}ms` }}
              />
            ))}
          </span>
          {t('pensando')}
        </div>
      )}

      {fase === 'consultando' && (
        <ul className="space-y-1.5" aria-label={t('enCurso')}>
          {pasos.map((paso, i) => (
            <Paso key={`${paso.name}-${i}`} paso={paso} />
          ))}
        </ul>
      )}

      {fase === 'escribiendo' && (
        <>
          {pasos.length > 0 && (
            <details className="text-xs text-fg-muted">
              <summary className="cursor-pointer select-none rounded outline-none focus-visible:ring-2 focus-visible:ring-brand">
                {t('plegados', { n: pasos.length })}
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {pasos.map((paso, i) => (
                  <Paso key={`${paso.name}-${i}`} paso={paso} />
                ))}
              </ul>
            </details>
          )}
          <div className="text-fg">
            <MarkdownRenderer content={texto} />
            <span
              className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-brand motion-reduce:animate-none"
              aria-hidden="true"
            />
          </div>
        </>
      )}
    </div>
  );
}
