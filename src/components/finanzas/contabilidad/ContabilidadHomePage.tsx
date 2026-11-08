'use client';

/**
 * Inicio de Contabilidad (Figma 987:622311 con avisos · 987:623198 todo en
 * orden · 987:624072 cargando · 988:626299 tableta · 989:77178 móvil).
 *
 * Qué conserva de la pantalla vieja: accesos a todas las páginas de
 * Contabilidad (plan, PUC, asientos, plantillas, reglas, configuración contable,
 * periodos, centros, activos, presupuestos), la tarjeta «Reportes contables»,
 * «Nuevo asiento», los avisos de reglas con fallo (`AlertasFalloContable`) y los
 * pendientes (ahora en Salud contable). Qué quita: la tarjeta de folios del PMS
 * (no es contable y leía todos los folios: va en el inicio del PMS) y el KPI
 * «Publicados», que se contaba sobre las primeras 1.000 filas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookOpen,
  Building,
  Calculator,
  CalendarClock,
  FileText,
  GitBranch,
  Landmark,
  ListChecks,
  Plus,
  RefreshCw,
  Scale,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import {
  AvisoTonal,
  KpiStrip,
  PageHeader,
  RelatedLinkCard,
  StatCard,
  clasesBoton,
  inicioDeMes,
  type TonoRelatedLink,
} from '@/components/kit';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { AlertasFalloContable } from '@/components/finanzas/configuracion-contable';
import {
  contarAgrupadoras,
  nombreMes,
  periodoActual,
  tonoAvisoInicio,
  type PeriodoActual,
} from '@/lib/finanzas/contabilidad/inicioContabilidadLogica';
import { ContabilidadService } from './ContabilidadService';
import { PeriodosFiscalesService } from './periodos-fiscales/PeriodosFiscalesService';
import { ReglasContablesService } from '@/components/finanzas/reglas-contables/ReglasContablesService';
import { SaludContableService } from './salud/SaludContableService';

type Lectura<T> = { estado: 'cargando' } | { estado: 'listo'; datos: T } | { estado: 'error' };
const CARGANDO = { estado: 'cargando' } as const;

interface Datos {
  asientosMes: Lectura<number>;
  periodo: Lectura<PeriodoActual>;
  pendientes: Lectura<number>;
  /** `null` en datos: la revisión de descuadres aún no está activada en la base. */
  descuadres: Lectura<number | null>;
  balance: Lectura<boolean>;
  plan: Lectura<{ cuentas: number; agrupadoras: number }>;
  reglas: Lectura<{ reglas: number; conAvisos: number }>;
  centros: Lectura<number>;
}

const VACIO: Datos = {
  asientosMes: CARGANDO,
  periodo: CARGANDO,
  pendientes: CARGANDO,
  descuadres: CARGANDO,
  balance: CARGANDO,
  plan: CARGANDO,
  reglas: CARGANDO,
  centros: CARGANDO,
};

