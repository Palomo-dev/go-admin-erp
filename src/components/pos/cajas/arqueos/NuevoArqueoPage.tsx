'use client';

/**
 * /app/pos/cajas/[id]/arqueos/nuevo — «Nuevo arqueo» (Figma `359:57136`,
 * `360:144952` móvil; paso 8 de docs/implementacion/CAJAS-VENTAS-PLAN.md).
 *
 * - Tipo de arqueo (apertura · parcial · cierre) con la ayuda de que un arqueo
 *   de tipo «Cierre» NO cierra la caja.
 * - Efectivo por billetes y monedas de la moneda de la organización
 *   (`ConteoEfectivo`) y los demás métodos (`ConteoPorMetodo`), cada uno contra
 *   su propio esperado.
 * - El esperado viene del servidor (`GET /api/pos/cajas/[id]/resumen`): con
 *   cierre ciego y sin permiso no llega y se ve «Oculto».
 * - Observación obligatoria si hay diferencia; confirmación antes de guardar
 *   con diferencia (Figma `C-ArqueoDif` `360:145358`).
 * - Guarda por `pos_caja_registrar_arqueo` (solo lo contado; el servidor
 *   calcula esperado, diferencia y `method_breakdown`, y exige la caja abierta).
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardList, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo, EmptyState, FormField, PageHeader, SegmentedControl, Tarjeta } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { diferenciasPorMetodo, observacionObligatoria, totalesConteo, type TipoArqueo } from '@/lib/pos/cajas/arqueo';
import { conteoParaGuardar, denominacionesDe, totalDenominaciones, type ConteoDenominaciones } from '@/lib/pos/cajas/denominaciones';
import { CajasService } from '../CajasService';
import { ConteoEfectivo } from '../conteo/ConteoEfectivo';
import { ConteoPorMetodo } from '../conteo/ConteoPorMetodo';
import { ResumenArqueo } from '../conteo/ResumenArqueo';
import { DebajoSesion, useMensajeErrorCaja, useMetodosPagoActivos, useMonedaCaja } from '../comunesCaja';
import { useEtiquetaMetodoPago } from '../paymentMethodLabels';
import { useResumenCaja } from '../useResumenCaja';

interface NuevoArqueoPageProps {
  sessionUuid: string;
}

const MAX_NOTAS = 1000;

export function NuevoArqueoPage({ sessionUuid }: NuevoArqueoPageProps) {
  const t = useTranslations('cajas.arqueo');
  const tFicha = useTranslations('cajas.ficha');
  const router = useRouter();
  const { moneda, simbolo, formatear } = useMonedaCaja();
  const etiquetaMetodo = useEtiquetaMetodoPago();
  const mensajeError = useMensajeErrorCaja();
  const metodosActivos = useMetodosPagoActivos();
  const { resumen, cargando, error, recargar } = useResumenCaja(sessionUuid, { ventas: false });

  const [tipo, setTipo] = useState<TipoArqueo>('partial');
  const [denominaciones, setDenominaciones] = useState<ConteoDenominaciones>({});
  const [efectivoManual, setEfectivoManual] = useState<number | null>(null);
  const [otros, setOtros] = useState<Record<string, number | null>>({});
  const [notas, setNotas] = useState('');
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const volverA = `/app/pos/cajas/${sessionUuid}`;
  const conLista = denominacionesDe(moneda.code) !== null;
  const efectivoContado = conLista ? totalDenominaciones(denominaciones) : efectivoManual ?? 0;
  const visible = resumen?.verImportes ?? false;

  const filas = useMemo(
    () => diferenciasPorMetodo(visible ? resumen?.esperado.por_metodo ?? {} : null, { ...otros, cash: efectivoContado }, metodosActivos),
    [visible, resumen, otros, efectivoContado, metodosActivos],
  );
  const totales = useMemo(() => totalesConteo(filas), [filas]);
  const notasObligatorias = observacionObligatoria(totales.diferenciaTotal);
  const errorNotas = intentoGuardar && notasObligatorias && !notas.trim() ? t('notasObligatorias') : null;
  const nadaContado = totales.totalContado <= 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      const porMetodo: Record<string, number> = {};
      for (const [k, v] of Object.entries(otros)) if (v !== null && v > 0) porMetodo[k] = v;
      const guardado = await CajasService.createCashCountByUuid(sessionUuid, {
        count_type: tipo,
        counted_amount: efectivoContado,
        counted_by_method: porMetodo,
        denominations: conLista ? conteoParaGuardar(denominaciones) : undefined,
        notes: notas.trim() || undefined,
      });
      const dif = guardado.difference;
      toast.success(t('guardado'), {
        description: dif !== null && dif !== undefined ? t('guardadoDiferencia', { monto: formatear(Number(dif)) }) : t('guardadoSinCifras'),
      });
      router.push(volverA);
    } catch (e) {
      const m = (e as { message?: string })?.message ?? '';
      toast.error(t('errorGuardar'), { description: m.includes('caja_cerrada') ? mensajeError('caja_ya_cerrada') : mensajeError(null, m) });
      setGuardando(false);
      setConfirmar(false);
    }
  };

  const alGuardar = () => {
    setIntentoGuardar(true);
    if (nadaContado) return;
    if (notasObligatorias && !notas.trim()) return;
    if (visible && observacionObligatoria(totales.diferenciaTotal)) {
      setConfirmar(true);
      return;
    }
    void guardar();
  };

  const migas = [
    { etiqueta: tFicha('migaPos'), href: '/app/pos' },
    { etiqueta: tFicha('migaCajas'), href: '/app/pos/cajas' },
    { etiqueta: resumen ? tFicha('sesion', { id: resumen.sesion.id }) : '…', href: volverA },
    { etiqueta: t('titulo') },
  ];

  // ── Estados ───────────────────────────────────────────────────────────────
  if (cargando && !resumen) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6" aria-busy="true">
        <PageHeader titulo={t('titulo')} variante="form" volverA={volverA} migas={migas} cargando />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
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
      <Button className="h-10" onClick={alGuardar} disabled={guardando || nadaContado} title={nadaContado ? t('nadaContado') : undefined}>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Tarjeta titulo={t('tipoTitulo')} icono={ClipboardList}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <SegmentedControl<TipoArqueo>
                etiqueta={t('tipoTitulo')}
                valor={tipo}
                onValorChange={setTipo}
                opciones={[
                  { valor: 'opening', etiqueta: t('tipos.opening') },
                  { valor: 'partial', etiqueta: t('tipos.partial') },
                  { valor: 'closing', etiqueta: t('tipos.closing') },
                ]}
              />
              <p className="text-xs text-fg-muted">{t('ayudaTipo')}</p>
            </div>
          </Tarjeta>

          <ConteoEfectivo
            moneda={moneda.code}
            valor={denominaciones}
            onValorChange={setDenominaciones}
            totalManual={efectivoManual}
            onTotalManualChange={setEfectivoManual}
            formatear={formatear}
            simbolo={simbolo}
            deshabilitado={guardando}
          />

          <ConteoPorMetodo
            filas={filas}
            incluirEfectivo={false}
            onContadoChange={(metodo, v) => setOtros((prev) => ({ ...prev, [metodo]: v }))}
            etiquetaMetodo={etiquetaMetodo}
            formatear={formatear}
            simbolo={simbolo}
            visible={visible}
            deshabilitado={guardando}
            descripcion={t('otrosDescripcion')}
          />
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <ResumenArqueo totales={totales} formatear={formatear} visible={visible} />
          <Tarjeta titulo={t('observaciones')} icono={NotebookPen}>
            <FormField etiqueta={t('notas')} obligatorio={notasObligatorias} error={errorNotas} ayuda={t('notasAyuda', { max: MAX_NOTAS })}>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value.slice(0, MAX_NOTAS))} rows={3} placeholder={t('notasPlaceholder')} />
            </FormField>
          </Tarjeta>
          <div className="hidden gap-3 lg:grid lg:grid-cols-2">{botones}</div>
        </div>
      </div>

      {/* Móvil: acciones fijas al pie. */}
      <div className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-3 border-t border-line bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        {botones}
      </div>

      <Dialogo
        abierto={confirmar}
        onAbiertoChange={(v) => !guardando && setConfirmar(v)}
        titulo={t('confirmarTitulo')}
        descripcion={
          totales.diferenciaTotal !== null && totales.diferenciaTotal < 0
            ? t('confirmarFaltante', { monto: formatear(Math.abs(totales.diferenciaTotal)) })
            : t('confirmarSobrante', { monto: formatear(Math.abs(totales.diferenciaTotal ?? 0)) })
        }
        ancho={440}
        primario={{ etiqueta: t('confirmarGuardar'), onClick: () => void guardar(), cargando: guardando }}
      >
        <p className="text-sm text-fg-secondary">{t('confirmarNota')}</p>
      </Dialogo>
    </div>
  );
}
