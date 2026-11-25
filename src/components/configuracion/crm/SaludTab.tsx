'use client';

/**
 * Configuración › CRM › Salud de clientes (Figma pág. «10 Configuración», sección
 * 3080:36387; S2–S9, nota técnica S10; aprobado por el dueño el 2026-11-24). Antes
 * era la página «Factores de salud» del CRM; su ruta ahora abre el diálogo aquí.
 *
 * Edita `health_score_configs.config` (forma de `healthBands.ts`): peso e
 * interruptor de cada indicador y los cortes de las bandas, con la vista previa
 * sobre los datos actuales (`vistaPrevia`, el mismo `scoreFromConfig` del cron).
 *
 * - Leer y guardar: `healthScoreService.getConfigSalud` / `guardarConfigSalud`
 *   (`/api/crm/health/config`). El servidor valida otra vez y decide
 *   `puedeEditar` (solo admin): sin permiso, solo lectura (S6).
 * - Guardar va en la barra del diálogo («N cambios sin guardar · Descartar ·
 *   Guardar y recalcular», `useRegistrarCambios`). Mientras la organización no
 *   tenga fila, la barra queda a la vista con «Propuesta inicial sin guardar»
 *   (S2/S3); con errores de validación, Guardar se bloquea (S5).
 * - Tras guardar se queda en el diálogo y dispara el recálculo sin esperarlo
 *   (`refreshAllHealthScores`, como antes).
 * - «Restaurar predeterminados» vuelve a `DEFAULT_HEALTH_CONFIG` sin guardar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { AvisoTonal, CampoNumero, EmptyState } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { logError } from '@/lib/utils/errorMessage';
import { DEFAULT_HEALTH_CONFIG, validateHealthConfig, type HealthConfigJson, type HealthIndicatorJson } from '@/lib/services/crm/healthBands';
import { ErrorConfigSaludApi, healthScoreService, type ConfigSaludRespuesta, type HealthScoreResult } from '@/lib/services/crm/healthScoreService';
import { conBanda, conEncendido, conPeso, configComparable, partesUmbral, sumaPesos, unidadDeClave, vistaPrevia } from '@/components/crm/health/saludLogica';
import { capitalizar } from '@/components/crm/health/useTextosSalud';
import { cn } from '@/utils/Utils';
import { contarCambios, useRegistrarCambios } from '../dialogo/cambiosSinGuardar';

interface Estado {
  respuesta: ConfigSaludRespuesta;
  /** Lo guardado (o la propuesta inicial): contra esto se cuentan los cambios. */
  original: HealthConfigJson;
  editado: HealthConfigJson;
}

/** Error al guardar: los del servidor que tienen texto propio, o el genérico (S7). */
type ErrorGuardar = { tipo: 'validacion'; errores: string[] } | { tipo: 'generico' };

const FILA = 'flex flex-col gap-3 border-t border-line py-3 sm:flex-row sm:items-center';

