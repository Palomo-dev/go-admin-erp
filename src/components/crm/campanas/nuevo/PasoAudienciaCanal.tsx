'use client';

/**
 * Paso 1 · Audiencia y canal (Figma CRM 1395:1065): nombre, segmento y una
 * tarjeta por canal con su conteo (`useDesgloseSegmento`). Un canal sin
 * configurar se ve deshabilitado con el enlace a Configuración › CRM
 * (anotación 1404:830282).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bot, Check, Info, Mail, MessageSquare, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { FormField } from '@/components/kit/FormField';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_CAMPO, CLASE_NOTA } from '@/components/crm/kit/camposCrm';
import type { DesgloseSegmento } from '@/lib/services/crm/segmentosConteoService';
import type { SegmentOption } from '../CampanasService';
import { CANALES_ASISTENTE, type CanalAsistente, type DisponibilidadCanal } from './asistenteCampanaLogica';
import type { EstadoDesglose } from './useDesgloseSegmento';

const ICONO: Record<CanalAsistente, LucideIcon> = { voice: Bot, whatsapp: MessageSquare, email: Mail };

function TarjetaCanal(p: {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  insignia: string | null;
  seleccionada: boolean;
  disp: DisponibilidadCanal;
  motivo: string | null;
  textoConfigurar: string;
  onSeleccionar: () => void;
}) {
  const Icono = p.icono;
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border bg-surface p-4 text-left transition-colors',
        p.seleccionada ? 'border-2 border-brand bg-brand-tint' : 'border-line',
        !p.disp.habilitado && 'bg-subtle',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={p.seleccionada}
        disabled={!p.disp.habilitado}
        onClick={p.onSeleccionar}
        className="flex w-full flex-col gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
      >
        <span className="flex w-full items-center gap-2">
          <Icono aria-hidden="true" className={cn('size-5 shrink-0', p.disp.habilitado ? 'text-fg' : 'text-fg-muted')} strokeWidth={1.5} />
          <span className={cn('min-w-0 flex-1 text-base font-semibold', p.disp.habilitado ? 'text-fg' : 'text-fg-secondary')}>{p.titulo}</span>
          {p.seleccionada && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={2} />}
        </span>
        <span className="text-[13px] leading-[18px] text-fg-secondary">{p.descripcion}</span>
        {p.insignia && p.disp.habilitado && (
          <span className="inline-flex w-fit items-center rounded-full border border-line bg-subtle px-2 py-0.5 text-xs font-medium text-fg">{p.insignia}</span>
        )}
      </button>
      {p.motivo && (
        <p className="text-xs text-fg-secondary">
          {p.motivo}
          {p.disp.configurable && (
            <>
              {' '}
              <Link href="/app/configuracion?modulo=crm" className="font-medium text-brand underline-offset-2 hover:underline">
                {p.textoConfigurar}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function PasoAudienciaCanal(p: {
  nombre: string;
  onNombre: (v: string) => void;
  errorNombre: string | null;
  segmentos: readonly SegmentOption[] | null;
  segmentId: string | null;
  onSegmento: (id: string) => void;
  canal: CanalAsistente | null;
  onCanal: (c: CanalAsistente) => void;
  disponibilidad: Record<CanalAsistente, DisponibilidadCanal>;
  desglose: DesgloseSegmento | null;
  estadoDesglose: EstadoDesglose;
}) {
  const t = useTranslations('crm.campanasAsistente');
  const entero = useFormatoEntero();

  const insignia = (c: CanalAsistente): string | null => {
    if (p.estadoDesglose === 'contando') return t('canales.contando');
    const d = p.desglose;
    if (!d) return null;
    if (c === 'voice') return t('canales.insigniaVoz', { telefono: entero(d.telefono), excluidos: entero(d.no_llamar) });
    if (c === 'whatsapp') return t('canales.insigniaWhatsapp', { n: entero(d.whatsapp) });
    return t('canales.insigniaCorreo', { n: entero(d.correo) });
  };

  return (
    <div className="space-y-5">
      <FormField etiqueta={t('audiencia.nombre')} obligatorio error={p.errorNombre}>
        <input className={CLASE_CAMPO} value={p.nombre} maxLength={160} onChange={(e) => p.onNombre(e.target.value)} placeholder={t('audiencia.nombrePlaceholder')} />
      </FormField>

      <FormField
        etiqueta={t('audiencia.segmento')}
        ayuda={p.segmentos && p.segmentos.length === 0 ? (
          <>
            {t('audiencia.sinSegmentos')}{' '}
            <Link href="/app/crm/segmentos/nuevo" className="font-medium text-brand hover:underline">
              {t('audiencia.crearSegmento')}
            </Link>
          </>
        ) : undefined}
      >
        {(campo) => (
          <SelectCrm
            id={campo.id}
            aria-describedby={campo['aria-describedby']}
            valor={p.segmentId ?? ''}
            onValorChange={p.onSegmento}
            disabled={!p.segmentos || p.segmentos.length === 0}
            placeholder={p.segmentos ? t('audiencia.elegirSegmento') : t('audiencia.cargandoSegmentos')}
            opciones={(p.segmentos ?? []).map((s) => ({ valor: s.id, etiqueta: t('audiencia.opcionSegmento', { nombre: s.name, n: s.customer_count ?? 0, conteo: entero(s.customer_count ?? 0) }) }))}
          />
        )}
      </FormField>

      <div className="space-y-2">
        <p id="campana-canal" className="text-[13px] font-medium leading-[18px] text-fg">
          {t('audiencia.canal')}
        </p>
        <div role="radiogroup" aria-labelledby="campana-canal" className="grid gap-3 md:grid-cols-3">
          {CANALES_ASISTENTE.map((c) => {
            const disp = p.disponibilidad[c];
            return (
              <TarjetaCanal
                key={c}
                icono={ICONO[c]}
                titulo={t(`canales.${c}.titulo`)}
                descripcion={t(`canales.${c}.descripcion`)}
                insignia={insignia(c)}
                seleccionada={p.canal === c}
                disp={disp}
                motivo={disp.motivo && disp.motivo !== 'cargando' ? t(`canales.motivos.${disp.motivo}`) : null}
                textoConfigurar={t('canales.configurar')}
                onSeleccionar={() => p.onCanal(c)}
              />
            );
          })}
        </div>
      </div>

      <p className={CLASE_NOTA}>
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        <span className="text-[13px] leading-[18px]">{t('audiencia.notaExclusiones')}</span>
      </p>
    </div>
  );
}
