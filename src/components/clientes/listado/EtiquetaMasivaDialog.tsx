'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
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
import {
  aplicarEtiquetaMasiva,
  mensajeErrorClientes,
  type OpcionFiltro,
} from '@/lib/services/clientesListadoService';

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
        quitar
          ? `Etiqueta «${valor}» quitada de ${n} ${n === 1 ? 'cliente' : 'clientes'}`
          : `Etiqueta «${valor}» agregada a ${n} ${n === 1 ? 'cliente' : 'clientes'}`,
      );
      onHecho();
      onAbiertoChange(false);
    } catch (err) {
      setError(mensajeErrorClientes(err, quitar ? 'No se pudo quitar la etiqueta.' : 'No se pudo agregar la etiqueta.'));
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !procesando && onAbiertoChange(v)}>
      <DialogContent className="max-w-[460px] border-line bg-surface text-fg">
        <DialogHeader>
          <DialogTitle className="text-fg">{quitar ? 'Quitar etiqueta' : 'Etiquetar clientes'}</DialogTitle>
          <DialogDescription className="text-fg-secondary">
            {quitar
              ? `Quita una etiqueta de los ${ids.length} clientes seleccionados.`
              : `Aplica una etiqueta a los ${ids.length} clientes seleccionados.`}
          </DialogDescription>
        </DialogHeader>

        <FormField etiqueta="Etiqueta" ayuda="Enter aplica la acción">
          <Input
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder="Nombre de etiqueta"
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
          <div className="flex flex-wrap gap-1.5" aria-label="Etiquetas frecuentes">
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
            Cancelar
          </Button>
          <Button onClick={() => void aplicar()} disabled={!etiqueta.trim() || procesando}>
            {procesando && <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />}
            {procesando ? 'Procesando…' : quitar ? 'Quitar etiqueta' : 'Aplicar etiqueta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
