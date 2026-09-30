'use client';

/**
 * «Estás viendo solo Sucursal Norte» (Figma «Gerente de sede»): quien no tiene
 * acceso a todas las sucursales ve el porqué de lo bloqueado y puede pedir
 * acceso. La solicitud avisa a los administradores (una por persona cada
 * pocas horas); el acceso lo da un administrador en Miembros.
 */
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clasesBoton } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { clienteReportes } from '@/lib/services/reportes/clienteReportes';
import { useMensajeError } from './useMensajeError';
import type { ContextoReportes } from './useContextoReportes';

export function AvisoAlcance({ ctx, reportId }: { ctx: ContextoReportes; reportId?: string }) {
  const t = useTranslations('reportes.alcance');
  const mensajeError = useMensajeError();
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);

  if (ctx.cargando || ctx.accesoTotal) return null;
  const nombres = ctx.sucursales.map((s) => s.nombre);
  const sucursales = nombres.length === 0 ? t('ninguna') : nombres.join(', ');

  const solicitar = async () => {
    setEnviando(true);
    try {
      const r = await clienteReportes.solicitarAcceso({ reportId: reportId ?? null, sucursalId: ctx.sucursalEncabezado });
      setEnviada(true);
      toastSuccess(r.repetida ? t('yaSolicitada') : t('solicitada'));
    } catch (e) {
      toastError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-subtle p-4">
      <Lock aria-hidden className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">{t('titulo', { sucursales, n: nombres.length })}</p>
        <p className="text-[13px] text-fg-secondary">{t('descripcion', { n: nombres.length })}</p>
      </div>
      <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void solicitar()} disabled={enviando || enviada}>
        {enviada ? t('botonEnviada') : t('boton')}
      </button>
    </div>
  );
}
