'use client';

import { useId, useRef } from 'react';
import { CalendarClock, Check, Info, Lock, RefreshCw, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { CampoNumero, FormField, SegmentedControl, etiquetaDiaTrigger } from '@/components/kit';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { UnidadDuracion } from '@/lib/services/membresias/vigencia';
import { cn } from '@/utils/Utils';
import {
  DIAS_SEMANA,
  PRESETS_DURACION,
  UNIDADES_DURACION,
  nombreDiaIso,
  presetDe,
  ultimoDiaEjemplo,
  type MembresiaForm,
} from '../../logica/membresiaProducto';
import type { PropsSeccionFormulario } from '../tipos';
import { TarjetasOpcion } from './TarjetasOpcion';

/**
 * «Configuración de membresía» del formulario único de producto (Figma A1 978:605773,
 * móvil A2 980:1146). Solo el contenido: el marco (FormSection 'membresia') lo pone
 * `ProductoForm`. Nada se escribe aquí: el plan se guarda con el producto en
 * `fn_producto_guardar` (`payload.membresia`). El precio es el del producto (P9).
 *
 * Sin memberships.plans.manage se ve pero no se edita (el payload no la envía).
 */
export function SeccionMembresia({ estado, actualizar, errores, catalogos, moneda, hoy, puedeConfigurarMembresia }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.secciones.membresia');
  const tDur = useTranslations('membresias.duracion');
  const tCobro = useTranslations('membresias.cobro');
  const tErr = useTranslations('productoForm.errores');
  const locale = useLocale();
  const base = useId();
  const cantidadRef = useRef<HTMLInputElement>(null);
  const m = estado.membresia;
  const editable = puedeConfigurarMembresia !== false;

  const cambiarM = (parcial: Partial<MembresiaForm>) => actualizar({ membresia: { ...m, ...parcial } });
  const error = (c: string | undefined) => (c ? tErr(c) : null);

  const preset = presetDe(m);
  const ultimoDia = ultimoDiaEjemplo(hoy, m.duration_unit, m.duration_value);
  const duracionTexto = m.duration_value && m.duration_value >= 1 ? tDur(m.duration_unit, { n: m.duration_value }) : '—';

  const sedes = catalogos.sucursales;
  const nombreSede = new Map(sedes.map((s) => [s.branch_id, s.nombre]));
  const opcionesSedes = sedes.map((s) => ({ valor: String(s.branch_id), etiqueta: s.nombre }));

  const alternarDia = (d: number) =>
    cambiarM({ dias: m.dias.includes(d) ? m.dias.filter((x) => x !== d) : [...m.dias, d].sort((a, b) => a - b) });

  // «Así lo verá el cajero»: nombre · precio · duración · acceso · congelamientos.
  const partesResumen = [
    estado.name.trim() || t('resumenSinNombre'),
    estado.price !== null ? moneda.formatear(estado.price) : t('resumenSinPrecio'),
    duracionTexto,
    m.allowed_branch_ids.length > 0
      ? m.allowed_branch_ids.map((id) => nombreSede.get(id) ?? `#${id}`).join(', ')
      : t('resumenTodasSedes'),
    m.horario === 'franja'
      ? [
          m.dias.length === 7 ? t('resumenTodosLosDias') : m.dias.map((d) => nombreDiaIso(d, locale)).join(', '),
          m.desde && m.hasta ? `${m.desde}–${m.hasta}` : null,
        ]
          .filter(Boolean)
          .join(' ')
      : t('resumenCualquierHora'),
    m.freeze_allowed
      ? [
          m.freeze_max_times !== null ? t('resumenCongelarVeces', { n: m.freeze_max_times }) : t('resumenCongelarLibre'),
          m.freeze_max_days !== null ? `(${t('resumenCongelarDias', { n: m.freeze_max_days })})` : null,
        ]
          .filter(Boolean)
          .join(' ')
      : null,
  ].filter((x): x is string => !!x);

  const idDuracion = `${base}-duracion`;
  const idActivacion = `${base}-activacion`;
  const idCongelar = `${base}-congelar`;

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2 text-xs text-fg-secondary">
        <Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-brand" strokeWidth={1.5} />
        {t('nota')}
      </p>

      {!editable && (
        <div role="status" className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t('sinPermiso')}
        </div>
      )}

      <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-6">
        <legend className="sr-only">{t('titulo')}</legend>

        {/* Duración */}
        <section aria-labelledby={idDuracion} className="flex flex-col gap-3">
          <div>
            <h3 id={idDuracion} className="text-sm font-semibold text-fg">
              {t('duracion')}
            </h3>
            <p className="text-xs text-fg-secondary">{t('duracionAyuda')}</p>
          </div>
          <div role="group" aria-label={t('duracionPresets')} className="flex flex-wrap gap-2">
            {PRESETS_DURACION.map((p) => {
              const activo = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => cambiarM({ duration_unit: p.unidad, duration_value: p.valor })}
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
                    activo ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
                  )}
                >
                  {activo && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
                  {tDur(p.unidad, { n: p.valor })}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={preset === null}
              onClick={() => cantidadRef.current?.focus()}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
                preset === null ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
              )}
            >
              {preset === null && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
              {t('personalizada')}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('cantidad')} error={error(errores.membresia_duracion)} obligatorio>
              <CampoNumero
                ref={cantidadRef}
                valor={m.duration_value}
                onValorChange={(v) => cambiarM({ duration_value: v === null ? null : Math.round(v) })}
                decimales={0}
                minimo={1}
                alinear="derecha"
              />
            </FormField>
            <FormField etiqueta={t('unidad')}>
              {(campo) => (
                <Select value={m.duration_unit} onValueChange={(v) => cambiarM({ duration_unit: v as UnidadDuracion })} disabled={!editable}>
                  <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES_DURACION.map((u) => (
                      <SelectItem key={u} value={u}>
                        {t(`unidades.${u}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>
          {ultimoDia && (
            <p className="text-xs text-fg-secondary" aria-live="polite">
              {t('ejemplo', { desde: etiquetaDiaTrigger(hoy, locale), hasta: etiquetaDiaTrigger(ultimoDia, locale) })}
            </p>
          )}
        </section>

        {/* Renovación y cobro */}
        <section className="flex flex-col gap-3 border-t border-line pt-5">
          <h3 id={`${base}-renovacion`} className="text-sm font-semibold text-fg">
            {t('renovacionCobro')}
          </h3>
          <TarjetasOpcion
            aria-labelledby={`${base}-renovacion`}
            columnas={2}
            valor={m.renewal_mode}
            onValorChange={(v) => cambiarM({ renewal_mode: v === 'automatic' ? 'automatic' : 'manual' })}
            opciones={[
              {
                valor: 'manual',
                titulo: t('renovacionManual'),
                descripcion: t('renovacionManualAyuda'),
                icono: RefreshCw,
              },
              {
                valor: 'automatic',
                titulo: t('renovacionAutomatica'),
                descripcion: t('renovacionAutomaticaAyuda'),
                icono: CalendarClock,
              },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('formaCobro')} ayuda={tCobro(m.billing_mode)} error={error(errores.membresia_cobro)}>
              {(campo) => (
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  aria-describedby={campo['aria-describedby']}
                  anchoCompleto
                  deshabilitado={!editable}
                  valor={m.billing_mode}
                  onValorChange={(v) => cambiarM({ billing_mode: v })}
                  opciones={[
                    { valor: 'prepaid', etiqueta: t('cobroAdelantado') },
                    { valor: 'on_credit', etiqueta: t('cobroCredito') },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('gracia')} ayuda={t('graciaAyuda')} error={error(errores.membresia_gracia)}>
              <CampoNumero
                valor={m.grace_days}
                onValorChange={(v) => cambiarM({ grace_days: v === null ? null : Math.round(v) })}
                decimales={0}
                minimo={0}
                sufijo={t('dias')}
                alinear="derecha"
              />
            </FormField>
          </div>
        </section>

        {/* Inicio y congelamientos */}
        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-fg">{t('inicioCongelamientos')}</h3>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <label htmlFor={idActivacion} className="text-sm font-medium text-fg">
                {t('requiereActivacion')}
              </label>
              <p id={`${idActivacion}-ayuda`} className="text-xs text-fg-secondary">
                {t('requiereActivacionAyuda')}
              </p>
            </div>
            <Switch
              id={idActivacion}
              checked={m.requires_activation}
              onCheckedChange={(v) => cambiarM({ requires_activation: v })}
              aria-describedby={`${idActivacion}-ayuda`}
            />
          </div>
          {m.requires_activation && (
            <div className="grid gap-4 border-l-2 border-line-brand pl-4 sm:grid-cols-2">
              <FormField etiqueta={t('ventanaActivacion')} ayuda={t('ventanaActivacionAyuda')} error={error(errores.membresia_activacion)}>
                <CampoNumero
                  valor={m.activation_window_days}
                  onValorChange={(v) => cambiarM({ activation_window_days: v === null ? null : Math.round(v) })}
                  decimales={0}
                  minimo={1}
                  sufijo={t('dias')}
                  alinear="derecha"
                  placeholder={t('sinLimite')}
                />
              </FormField>
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <label htmlFor={idCongelar} className="text-sm font-medium text-fg">
                {t('permiteCongelar')}
              </label>
              <p id={`${idCongelar}-ayuda`} className="text-xs text-fg-secondary">
                {t('permiteCongelarAyuda')}
              </p>
            </div>
            <Switch
              id={idCongelar}
              checked={m.freeze_allowed}
              onCheckedChange={(v) => cambiarM({ freeze_allowed: v })}
              aria-describedby={`${idCongelar}-ayuda`}
            />
          </div>
          {m.freeze_allowed && (
            <div className="grid gap-4 border-l-2 border-line-brand pl-4 sm:grid-cols-2">
              <FormField etiqueta={t('maxVeces')} ayuda={t('vacioSinTope')} error={error(errores.membresia_congelamiento)}>
                <CampoNumero
                  valor={m.freeze_max_times}
                  onValorChange={(v) => cambiarM({ freeze_max_times: v === null ? null : Math.round(v) })}
                  decimales={0}
                  minimo={0}
                  sufijo={t('veces')}
                  alinear="derecha"
                />
              </FormField>
              <FormField etiqueta={t('maxDias')} ayuda={t('vacioSinTope')}>
                <CampoNumero
                  valor={m.freeze_max_days}
                  onValorChange={(v) => cambiarM({ freeze_max_days: v === null ? null : Math.round(v) })}
                  decimales={0}
                  minimo={0}
                  sufijo={t('dias')}
                  alinear="derecha"
                />
              </FormField>
            </div>
          )}
        </section>

        {/* Acceso */}
        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <div>
            <h3 className="text-sm font-semibold text-fg">{t('acceso')}</h3>
            <p className="text-xs text-fg-secondary">{t('accesoAyuda')}</p>
          </div>

          <FormField etiqueta={t('sedes')} ayuda={t('sedesAyuda')} error={error(errores.membresia_sedes)}>
            {(campo) => (
              <MultiSelect
                id={campo.id}
                aria-describedby={campo['aria-describedby']}
                aria-invalid={campo['aria-invalid']}
                opciones={opcionesSedes}
                valores={m.allowed_branch_ids.map(String)}
                onValoresChange={(v) => cambiarM({ allowed_branch_ids: v.map(Number) })}
                placeholder={t('sedesPlaceholder')}
                placeholderBusqueda={t('sedesBuscar')}
                textoVacio={t('sedesVacio')}
                etiquetaQuitar={(nombre) => t('quitarSede', { nombre })}
                deshabilitado={!editable}
              />
            )}
          </FormField>

          <FormField etiqueta={t('horario')} error={error(errores.membresia_horario)}>
            {(campo) => (
              <div className="flex flex-col gap-4">
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  aria-describedby={campo['aria-describedby']}
                  className="self-start"
                  deshabilitado={!editable}
                  valor={m.horario}
                  onValorChange={(v) => cambiarM({ horario: v })}
                  opciones={[
                    { valor: 'todo', etiqueta: t('horarioTodo') },
                    { valor: 'franja', etiqueta: t('horarioFranja') },
                  ]}
                />
                {m.horario === 'franja' && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField etiqueta={t('desde')}>
                        <Input
                          type="time"
                          value={m.desde}
                          onChange={(e) => cambiarM({ desde: e.target.value })}
                          aria-invalid={errores.membresia_horario === 'membresia_horario_invalido' || undefined}
                          className="h-10"
                        />
                      </FormField>
                      <FormField etiqueta={t('hasta')}>
                        <Input
                          type="time"
                          value={m.hasta}
                          onChange={(e) => cambiarM({ hasta: e.target.value })}
                          aria-invalid={errores.membresia_horario === 'membresia_horario_invalido' || undefined}
                          className="h-10"
                        />
                      </FormField>
                    </div>
                    <div role="group" aria-label={t('diasSemana')} className="flex flex-wrap gap-2">
                      {DIAS_SEMANA.map((d) => {
                        const activo = m.dias.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={activo}
                            aria-label={nombreDiaIso(d, locale, true)}
                            onClick={() => alternarDia(d)}
                            className={cn(
                              'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium capitalize transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
                              activo ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
                            )}
                          >
                            {activo && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
                            {nombreDiaIso(d, locale)}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('limiteDiario')} ayuda={t('vacioSinLimite')} error={error(errores.membresia_entradas)}>
              <CampoNumero
                valor={m.daily_checkin_limit}
                onValorChange={(v) => cambiarM({ daily_checkin_limit: v === null ? null : Math.round(v) })}
                decimales={0}
                minimo={0}
                sufijo={t('alDia')}
                alinear="derecha"
              />
            </FormField>
          </div>
        </section>
      </fieldset>

      <div className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle p-3 text-xs text-info-text">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        <p>{t('resumen', { texto: partesResumen.join(' · ') })}</p>
      </div>
    </div>
  );
}