export function ContabilidadHomePage() {
  const t = useTranslations('finanzasContabilidadR3.inicio');
  const tc = useTranslations('finanzasContabilidadR3.comun');
  const tReportes = useTranslations('reportesFinanzasR2.contabilidadInicio');
  const locale = useLocale();
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const [datos, setDatos] = useState<Datos>(VACIO);
  const turno = useRef(0);

  const cargar = useCallback(async () => {
    const mio = ++turno.current;
    setDatos(VACIO);
    const hoy = getToday();
    const fijar = <K extends keyof Datos>(clave: K, lectura: Datos[K]) => {
      if (mio === turno.current) setDatos((d) => ({ ...d, [clave]: lectura }));
    };
    const leer = <K extends keyof Datos, T>(clave: K, promesa: Promise<T>, mapa: (v: T) => Datos[K] extends Lectura<infer U> ? U : never) =>
      promesa
        .then((v) => fijar(clave, { estado: 'listo', datos: mapa(v) } as unknown as Datos[K]))
        .catch((error) => {
          console.error(`Inicio de Contabilidad: no se pudo leer ${String(clave)}:`, error);
          fijar(clave, { estado: 'error' } as Datos[K]);
        });
    await Promise.all([
      leer('asientosMes', ContabilidadService.resumenLibroDiario(inicioDeMes(hoy), hoy), (r) => r.asientos),
      leer('periodo', PeriodosFiscalesService.obtenerPeriodos(), (p) => periodoActual(p, hoy)),
      leer('pendientes', SaludContableService.pendientes(), (n) => n),
      leer('descuadres', SaludContableService.cruce(), (c) => (c ? c.totalDescuadres : null)),
      leer('balance', SaludContableService.balance(), (b) => b.cuadra),
      leer('plan', ContabilidadService.obtenerCuentasLigero(), (c) => ({ cuentas: c.length, agrupadoras: contarAgrupadoras(c.map((x) => x.account_code)) })),
      leer(
        'reglas',
        Promise.all([ReglasContablesService.obtenerReglas(), ReglasContablesService.obtenerDiagnostico()]),
        ([r, d]) => ({ reglas: r.length, conAvisos: new Set(d.map((x) => x.regla_id)).size }),
      ),
      leer('centros', ContabilidadService.listarCentrosCosto(), (c) => c.length),
    ]);
  }, [getToday]);

  useEffect(() => {
    if (tzLoading) return;
    void cargar();
  }, [tzLoading, cargar]);

  const v = <T,>(l: Lectura<T>): T | null => (l.estado === 'listo' ? l.datos : null);
  const periodo = v(datos.periodo);
  const pendientes = v(datos.pendientes);
  const descuadres = datos.descuadres.estado === 'listo' ? datos.descuadres.datos : null;
  const descuadresInactivo = datos.descuadres.estado === 'listo' && datos.descuadres.datos === null;
  const mes = periodo ? nombreMes(periodo.mes, periodo.anio, locale) : '';
  const mesMinuscula = mes.toLowerCase();
  const sinCerrar = periodo?.sinCerrar ?? [];
  const textoSinCerrar = sinCerrar.length
    ? t('periodo.sinCerrar', { n: sinCerrar.length, mes: periodo ? nombreMes(sinCerrar[sinCerrar.length - 1], periodo.anio, locale).toLowerCase() : '' })
    : t('periodo.alDia');
  const estadoPeriodo = periodo?.estado === 'closed' ? tc('periodo.cerrado') : periodo?.estado ? tc('periodo.abierto') : t('periodo.sinGenerar');
  const tono = tonoAvisoInicio(pendientes, descuadres);
  const cargandoTodo = Object.values(datos).every((l) => l.estado === 'cargando');

  const subtitulo = periodo
    ? t('subtitulo', { mes: nombreMes(periodo.mes, periodo.anio, locale, true).toLowerCase(), estado: estadoPeriodo.toLowerCase() })
    : t('subtituloCorto');

  const plan = v(datos.plan);
  const reglas = v(datos.reglas);
  const centros = v(datos.centros);
  const asientosMes = v(datos.asientosMes);
  const balance = v(datos.balance);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={Calculator}
        migas={[{ etiqueta: tc('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: tc('migas.contabilidad') }]}
        movil={{ accionesEnFila: true }}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void cargar()} aria-label={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">{t('actualizar')}</span>
            </button>
            <Link href="/app/finanzas/contabilidad/asientos?action=new" className={clasesBoton({ variante: 'primario' })}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevoAsiento')}
            </Link>
          </>
        }
      />

      {tono && (
        <AvisoTonal
          tono={tono}
          rol="alert"
          titulo={
            pendientes && descuadres
              ? t('aviso.ambos', { pendientes, descuadres })
              : pendientes
                ? t('aviso.pendientes', { n: pendientes })
                : t('aviso.descuadres', { n: descuadres ?? 0 })
          }
          descripcion={t('aviso.descripcion', { mes: mesMinuscula })}
          accion={{ etiqueta: t('aviso.abrirSalud'), href: pendientes ? '/app/finanzas/contabilidad/salud' : '/app/finanzas/contabilidad/salud?pestana=descuadres' }}
        />
      )}
      {!cargandoTodo && !tono && pendientes === 0 && (descuadres === 0 || descuadresInactivo) && balance === true && (
        <AvisoTonal tono="exito" compacto titulo={t('enOrden')} />
      )}

      <KpiStrip etiqueta={t('kpis.resumen')}>
        <StatCard
          etiqueta={periodo ? t('kpis.asientosDe', { mes: mesMinuscula }) : t('kpis.asientosMes')}
          valor={asientosMes ?? (datos.asientosMes.estado === 'error' ? '—' : '')}
          detalle={t('kpis.sinContraAsientos')}
          cargando={datos.asientosMes.estado === 'cargando'}
          href="/app/finanzas/contabilidad/asientos"
        />
        <StatCard
          etiqueta={t('kpis.periodoActual')}
          valor={periodo ? mes : datos.periodo.estado === 'error' ? '—' : ''}
          detalle={periodo ? `${estadoPeriodo.toLowerCase()} · ${textoSinCerrar}` : undefined}
          tono={periodo && sinCerrar.length ? 'advertencia' : periodo?.estado ? 'exito' : undefined}
          cargando={datos.periodo.estado === 'cargando'}
          href="/app/finanzas/contabilidad/periodos-fiscales"
        />
        <StatCard
          etiqueta={t('kpis.pendientes')}
          valor={pendientes ?? (datos.pendientes.estado === 'error' ? '—' : '')}
          detalle={pendientes ? t('kpis.verSalud') : undefined}
          tono={pendientes ? 'peligro' : undefined}
          cargando={datos.pendientes.estado === 'cargando'}
          href="/app/finanzas/contabilidad/salud"
        />
        <StatCard
          etiqueta={t('kpis.descuadres')}
          valor={descuadres ?? (datos.descuadres.estado === 'cargando' ? '' : '—')}
          detalle={descuadresInactivo ? t('kpis.descuadresInactivo') : t('kpis.descuadresDetalle')}
          tono={descuadres ? 'advertencia' : undefined}
          cargando={datos.descuadres.estado === 'cargando'}
          href="/app/finanzas/contabilidad/salud?pestana=descuadres"
        />
      </KpiStrip>

      <AlertasFalloContable compacto />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="inicio-contabilidad-informes" className="space-y-3">
          <h2 id="inicio-contabilidad-informes" className="text-base font-semibold text-fg">
            {t('informes.titulo')}
          </h2>
          <Acceso icono={BookOpen} etiqueta={t('informes.libroDiario')} valor={asientosMes != null && periodo ? t('informes.libroDiarioValor', { n: asientosMes, mes: mesMinuscula }) : t('informes.libroDiarioDesc')} href="/app/finanzas/contabilidad/asientos" />
          <Acceso icono={FileText} etiqueta={t('informes.mayor')} valor={t('informes.mayorDesc')} href="/app/finanzas/contabilidad/mayor-contable" />
          <Acceso
            icono={Scale}
            etiqueta={t('informes.balancePrueba')}
            valor={balance === null ? t('informes.balancePruebaDesc') : balance ? tc('cuadre.cuadra') : t('informes.noCuadra')}
            tono={balance === false ? 'danger' : 'neutral'}
            href="/app/reportes/contabilidad/balance-prueba"
          />
          <Acceso icono={TrendingUp} etiqueta={t('informes.estadoResultados')} valor={t('informes.estadoResultadosDesc')} href="/app/reportes/contabilidad/estado-resultados" />
          <Acceso icono={Landmark} etiqueta={t('informes.balanceGeneral')} valor={t('informes.balanceGeneralDesc')} href="/app/reportes/contabilidad/balance-general" />
          <Acceso icono={ListChecks} etiqueta={tReportes('titulo')} valor={tReportes('descripcion')} href="/app/reportes/contabilidad" />
        </section>

        <section aria-labelledby="inicio-contabilidad-config" className="space-y-3">
          <h2 id="inicio-contabilidad-config" className="text-base font-semibold text-fg">
            {t('configuracion.titulo')}
          </h2>
          <Acceso
            icono={ListChecks}
            etiqueta={t('configuracion.plan')}
            valor={plan ? t('configuracion.planValor', { cuentas: plan.cuentas, agrupadoras: plan.agrupadoras }) : t('configuracion.planDesc')}
            href="/app/finanzas/contabilidad/plan-cuentas"
          />
          <Acceso
            icono={GitBranch}
            etiqueta={t('configuracion.reglas')}
            valor={reglas ? (reglas.conAvisos ? t('configuracion.reglasConAvisos', { n: reglas.reglas, avisos: reglas.conAvisos }) : t('configuracion.reglasValor', { n: reglas.reglas })) : t('configuracion.reglasDesc')}
            tono={reglas?.conAvisos ? 'warning' : 'neutral'}
            accion={reglas?.conAvisos ? t('revisar') : undefined}
            href="/app/finanzas/reglas-contables"
          />
          <Acceso icono={CalendarClock} etiqueta={t('configuracion.periodos')} valor={periodo ? textoSinCerrar : t('configuracion.periodosDesc')} href="/app/finanzas/contabilidad/periodos-fiscales" />
          <Acceso icono={ShieldCheck} etiqueta={t('configuracion.salud')} valor={t('configuracion.saludDesc')} href="/app/finanzas/contabilidad/salud" />
          <Acceso
            icono={Building}
            etiqueta={t('configuracion.centros')}
            valor={centros === 0 ? t('configuracion.centrosVacio') : centros ? t('configuracion.centrosValor', { n: centros }) : t('configuracion.centrosDesc')}
            accion={centros === 0 ? t('crear') : undefined}
            href="/app/finanzas/centro-costos"
          />
          <Acceso icono={FileText} etiqueta={t('configuracion.plantillas')} valor={t('configuracion.plantillasDesc')} href="/app/finanzas/contabilidad/plantillas" />
          <Acceso icono={Settings} etiqueta={t('configuracion.cuentasAutomaticas')} valor={t('configuracion.cuentasAutomaticasDesc')} href="/app/finanzas/configuracion-contable" />
          <Acceso icono={RefreshCw} etiqueta={t('configuracion.puc')} valor={t('configuracion.pucDesc')} href="/app/finanzas/contabilidad/actualizar-puc" />
          <Acceso icono={Building} etiqueta={t('configuracion.activos')} valor={t('configuracion.activosDesc')} href="/app/finanzas/activos-fijos" />
          <Acceso icono={Target} etiqueta={t('configuracion.presupuestos')} valor={t('configuracion.presupuestosDesc')} href="/app/finanzas/presupuestos" />
        </section>
      </div>
    </div>
  );
}

function Acceso({
  icono,
  etiqueta,
  valor,
  href,
  tono = 'neutral',
  accion,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: string;
  href: string;
  tono?: TonoRelatedLink;
  accion?: string;
}) {
  const t = useTranslations('finanzasContabilidadR3.inicio');
  return <RelatedLinkCard icono={icono} etiqueta={etiqueta} valor={valor} href={href} tono={tono} textoAccion={accion ?? t('abrir')} />;
}
