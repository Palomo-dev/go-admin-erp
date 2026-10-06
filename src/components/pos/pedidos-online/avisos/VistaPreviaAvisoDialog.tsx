'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Info, Loader2 } from 'lucide-react';
import { SegmentedControl } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { VARIABLES_PLANTILLA, type MomentoAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { AvisosError, enviarPrueba, leerVistaPrevia, type VistaPrevia } from './avisosClienteApi';

/**
 * «Vista previa» de un aviso (Figma 465:85523): correo o WhatsApp con los
 * datos del último pedido, las variables disponibles y «Enviarme una prueba»
 * (al correo de la sesión). El texto lo arma el servidor con la misma función
 * del envío real.
 */
export function VistaPreviaAvisoDialog({ momento, onCerrar }: { momento: MomentoAviso | null; onCerrar: () => void }) {
  const t = useTranslations('posAvisosCliente');
  const { toast } = useToast();
  const [canal, setCanal] = React.useState<'email' | 'whatsapp'>('email');
  const [vista, setVista] = React.useState<VistaPrevia | null>(null);
  const [error, setError] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    if (!momento) return;
    setVista(null);
    setError(false);
    setCanal('email');
    leerVistaPrevia(momento).then(setVista).catch(() => setError(true));
  }, [momento]);

  const prueba = async () => {
    if (!momento) return;
    setEnviando(true);
    try {
      const r = await enviarPrueba(momento);
      toast({ title: t('pruebaEnviada', { correo: r.para }) });
    } catch (err) {
      const codigo = err instanceof AvisosError ? err.codigo : 'error';
      toast({ title: t('pruebaError'), description: codigo === 'sin_proveedor' ? t('sinProveedor') : codigo === 'sin_correo' ? t('sinCorreoUsuario') : undefined, variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={!!momento} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent hideCloseButton className="flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-line bg-surface p-0 text-fg sm:max-w-[672px]">
        <div className="px-6 pt-6">
          <DialogTitle className="text-lg font-semibold leading-6 text-fg">
            {momento ? t('vistaPreviaTitulo', { plantilla: t(`momentos.${momento}.titulo`) }) : ''}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-[13px] text-fg-secondary">
            {t('vistaPreviaDescripcion', { pedido: vista?.pedido ?? '…' })}
          </DialogDescription>
          <SegmentedControl
            className="mt-4"
            etiqueta={t('canal')}
            tonoActivo="marca"
            valor={canal}
            onValorChange={setCanal}
            opciones={[
              { valor: 'email', etiqueta: t('col.correo') },
              { valor: 'whatsapp', etiqueta: t('col.whatsapp') },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-2 pt-4">
          <div className="rounded-xl bg-subtle p-4 text-[13px]">
            {error ? (
              <p className="text-danger-text">{t('vistaPreviaError')}</p>
            ) : !vista ? (
              <Loader2 aria-label={t('cargando')} className="mx-auto size-5 animate-spin text-fg-muted" />
            ) : (
              <>
                {canal === 'email' && (
                  <dl className="space-y-2 border-b border-line pb-3">
                    {[
                      [t('de'), vista.de],
                      [t('para'), vista.para],
                      [t('asunto'), vista.asunto],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-12 shrink-0 text-xs text-fg-muted">{k}</dt>
                        <dd className="text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className={canal === 'email' ? 'mt-3 whitespace-pre-line leading-6 text-fg' : 'whitespace-pre-line rounded-lg bg-surface p-3 leading-6 text-fg'}>
                  {vista.texto}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-fg-muted">{t('variables')}</span>
            {VARIABLES_PLANTILLA.map((v) => (
              <span key={v} className="rounded-full border border-line-strong px-2 text-xs leading-5 text-fg-secondary">{`{{${v}}}`}</span>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2.5 text-[13px] text-info-text">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>{t('vistaPreviaNota')}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 pb-6 pt-3">
          <button type="button" disabled={enviando || !vista} onClick={() => void prueba()} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            {enviando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {t('enviarPrueba')}
          </button>
          <button type="button" onClick={onCerrar} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            {t('cerrar')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
