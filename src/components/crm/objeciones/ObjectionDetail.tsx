'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Pencil } from 'lucide-react';
import { Dialogo, clasesBoton } from '@/components/kit';
import type { Objection } from '@/lib/services/crm/objectionService';
import { ObjectionEvidence } from './ObjectionEvidence';
export function ObjectionDetail({
  objection,
  onClose,
  onEdit,
  canManage,
}: {
  canManage: boolean;
  objection: Objection | null;
  onClose: () => void;
  onEdit: (row: Objection) => void;
}) {
  const t = useTranslations('crm.objecionesNuevo');
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(objection?.recommended_response ?? '');
      setCopyState('done');
    } catch {
      setCopyState('error');
    }
  };
  return (
    <Dialogo
      abierto={!!objection}
      onAbiertoChange={(open) => {
        if (!open) {
          setCopyState('idle');
          onClose();
        }
      }}
      titulo={objection?.title ?? t('title')}
      descripcion={t('detailHint')}
      ancho={672}
      primario={{ etiqueta: t('close'), onClick: onClose }}
    >
      {objection && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-line bg-subtle px-2 py-1 text-xs text-fg-secondary">
              {t.has(`categories.${objection.category}`)
                ? t(`categories.${objection.category}`)
                : objection.category}
            </span>
            {canManage && (
              <button
                className={clasesBoton({ variante: 'secundario' })}
                onClick={() => {
                  onClose();
                  onEdit(objection);
                }}
              >
                <Pencil className="size-4" />
                {t('edit')}
              </button>
            )}
          </div>
          <section>
            <h3 className="font-semibold text-fg">{t('signals')}</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {objection.detection_signals?.map((signal) => (
                <li
                  key={signal}
                  className="rounded-full border border-line bg-subtle px-2 py-1 text-xs text-fg-secondary"
                >
                  {signal}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-line-brand bg-brand-tint p-4">
            <h3 className="font-semibold text-brand-deep">{t('recommended')}</h3>
            <p className="mt-2 text-sm text-fg">
              {objection.recommended_response ?? t('noResponse')}
            </p>
            {objection.recommended_response && (
              <button
                className={`${clasesBoton({ variante: 'secundario' })} mt-3`}
                onClick={() => void copy()}
              >
                <Copy className="size-4" />
                {t(copyState === 'done' ? 'copied' : 'copy')}
              </button>
            )}
            {copyState === 'error' && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {t('copyError')}
              </p>
            )}
          </section>
          <section>
            <h3 className="font-semibold text-fg">{t('questions')}</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-fg-secondary">
              {objection.discovery_questions?.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
          <ObjectionEvidence key={objection.id} id={objection.id} />
        </div>
      )}
    </Dialogo>
  );
}
