'use client';

/**
 * /app/pos/cajas/[id]/movimientos/nuevo — «Nuevo movimiento» (Figma
 * `359:59059`, móvil `360:145137`): envoltura de página del formulario único
 * `MovimientoCajaForm` con el efecto en el esperado de la caja.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EmptyState, PageHeader } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CajasService } from '../CajasService';
import { DebajoSesion, useMensajeErrorCaja, useMonedaCaja } from '../comunesCaja';
import { useResumenCaja } from '../useResumenCaja';
import { EfectoEnCaja, MovimientoCajaForm, datosParaGuardar, useMovimientoCajaForm } from './MovimientoCajaForm';

interface NuevoMovimientoPageProps {
  sessionUuid: string;
}

export function NuevoMovimientoPage({ sessionUuid }: NuevoMovimientoPageProps) {
  const t = useTranslations('cajas.mov');
  const tFicha = useTranslations('cajas.ficha');
  const router = useRouter();
  const { simbolo, formatear } = useMonedaCaja();
  const mensajeError = useMensajeErrorCaja();
  const { resumen, cargando, error, recargar } = useResumenCaja(sessionUuid, { ventas: false });
  const form = useMovimientoCajaForm();
  const [guardando, setGuardando] = useState(false);
  const volverA = `/app/pos/cajas/${sessionUuid}`;

  const guardar = async () => {
    if (!form.validar() || !resumen) return;
    setGuardando(true);
    try {
      const datos = datosParaGuardar(form.datos);
      await CajasService.addMovementToSession(resumen.sesion.id, datos);
      toast.success(t(datos.type === 'in' ? 'ingresoGuardado' : 'egresoGuardado'), {
        description: t('guardadoDescripcion', { monto: formatear(datos.amount) }),
      });
      router.push(volverA);
    } catch (e) {
      const codigo = (e as { codigo?: string })?.codigo;
      toast.error(t('errorGuardar'), { description: mensajeError(codigo, (e as Error)?.message) });
      setGuardando(false);
    }
  };

  const migas = [
    { etiqueta: tFicha('migaPos'), href: '/app/pos' },
    { etiqueta: tFicha('migaCajas'), href: '/app/pos/cajas' },
    { etiqueta: resumen ? tFicha('sesion', { id: resumen.sesion.id }) : '…', href: volverA },
    { etiqueta: t('titulo') },
  ];

  if (cargando && !resumen) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6" aria-busy="true">
        <PageHeader titulo={t('titulo')} variante="form" volverA={volverA} migas={migas} cargando />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    );
  }
  if (error || !resumen) {
    const noExiste = error === 'caja_no_encontrada' || error === 'caja_invalida';
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeader titulo={t('titulo')} variante="form" volverA="/app/pos/cajas" migas={migas} />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante={noExiste ? 'empty' : 'error'}
            titulo={noExiste ? tFicha('noExisteTitulo') : tFicha('errorTitulo')}
            descripcion={noExiste ? tFicha('noExisteDescripcion') : mensajeError(error)}
            onReintentar={noExiste ? undefined : () => void recargar()}
            accion={noExiste ? { etiqueta: tFicha('volverCajas'), href: '/app/pos/cajas' } : undefined}
          />
        </div>
      </div>
    );
  }
  if (resumen.sesion.status !== 'open') {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeader titulo={t('titulo')} variante="form" volverA={volverA} migas={migas} debajo={<DebajoSesion sesion={resumen.sesion} />} />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="forbidden"
            titulo={t('cerradaTitulo')}
            descripcion={t('cerradaDescripcion')}
            accion={{ etiqueta: tFicha('verCaja'), href: volverA }}
            accionSecundaria={{ etiqueta: tFicha('volverCajas'), href: '/app/pos/cajas' }}
          />
        </div>
      </div>
    );
  }

  const botones = (
    <>
      <Button variant="outline" className="h-10" onClick={() => router.push(volverA)} disabled={guardando}>
        {t('cancelar')}
      </Button>
      <Button className="h-10" onClick={() => void guardar()} disabled={guardando}>
        {guardando ? t('guardando') : t('guardar')}
      </Button>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 pb-24 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo', { id: resumen.sesion.id })}
        variante="form"
        volverA={volverA}
        migas={migas}
        acciones={botones}
        debajo={<DebajoSesion sesion={resumen.sesion} />}
      />
      <form
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <div className="min-w-0 lg:col-span-2">
          <MovimientoCajaForm datos={form.datos} onCambiar={form.cambiar} errorVisible={form.errorVisible} simbolo={simbolo} deshabilitado={guardando} />
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <EfectoEnCaja esperado={resumen.esperado.efectivo_esperado} tipo={form.datos.tipo} monto={form.datos.monto} formatear={formatear} />
          <div className="hidden gap-3 lg:grid lg:grid-cols-2">{botones}</div>
        </div>
      </form>
      <div className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-3 border-t border-line bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        {botones}
      </div>
    </div>
  );
}
