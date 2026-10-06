'use client';

/**
 * Detalle de una campaña de voz en marcha — /app/crm/campanas/voz/[id]
 * (Figma CRM 1809:144962).
 *
 * - Cabecera: «Ejecutar ahora» (solo si el servidor dice que puedes:
 *   `puede_ejecutar` del diagnóstico), «Pausar»/«Reanudar» y «Parada de
 *   emergencia» (con confirmación). Mismas rutas que las tarjetas del panel.
 * - Línea de estado y chips «esta pasada no marcó por…» (`CampaignBlockChips`).
 * - Progreso de la audiencia, 6 cifras, «Llamadas en vivo y recientes» y «Hoy».
 *
 * Datos: `GET /api/crm/voice-agents/campaigns/[id]` (sesión, permisos y
 * sucursal resueltos en la base). Mientras la campaña está en marcha se
 * relee cada 30 s con la pestaña visible.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { OctagonX, Pause, PhoneOutgoing, Play, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { DetalleCampanaVoz } from '@/lib/services/crm/voiceCampaignDetailService';
import { CampaignBlockChips } from '../CampaignBlockChips';
import { useDiagnosticoVoz } from '../useDiagnosticoVoz';
import { estadoCampana } from './campanaVozDetalleLogica';
import { CifrasCampanaVoz } from './CifrasCampanaVoz';
import { LlamadasCampanaVoz } from './LlamadasCampanaVoz';
import { PanelHoyCampanaVoz } from './PanelHoyCampanaVoz';

const RELECTURA_MS = 30_000;

type Estado = { tipo: 'cargando' } | { tipo: 'error'; sinPermiso: boolean; noExiste: boolean } | { tipo: 'listo'; datos: DetalleCampanaVoz };

export function CampanaVozDetalle({ id }: { id: string }) {
  const t = useTranslations('crm.campanaVoz');
  const tDisparo = useTranslations('vozCampanasDisparo');
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [ocupado, setOcupado] = useState<null | 'pausar' | 'reanudar' | 'parar' | 'ejecutar'>(null);
  const [confirmarParada, setConfirmarParada] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const diagnostico = useDiagnosticoVoz(tDisparo('errorDiagnostico'));

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setEstado({ tipo: 'cargando' });
      try {
        const { data } = await pedirCrm<DetalleCampanaVoz>(`/api/crm/voice-agents/campaigns/${encodeURIComponent(id)}`);
        setEstado({ tipo: 'listo', datos: data });
      } catch (e) {
        if (silencioso) return; // una relectura fallida no borra lo que ya se ve
        const st = e instanceof ErrorApiCrm ? e.status : 0;
        setEstado({ tipo: 'error', sinPermiso: st === 401 || st === 403, noExiste: st === 404 });
      }
    },
    [id],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enMarcha = estado.tipo === 'listo' && estado.datos.campaign.status === 'running' && !estado.datos.campaign.emergency_stop;
  useEffect(() => {
    if (!enMarcha) return;
    const relectura = setInterval(() => {
      if (document.visibilityState === 'visible') void cargar(true);
    }, RELECTURA_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      clearInterval(relectura);
      clearInterval(reloj);
    };
  }, [enMarcha, cargar]);

  const cambiar = async (accion: 'pausar' | 'reanudar' | 'parar', cuerpo: Record<string, unknown>, ok: string) => {
    setOcupado(accion);
    try {
      await pedirCrm(`/api/crm/voice-agents/campaigns/${encodeURIComponent(id)}`, { method: 'PATCH', cuerpo });
      toast({ title: ok });
      await cargar(true);
      void diagnostico.recargar();
    } catch (e) {
      toast({ title: t('errores.accion'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(null);
      setConfirmarParada(false);
    }
  };

  const ejecutar = async () => {
    setOcupado('ejecutar');
    try {
      const { data } = await pedirCrm<{ total_calls_initiated?: number }>('/api/crm/voice-agents/campaigns/run-now', { method: 'POST' });
      const n = data?.total_calls_initiated ?? 0;
      toast({ title: n > 0 ? tDisparo('resultadoConLlamadas', { n }) : tDisparo('resultadoSinLlamadas') });
      await cargar(true);
      void diagnostico.recargar();
    } catch (e) {
      toast({ title: tDisparo('errorEjecutar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const migas = [
    { etiqueta: t('migas.crm'), href: '/app/crm' },
    { etiqueta: t('migas.campanas'), href: '/app/crm/campanas' },
  ];

  if (estado.tipo !== 'listo') {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <PageHeader titulo={t('tituloCargando')} icono={Send} migas={migas} variante="detail" volverA="/app/crm/campanas" cargando={estado.tipo === 'cargando'} />
        {estado.tipo === 'cargando' ? (
          <div aria-busy="true" aria-label={t('cargando')} className="flex flex-col gap-4">
            <div className="h-16 animate-pulse rounded-xl border border-line bg-subtle" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-subtle" />
              ))}
            </div>
            <div className="h-80 animate-pulse rounded-xl border border-line bg-subtle" />
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState
              variante={estado.sinPermiso ? 'forbidden' : estado.noExiste ? 'empty' : 'error'}
              titulo={t(estado.sinPermiso ? 'sinPermiso.titulo' : estado.noExiste ? 'noExiste.titulo' : 'error.titulo')}
              descripcion={t(estado.sinPermiso ? 'sinPermiso.descripcion' : estado.noExiste ? 'noExiste.descripcion' : 'error.descripcion')}
              onReintentar={estado.sinPermiso || estado.noExiste ? undefined : () => void cargar()}
              accion={estado.noExiste ? { etiqueta: t('noExiste.volver'), href: '/app/crm/campanas' } : undefined}
            />
          </div>
        )}
      </div>
    );
  }

  const { campaign: c, stats, hoy } = estado.datos;
  const est = estadoCampana(c);
  const diagCampana = diagnostico.diag?.campanas.find((d) => d.id === c.id);
  const filas = [...estado.datos.active, ...estado.datos.history.filter((h) => !estado.datos.active.some((a) => a.id === h.id))];
  const contactados = hoy?.audiencia.contactados ?? 0;
  const encolados = hoy?.audiencia.encolados ?? stats.targets;
  const pausada = c.status === 'paused' && !c.emergency_stop;

  const acciones = (
    <>
      {diagnostico.puedeEjecutar && enMarcha && (
        <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={ocupado !== null} onClick={() => void ejecutar()}>
          <PhoneOutgoing aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {ocupado === 'ejecutar' ? tDisparo('ejecutando') : t('acciones.ejecutar')}
        </button>
      )}
      {enMarcha && (
        <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={ocupado !== null} onClick={() => void cambiar('pausar', { status: 'paused' }, t('ok.pausada'))}>
          <Pause aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.pausar')}
        </button>
      )}
      {(pausada || c.emergency_stop || c.status === 'draft') && (
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario' })}
          disabled={ocupado !== null}
          onClick={() => void cambiar('reanudar', { status: 'running', emergency_stop: false }, t('ok.reanudada'))}
        >
          <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {c.status === 'draft' ? t('acciones.activar') : t('acciones.reanudar')}
        </button>
      )}
      {!c.emergency_stop && c.status !== 'draft' && c.status !== 'completed' && (
        <button type="button" className={clasesBoton({ variante: 'destructivo' })} disabled={ocupado !== null} onClick={() => setConfirmarParada(true)}>
          <OctagonX aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.parar')}
        </button>
      )}
    </>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        titulo={c.name}
        subtitulo={[c.agent_name, c.objective].filter(Boolean).join(' · ') || undefined}
        icono={Send}
        migas={migas}
        variante="detail"
        volverA="/app/crm/campanas"
        acciones={acciones}
        movil={{ titulo: c.name }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tono={est.tono} tamano="sm" punto>
          {t(`estados.${est.clave}`)}
        </Badge>
        {c.emergency_stop && c.stopped_reason && <span className="text-[13px] text-danger-text">{t('motivoParada', { motivo: c.stopped_reason })}</span>}
      </div>
      <CampaignBlockChips campana={diagCampana} organizacion={diagnostico.diag?.organizacion ?? []} />

      {/* Por debajo de lg la cabecera del kit se integra en la barra móvil: las acciones van aquí, a ancho completo. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:hidden">{acciones}</div>

      {!hoy && (
        <AvisoTonal tono="informacion" compacto titulo={t('sinHoy.titulo')} descripcion={t('sinHoy.descripcion')} />
      )}

      <CifrasCampanaVoz stats={stats} hoy={hoy} encolados={encolados} contactados={contactados} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <LlamadasCampanaVoz filas={filas} detalle={hoy?.filas ?? {}} enMarcha={enMarcha} ahora={ahora} />

        <PanelHoyCampanaVoz hoy={hoy} />
      </div>

      <ConfirmDialog
        abierto={confirmarParada}
        onAbiertoChange={setConfirmarParada}
        titulo={t('parada.titulo')}
        descripcion={t('parada.descripcion')}
        textoConfirmar={t('parada.confirmar')}
        tono="peligro"
        icono={OctagonX}
        cargando={ocupado === 'parar'}
        onConfirmar={() => void cambiar('parar', { emergency_stop: true, status: 'paused' }, t('ok.detenida'))}
      />
    </div>
  );
}
