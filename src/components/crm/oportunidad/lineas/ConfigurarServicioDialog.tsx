'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { FormField } from '@/components/kit/FormField';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { combinarFechaHora, deFechaHoraLocal, horaEnZona } from '@/components/crm/kit/fechasCrm';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatDateInTz, todayInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { SERVICIOS_MODELO_NUEVO, type LineaProducto, type TipoServicio } from '../lineasLogica';
import { clasesProximas, ocupadoProfesional, planDeMembresia, type ClaseProxima, type PlanMembresia } from './catalogoOportunidad';

/**
 * «3c Configurar servicio por tipo» (Figma 1780:139899): un mini formulario
 * por `products.service_type`. Estándar pide cantidad y precio; membresía, el
 * inicio y los periodos (la crea `fn_membresias_activar_venta` al emitir);
 * paquete de sesiones y curso se venden pero son «Modelo nuevo» (no hay saldo
 * ni cohortes); clase, el horario con cupos en vivo; cita, profesional, día y
 * hora en la zona de la organización. Lo elegido va a `service_config`.
 */
export interface ServicioAConfigurar {
  id: number;
  nombre: string;
  sku?: string | null;
  tipo: TipoServicio;
  precio: number;
  tasa_impuesto?: number;
}

export interface ConfigurarServicioDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  servicio: ServicioAConfigurar | null;
  /** Línea a editar (mismos campos prellenados). */
  inicial?: LineaProducto | null;
  moneda: ContextoMoneda;
  usuarios: readonly OpcionUsuario[];
  onListo: (linea: LineaProducto) => void;
}

const VIGENCIAS = [30, 60, 90, 180, 365] as const;
const HORAS = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'] as const;

