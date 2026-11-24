'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { FormField } from '@/components/kit/FormField';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { diasEntrePlanos } from '@/components/crm/kit/fechasCrm';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import type { LineaEspacio } from '../lineasLogica';
import { disponibilidad, planesTarifa, tiposHospedaje, totalHospedaje, type HabitacionDisponible, type TipoHospedaje } from './catalogoOportunidad';

/**
 * «3d Hospedaje» (Figma 1783:310575 y estados 1783:896245): tipo de
 * habitación por sucursal, entrada y salida, plan de tarifa, huéspedes y
 * habitaciones; disponibilidad en vivo con `fn_availability` y total sugerido
 * con `calculate_reservation_total` (editable). No bloquea la habitación: la
 * reserva se crea al ganar. «Asignar al ganar» deja `space_id` vacío; elegir
 * una habitación la fija.
 */
export interface HospedajeFormularioProps {
  moneda: ContextoMoneda;
  inicial?: LineaEspacio | null;
  onListo: (lineas: LineaEspacio[]) => void;
}

type Estado<T> = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'listo'; datos: T };

const SIN_PLAN = '__base__';

export function HospedajeFormulario({ moneda, inicial, onListo }: HospedajeFormularioProps) {
  const t = useTranslations('crm.oportunidad.hospedaje');
  const { timezone } = useFormatDate();
  const hoy = todayInTz(timezone);
  const sucursales = useBranchOpcional();
  const org = Number(getOrganizationId());
  const [tipos, setTipos] = useState<Estado<TipoHospedaje[]>>({ tipo: 'cargando' });
  const [clave, setClave] = useState(inicial?.space_type_id ? `${inicial.space_type_id}:${inicial.branch_id ?? ''}` : '');
  const [entrada, setEntrada] = useState(inicial?.checkin_date ?? '');
  const [salida, setSalida] = useState(inicial?.checkout_date ?? '');
  const [plan, setPlan] = useState(inicial?.rate_plan ?? SIN_PLAN);
  const [planes, setPlanes] = useState<string[]>([]);
  const [adultos, setAdultos] = useState<number | null>(inicial?.adults ?? 2);
  const [ninos, setNinos] = useState<number | null>(inicial?.children ?? 0);
  const [habitaciones, setHabitaciones] = useState<number | null>(1);
  const [habitacion, setHabitacion] = useState<string | null>(inicial?.space_id ?? null);
  const [libres, setLibres] = useState<Estado<HabitacionDisponible[]> | null>(null);
  const [tarifa, setTarifa] = useState<Estado<{ total: number; noches: number; tarifa: number; origen: string } | null> | null>(null);
  const [precioNoche, setPrecioNoche] = useState<number | null>(inicial?.unit_price ?? null);
  const [reintento, setReintento] = useState(0);
  const [reintentoTipos, setReintentoTipos] = useState(0);

  useEffect(() => {
    const c = new AbortController();
    tiposHospedaje(org, c.signal).then(
      (d) => {
        setTipos({ tipo: 'listo', datos: d });
        if (!clave && d[0]) setClave(`${d[0].space_type_id}:${d[0].branch_id}`);
      },
      () => !c.signal.aborted && setTipos({ tipo: 'error' }),
    );
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, reintentoTipos]);

  const tipo = tipos.tipo === 'listo' ? tipos.datos.find((x) => `${x.space_type_id}:${x.branch_id}` === clave) ?? null : null;
  const fechasOk = nochesDeRango(entrada, salida) > 0;
  const noches = nochesDeRango(entrada, salida);

  useEffect(() => {
    if (!tipo) return;
    planesTarifa(org, tipo.space_type_id).then(setPlanes, () => setPlanes([]));
  }, [org, tipo]);

  useEffect(() => {
    if (!tipo || !fechasOk) {
      setLibres(null);
      setTarifa(null);
      return;
    }
    let vivo = true;
    setLibres({ tipo: 'cargando' });
    setTarifa({ tipo: 'cargando' });
    disponibilidad(entrada, salida, tipo.space_type_id, tipo.branch_id).then(
      (d) => vivo && setLibres({ tipo: 'listo', datos: d }),
      () => vivo && setLibres({ tipo: 'error' }),
    );
    totalHospedaje(org, tipo.space_type_id, entrada, salida, plan === SIN_PLAN ? null : plan).then(
      (r) => {
        if (!vivo) return;
        setTarifa({ tipo: 'listo', datos: r });
        if (r && !inicial) setPrecioNoche(r.tarifa);
      },
      () => vivo && setTarifa({ tipo: 'error' }),
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, tipo, entrada, salida, plan, fechasOk, reintento]);

  const disponibles = libres?.tipo === 'listo' ? libres.datos.filter((h) => h.libre) : [];
  const totalHab = libres?.tipo === 'listo' ? libres.datos.length : 0;
  const ocupadas = libres?.tipo === 'listo' ? libres.datos.filter((h) => !h.libre) : [];
  const nHab = Math.max(1, Math.round(habitaciones ?? 1));
  const unidad = precioNoche ?? 0;
  const total = unidad * noches * nHab;
  const capacidadSuperada = !!tipo?.capacidad && (adultos ?? 0) + (ninos ?? 0) > tipo.capacidad * nHab;
  const valido = !!tipo && fechasOk && (adultos ?? 0) >= 1 && !capacidadSuperada && unidad >= 0;
  const nombreSucursal = (id: number) => sucursales?.branches.find((b) => b.id === id)?.name ?? t('sucursalN', { id });

  const agregar = () => {
    if (!tipo || !valido) return;
    const base: LineaEspacio = {
      ...(inicial?.id ? { id: inicial.id } : {}),
      space_type_id: tipo.space_type_id,
      branch_id: tipo.branch_id,
      space_id: nHab === 1 ? habitacion : null,
      nombre: tipo.nombre,
      nights: noches,
      unit_price: unidad,
      checkin_date: entrada,
      checkout_date: salida,
      adults: adultos ?? 0,
      children: ninos ?? 0,
      rate_plan: plan === SIN_PLAN ? null : plan,
      disponibles: libres?.tipo === 'listo' ? disponibles.length : null,
      total_tipo: totalHab || null,
    };
    onListo(Array.from({ length: inicial ? 1 : nHab }, (_, i) => (i === 0 ? base : { ...base, id: undefined, space_id: null })));
  };

  if (tipos.tipo === 'cargando') return <div className="flex flex-col gap-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-subtle" />)}</div>;
  if (tipos.tipo === 'error') return <EmptyState variante="error" titulo={t('errorTipos')} onReintentar={() => {
    setTipos({ tipo: 'cargando' });
    setReintentoTipos((x) => x + 1);
  }} compacto />;
  if (tipos.datos.length === 0) return <EmptyState variante="empty" titulo={t('sinTipos')} descripcion={t('sinTiposDetalle')} compacto />;

  return (
    <div className="flex flex-col gap-4">
      <FormField etiqueta={t('tipo')}>
        <SelectCrm
          valor={clave}
          onValorChange={(v) => {
            setClave(v);
            setHabitacion(null);
          }}
          opciones={tipos.datos.map((x) => ({ valor: `${x.space_type_id}:${x.branch_id}`, etiqueta: [x.nombre, x.capacidad ? t('hastaPersonas', { n: x.capacidad }) : null, nombreSucursal(x.branch_id)].filter(Boolean).join(' · ') }))}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
        <FormField etiqueta={t('entrada')}>
          <CampoFecha valor={entrada} onValorChange={(v) => { setEntrada(v); if (salida && salida <= v) setSalida(''); }} min={hoy} />
        </FormField>
        <FormField etiqueta={t('salida')} ayuda={fechasOk ? t('noches', { n: noches }) : undefined}>
          <CampoFecha valor={salida} onValorChange={setSalida} min={entrada || hoy} />
        </FormField>
        <FormField etiqueta={t('plan')}>
          <SelectCrm valor={plan} onValorChange={setPlan} opciones={[{ valor: SIN_PLAN, etiqueta: t('tarifaBase') }, ...planes.map((p) => ({ valor: p, etiqueta: p }))]} />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField etiqueta={t('adultos')}>
          <CampoNumero valor={adultos} onValorChange={setAdultos} minimo={1} maximo={99} decimales={0} alinear="derecha" />
        </FormField>
        <FormField etiqueta={t('ninos')}>
          <CampoNumero valor={ninos} onValorChange={setNinos} minimo={0} maximo={99} decimales={0} alinear="derecha" />
        </FormField>
        <FormField etiqueta={t('habitaciones')}>
          <CampoNumero valor={habitaciones} onValorChange={setHabitaciones} minimo={1} maximo={20} decimales={0} alinear="derecha" disabled={!!inicial} />
        </FormField>
      </div>
      {capacidadSuperada && <p role="alert" className="text-[13px] text-danger-text">{t('capacidad', { n: tipo?.capacidad ?? 0 })}</p>}

      <section aria-labelledby="disp-hospedaje" className="flex flex-col gap-2 rounded-lg bg-subtle p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 id="disp-hospedaje" className="text-sm font-medium text-fg">{t('disponibilidad')}</h4>
          {libres?.tipo === 'listo' && (
            <StatusBadge
              estado="disp"
              etiqueta={disponibles.length === 0 ? t('ninguna') : t('libres', { n: disponibles.length, total: totalHab })}
              tono={disponibles.length === 0 ? 'peligro' : disponibles.length <= Math.max(1, Math.floor(totalHab / 4)) ? 'advertencia' : 'exito'}
              tamano="sm"
            />
          )}
        </div>
        {!fechasOk ? (
          <p className="text-[13px] text-fg-secondary">{t('eligeFechas')}</p>
        ) : libres?.tipo === 'cargando' ? (
          <div className="h-8 animate-pulse rounded-full bg-surface" aria-busy="true" />
        ) : libres?.tipo === 'error' ? (
          <div className="flex items-center justify-between gap-2 text-[13px] text-danger-text">
            <span>{t('errorDisponibilidad')}</span>
            <button type="button" onClick={() => setReintento((x) => x + 1)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <RotateCcw aria-hidden="true" className="size-3.5" />
              {t('reintentar')}
            </button>
          </div>
        ) : disponibles.length === 0 ? (
          <p className="text-[13px] text-danger-text">{t('noDisponible')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[{ id: null as string | null, etiqueta: t('asignarAlGanar') }, ...(nHab === 1 ? disponibles.map((h) => ({ id: h.space_id as string | null, etiqueta: h.etiqueta })) : [])].map((o) => {
              const elegida = habitacion === o.id;
              return (
                <button key={o.id ?? 'ganar'} type="button" aria-pressed={elegida} onClick={() => setHabitacion(o.id)} className={cn('flex items-center gap-1.5 rounded-full border bg-surface px-3 py-1.5 text-xs', elegida ? 'border-brand text-brand-deep' : 'border-line text-fg')}>
                  {elegida && <Check aria-hidden="true" className="size-3.5" />}
                  {o.etiqueta}
                </button>
              );
            })}
          </div>
        )}
        {fechasOk && tipo && (
          <p className="text-xs text-fg-muted">
            {t('tecnicoDisponibilidad', { tipo: tipo.nombre, sucursal: nombreSucursal(tipo.branch_id) })}
            {ocupadas.length > 0 && ` ${t('ocupadas', { lista: ocupadas.map((h) => h.etiqueta).join(', ') })}`}
          </p>
        )}
      </section>

      <dl className="flex flex-col gap-1.5 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-fg-secondary">{tarifa?.tipo === 'listo' && tarifa.datos?.origen === 'tarifa' ? t('tarifaTemporada') : t('tarifaNoche')}</dt>
          <dd className="w-40">
            <CampoNumero aria-label={t('tarifaNoche')} valor={precioNoche} onValorChange={setPrecioNoche} minimo={0} decimales={moneda.decimals} alinear="derecha" prefijo="$" tamano="sm" />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-fg-secondary">{t('nochesEtiqueta')}</dt>
          <dd className="tabular-nums text-fg">{noches || '—'}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-fg-secondary">{t('totalSugerido')}</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">{formatMoneda(total, moneda)}</dd>
        </div>
        {tarifa?.tipo === 'error' && <p className="text-xs text-danger-text">{t('errorTarifa')}</p>}
        <p className="text-xs text-fg-muted">{t('tecnicoTarifa')}</p>
      </dl>

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-fg-secondary">{t('noBloquea')}</p>
        <button type="button" onClick={agregar} disabled={!valido} className={clasesBoton()}>
          <Check aria-hidden="true" className="size-4" />
          {inicial ? t('guardar', { total: formatMoneda(total, moneda) }) : t('agregar', { total: formatMoneda(total, moneda) })}
        </button>
      </div>
    </div>
  );
}

/** Para pruebas: noches de un rango (misma regla que la RPC). */
export function nochesDeRango(entrada: string, salida: string): number {
  return entrada && salida && salida > entrada ? diasEntrePlanos(entrada, salida) : 0;
}
