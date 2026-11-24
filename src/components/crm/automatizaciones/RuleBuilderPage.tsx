'use client';

/**
 * Constructor de una regla a página completa (Figma CRM 1375:17 «Constructor —
 * disparador, condiciones y acciones» y 1379:776 «Constructor — prueba en
 * seco»). Rutas: `/app/crm/automatizaciones/nueva` y `/app/crm/automatizaciones/[id]`.
 *
 * Izquierda, los tres bloques Cuando · Si se cumple · Entonces. Derecha, «En
 * palabras», «Límites» y el aviso si la regla envía; con «Probar en seco» el
 * panel pasa a «Resultado de la prueba» (repetición de los últimos 30 días,
 * `POST /api/crm/automation-rules/[id]/replay`: nunca ejecuta ni cobra).
 * Guardar crea una versión nueva (`version + 1`, `updated_by`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { History, Play, Save, X, Zap } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { EmptyState } from '@/components/kit/EmptyState';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { Skeleton } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { describeRule } from '@/lib/services/crm/automation/ruleHumanizer';
import {
  formToPayload,
  ruleToForm,
  validateForm,
  type FormError,
  type RuleFormState,
} from '@/lib/services/crm/automation/ruleEditorModel';
import { browserFetch, fetchRule, RuleHttpError, saveRule, type AutomationRuleView } from '@/lib/services/crm/automation/ruleMutations';
import { avisoEnvio } from '@/lib/services/crm/automation/automationListaLogica';
import type { ReplayAutomatizacion } from '@/lib/services/crm/automation/automationReplay';
import { BloqueAcciones, BloqueCondiciones, BloqueCuando, BloqueRegla, ConectorBloques, ICONOS_BLOQUE } from './BloquesConstructor';
import { ReplayResultado } from './ReplayResultado';
import { rutaReplay } from './replayLogica';
import { useRuleLookups } from './useRuleLookups';

const BASE = '/app/crm/automatizaciones';

type Carga = 'cargando' | 'listo' | 'noEncontrada' | 'sinPermiso' | 'error';
type Prueba = { estado: 'cerrada' } | { estado: 'cargando' } | { estado: 'listo'; resultado: ReplayAutomatizacion } | { estado: 'error'; mensaje: string };

/** «hace 2 días» con el idioma de la interfaz (es un delta: no depende de la zona). */
function haceTiempo(iso: string | null | undefined, locale: string): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const seg = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seg);
  if (abs < 60) return rtf.format(seg, 'second');
  if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seg / 3600), 'hour');
  return rtf.format(Math.round(seg / 86_400), 'day');
}

