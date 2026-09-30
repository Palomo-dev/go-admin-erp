'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock, Lock, Plus, TrendingUp, User } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { FormField } from '@/components/kit/FormField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { CLASE_CAMPO, simboloMoneda, type OpcionUsuario } from './camposCrm';
import type { Temperatura } from './opportunityCardLogica';
import { estaBloqueado, etapasAbiertas, probabilidadDeEtapa, type EtapaFormulario, type LayoutFormulario, type OrigenFormulario, type ValoresOportunidad } from './opportunityFormLogica';

/**
 * Secciones de `OpportunityForm` (Figma 766:448739): Cliente, Negocio y
 * Responsable y seguimiento. Solo presentación; el estado vive en
 * `OpportunityForm`.
 */
export interface PipelineOpcion {
  id: string;
  name: string;
}

export interface CamposOportunidadProps {
  v: ValoresOportunidad;
  cambiar: (parcial: Partial<ValoresOportunidad>) => void;
  errores: Partial<Record<keyof ValoresOportunidad, string | null>>;
  origen: OrigenFormulario;
  layout: LayoutFormulario;
  pipelines: readonly PipelineOpcion[];
  etapas: readonly EtapaFormulario[];
  usuarios: readonly OpcionUsuario[];
  monedas: readonly string[];
  monedaBase: ContextoMoneda;
  usuarioActualId?: string | null;
  /** Nombre del cliente elegido o fijado. */
  clienteNombre?: string | null;
  onElegirCliente?: () => void;
  /** «Agregar productos, espacios o conceptos (opcional)» en diálogo y hoja. */
  onAgregarLineas?: () => void;
}

const PRIORIDADES: readonly Temperatura[] = ['cold', 'warm', 'hot'];

function Titulo({ icono: Icono, children }: { icono: typeof User; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
      <Icono aria-hidden="true" className="size-4 text-brand" strokeWidth={1.5} />
      {children}
    </h3>
  );
}

