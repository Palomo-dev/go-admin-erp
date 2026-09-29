'use client';

/**
 * Pagos programados pendientes de aprobación (plan F10, D3/D7).
 *
 * - Aprobar registra el pago por el pago único (`fn_aprobar_pago_programado` →
 *   `fn_registrar_pago`) y exige `finance.approve`; quien programó no puede
 *   aprobar (segregación de funciones). La base lo vuelve a exigir: aquí solo
 *   se explica por qué el botón está deshabilitado.
 * - Rechazar pide motivo; cancelar es para quien lo programó.
 * - Recibe la lista ya cargada (listado o detalle) para no consultar dos veces.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { DialogoMotivo, Tarjeta, clasesBoton } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import type { ProgramacionLeida } from '@/lib/services/compras/lecturasCompras';

export type ProgramacionPanel = ProgramacionLeida & {
  cuenta?: { id: string; balance: number; proveedor: string | null; factura: string | null } | null;
};

export interface AprobacionesPanelProps {
  programaciones: readonly ProgramacionPanel[];
  moneda: ContextoMoneda;
  puedeAprobar: boolean;
  onCambio: () => void;
  /** En el detalle de una CxP no hace falta repetir proveedor y factura. */
  mostrarCuenta?: boolean;
  id?: string;
}

export function AprobacionesPanel({ programaciones, moneda, puedeAprobar, onCambio, mostrarCuenta = true, id }: AprobacionesPanelProps) {
  const t = useTranslations('cuentasPorPagar.aprobaciones');
  const te = useTranslations('cuentasPorPagar.errores');
  const { formatPlain, formatDateTime } = useFormatDate();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const [usuario, setUsuario] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<ProgramacionPanel | null>(null);
  const [errorRechazo, setErrorRechazo] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void supabase.auth.getUser().then(({ data }) => !cancelado && setUsuario(data.user?.id ?? null));
    return () => {
      cancelado = true;
    };
  }, []);

  const mensaje = (e: unknown) => {
    const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
    return te.has(codigo) ? te(codigo as never) : te('error_desconocido');
  };

  const decidir = async (p: ProgramacionPanel, accion: 'aprobar' | 'cancelar') => {
    setOcupado(p.id);
    try {
      if (accion === 'aprobar') await clienteCompras.aprobarProgramacion(p.id, null);
      else await clienteCompras.cancelarProgramacion(p.id, null);
      toastSuccess(accion === 'aprobar' ? t('aprobado', { monto: formatear(p.amount) }) : t('cancelado'));
      onCambio();
    } catch (e) {
      toastError(mensaje(e));
    } finally {
      setOcupado(null);
    }
  };

  const rechazar = async (motivo: string) => {
    if (!rechazando) return;
    setOcupado(rechazando.id);
    setErrorRechazo(null);
    try {
      await clienteCompras.rechazarProgramacion(rechazando.id, motivo);
      toastSuccess(t('rechazado'));
      setRechazando(null);
      onCambio();
    } catch (e) {
      setErrorRechazo(mensaje(e));
    } finally {
      setOcupado(null);
    }
  };

  const pendientes = programaciones.filter((p) => p.status === 'pending');
  if (pendientes.length === 0) return null;

  return (
    <Tarjeta id={id} titulo={t('titulo', { n: pendientes.length })} descripcion={t('descripcion')} icono={ShieldCheck} tono="advertencia">
      <ul className="flex flex-col divide-y divide-line pb-2">
        {pendientes.map((p) => {
          const propia = !!usuario && p.requested_by === usuario;
          const motivoAprobar = !puedeAprobar ? t('motivos.sinPermiso') : propia ? t('motivos.propia') : undefined;
          return (
            <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium tabular-nums text-fg">
                  {formatear(p.amount)} · {t('para', { fecha: formatPlain(p.scheduled_date) })}
                </span>
                <span className="truncate text-xs text-fg-secondary">
                  {[
                    mostrarCuenta && p.cuenta ? [p.cuenta.proveedor, p.cuenta.factura].filter(Boolean).join(' · ') : null,
                    p.reference,
                    p.notes,
                    t('solicitado', { fecha: formatDateTime(p.requested_at) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {propia && (
                  <button type="button" disabled={ocupado === p.id} onClick={() => void decidir(p, 'cancelar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                    <Ban aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {t('cancelar')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!puedeAprobar || ocupado === p.id}
                  title={!puedeAprobar ? t('motivos.sinPermiso') : undefined}
                  onClick={() => {
                    setErrorRechazo(null);
                    setRechazando(p);
                  }}
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                >
                  <XCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('rechazar')}
                </button>
                <button
                  type="button"
                  disabled={!!motivoAprobar || ocupado === p.id}
                  title={motivoAprobar}
                  aria-describedby={motivoAprobar ? `motivo-aprobar-${p.id}` : undefined}
                  onClick={() => void decidir(p, 'aprobar')}
                  className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
                >
                  <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('aprobar')}
                </button>
                {motivoAprobar && (
                  <span id={`motivo-aprobar-${p.id}`} className="sr-only">
                    {motivoAprobar}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <DialogoMotivo
        abierto={!!rechazando}
        onAbiertoChange={(v) => !v && !ocupado && setRechazando(null)}
        titulo={t('rechazo.titulo')}
        descripcion={rechazando ? t('rechazo.descripcion', { monto: formatear(rechazando.amount) }) : undefined}
        textoConfirmar={t('rechazar')}
        minimo={3}
        cargando={!!ocupado}
        error={errorRechazo}
        onConfirmar={(motivo) => void rechazar(motivo)}
      />
    </Tarjeta>
  );
}