export function RuleBuilderPage({ ruleId }: { ruleId: string | null }) {
  const t = useTranslations('crm.automatizaciones.constructor');
  const router = useRouter();
  const params = useSearchParams();
  const locale = useLocale();
  const lookups = useRuleLookups();

  const [carga, setCarga] = useState<Carga>(ruleId ? 'cargando' : 'listo');
  const [rule, setRule] = useState<AutomationRuleView | null>(null);
  const [form, setForm] = useState<RuleFormState>(() => ruleToForm(null));
  const [original, setOriginal] = useState<string>(() => JSON.stringify(formToPayload(ruleToForm(null))));
  const [errores, setErrores] = useState<FormError[]>([]);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [prueba, setPrueba] = useState<Prueba>({ estado: 'cerrada' });
  const [salir, setSalir] = useState(false);
  const pruebaInicial = useRef(params?.get('prueba') === '1');

  const cargar = useCallback(async () => {
    if (!ruleId) return;
    setCarga('cargando');
    try {
      const r = await fetchRule(browserFetch, ruleId);
      const f = ruleToForm(r);
      setRule(r);
      setForm(f);
      setOriginal(JSON.stringify(formToPayload(f)));
      setCarga('listo');
    } catch (e) {
      const status = e instanceof RuleHttpError ? e.status : 0;
      setCarga(status === 404 ? 'noEncontrada' : status === 401 || status === 403 ? 'sinPermiso' : 'error');
    }
  }, [ruleId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sucio = useMemo(() => JSON.stringify(formToPayload(form)) !== original, [form, original]);

  const probar = useCallback(async () => {
    if (!ruleId) return;
    setPrueba({ estado: 'cargando' });
    try {
      const { data } = await pedirCrm<ReplayAutomatizacion>(rutaReplay(ruleId), { method: 'POST', cuerpo: {} });
      setPrueba({ estado: 'listo', resultado: data });
    } catch (e) {
      setPrueba({ estado: 'error', mensaje: e instanceof Error ? e.message : '' });
    }
  }, [ruleId]);

  // «Probar en seco» desde el menú de la fila llega con `?prueba=1`.
  useEffect(() => {
    if (carga === 'listo' && pruebaInicial.current) {
      pruebaInicial.current = false;
      void probar();
    }
  }, [carga, probar]);

  const cambiar = (next: RuleFormState) => {
    setForm(next);
    if (errores.length) setErrores(validateForm(next));
  };

  const guardar = async () => {
    const errs = validateForm(form);
    setErrores(errs);
    if (errs.length) {
      const primero = errs[0].field;
      document.getElementById(primero === 'name' ? 'rule-name' : primero === 'cooldown_hours' ? 'rule-cooldown' : 'action-add')?.focus();
      return;
    }
    setGuardando(true);
    setErrorServidor(null);
    try {
      const { row } = await saveRule(browserFetch, formToPayload(form, ruleId ?? undefined) as unknown as Partial<AutomationRuleView> & { id?: string });
      toast({ title: ruleId ? t('toast.guardada', { version: row.version ?? 1 }) : t('toast.creada') });
      if (!ruleId) {
        setOriginal(JSON.stringify(formToPayload(form)));
        router.replace(`${BASE}/${row.id}`);
        return;
      }
      await cargar();
    } catch (e) {
      setErrorServidor(e instanceof Error ? e.message : t('errorDesconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const volver = () => {
    if (sucio) setSalir(true);
    else router.push(BASE);
  };

  if (carga === 'cargando') {
    return (
      <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6" aria-busy="true">
        <PageHeader titulo={t('cargandoTitulo')} variante="form" volverA={BASE} cargando migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.automatizaciones'), href: BASE }]} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (carga !== 'listo') {
    const variante = carga === 'sinPermiso' ? 'forbidden' : carga === 'error' ? 'error' : 'empty';
    return (
      <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
        <PageHeader titulo={t('migas.automatizaciones')} variante="form" volverA={BASE} migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.automatizaciones'), href: BASE }]} />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante={variante}
            icono={variante === 'empty' ? Zap : undefined}
            titulo={t(`estados.${carga}.titulo`)}
            descripcion={t(`estados.${carga}.descripcion`)}
            onReintentar={carga === 'error' ? () => void cargar() : undefined}
            accion={carga === 'noEncontrada' ? { etiqueta: t('estados.noEncontrada.volver'), href: BASE } : undefined}
          />
        </div>
      </div>
    );
  }

  const estadoRegla = form.is_active ? t('cabecera.activa') : t('cabecera.pausada');
  const subtitulo = rule
    ? t('cabecera.version', {
        version: rule.version ?? 1,
        editor: rule.editor_name ?? t('cabecera.alguien'),
        hace: haceTiempo(rule.updated_at, locale),
        estado: estadoRegla,
      })
    : t('cabecera.nueva');
  const frase = describeRule(
    { ...form, pipeline_id: form.pipeline_id || null, stage_id: form.stage_id || null, event: form.event || null },
    lookups.humanizer,
  );
  const aviso = avisoEnvio(form.actions);
  const errorNombre = errores.find((e) => e.field === 'name')?.message;
  const errorEnfriamiento = errores.find((e) => e.field === 'cooldown_hours')?.message;

  const panelPrueba = prueba.estado !== 'cerrada' && rule;

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={form.name.trim() || (ruleId ? rule?.name ?? '' : t('nueva'))}
        subtitulo={subtitulo}
        variante="form"
        volverA={BASE}
        onVolver={volver}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.automatizaciones'), href: BASE }]}
        acciones={
          <>
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario' })}
              disabled={!ruleId || prueba.estado === 'cargando'}
              title={!ruleId ? t('probarSinGuardar') : undefined}
              onClick={() => void probar()}
            >
              <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('probar')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} disabled={guardando} onClick={() => void guardar()}>
              <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {guardando ? t('guardando') : t('guardar')}
            </button>
            {ruleId && (
              <Link href={`${BASE}/historial?regla=${ruleId}`} aria-label={t('verHistorial')} title={t('verHistorial')} className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })}>
                <History aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </Link>
            )}
          </>
        }
        movil={{
          accion: (
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} disabled={guardando} onClick={() => void guardar()}>
              {t('guardar')}
            </button>
          ),
        }}
      />

      {errorServidor && (
        <AvisoTonal tono="peligro" rol="alert" titulo={t('noGuardo')} descripcion={errorServidor} />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <BloqueRegla id="blk-cuando" icono={ICONOS_BLOQUE.cuando} titulo={t('bloques.cuando')}>
            <BloqueCuando form={form} lookups={lookups} onChange={cambiar} />
          </BloqueRegla>
          <ConectorBloques />
          <BloqueRegla id="blk-si" icono={ICONOS_BLOQUE.si} titulo={t('bloques.si')}>
            <BloqueCondiciones form={form} lookups={lookups} onChange={cambiar} />
          </BloqueRegla>
          <ConectorBloques />
          <BloqueRegla id="blk-entonces" icono={ICONOS_BLOQUE.entonces} titulo={t('bloques.entonces')}>
            <BloqueAcciones form={form} lookups={lookups} errors={errores} onChange={cambiar} />
          </BloqueRegla>
        </div>

        <aside className="min-w-0 space-y-4" aria-label={t('panel')}>
          {panelPrueba && prueba.estado === 'listo' ? (
            <ReplayResultado
              resultado={prueba.resultado}
              rule={panelPrueba}
              lookups={lookups.humanizer}
              onCerrar={() => setPrueba({ estado: 'cerrada' })}
              etiquetaCerrar={t('prueba.cerrar')}
              nota={sucio ? t('prueba.versionGuardada') : undefined}
            />
          ) : panelPrueba ? (
            <section className="rounded-xl border border-line bg-surface p-4" aria-labelledby="prueba-titulo">
              <div className="mb-3 flex items-center gap-2">
                <h2 id="prueba-titulo" className="flex-1 text-base font-semibold text-fg">{t('prueba.titulo')}</h2>
                <button
                  type="button"
                  aria-label={t('prueba.cerrar')}
                  className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  onClick={() => setPrueba({ estado: 'cerrada' })}
                >
                  <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </div>
              {prueba.estado === 'error' ? (
                <AvisoTonal tono="peligro" compacto titulo={t('prueba.error')} descripcion={prueba.mensaje} accion={{ etiqueta: t('prueba.reintentar'), onClick: () => void probar() }} />
              ) : (
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-5 w-3/4" />
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-label={t('nombre.seccion')}>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-name" className="text-[13px] text-fg">{t('nombre.etiqueta')}</Label>
                  <Input
                    id="rule-name"
                    value={form.name}
                    placeholder={t('nombre.placeholder')}
                    autoComplete="off"
                    aria-invalid={!!errorNombre}
                    aria-describedby={errorNombre ? 'rule-name-error' : undefined}
                    className="h-10 rounded-lg border-line-strong"
                    onChange={(e) => cambiar({ ...form, name: e.target.value })}
                  />
                  {errorNombre && <p id="rule-name-error" role="alert" className="text-xs text-danger-text">{t('nombre.error')}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rule-desc" className="text-[13px] text-fg">{t('nombre.descripcion')}</Label>
                  <Textarea id="rule-desc" rows={2} value={form.description} placeholder={t('nombre.descripcionPlaceholder')}
                    className="rounded-lg border-line-strong" onChange={(e) => cambiar({ ...form, description: e.target.value })} />
                </div>
              </section>

              <section className="rounded-xl border border-line-brand bg-brand-tint p-4" aria-labelledby="en-palabras">
                <h2 id="en-palabras" className="text-xs font-semibold text-fg-secondary">{t('enPalabras')}</h2>
                <p aria-live="polite" className="mt-2 break-words text-[13px] leading-5 text-fg">{frase}</p>
              </section>

              <section className="space-y-4 rounded-xl border border-line bg-surface p-4" aria-labelledby="limites">
                <h2 id="limites" className="text-base font-semibold text-fg">{t('limites.titulo')}</h2>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="rule-once" className="text-[13px] text-fg">{t('limites.unaVez')}</Label>
                  <Switch id="rule-once" checked={form.run_once_per_opportunity} onCheckedChange={(v) => cambiar({ ...form, run_once_per_opportunity: v })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="rule-cooldown" className="text-[13px] text-fg">{t('limites.enfriamiento')}</Label>
                  <div className="flex h-10 w-[200px] items-stretch overflow-hidden rounded-lg border border-line-strong focus-within:ring-2 focus-within:ring-brand">
                    <input
                      id="rule-cooldown"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={8760}
                      value={form.cooldown_hours}
                      aria-invalid={!!errorEnfriamiento}
                      aria-describedby="rule-cooldown-unidad"
                      className="min-w-0 flex-1 bg-surface px-3 text-right text-sm tabular-nums text-fg focus:outline-none"
                      onChange={(e) => cambiar({ ...form, cooldown_hours: Number(e.target.value) })}
                    />
                    <span id="rule-cooldown-unidad" className="flex items-center border-l border-line-strong bg-subtle px-3 text-[13px] text-fg-secondary">{t('limites.horas')}</span>
                  </div>
                </div>
                {errorEnfriamiento && <p role="alert" className="text-xs text-danger-text">{t('limites.errorEnfriamiento')}</p>}
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="rule-ley2300" className="text-[13px] text-fg">{t('limites.ley2300')}</Label>
                  <Switch id="rule-ley2300" checked={form.solo_horario_ley2300} onCheckedChange={(v) => cambiar({ ...form, solo_horario_ley2300: v })} />
                </div>
              </section>

              {aviso && <AvisoTonal tono="advertencia" compacto titulo={t(`aviso.${aviso}`)} />}
            </>
          )}
        </aside>
      </div>

      <ConfirmDialog
        abierto={salir}
        onAbiertoChange={setSalir}
        titulo={t('salir.titulo')}
        descripcion={t('salir.descripcion')}
        textoConfirmar={t('salir.confirmar')}
        tono="advertencia"
        onConfirmar={() => {
          setSalir(false);
          router.push(BASE);
        }}
      />
    </div>
  );
}
