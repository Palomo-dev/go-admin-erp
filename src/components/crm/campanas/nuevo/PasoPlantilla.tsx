'use client';

/**
 * Paso 2 · Agente o plantilla (Figma CRM 1402:17), canal WhatsApp: tarjetas
 * con las plantillas APROBADAS por Meta del número elegido y, debajo, el
 * recuadro «Así se ve el mensaje» con las variables ya resueltas. Las variables
 * sin valor por defecto se piden aquí y se aplican a todos los contactos.
 *
 * Los datos salen del mismo `useWhatsAppCompose` del compositor (sin otra
 * lógica de plantillas).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { FormField } from '@/components/kit/FormField';
import { Skeleton } from '@/components/kit';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import type { ComposeState } from '@/components/crm/whatsapp/compose/useWhatsAppCompose';

export function PasoPlantilla({ c }: { c: ComposeState }) {
  const t = useTranslations('crm.campanasAsistente');
  const activos = c.channels.filter((x) => x.status === 'active');
  // Las que faltaban siguen visibles mientras se escriben (la vista previa ya no
  // las cuenta como faltantes en cuanto tienen valor).
  const faltantes = [...new Set([...(c.preview?.missing ?? []), ...Object.keys(c.variables)])];
  const quedan = c.preview?.missing.length ?? 0;

  return (
    <div className="space-y-5">
      {activos.length > 1 && (
        <FormField etiqueta={t('contenido.numero')}>
          {(campo) => (
            <SelectCrm
              id={campo.id}
              valor={c.channelId ?? ''}
              onValorChange={(v) => {
                c.setChannelId(v || null);
                c.setTemplateId(null);
              }}
              opciones={activos.map((x) => ({ valor: x.id, etiqueta: x.name }))}
            />
          )}
        </FormField>
      )}

      <div className="space-y-2">
        <p id="campana-plantilla" className="text-[13px] font-medium leading-[18px] text-fg">
          {t('contenido.plantillaWhatsapp')}
        </p>
        {c.loadingTemplates ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : c.templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong p-4 text-center">
            <p className="text-sm font-medium text-fg">{t('contenido.sinPlantillas')}</p>
            <p className="mt-1 text-[13px] text-fg-secondary">{t('contenido.sinPlantillasDescripcion')}</p>
            <Link href="/app/crm/plantillas?pestana=whatsapp" className="mt-2 inline-block text-[13px] font-medium text-brand hover:underline">
              {t('contenido.irAPlantillas')}
            </Link>
          </div>
        ) : (
          <div role="radiogroup" aria-labelledby="campana-plantilla" className="grid gap-3 md:grid-cols-2">
            {c.templates.map((tp) => {
              const sel = tp.id === c.templateId;
              return (
                <button
                  key={tp.id}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => c.setTemplateId(tp.id)}
                  className={cn(
                    'flex flex-col gap-1 rounded-xl border bg-surface p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    sel ? 'border-2 border-brand bg-brand-tint' : 'border-line hover:bg-hover',
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <FileText aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">{tp.name}</span>
                    {sel && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={2} />}
                  </span>
                  <span className="text-[13px] leading-[18px] text-fg-secondary">
                    {t('contenido.categoriaIdioma', { categoria: t(`contenido.categorias.${tp.meta.category}`), idioma: tp.meta.language })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {c.templateId && (
        <div className="space-y-3 rounded-xl border border-line bg-subtle p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-fg">{t('contenido.asiSeVe')}</p>
            {c.previewing && <Loader2 aria-hidden="true" className="size-4 animate-spin text-fg-muted" strokeWidth={1.5} />}
          </div>
          {c.preview ? (
            <>
              {c.preview.header && <p className="text-sm font-semibold text-fg">{c.preview.header}</p>}
              <p className="whitespace-pre-line text-sm leading-5 text-fg">{c.preview.body}</p>
              {c.preview.footer && <p className="text-xs text-fg-secondary">{c.preview.footer}</p>}
              <p className="text-xs text-fg-secondary">{t('contenido.variablesNota')}</p>
            </>
          ) : (
            <Skeleton className="h-12 rounded-lg" />
          )}
        </div>
      )}

      {faltantes.length > 0 && (
        <div className="space-y-3">
          <p className={cn('text-[13px]', quedan > 0 ? 'text-warning-text' : 'text-fg-secondary')}>{t('contenido.variablesFaltantes')}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {faltantes.map((k) => (
              <FormField key={k} etiqueta={t('contenido.variable', { nombre: k })} obligatorio>
                <input className={CLASE_CAMPO} value={c.variables[k] ?? ''} onChange={(e) => c.setVariable(k, e.target.value)} />
              </FormField>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