export function CamposOportunidad(p: CamposOportunidadProps) {
  const { v, cambiar, errores, origen, layout } = p;
  const t = useTranslations('crm.kit.formulario');
  const compacto = layout === 'sheet';
  const abiertas = etapasAbiertas(p.etapas, v.pipeline_id);
  const prob = probabilidadDeEtapa(p.etapas, v.stage_id);
  const bloqueado = (c: keyof ValoresOportunidad) => estaBloqueado(origen, c);
  const monedas = Array.from(new Set([p.monedaBase.code, ...p.monedas, v.currency].filter(Boolean)));
  const grid = cn('grid gap-3', !compacto && 'sm:grid-cols-2');
  const grid2 = 'grid grid-cols-2 gap-3';

  return (
    <div className="flex flex-col gap-4">
      {!bloqueado('customer_id') ? (
        <section className="flex flex-col gap-2">
          <Titulo icono={User}>{t('cliente')}</Titulo>
          <FormField etiqueta={t('cliente')} etiquetaOculta obligatorio error={errores.customer_id} ayuda={t('clienteAyuda')}>
            <button type="button" onClick={p.onElegirCliente} className={cn(CLASE_CAMPO, 'text-left', !p.clienteNombre && 'text-fg-muted')}>
              {p.clienteNombre || t('buscarCliente')}
            </button>
          </FormField>
        </section>
      ) : (
        layout !== 'sheet' && (
          <section className="flex flex-col gap-1">
            <Titulo icono={User}>{t('cliente')}</Titulo>
            <p className="flex items-center gap-1.5 text-sm text-fg">
              <Lock aria-hidden="true" className="size-3.5 text-fg-muted" />
              {origen === 'lead' ? t('clienteLead', { nombre: p.clienteNombre ?? '' }) : p.clienteNombre}
            </p>
          </section>
        )
      )}

      <section className="flex flex-col gap-3">
        <Titulo icono={TrendingUp}>{t('negocio')}</Titulo>
        <FormField etiqueta={t('nombre')} obligatorio error={errores.name}>
          <input value={v.name} maxLength={255} onChange={(e) => cambiar({ name: e.target.value })} placeholder={t('nombreEj')} className={CLASE_CAMPO} />
        </FormField>
        <div className={compacto ? grid2 : grid}>
          <FormField etiqueta={t('embudo')} obligatorio error={errores.pipeline_id} ayuda={compacto ? undefined : t('embudoAyuda')}>
            <select
              value={v.pipeline_id}
              onChange={(e) => cambiar({ pipeline_id: e.target.value, stage_id: etapasAbiertas(p.etapas, e.target.value)[0]?.id ?? '' })}
              className={CLASE_CAMPO}
            >
              <option value="">{t('elegir')}</option>
              {p.pipelines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </FormField>
          <FormField etiqueta={t('etapa')} obligatorio error={errores.stage_id}>
            <select value={v.stage_id} onChange={(e) => cambiar({ stage_id: e.target.value })} disabled={!v.pipeline_id} className={CLASE_CAMPO}>
              <option value="">{t('elegir')}</option>
              {abiertas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </FormField>
          <FormField etiqueta={t('monto')} error={errores.amount} ayuda={compacto ? undefined : t('montoAyuda')}>
            <input inputMode="decimal" value={v.amount} disabled={bloqueado('amount')} onChange={(e) => cambiar({ amount: e.target.value })} placeholder={`${simboloMoneda(p.monedaBase)} 0`} className={CLASE_CAMPO} />
          </FormField>
          <FormField etiqueta={t('moneda')} error={errores.currency} ayuda={compacto ? undefined : t('monedaAyuda')}>
            <select value={v.currency} disabled={bloqueado('currency')} onChange={(e) => cambiar({ currency: e.target.value })} className={CLASE_CAMPO}>
              {monedas.map((m) => <option key={m} value={m}>{m === p.monedaBase.code ? t('monedaBase', { moneda: m }) : m}</option>)}
            </select>
          </FormField>
          <FormField etiqueta={t('probabilidad')}>
            <input readOnly disabled value={prob === null ? '—' : compacto ? `${prob} %` : t('probEtapa', { prob })} className={CLASE_CAMPO} />
          </FormField>
          <FormField etiqueta={t('cierre')} error={errores.expected_close_date}>
            <input type="date" value={v.expected_close_date} onChange={(e) => cambiar({ expected_close_date: e.target.value })} className={CLASE_CAMPO} />
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Titulo icono={CalendarClock}>{t('seguimiento')}</Titulo>
        <div className={compacto ? grid2 : grid}>
          <FormField etiqueta={t('responsable')}>
            <select value={v.salesperson_id} onChange={(e) => cambiar({ salesperson_id: e.target.value })} className={CLASE_CAMPO}>
              <option value="">{t('sinResponsable')}</option>
              {p.usuarios.map((u) => <option key={u.id} value={u.id}>{u.id === p.usuarioActualId ? t('tu', { nombre: u.nombre }) : u.nombre}</option>)}
            </select>
          </FormField>
          <FormField etiqueta={t('proximoContacto')} error={errores.next_contact_at} ayuda={compacto ? undefined : t('horaOrg')}>
            <input type="datetime-local" value={v.next_contact_at} onChange={(e) => cambiar({ next_contact_at: e.target.value })} className={CLASE_CAMPO} />
          </FormField>
        </div>
        {!compacto && (
          <>
            <FormField etiqueta={t('proximaAccion')} error={errores.next_action}>
              <input value={v.next_action} maxLength={500} onChange={(e) => cambiar({ next_action: e.target.value })} placeholder={t('proximaAccionEj')} className={CLASE_CAMPO} />
            </FormField>
            <FormField etiqueta={t('prioridad')}>
              {(c) => (
                <SegmentedControl<Temperatura>
                  aria-labelledby={c.idEtiqueta}
                  tamano="sm"
                  opciones={PRIORIDADES.map((x) => ({ valor: x, etiqueta: t(`prioridades.${x}`) }))}
                  valor={v.temperature || 'warm'}
                  onValorChange={(temperature) => cambiar({ temperature })}
                />
              )}
            </FormField>
          </>
        )}
      </section>

      {layout !== 'page' && origen !== 'factura' && p.onAgregarLineas && (
        <button type="button" onClick={p.onAgregarLineas} className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-3 text-left text-[13px] font-medium text-brand-deep hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('agregarLineas')}
        </button>
      )}
    </div>
  );
}

/** Líneas copiadas de la factura (Origen=factura), solo lectura. */
export function LineasCopiadas({ lineas, numero, moneda }: { lineas: readonly { concepto: string; cantidad: number; total: number }[]; numero: string; moneda: ContextoMoneda }) {
  const t = useTranslations('crm.kit.formulario');
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-fg">{t('lineasCopiadas', { numero })}</h3>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {lineas.map((l, i) => (
          <li key={`${l.concepto}-${i}`} className="flex items-center gap-2 px-3 py-2 text-[13px]">
            <span className="flex-1 text-fg">{t('lineaCantidad', { concepto: l.concepto, cantidad: l.cantidad })}</span>
            <span className="font-medium text-fg">{formatMoneda(l.total, moneda)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
