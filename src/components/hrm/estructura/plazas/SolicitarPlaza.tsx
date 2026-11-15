'use client';

/**
 * «Solicitar una plaza nueva» (Figma `95-hrm-01-06`): diálogo en escritorio y
 * hoja inferior en el celular (`PanelAdaptable`). Muestra la escala del cargo
 * en la sede (solo con el permiso de salario) y quién la aprueba, según el
 * motor de aprobaciones. Sin aprobador no se puede enviar: nadie se contrata
 * contra una plaza sin aprobar.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ClipboardList, Info, Send, ShieldCheck } from 'lucide-react';
import { AvisoTonal, CampoFecha, CampoNumero, ChipsOpcion, FormField, PanelAdaptable, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { PlanPlaza, RespuestaPlazas, TipoPlaza } from '@/lib/hrm/estructura/tipos';
import { pedir, useFormatoMoneda, useMensajeError } from '../comun';

export interface PrefijoSolicitud {
  area_id?: string;
  sede_id?: number;
  justificacion?: string;
}

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  datos: RespuestaPlazas;
  inicial: PrefijoSolicitud | null;
  onEnviada: () => void;
}

export function SolicitarPlaza({ abierto, onAbiertoChange, datos, inicial, onEnviada }: Props) {
  const t = useTranslations('hrmEstructura.plazas.solicitar');
  const tc = useTranslations('hrmEstructura.comun');
  const moneda = useFormatoMoneda();
  const mensajeError = useMensajeError();
  const { getToday } = useFormatDate();

  const [area, setArea] = useState<string>('');
  const [sede, setSede] = useState<string>('');
  const [cargo, setCargo] = useState<string>('');
  const [cantidad, setCantidad] = useState<number | null>(1);
  const [tipo, setTipo] = useState<TipoPlaza>('permanente');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [justificacion, setJustificacion] = useState('');
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [plan, setPlan] = useState<PlanPlaza | null>(null);
  const [errorPlan, setErrorPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setArea(inicial?.area_id ?? '');
    setSede(inicial?.sede_id ? String(inicial.sede_id) : datos.sedes.length === 1 ? String(datos.sedes[0].id) : '');
    setCargo('');
    setCantidad(1);
    setTipo('permanente');
    setDesde(getToday());
    setHasta('');
    setJustificacion(inicial?.justificacion ?? '');
    setIntento(false);
    setPlan(null);
  }, [abierto, inicial, datos.sedes, getToday]);

  const cargos = useMemo(() => datos.cargos.filter((c) => !area || c.area_id === area || c.area_id === null), [datos.cargos, area]);
  useEffect(() => {
    if (cargo && !cargos.some((c) => c.id === cargo)) setCargo('');
  }, [cargos, cargo]);

  useEffect(() => {
    setPlan(null);
    setErrorPlan(null);
    if (!abierto || !area || !sede || !cargo) return;
    let vigente = true;
    const h = setTimeout(() => {
      pedir<PlanPlaza>('/api/hrm/estructura/plazas/plan', { metodo: 'POST', cuerpo: { area_id: area, sede_id: Number(sede), cargo_id: cargo, cantidad } })
        .then((p) => vigente && setPlan(p))
        .catch((e) => vigente && setErrorPlan(mensajeError(e)));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(h);
    };
    // La cantidad no cambia quién aprueba salvo con reglas por monto; no se vuelve a pedir por ella.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, area, sede, cargo]);

  const errores = {
    area: !area ? t('errores.area') : null,
    sede: !sede ? t('errores.sede') : null,
    cargo: !cargo ? t('errores.cargo') : null,
    cantidad: !cantidad || cantidad < 1 ? t('errores.cantidad') : null,
    desde: !desde ? t('errores.desde') : null,
    hasta: tipo === 'temporal' && (!hasta || hasta < desde) ? t('errores.hasta') : null,
    justificacion: justificacion.trim().length < 5 ? t('errores.justificacion') : null,
  };
  const hayErrores = Object.values(errores).some(Boolean);
  const ver = (k: keyof typeof errores) => (intento ? errores[k] ?? undefined : undefined);
  const nombreCargo = datos.cargos.find((c) => c.id === cargo)?.nombre ?? '';
  const nombreSede = datos.sedes.find((s) => String(s.id) === sede)?.nombre ?? '';

  const enviar = async () => {
    setIntento(true);
    if (hayErrores || plan?.sin_aprobador) return;
    setEnviando(true);
    try {
      await pedir('/api/hrm/estructura/plazas', {
        metodo: 'POST',
        cuerpo: {
          area_id: area,
          sede_id: Number(sede),
          cargo_id: cargo,
          cantidad,
          tipo,
          desde,
          hasta: tipo === 'temporal' ? hasta : null,
          justificacion: justificacion.trim(),
        },
      });
      toast.success(t('enviada'));
      onEnviada();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  };

  const aprobador = plan?.aprobadores
    .map((a) => [a.nombre, a.cargo].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join(', ');

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={ClipboardList}
      ancho={560}
      ocupado={enviando}
      pie={
        <div className="flex w-full justify-end gap-3">
          <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario' })}>
            {tc('cancelar')}
          </button>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando || !!plan?.sin_aprobador}
            title={plan?.sin_aprobador ? t('sinAprobador') : undefined}
            className={clasesBoton({ variante: 'primario' })}
          >
            <Send aria-hidden className="size-4" strokeWidth={1.5} />
            {t('enviar')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('area')} obligatorio error={ver('area')}>
            {(c) => (
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('elegir')} />
                </SelectTrigger>
                <SelectContent>
                  {datos.areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('sede')} obligatorio ayuda={t('sedeAyuda')} error={ver('sede')}>
            {(c) => (
              <Select value={sede} onValueChange={setSede}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('elegir')} />
                </SelectTrigger>
                <SelectContent>
                  {datos.sedes.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
          <FormField etiqueta={t('cargo')} obligatorio error={ver('cargo')}>
            {(c) => (
              <Select value={cargo} onValueChange={setCargo}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('elegir')} />
                </SelectTrigger>
                <SelectContent>
                  {cargos.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('cantidad')} obligatorio error={ver('cantidad')}>
            <CampoNumero valor={cantidad} onValorChange={setCantidad} decimales={0} minimo={1} maximo={500} />
          </FormField>
        </div>
        <FormField etiqueta={t('tipo')}>
          {(c) => (
            <ChipsOpcion<TipoPlaza>
              aria-labelledby={c.idEtiqueta}
              valor={tipo}
              onValorChange={setTipo}
              opciones={[
                { valor: 'permanente', etiqueta: t('permanente') },
                { valor: 'temporal', etiqueta: t('temporal') },
              ]}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('desde')} obligatorio error={ver('desde')}>
            <CampoFecha valor={desde} onValorChange={setDesde} />
          </FormField>
          {tipo === 'temporal' ? (
            <FormField etiqueta={t('hasta')} obligatorio error={ver('hasta')}>
              <CampoFecha valor={hasta} onValorChange={setHasta} min={desde || undefined} />
            </FormField>
          ) : (
            <FormField etiqueta={t('justificacion')} obligatorio error={ver('justificacion')}>
              <Input value={justificacion} maxLength={500} onChange={(e) => setJustificacion(e.target.value)} />
            </FormField>
          )}
        </div>
        {tipo === 'temporal' && (
          <FormField etiqueta={t('justificacion')} obligatorio error={ver('justificacion')}>
            <Input value={justificacion} maxLength={500} onChange={(e) => setJustificacion(e.target.value)} />
          </FormField>
        )}

        {errorPlan && <AvisoTonal tono="peligro" titulo={errorPlan} compacto rol="alert" />}
        {plan && (
          <div className="flex flex-col gap-3 rounded-lg bg-brand-tint p-3 text-sm text-fg">
            {plan.escala && (
              <p className="flex gap-2">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} />
                {t('escala', {
                  cargo: nombreCargo,
                  sede: nombreSede,
                  minimo: moneda(plan.escala.minimo),
                  maximo: moneda(plan.escala.maximo),
                  medio: moneda(plan.escala.medio),
                })}
              </p>
            )}
            {plan.sin_aprobador ? (
              <p className="flex gap-2 text-danger-text" role="alert">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                {t('sinAprobador')}
              </p>
            ) : (
              <p className="flex gap-2">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} />
                {plan.regla
                  ? t('apruebaRegla', { quien: aprobador || t('rrhh'), regla: plan.regla.nombre })
                  : t('apruebaPorDefecto', { quien: aprobador || t('rrhh') })}
                {plan.pasos > 1 ? ` ${t('pasos', { n: plan.pasos })}` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </PanelAdaptable>
  );
}