export function ConfigurarServicioDialog({ abierto, onAbiertoChange, servicio, inicial, moneda, usuarios, onListo }: ConfigurarServicioDialogProps) {
  const t = useTranslations('crm.oportunidad.servicio');
  const tl = useTranslations('crm.oportunidad.lineas');
  const { timezone } = useFormatDate();
  const hoy = todayInTz(timezone);
  const cfg0 = (inicial?.service_config ?? {}) as Record<string, unknown>;
  const [cantidad, setCantidad] = useState<number | null>(1);
  const [precio, setPrecio] = useState<number | null>(0);
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [sesiones, setSesiones] = useState<number | null>(10);
  const [vigencia, setVigencia] = useState('90');
  const [claseId, setClaseId] = useState<number | null>(null);
  const [profesional, setProfesional] = useState('');
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');
  const [plan, setPlan] = useState<PlanMembresia | null>(null);
  const [clases, setClases] = useState<ClaseProxima[] | null>(null);
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!abierto || !servicio) return;
    setCantidad(inicial?.quantity ?? 1);
    setPrecio(inicial?.unit_price ?? servicio.precio);
    setInicio(typeof cfg0.start_date === 'string' ? cfg0.start_date : '');
    setFin(typeof cfg0.end_date === 'string' ? cfg0.end_date : '');
    setSesiones(Number(cfg0.sessions) || 10);
    setVigencia(String(Number(cfg0.validity_days) || 90));
    setClaseId(Number(cfg0.gym_class_id) || null);
    setProfesional(typeof cfg0.professional_id === 'string' ? cfg0.professional_id : '');
    const ini = typeof cfg0.start_at === 'string' ? cfg0.start_at : null;
    setDia(ini ? toPlainDate(new Date(ini), timezone) : '');
    setHora(ini ? horaEnZona(ini, timezone) : '');
    setError(false);
    setPlan(null);
    setClases(null);
    const org = Number(getOrganizationId());
    if (servicio.tipo === 'membership') planDeMembresia(servicio.id).then(setPlan, () => setError(true));
    if (servicio.tipo === 'class') clasesProximas(org, new Date().toISOString()).then(setClases, () => setError(true));
    // Se reinicia al abrir con otro servicio o línea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, servicio?.id, inicial?.id]);

  // Horas ocupadas del profesional ese día (calendario).
  useEffect(() => {
    if (!abierto || servicio?.tipo !== 'appointment' || !profesional || !dia) return;
    const desde = deFechaHoraLocal(combinarFechaHora(dia, '00:00'), timezone);
    const hasta = deFechaHoraLocal(combinarFechaHora(dia, '23:59'), timezone);
    if (!desde || !hasta) return;
    let vivo = true;
    ocupadoProfesional(Number(getOrganizationId()), profesional, desde, hasta).then(
      (ev) => {
        if (!vivo) return;
        const set = new Set<string>();
        for (const h of HORAS) {
          const a = Date.parse(deFechaHoraLocal(combinarFechaHora(dia, h), timezone) ?? '');
          if (ev.some((e) => Date.parse(e.inicio) < a + 3_600_000 && Date.parse(e.fin) > a)) set.add(h);
        }
        setOcupadas(set);
      },
      () => vivo && setOcupadas(new Set()),
    );
    return () => {
      vivo = false;
    };
  }, [abierto, servicio?.tipo, profesional, dia, timezone]);

  const tipo = servicio?.tipo ?? 'standard';
  const qty = tipo === 'membership' ? Math.max(1, Math.round(cantidad ?? 1)) : tipo === 'standard' ? cantidad ?? 0 : 1;
  const unit = precio ?? 0;
  const clase = clases?.find((c) => c.id === claseId) ?? null;
  const nombreProfesional = usuarios.find((u) => u.id === profesional)?.nombre ?? null;

  const faltante = useMemo(() => {
    if (qty <= 0 || unit < 0) return true;
    if (tipo === 'class') return !clase;
    if (tipo === 'course') return !inicio || !fin || fin < inicio;
    if (tipo === 'appointment') return !profesional || !dia || !hora;
    if (tipo === 'session_pack') return !sesiones || sesiones <= 0;
    return false;
  }, [qty, unit, tipo, clase, inicio, fin, profesional, dia, hora, sesiones]);

  if (!servicio) return null;

  const config = (): Record<string, unknown> => {
    switch (tipo) {
      case 'membership':
        return { ...(plan ? { plan_id: plan.id, plan_name: plan.nombre } : {}), ...(inicio ? { start_date: inicio } : {}), periods: qty };
      case 'session_pack':
        return { sessions: sesiones, validity_days: Number(vigencia) };
      case 'class':
        return clase ? { gym_class_id: clase.id, class_title: clase.titulo, class_start: clase.inicio } : {};
      case 'course':
        return { start_date: inicio, end_date: fin };
      case 'appointment':
        return { professional_id: profesional, professional_name: nombreProfesional, start_at: deFechaHoraLocal(combinarFechaHora(dia, hora), timezone), duration_minutes: 60 };
      default:
        return {};
    }
  };

  const listo = () => {
    if (faltante) return;
    onListo({
      ...(inicial ?? {}),
      product_id: servicio.id,
      nombre: servicio.nombre,
      sku: servicio.sku ?? null,
      quantity: qty,
      unit_price: unit,
      es_servicio: true,
      tipo_servicio: tipo,
      service_config: config(),
      controla_stock: false,
      tasa_impuesto: inicial?.tasa_impuesto ?? servicio.tasa_impuesto ?? 0,
    });
    onAbiertoChange(false);
  };

  const total = qty * unit;
  const pie = (
    <>
      <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'fantasma' })}>{t('cancelar')}</button>
      <button type="button" onClick={listo} disabled={faltante} className={clasesBoton()}>
        {inicial ? t('guardar', { total: formatMoneda(total, moneda) }) : t('agregar', { total: formatMoneda(total, moneda) })}
      </button>
    </>
  );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={servicio.nombre}
      descripcion={t('subtitulo', { tipo: tl(`tipoServicio.${tipo}`) })}
      accionesCabecera={
        <div className="flex flex-col items-end gap-1">
          <StatusBadge estado={tipo} etiqueta={tl('insignia.servicio', { tipo: tl(`tipoServicio.${tipo}`) })} tono="informacion" tamano="sm" />
          {SERVICIOS_MODELO_NUEVO.includes(tipo) && <StatusBadge estado="nuevo" etiqueta={tl('insignia.modeloNuevo')} tono="advertencia" tamano="sm" />}
        </div>
      }
      ancho={520}
      pie={pie}
    >
      <div className="flex flex-col gap-4">
        {error && <AvisoTonal tono="peligro" titulo={t('errorCarga')} compacto />}

        {tipo === 'standard' && (
          <>
            <p className="text-[13px] text-fg-secondary">{t('estandarAyuda')}</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('cantidad')}>
                <CampoNumero valor={cantidad} onValorChange={setCantidad} minimo={0} decimales={2} alinear="derecha" />
              </FormField>
              <FormField etiqueta={t('precioUnitario')}>
                <CampoNumero valor={precio} onValorChange={setPrecio} minimo={0} decimales={moneda.decimals} alinear="derecha" prefijo="$" />
              </FormField>
            </div>
          </>
        )}

        {tipo === 'membership' && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-fg-secondary">{t('plan')}</dt>
              <dd className="text-right font-medium text-fg">{plan ? (plan.duracion ? t('planDuracion', { plan: plan.nombre, n: plan.duracion, unidad: t(`unidad.${plan.unidad ?? 'month'}`) }) : plan.nombre) : plan === null && !error ? <Loader2 aria-label={t('cargando')} className="ml-auto size-4 animate-spin" /> : '—'}</dd>
              <dt className="text-fg-secondary">{t('titular')}</dt>
              <dd className="text-right text-fg">{t('titularCliente')}</dd>
            </dl>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('fechaInicio')} ayuda={t('fechaInicioAyuda')}>
                <CampoFecha valor={inicio} onValorChange={setInicio} min={hoy} limpiable />
              </FormField>
              <FormField etiqueta={t('periodos')}>
                <CampoNumero valor={cantidad} onValorChange={setCantidad} minimo={1} decimales={0} alinear="derecha" />
              </FormField>
            </div>
            <p className="text-xs text-fg-muted">{t('membresiaTecnico')}</p>
          </>
        )}

        {tipo === 'session_pack' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('sesiones')}>
                <CampoNumero valor={sesiones} onValorChange={setSesiones} minimo={1} decimales={0} alinear="derecha" />
              </FormField>
              <FormField etiqueta={t('vigencia')} ayuda={t('vigenciaAyuda')}>
                <SelectCrm valor={vigencia} onValorChange={setVigencia} opciones={VIGENCIAS.map((d) => ({ valor: String(d), etiqueta: t('dias', { n: d }) }))} />
              </FormField>
            </div>
            <AvisoTonal tono="advertencia" titulo={t('paqueteModeloNuevo')} descripcion={t('paqueteModeloNuevoDetalle')} />
          </>
        )}

        {tipo === 'class' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-medium text-fg">{t('horario')}</legend>
            {clases === null && !error ? (
              <div className="h-9 animate-pulse rounded-lg bg-subtle" aria-busy="true" />
            ) : clases && clases.length === 0 ? (
              <p className="text-[13px] text-fg-secondary">{t('sinClases')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(clases ?? []).map((c) => {
                  const libres = Math.max(0, c.capacidad - c.reservados);
                  const lleno = c.capacidad > 0 && libres === 0;
                  const elegido = c.id === claseId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={elegido}
                      disabled={lleno}
                      onClick={() => setClaseId(c.id)}
                      className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs', elegido ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line text-fg', lleno && 'opacity-50')}
                    >
                      {elegido && <Check aria-hidden="true" className="size-3.5" />}
                      {lleno ? t('claseLlena', { clase: c.titulo, fecha: formatDateInTz(c.inicio, timezone, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) }) : t('claseCupos', { clase: c.titulo, fecha: formatDateInTz(c.inicio, timezone, { weekday: 'short', hour: 'numeric', minute: '2-digit' }), libres, total: c.capacidad })}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-fg-muted">{t('claseTecnico')}</p>
          </fieldset>
        )}

        {tipo === 'course' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('inicio')}>
                <CampoFecha valor={inicio} onValorChange={setInicio} min={hoy} />
              </FormField>
              <FormField etiqueta={t('fin')}>
                <CampoFecha valor={fin} onValorChange={setFin} min={inicio || hoy} />
              </FormField>
            </div>
            <AvisoTonal tono="advertencia" titulo={t('cursoModeloNuevo')} descripcion={t('cursoModeloNuevoDetalle')} />
          </>
        )}

        {tipo === 'appointment' && (
          <>
            <FormField etiqueta={t('profesional')}>
              <SelectCrm valor={profesional} onValorChange={setProfesional} opcionVacia={t('elegir')} opciones={usuarios.map((u) => ({ valor: u.id, etiqueta: u.nombre }))} />
            </FormField>
            <FormField etiqueta={t('fecha')}>
              <CampoFecha valor={dia} onValorChange={setDia} min={hoy} />
            </FormField>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-medium text-fg">{t('hora')}</legend>
              <div className="flex flex-wrap gap-2">
                {HORAS.map((h) => {
                  const ocupada = ocupadas.has(h);
                  const elegida = h === hora;
                  return (
                    <button key={h} type="button" aria-pressed={elegida} disabled={ocupada || !profesional || !dia} onClick={() => setHora(h)} className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs', elegida ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line text-fg', (ocupada || !profesional || !dia) && 'opacity-50')}>
                      {elegida && <Check aria-hidden="true" className="size-3.5" />}
                      {ocupada ? t('horaOcupada', { hora: h }) : h}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-fg-muted">{t('citaTecnico')}</p>
            </fieldset>
          </>
        )}

        {tipo !== 'standard' && (
          <FormField etiqueta={t('precioUnitario')}>
            <CampoNumero valor={precio} onValorChange={setPrecio} minimo={0} decimales={moneda.decimals} alinear="derecha" prefijo="$" />
          </FormField>
        )}
      </div>
    </PanelAdaptable>
  );
}
