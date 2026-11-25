'use client';

/**
 * «Mis envíos» para quien no tiene perfil de domiciliario (Figma «21 Logística» b1 v2 3238-19877,
 * b2 v2 3238-19364; celular «18» y «19»). Reemplaza el aviso «No tienes perfil…» sin quitar nada:
 * dice qué es la página, quién registra y ofrece atajos de lo que el menú de la persona ya le
 * muestra.
 *
 * - Con permiso de registrar domiciliarios (lo resuelve el servidor, `fn_logistica_gestiona`):
 *   cifras de despacho, «Registrarme como domiciliario» con el MISMO diálogo completo de
 *   Domiciliarios (documentos y vehículo) y la cuenta propia ya elegida, e «Ir a Domiciliarios».
 * - Sin permiso: lo que podrá hacer cuando la registren y su correo para que quien despacha la
 *   vincule.
 *
 * «Ver la ruta de un domiciliario» abre la vista del supervisor en la misma página
 * (`?domiciliario=`), con el mismo permiso resuelto en el servidor.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowDown,
  Banknote,
  ChevronRight,
  Copy,
  Home,
  ListChecks,
  Lock,
  Route,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { EmptyState, PageHeader, Skeleton, StatCard, StatusBadge, clasesBoton } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { clavePagina } from '@/lib/navigation/catalog';
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';
import type { PerfilMisEnvios } from '@/lib/logistica/sinPerfil';
import { RegistrarDomiciliarioDialog } from '../domiciliarios/RegistrarDomiciliarioDialog';
import { leerPerfilMisEnvios } from '../logisticaApi';

export interface SinPerfilProps {
  /** Nombre de la sede de la cabecera (si hay una elegida). */
  sede: string | null;
  /** Tras registrarse: la página vuelve a leer quién es el domiciliario de la sesión. */
  onRegistrado: () => void;
}

const FUNCIONES = [
  { clave: 'ruta', icono: ListChecks },
  { clave: 'codigo', icono: Lock },
  { clave: 'cobrar', icono: Banknote },
  { clave: 'cuadrar', icono: Wallet },
] as const;

