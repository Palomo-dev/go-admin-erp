'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/kit';
import { useFormatoEntero, useKitT } from '@/components/kit/useIdiomaKit';
import { useMensajeErrorClientes } from '@/components/clientes/listado/useOperacionesClientes';
import { aplicarEtiquetaMasiva, type OpcionFiltro } from '@/lib/services/clientesListadoService';

/**
 * «Etiquetar clientes» / «Quitar etiqueta»: un solo diálogo con dos modos
 * (antes había dos copias en la misma pantalla). Un UPDATE en el servidor
 * (fn_clientes_etiqueta_masiva), no uno por cliente desde el navegador.
 */
export interface EtiquetaMasivaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  modo: 'agregar' | 'quitar';
  organizationId: number | null;
  ids: readonly string[];
  /** Etiquetas de la organización (chips de las más usadas). */
  sugerencias: readonly OpcionFiltro[];
  onHecho: () => void;
}

export function EtiquetaMasivaDialog({
  abierto,
  onAbiertoChange,
  modo,
  organizationId,
  ids,
  sugerencias,
  onHecho,
}: EtiquetaMasivaDialogProps) {
  const t = useTranslations('clientes.listado');
  const tk = useKitT();
  const entero = useFormatoEntero();
  const mensajeError = useMensajeErrorClientes();
  const [etiqueta, setEtiqueta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setEtiqueta('');
      setError(null);
    }
  }, [abierto]);

  const quitar = modo === 'quitar';
  const frecuentes = [...sugerencias].sort((a, b) => (b.cantidad ?? 0) - (a.cantidad ?? 0)).slice(0, 8);

  const aplicar = async () => {
    const valor = etiqueta.trim();
    if (!valor || !organizationId || ids.length === 0) return;
    setProcesando(true);
    setError(null);
    try {
      const n = await aplicarEtiquetaMasiva(organizationId, [...ids], valor, quitar);
      toast.success(
        t(quitar ? 'etiquetaMasiva.quitada' : 'etiquetaMasiva.agregada', { etiqueta: valor, count: n, n: entero(n) }),
      );
      onHecho();
      onAbiertoChange(false);
    } catch (err) {
      setError(mensajeError(err, quitar ? t('etiquetaMasiva.errorQuitar') : t('etiquetaMasiva.errorAgregar')));
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !procesando && onAbiertoChange(v)}>
      <DialogContent className="max-w-[460px] border-line bg-surface text-fg">
        <DialogHeader>
          <DialogTitle className="text-fg">{quitar ? t('etiquetaMasiva.tituloQuitar') : t('etiquetaMasiva.tituloAgregar')}</DialogTitle>
          <DialogDescription className="text-fg-secondary">
            {t(quitar ? 'etiquetaMasiva.descripcionQuitar' : 'etiquetaMasiva.descripcionAgregar', {
              count: ids.length,
              n: entero(ids.length),
            })}
          </DialogDescription>
        </DialogHeader>

        <FormField etiqueta={t('etiquetaMasiva.campo')} ayuda={t('etiquetaMasiva.ayuda')}>
          <Input
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder={t('etiquetaMasiva.placeholder')}
            maxLength={60}
            disabled={procesando}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && etiqueta.trim()) {
                e.preventDefault();
                void aplicar();
              }
            }}
            className="h-10"
          />
        </FormField>

        {frecuentes.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label={t('etiquetaMasiva.frecuentes')}>
            {frecuentes.map((s) => (
              <button
                key={s.valor}
                type="button"
                onClick={() => setEtiqueta(s.valor)}
                className="h-7 rounded-full border border-line-strong bg-surface px-2.5 text-xs font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {s.valor}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={procesando}>
            {tk('comun.cancelar')}
          </Button>
          <Button onClick={() => void aplicar()} disabled={!etiqueta.trim() || procesando}>
            {procesando && <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />}
            {procesando
              ? t('etiquetaMasiva.procesando')
              : quitar
                ? t('etiquetaMasiva.quitar')
                : t('etiquetaMasiva.aplicar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
