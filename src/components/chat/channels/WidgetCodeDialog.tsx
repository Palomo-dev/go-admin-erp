'use client';

/**
 * «Instalar el chat en tu sitio web» (diseño aprobado
 * 94-chat-recuperado-canales-11): se abre desde el menú de la fila del chat del
 * sitio web en Canales. Pestañas «Código» e «Instrucciones», el código REAL
 * (el mismo del detalle del canal: un solo generador, `codigoDelWidget`), la
 * clave pública con «Copiar» y la nota de dominios. Escritorio: diálogo;
 * móvil: hoja inferior (`PanelAdaptable` no aplica: la cabecera lleva el ícono
 * del canal y no una caja tintada).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Info, X } from 'lucide-react';
import { SegmentedControl, clasesBoton } from '@/components/kit';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ChatChannel } from '@/lib/services/chatChannelsService';
import { codigoDelWidget } from '@/lib/chat/codigoWidget';
import { CanalIcono } from '@/components/chat/ui/CanalIcono';

interface WidgetCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChatChannel | null;
}

const PASOS = ['paso1', 'paso2', 'paso3', 'paso4', 'paso5'] as const;

export default function WidgetCodeDialog({ open, onOpenChange, channel }: WidgetCodeDialogProps) {
  const t = useTranslations('chatDialogos.codigoWidget');
  const [pestana, setPestana] = useState<'codigo' | 'pasos'>('codigo');
  const [copiadoCodigo, setCopiadoCodigo] = useState(false);
  const [copiadaClave, setCopiadaClave] = useState(false);

  if (!channel) return null;
  const codigo = codigoDelWidget(channel.public_key);

  const copiar = async (texto: string, marcar: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(texto);
      marcar(true);
      setTimeout(() => marcar(false), 2000);
    } catch {
      /* el texto está a la vista para copiarlo a mano */
    }
  };
  const copiarCodigo = () => copiar(codigo, setCopiadoCodigo);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setPestana('codigo');
        onOpenChange(v);
      }}
    >
      <DialogContent
        hideCloseButton
        className="flex max-h-[90vh] w-[calc(100%-32px)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-line bg-surface p-0 text-fg sm:max-w-[672px] sm:rounded-2xl max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:translate-y-0 max-sm:rounded-b-none"
      >
        <div className="flex items-start gap-3 border-b border-line px-6 pb-4 pt-6">
          <CanalIcono canal="web" size={24} className="mt-0.5 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-lg font-semibold leading-6 text-fg">{t('titulo')}</DialogTitle>
            <DialogDescription className="text-sm leading-5 text-fg-secondary">{t('descripcion')}</DialogDescription>
          </div>
          <button
            type="button"
            aria-label={t('cerrar')}
            onClick={() => onOpenChange(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <SegmentedControl
            anchoCompleto
            etiqueta={t('titulo')}
            valor={pestana}
            onValorChange={setPestana}
            opciones={[
              { valor: 'codigo', etiqueta: t('pestanaCodigo') },
              { valor: 'pasos', etiqueta: t('pestanaPasos') },
            ]}
          />

          {pestana === 'codigo' ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-fg">{t('codigo')}</p>
                <button type="button" onClick={copiarCodigo} className={clasesBoton({ variante: 'tinte', tamano: 'sm' })}>
                  {copiadoCodigo ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                  {copiadoCodigo ? t('copiado') : t('copiarCodigo')}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-solid-neutral p-4 font-mono text-xs leading-5 text-on-solid">
                <code className="whitespace-pre-wrap break-all">{codigo}</code>
              </pre>
              <div className="flex items-center gap-3 rounded-lg border border-line-brand bg-brand-tint px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-brand-deep">{t('clave')}</p>
                  <p className="truncate font-mono text-[13px] text-fg">{channel.public_key}</p>
                </div>
                <button
                  type="button"
                  disabled={!channel.public_key}
                  onClick={() => channel.public_key && copiar(channel.public_key, setCopiadaClave)}
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                >
                  {copiadaClave ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                  {copiadaClave ? t('copiadoCorto') : t('copiar')}
                </button>
              </div>
              <p className="flex items-start gap-2 rounded-lg bg-subtle px-4 py-3 text-[13px] leading-[18px] text-fg-secondary">
                <Info aria-hidden="true" className="mt-px size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <span>
                  {t('notaTitulo')} {t('nota')}
                </span>
              </p>
            </>
          ) : (
            <ol className="flex flex-col gap-3">
              {PASOS.map((paso, i) => (
                <li key={paso} className="flex items-start gap-3 rounded-lg bg-subtle p-3">
                  <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-action text-sm font-semibold text-fg-on-brand">
                    {i + 1}
                  </span>
                  <p className="pt-1 text-sm text-fg-secondary">{t(paso, { etiqueta: '</body>' })}</p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onOpenChange(false)} className={clasesBoton({ variante: 'secundario' })}>
            {t('cerrar')}
          </button>
          <button type="button" onClick={copiarCodigo} className={clasesBoton()}>
            {copiadoCodigo ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {copiadoCodigo ? t('copiado') : t('copiarCodigo')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