export function SaludTab() {
  const t = useTranslations('crmSalud');
  const tr = useTranslations('crm.redSalud');
  const idioma = useLocale();
  const { formatear } = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? 0;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [resultados, setResultados] = useState<HealthScoreResult[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<ErrorGuardar | null>(null);

  const cargar = useCallback(async () => {
    setErrorCarga(false);
    try {
      const r = await healthScoreService.getConfigSalud();
      setEstado({ respuesta: r, original: r.config, editado: r.config });
    } catch (e) {
      logError('[Salud] cargar configuración', e);
      setErrorCarga(true);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!orgId) return;
    healthScoreService
      .getPanelSalud(orgId)
      .then(setResultados)
      .catch((e: unknown) => {
        logError('[Salud] vista previa', e);
        setResultados([]);
      });
  }, [orgId]);

  const editado = estado?.editado ?? null;
  const puedeEditar = !!estado?.respuesta.puedeEditar;
  const errores = useMemo(() => (editado ? validateHealthConfig(editado) : []), [editado]);
  const previa = useMemo(() => (editado && resultados && resultados.length > 0 ? vistaPrevia(resultados, editado) : null), [editado, resultados]);
  const cambios = estado && puedeEditar ? contarCambios(configComparable(estado.original), configComparable(estado.editado)) : 0;
  const propuesta = !!estado && puedeEditar && !estado.respuesta.guardada;
  const n = (x: number) => new Intl.NumberFormat(idioma).format(x);

  const editar = (f: (c: HealthConfigJson) => HealthConfigJson) => {
    setErrorGuardar(null);
    setEstado((e) => (e ? { ...e, editado: f(e.editado) } : e));
  };

  const guardar = async () => {
    if (!estado || !puedeEditar || guardando || validateHealthConfig(estado.editado).length > 0) return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const r = await healthScoreService.guardarConfigSalud(estado.editado);
      setEstado({ respuesta: r, original: r.config, editado: r.config });
      toast({ title: t('guardado.titulo'), description: t('guardado.descripcion') });
      // No bloquea (anotación 1424:1606): la pasada sigue en el servidor.
      healthScoreService.refreshAllHealthScores().catch((e: unknown) => logError('[Salud] recalcular tras guardar', e));
    } catch (e) {
      logError('[Salud] guardar configuración', e);
      if (e instanceof ErrorConfigSaludApi && e.status === 403) setErrorGuardar({ tipo: 'validacion', errores: ['soloAdmin'] });
      else if (e instanceof ErrorConfigSaludApi && e.errores.length > 0) setErrorGuardar({ tipo: 'validacion', errores: e.errores });
      else setErrorGuardar({ tipo: 'generico' });
    } finally {
      setGuardando(false);
    }
  };
  const descartar = () => {
    setErrorGuardar(null);
    setEstado((e) => (e ? { ...e, editado: e.original } : e));
  };

  const aviso =
    errores.length > 0
      ? { texto: errores.includes('pesos') ? t('barra.revisarPesos') : t('barra.revisar'), tono: 'peligro' as const }
      : cambios === 0 && propuesta
        ? { texto: t('barra.propuesta'), tono: 'informacion' as const }
        : undefined;
  useRegistrarCambios({
    cambios,
    guardando,
    guardar,
    descartar,
    etiquetaGuardar: t('barra.guardar'),
    bloqueado: errores.length > 0,
    aviso,
    pendiente: propuesta,
  });

  if (errorCarga) {
    return <EmptyState variante="error" titulo={t('errorCargar.titulo')} descripcion={t('errorCargar.descripcion')} onReintentar={() => void cargar()} />;
  }
  if (!estado || !editado) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t('cargando')}>
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-fg-muted" />
      </div>
    );
  }

  /** Número con su unidad («30 d», «10 %», «$ 100.000.000»); `desnudo` = sin unidad (inicio de un tramo «30–90 d»). */
  const valorUmbral = (ind: HealthIndicatorJson, v: number, desnudo = false) => {
    const unidad = unidadDeClave(ind.key);
    if (unidad === 'dias') return desnudo ? n(v) : t('unidad.dias', { n: n(v) });
    if (unidad === 'porcentaje') return desnudo ? n(Math.round(v * 100)) : t('unidad.porcentaje', { n: n(Math.round(v * 100)) });
    if (unidad === 'dinero') return formatear(v);
    return n(v);
  };
  const textoUmbrales = (ind: HealthIndicatorJson) =>
    capitalizar(
      partesUmbral(ind)
        .map((p) =>
          p.tipo === 'rango'
            ? t('umbral.rango', { desde: valorUmbral(ind, p.valor, unidadDeClave(ind.key) !== 'dinero'), hasta: valorUmbral(ind, p.hasta ?? p.valor), puntos: p.puntos })
            : t(`umbral.${p.tipo}`, { valor: valorUmbral(ind, p.valor), puntos: p.puntos }),
        )
        .join(' · '),
    );
  const etiqueta = (ind: HealthIndicatorJson) => {
    const base = tr.has(`factor.${ind.key}`) ? tr(`factor.${ind.key}`) : ind.label;
    return unidadDeClave(ind.key) === 'porcentaje' ? t('indicadores.delSaldo', { nombre: base }) : base;
  };
  const textoError = (e: string) => (t.has(`errores.${e}`) ? t(`errores.${e}`) : t('errorGuardar.descripcion'));

  const { respuesta } = estado;
  const bloqueado = !puedeEditar || guardando;
  const suma = sumaPesos(editado);
  const erroresVista = puedeEditar ? [...new Set([...errores, ...(errorGuardar?.tipo === 'validacion' ? errorGuardar.errores : [])])] : [];
  const pesosMal = errores.includes('pesos') || errores.includes('sinIndicadores');
  const pesosFabrica = new Intl.ListFormat(idioma, { type: 'conjunction' }).format(DEFAULT_HEALTH_CONFIG.indicators.map((i) => n(i.weight)));
  const bandas = [
    { tono: 'exito' as const, texto: t('bandas.verde'), valor: editado.bands.green, banda: 'green' as const },
    { tono: 'advertencia' as const, texto: t('bandas.amarilla'), valor: editado.bands.yellow, banda: 'yellow' as const },
    { tono: 'peligro' as const, texto: t('bandas.roja'), valor: editado.bands.yellow, banda: null },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {(!puedeEditar || propuesta || !respuesta.activa || erroresVista.length > 0 || errorGuardar?.tipo === 'generico') && (
        <div className="flex flex-col gap-3">
          {!puedeEditar && <AvisoTonal tono="informacion" titulo={t('avisos.soloAdmin')} />}
          {propuesta && <AvisoTonal tono="informacion" titulo={t('avisos.propuesta.titulo')} descripcion={t('avisos.propuesta.descripcion')} />}
          {!respuesta.activa && <AvisoTonal tono="advertencia" titulo={t('avisos.inactiva')} />}
          {erroresVista.length > 0 && <AvisoTonal tono="peligro" rol="alert" titulo={t('errores.titulo')} descripcion={erroresVista.map(textoError).join(' ')} />}
          {errorGuardar?.tipo === 'generico' && <AvisoTonal tono="peligro" rol="alert" titulo={t('errorGuardar.titulo')} descripcion={t('errorGuardar.descripcion')} />}
        </div>
      )}

      {/* Indicadores (S2) */}
      <section className="flex flex-col" aria-labelledby="salud-indicadores">
        <div className="flex items-start justify-between gap-3 pb-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 id="salud-indicadores" className="text-base font-semibold text-fg">
              {t('indicadores.titulo')}
            </h3>
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('indicadores.descripcion')}</p>
          </div>
          <Badge tono={suma === 100 ? 'exito' : 'advertencia'} tamano="sm" className="shrink-0">
            {t('indicadores.suma', { n: n(suma) })}
          </Badge>
        </div>
        <div aria-hidden="true" className="hidden items-center gap-4 border-t border-line py-2 text-xs font-medium text-fg-secondary sm:flex">
          <span className="min-w-0 flex-1">{t('indicadores.columnaIndicador')}</span>
          <span className="w-[200px]">{t('indicadores.columnaPeso')}</span>
          <span className="w-9 text-right">{t('indicadores.columnaUsar')}</span>
        </div>
        <ul className="flex flex-col">
          {editado.indicators.map((ind) => {
            const nombre = etiqueta(ind);
            const encendido = ind.enabled !== false;
            return (
              <li key={ind.key} className={FILA}>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', encendido ? 'text-fg' : 'text-fg-muted')}>{nombre}</p>
                  <p className="text-[13px] leading-[18px] text-fg-secondary">{textoUmbrales(ind)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <CampoNumero
                    className="w-full sm:w-[200px]"
                    aria-label={t('indicadores.peso', { nombre })}
                    aria-invalid={pesosMal && encendido && puedeEditar ? true : undefined}
                    valor={ind.weight}
                    onValorChange={(v) => editar((c) => conPeso(c, ind.key, v ?? 0))}
                    sufijo="%"
                    decimales={0}
                    minimo={0}
                    maximo={100}
                    alinear="derecha"
                    disabled={bloqueado || !encendido}
                  />
                  <Switch
                    checked={encendido}
                    onCheckedChange={(v) => editar((c) => conEncendido(c, ind.key, v))}
                    aria-label={t('indicadores.encendido', { nombre })}
                    disabled={bloqueado}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Bandas y vista previa, debajo de los indicadores (S2: el diálogo mide 752 px) */}
      <section className="flex flex-col" aria-labelledby="salud-bandas">
        <div className="flex flex-col gap-1 pb-3">
          <h3 id="salud-bandas" className="text-base font-semibold text-fg">
            {t('bandas.titulo')}
          </h3>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('bandas.descripcion')}</p>
        </div>
        {bandas.map((b) => (
          <div key={b.texto} className="flex items-center justify-between gap-3 border-t border-line py-3">
            <Badge tono={b.tono} tamano="sm">
              {b.texto}
            </Badge>
            <CampoNumero
              className="w-[120px]"
              aria-label={b.texto}
              aria-invalid={errores.includes('bandas') && b.banda && puedeEditar ? true : undefined}
              valor={b.valor}
              onValorChange={(v) => {
                const banda = b.banda;
                if (banda) editar((c) => conBanda(c, banda, v ?? 0));
              }}
              decimales={0}
              minimo={0}
              maximo={100}
              alinear="derecha"
              disabled={bloqueado || !b.banda}
              readOnly={!b.banda}
            />
          </div>
        ))}
        <div className="mt-1 flex flex-col gap-1 rounded-lg bg-subtle px-3 py-2.5" aria-live="polite">
          <p className="text-[13px] font-medium text-fg">{t('vistaPrevia.titulo')}</p>
          <p className="text-[13px] leading-[18px] text-fg-secondary">
            {resultados === null
              ? t('vistaPrevia.cargando')
              : previa
                ? t('vistaPrevia.texto', {
                    gA: n(previa.antes.green),
                    gD: n(previa.despues.green),
                    yA: n(previa.antes.yellow),
                    yD: n(previa.despues.yellow),
                    rA: n(previa.antes.red),
                    rD: n(previa.despues.red),
                  })
                : t('vistaPrevia.sinDatos')}
          </p>
        </div>
      </section>

      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-subtle px-3 py-2.5">
          <p className="min-w-0 flex-1 basis-64 text-[13px] leading-[18px] text-fg-secondary">
            {t('predeterminados.nota', {
              n: DEFAULT_HEALTH_CONFIG.indicators.length,
              pesos: pesosFabrica,
              verde: n(DEFAULT_HEALTH_CONFIG.bands.green),
              amarilla: n(DEFAULT_HEALTH_CONFIG.bands.yellow),
            })}
          </p>
          <button type="button" onClick={() => editar(() => DEFAULT_HEALTH_CONFIG)} disabled={guardando} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            {t('predeterminados.restaurar')}
          </button>
        </div>
      )}
    </div>
  );
}