export function SinPerfil({ sede, onRegistrado }: SinPerfilProps) {
  const t = useTranslations('logistica.misEnvios.sinPerfil');
  const tm = useTranslations('logistica.misEnvios');
  const tNav = useTranslations('nav');
  const moneda = useMonedaOrganizacion();
  const [perfil, setPerfil] = useState<PerfilMisEnvios | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [registrar, setRegistrar] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setError(false);
    leerPerfilMisEnvios()
      .then((p) => !cancelado && setPerfil(p))
      .catch(() => !cancelado && setError(true));
    return () => {
      cancelado = true;
    };
  }, [version]);

  const nombrePagina = (p: { href: string; nombre: string }) => {
    const clave = `paginas.${clavePagina(p.href)}`;
    return tNav.has(clave) ? tNav(clave) : p.nombre;
  };
  const subtitulo = [t('subtitulo'), sede].filter(Boolean).join(' · ');
  const gestiona = perfil?.gestiona === true;
  const k = perfil?.kpis ?? null;

  const copiarCorreo = async () => {
    if (!perfil?.correo) return;
    try {
      await navigator.clipboard.writeText(perfil.correo);
      toastSuccess(t('correoCopiado'));
    } catch {
      toastError(t('noSeCopio'));
    }
  };

  const botonRegistrar = (
    <button type="button" onClick={() => setRegistrar(true)} className={clasesBoton({ variante: 'primario' })}>
      <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('registrarme')}
    </button>
  );

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-28 sm:pt-6">
        <PageHeader titulo={tm('titulo')} subtitulo={subtitulo} icono={Route} />
        <EmptyState variante="error" compacto titulo={tm('sinDomiciliario.titulo')} descripcion={tm('sinDomiciliario.descripcion')} onReintentar={() => setVersion((v) => v + 1)} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-28 sm:pt-6">
      <PageHeader
        titulo={tm('titulo')}
        subtitulo={subtitulo}
        icono={Route}
        cargando={!perfil}
        acciones={gestiona ? botonRegistrar : undefined}
        movil={{ subtitulo }}
      />

      {gestiona && k && (
        <section aria-label={t('cifras')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            tamano="sm"
            etiqueta={t('kpis.porDespachar')}
            valor={k.porDespachar}
            detalle={k.sinDomiciliario > 0 ? t('kpis.sinDomiciliario', { n: k.sinDomiciliario }) : t('kpis.todosAsignados')}
            tono={k.sinDomiciliario > 0 ? 'advertencia' : undefined}
            iconoDetalle={k.sinDomiciliario > 0 ? AlertTriangle : undefined}
            href={RUTAS_LOGISTICA.porDespachar}
          />
          <StatCard tamano="sm" etiqueta={t('kpis.enRuta')} valor={k.enRuta} detalle={t('kpis.enCalle', { n: k.domiciliariosEnCalle })} />
          <StatCard
            tamano="sm"
            etiqueta={t('kpis.novedades')}
            valor={k.novedades}
            detalle={k.porReprogramarHoy > 0 ? t('kpis.porReprogramar', { n: k.porReprogramarHoy }) : t('kpis.sinNovedades')}
            tono={k.porReprogramarHoy > 0 ? 'peligro' : undefined}
            iconoDetalle={k.porReprogramarHoy > 0 ? ArrowDown : undefined}
            href={RUTAS_LOGISTICA.seguimiento}
          />
          <StatCard
            tamano="sm"
            etiqueta={t('kpis.porCuadrar')}
            valor={moneda.formatear(k.porCuadrar)}
            detalle={t('kpis.domiciliariosConEfectivo', { n: k.domiciliariosPorCuadrar })}
            href={RUTAS_LOGISTICA.cuadres}
          />
        </section>
      )}

      {!perfil ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]" aria-busy="true">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 lg:p-7">
              <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-brand-tint text-brand">
                <Route className="size-6" strokeWidth={1.5} />
              </span>
              <h2 className="text-xl font-semibold text-fg">{gestiona ? (sede ? t('b1.tituloSede', { sede }) : t('b1.titulo')) : t('b2.titulo')}</h2>
              <p className="text-[15px] text-fg-secondary">{gestiona ? t('b1.descripcion') : t('b2.descripcion')}</p>

              {gestiona ? (
                <>
                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    <h3 className="text-base font-semibold text-fg">{t('b1.comoLlega')}</h3>
                    <ol className="flex flex-col gap-3">
                      {(['1', '2', '3'] as const).map((n) => (
                        <li key={n} className="flex items-start gap-3 text-sm text-fg-secondary">
                          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand">
                            {n}
                          </span>
                          <span>{t(`b1.pasos.${n}`)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {botonRegistrar}
                    <Link href={`${RUTAS_LOGISTICA.misEnvios}?domiciliario=`} className={clasesBoton({ variante: 'secundario' })}>
                      <Route aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('verRutaDe')}
                    </Link>
                    <Link href={RUTAS_LOGISTICA.domiciliarios} className={clasesBoton({ variante: 'secundario' })}>
                      <Users aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('irADomiciliarios')}
                    </Link>
                  </div>
                  <p className="text-xs text-fg-muted">{t('b1.notaRegistrar')}</p>
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-fg">{t('b2.cuandoTeRegistren')}</h3>
                  <FuncionesDomiciliario />
                  <div className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-4">
                    <h3 className="text-base font-semibold text-fg">{t('b2.quienRegistra')}</h3>
                    <p className="text-sm text-fg-secondary">{t('b2.quienRegistraTexto')}</p>
                    {perfil.correo && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3">
                        <span className="min-w-0 break-all text-[15px] font-medium text-fg">{perfil.correo}</span>
                        <button type="button" onClick={copiarCorreo} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                          <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
                          {t('copiarCorreo')}
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-center text-xs text-fg-muted">{t('b2.yaRegistrado')}</p>
                  <Link href="/app/inicio" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
                    <Home aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {t('irAlInicio')}
                  </Link>
                </>
              )}
            </section>

            {gestiona && (
              <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
                <h2 className="text-base font-semibold text-fg">{t('b1.loQueHace')}</h2>
                <FuncionesDomiciliario />
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            {perfil.atajos.length > 0 && (
              <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
                <h2 className="text-base font-semibold text-fg">{t('atajos.titulo')}</h2>
                <p className="text-xs text-fg-muted">{t('atajos.ayuda')}</p>
                <ul className="flex flex-col">
                  {perfil.atajos.map((a) => (
                    <li key={a.href}>
                      <Link
                        href={a.href}
                        className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-[15px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        {nombrePagina(a)}
                        <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <EjemploRuta />
          </aside>
        </div>
      )}

      {gestiona && perfil && (
        <RegistrarDomiciliarioDialog
          abierto={registrar}
          onAbiertoChange={setRegistrar}
          usuarioPropio={perfil.userId}
          onRegistrado={() => {
            setRegistrar(false);
            onRegistrado();
          }}
        />
      )}
    </div>
  );
}

function FuncionesDomiciliario() {
  const t = useTranslations('logistica.misEnvios.sinPerfil.funciones');
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {FUNCIONES.map(({ clave, icono: Icono }) => (
        <li key={clave} className="flex items-start gap-3 rounded-xl bg-subtle p-4">
          <Icono aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" strokeWidth={1.5} />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-medium text-fg">{t(`${clave}.titulo`)}</span>
            <span className="text-sm text-fg-secondary">{t(`${clave}.descripcion`)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** «Así se ve la ruta de un domiciliario»: ilustración marcada «Ejemplo», sin datos de nadie. */
function EjemploRuta() {
  const t = useTranslations('logistica.misEnvios.sinPerfil.ejemplo');
  const te = useTranslations('logistica.misEnvios.estados');
  const filas = [
    { n: 1, estado: 'delivered', tono: 'exito' as const },
    { n: 2, estado: 'out_for_delivery', tono: 'informacion' as const },
    { n: 3, estado: 'picked', tono: 'neutro' as const },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{t('titulo')}</h2>
        <StatusBadge estado="ejemplo" etiqueta={t('etiqueta')} tono="neutro" apariencia="contorno" />
      </div>
      <p className="text-sm text-fg-secondary">{t('descripcion')}</p>
      <ol className="flex flex-col gap-2" aria-label={t('titulo')}>
        {filas.map((f) => (
          <li key={f.n} className="flex items-center gap-3 rounded-lg bg-subtle px-3 py-2.5">
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-fg-secondary">
              {f.n}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{t('guia', { n: f.n })}</span>
              <span className="block truncate text-xs text-fg-muted">{t('direccion')}</span>
            </span>
            <StatusBadge estado={f.estado} etiqueta={te(f.estado)} tono={f.tono} apariencia="contorno" />
          </li>
        ))}
      </ol>
    </section>
  );
}
