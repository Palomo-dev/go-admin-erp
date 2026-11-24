'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, Info, Lock, MessageSquare, Pause, Pencil, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { inicialesDe } from '@/components/kit/AvatarIniciales';
import type { ErrorPaso, FormAsistente } from './asistenteVozLogica';
import type { AgenteVoz, Lectura, MetricasAgente, VozCatalogo } from './useDatosAsistenteVoz';

const RUTA_AGENTES = '/app/crm/agentes-ia';

function numeroAjuste(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Paso 3 · Agente y voz (Figma 1681:860291). La voz es la del agente: aquí solo se muestra. */
export function PasoAgenteVoz({
  form,
  cambiar,
  errores,
  agentes,
  voces,
  metricas,
}: {
  form: FormAsistente;
  cambiar: (p: Partial<FormAsistente>) => void;
  errores: ErrorPaso[];
  agentes: Lectura<AgenteVoz[]>;
  voces: Lectura<VozCatalogo[]>;
  metricas: Lectura<MetricasAgente>;
}) {
  const t = useTranslations('crm.campanaVozAsistente.agente');
  const lista = agentes.estado === 'listo' ? agentes.datos : [];
  const agente = lista.find((a) => a.id === form.agenteId) ?? null;
  const voz = agente?.voice_ref_id && voces.estado === 'listo' ? voces.datos.find((v) => v.id === agente.voice_ref_id) ?? null : null;
  const etapas = metricas.estado === 'listo' ? metricas.datos.etapas : [];

  if (agentes.estado === 'cargando') {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (agentes.estado === 'error' || lista.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          variante={agentes.estado === 'error' ? 'error' : 'empty'}
          icono={Bot}
          titulo={agentes.estado === 'error' ? undefined : t('sinAgentes.titulo')}
          descripcion={agentes.estado === 'error' ? undefined : t('sinAgentes.descripcion')}
          accion={agentes.estado === 'error' ? undefined : { etiqueta: t('sinAgentes.crear'), href: RUTA_AGENTES }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-medium leading-[18px] text-fg">{t('titulo')}</h2>
        <div role="radiogroup" aria-label={t('titulo')} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((a) => {
            const sel = a.id === form.agenteId;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={!a.is_active}
                onClick={() => cambiar({ agenteId: a.id })}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:bg-subtle',
                  sel ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line hover:bg-hover',
                )}
              >
                <span className={cn('flex items-center gap-2 text-sm font-medium', a.is_active ? (sel ? 'text-brand-deep' : 'text-fg') : 'text-fg-muted')}>
                  {a.is_active ? <Bot aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} /> : <Lock aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />}
                  <span className="truncate">{a.name}</span>
                </span>
                <span className="line-clamp-2 text-xs leading-4 text-fg-muted">{a.is_active ? a.description || t('sinDescripcion') : t('inactivo')}</span>
              </button>
            );
          })}
        </div>
        {errores.includes('agente') && (
          <p role="alert" className="text-xs text-danger-text">
            {t('error')}
          </p>
        )}
      </section>

      {agente && (
        <>
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-action text-sm font-medium text-fg-on-brand">
                {inicialesDe(voz?.name ?? agente.name)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-fg">{voz ? t('voz', { nombre: voz.name }) : t('vozPorDefecto')}</span>
                  {voz && (
                    <Badge tono="neutro" apariencia="contorno" tamano="sm">
                      {t.has(`tipos.${voz.kind}`) ? t(`tipos.${voz.kind}`) : voz.kind}
                    </Badge>
                  )}
                  {(voz?.language || agente.language) && (
                    <Badge tono="marca" tamano="sm">
                      {voz?.language || agente.language}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-fg-muted">
                  {(() => {
                    const velocidad = numeroAjuste(agente.voice_settings?.speed);
                    const estabilidad = numeroAjuste(agente.voice_settings?.stability);
                    return velocidad !== null && estabilidad !== null
                      ? t('ajustes', { velocidad: velocidad.toFixed(1), estabilidad: estabilidad.toFixed(2) })
                      : t('sinAjustes');
                  })()}
                </span>
              </div>
              {voz?.preview_url && <MuestraVoz url={voz.preview_url} />}
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-[13px] leading-[18px] text-fg-secondary">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                {t('vozAviso')}
              </p>
              <Link href={RUTA_AGENTES} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'shrink-0' })}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('editarAgente')}
              </Link>
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
            <h2 className="text-[13px] font-medium leading-[18px] text-fg">{t('primerMensaje')}</h2>
            <p className="rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm text-fg">{agente.first_message}</p>
            <p className="text-xs text-fg-muted">{t('primerMensajeAyuda')}</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-fg-secondary">{t('guion')}</span>
              {etapas.length === 0 ? (
                <span className="text-xs text-fg-muted">{t('sinEtapas')}</span>
              ) : (
                etapas.map((e, i) => (
                  <Badge key={e.stage_id} tono="neutro" apariencia="contorno" tamano="sm">
                    {`${i + 1} · ${e.etapa}`}
                  </Badge>
                ))
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={RUTA_AGENTES} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <MessageSquare aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('probar')}
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MuestraVoz({ url }: { url: string }) {
  const t = useTranslations('crm.campanaVozAsistente.agente');
  const audio = useRef<HTMLAudioElement>(null);
  const [sonando, setSonando] = useState(false);
  const alternar = () => {
    const a = audio.current;
    if (!a) return;
    if (sonando) {
      a.pause();
      setSonando(false);
    } else {
      void a.play().then(() => setSonando(true)).catch(() => setSonando(false));
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={alternar}
        aria-label={sonando ? t('pausar') : t('escuchar')}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {sonando ? <Pause aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />}
      </button>
      <audio ref={audio} src={url} preload="none" onEnded={() => setSonando(false)} className="hidden" />
    </>
  );
}
