'use client';

/**
 * Pantalla «Módulo no habilitado» (Figma `EAvjINVRnlzFM70GVoWXgl`, página «08
 * Acceso y organización», sección `2416:62653`; capturas
 * `docs/design/figma/90-modulo-no-habilitado-*.png`; decisiones en
 * docs/design/MODULO-NO-HABILITADO.md).
 *
 * La monta la ruta interna `/app/modulo-no-habilitado`, a la que el middleware
 * REESCRIBE la petición bloqueada: la URL del navegador sigue siendo la del
 * módulo (`usePathname`), con sus migas y su cabecera.
 *
 * Qué se ve lo decide el servidor (`GET /api/modules/acceso`): la causa
 * (apagado, sin cupo, sin plan, página oculta, cargo) y si la persona puede
 * resolverla. Este componente solo pinta la matriz causa × rol; nunca decide
 * un permiso. Las acciones vuelven a pasar por el servidor:
 *  - «Encender» lleva a Organización › Módulos con la tarjeta resaltada (allí
 *    se confirma).
 *  - «Mostrar página» llama a `POST /api/modules/pages` (exige administrador).
 *  - «Avisar» / «Pedir acceso» llama a `POST /api/modules/acceso/avisar`.
 *
 * Reemplaza a `ModuleAccessDenied` (textos cableados, sin organización, sin
 * acción) y al `Alert` genérico del inicio.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  Bell,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Grid3x3,
  LayoutGrid,
  Power,
  Send,
  Sparkles,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, PageHeader, clasesBoton } from '@/components/kit';
import { Cohete, Luna, Planeta, ViajeroDePie, ViajeroSentado } from '@/components/kit/acceso/ilustraciones';
import { Skeleton } from '@/components/ui/skeleton';
import { moduloPorCodigo, type PaginaNav } from '@/lib/navigation/catalog';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { RUTA_MODULO_NO_HABILITADO, accionPrincipal, type CausaAcceso } from '@/lib/organizacion/accesoModulo';
import type { AccesoModuloResuelto, PersonaResuelve } from '@/lib/organizacion/accesoModulo';
import { cn } from '@/utils/Utils';

/** Correo de soporte: el mismo «Ayuda» de las pantallas de acceso. */
const AYUDA_HREF = 'mailto:soporte@goadmin.io';
/** Cuántas páginas se listan antes de «Y N páginas más». */
const PAGINAS_VISIBLES = 3;

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error' }
  | { fase: 'listo'; acceso: AccesoModuloResuelto };

/** Lee el veredicto del servidor para la ruta. */
function useAccesoModulo(ruta: string | null) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const cargar = useCallback(async () => {
    if (!ruta) {
      setEstado({ fase: 'error' });
      return;
    }
    setEstado({ fase: 'cargando' });
    try {
      const res = await fetch(`/api/modules/acceso?ruta=${encodeURIComponent(ruta)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { acceso: AccesoModuloResuelto };
      setEstado({ fase: 'listo', acceso: json.acceso });
    } catch {
      setEstado({ fase: 'error' });
    }
  }, [ruta]);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  return { estado, recargar: cargar, setEstado };
}

/** Ruta pedida: la del navegador; si se entró a la ruta interna, la que trae la reescritura. */
export function rutaPedida(pathname: string | null, rutaRespaldo: string | null): string | null {
  if (pathname && pathname !== RUTA_MODULO_NO_HABILITADO && pathname.startsWith('/app/')) return pathname;
  return rutaRespaldo && rutaRespaldo.startsWith('/app/') ? rutaRespaldo : null;
}

interface Fila {
  icono: LucideIcon;
  titulo: string;
  descripcion?: string;
}

function Panel({ titulo, filas, vacio, className }: { titulo: string; filas: Fila[]; vacio?: string; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-xl bg-subtle p-4 lg:p-5', className)}>
      <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
      {filas.length === 0 && vacio ? (
        <p className="text-[13px] text-fg-secondary">{vacio}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((f, i) => {
            const Icono = f.icono;
            return (
              <li key={`${f.titulo}-${i}`} className="flex gap-3">
                <Icono aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="text-sm text-fg">{f.titulo}</p>
                  {f.descripcion && <p className="text-[13px] text-fg-secondary">{f.descripcion}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface Pantalla {
  ilustracion: ReactNode;
  titulo: string;
  descripcion: string;
  subtitulo: string;
  subtituloMovil?: string;
  acciones: ReactNode;
  izquierda: { titulo: string; filas: Fila[]; vacio?: string };
  derecha: { titulo: string; filas: Fila[]; vacio?: string } | null;
  /** Qué panel queda en el celular (Figma 09–11 muestran uno solo). */
  panelMovil: 'izquierda' | 'derecha';
}

export function ModuloNoHabilitado({ rutaRespaldo = null }: { rutaRespaldo?: string | null }) {
  const pathname = usePathname();
  const ruta = rutaPedida(pathname, rutaRespaldo);
  const { estado, recargar, setEstado } = useAccesoModulo(ruta);
  const t = useTranslations('moduloNoHabilitado');
  const tNav = useTranslations('nav');
  const nombres = useNombresNav();
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [mostrando, setMostrando] = useState(false);
  const [anuncio, setAnuncio] = useState('');

  const acceso = estado.fase === 'listo' ? estado.acceso : null;
  const nav = acceso?.modulo ? moduloPorCodigo(acceso.modulo) : undefined;
  const nombreModulo = acceso?.modulo ? nombres.modulo(acceso.modulo) ?? acceso.modulo : '';
  const paginaNav = useMemo<PaginaNav | undefined>(
    () => (acceso?.pagina ? nav?.paginas.find((p) => p.href === acceso.pagina) : undefined),
    [acceso?.pagina, nav],
  );
  const nombrePagina = paginaNav ? nombres.pagina(paginaNav) : '';

  const avisar = async () => {
    if (!ruta || !acceso || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/modules/acceso/avisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruta }),
      });
      const json = (await res.json().catch(() => ({}))) as { resultado?: { notificados: number; repetida: boolean }; code?: string };
      if (!res.ok || !json.resultado) {
        const mensaje = json.code === 'sin_destinatarios' ? t('avisar.sinDestinatarios') : t('avisar.error');
        setAnuncio(mensaje);
        toast.error(mensaje);
        return;
      }
      const mensaje = json.resultado.repetida ? t('avisar.repetido') : t('avisar.enviado', { n: json.resultado.notificados });
      setAnuncio(mensaje);
      toast.success(mensaje);
      setEstado({ fase: 'listo', acceso: { ...acceso, yaAvisado: true } });
    } catch {
      setAnuncio(t('avisar.error'));
      toast.error(t('avisar.error'));
    } finally {
      setEnviando(false);
    }
  };

  const mostrarPagina = async () => {
    if (!acceso?.modulo || !paginaNav || mostrando) return;
    setMostrando(true);
    try {
      const res = await fetch('/api/modules/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleCode: acceso.modulo, pageHref: paginaNav.href, pageName: paginaNav.nombre, isActive: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (!res.ok || !json.success) throw new Error(String(res.status));
      // El menú vuelve a leer las páginas ocultas y la ruta se vuelve a pedir:
      // el middleware ya no la bloquea y se pinta la página de verdad.
      window.dispatchEvent(new Event('modules-updated'));
      router.refresh();
    } catch {
      toast.error(t('pagina.admin.errorMostrar'));
      setMostrando(false);
    }
  };

  if (estado.fase === 'cargando') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t('cargando')}
        </span>
        <Skeleton className="hidden h-14 w-72 rounded-lg lg:block" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  if (estado.fase === 'error' || !acceso) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />
      </div>
    );
  }

  if (!acceso.causa) {
    // Ya no está bloqueado (alguien lo encendió) o se entró directo a la ruta interna.
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          titulo={t('sinBloqueo.titulo')}
          descripcion={t('sinBloqueo.descripcion')}
          accion={
            ruta && ruta !== RUTA_MODULO_NO_HABILITADO
              ? { etiqueta: t('sinBloqueo.abrir'), onClick: () => router.refresh() }
              : { etiqueta: t('volverInicio'), href: '/app/inicio' }
          }
        />
      </div>
    );
  }

  const causa: CausaAcceso = acceso.causa;
  const principal = accionPrincipal(causa, acceso.puedeResolver);
  const vars = {
    modulo: nombreModulo,
    pagina: nombrePagina,
    organizacion: acceso.organizacion,
    plan: acceso.plan?.nombre ?? '',
    cupo: acceso.plan?.cupo ?? 0,
    usados: acceso.plan?.usados ?? 0,
    persona: acceso.persona ?? '—',
    cargo: acceso.cargo?.nombre ?? '',
  };

  const filaPagina = (href: string): Fila => {
    const p = nav?.paginas.find((x) => x.href === href);
    return {
      icono: p?.icono ?? LayoutGrid,
      titulo: p ? nombres.pagina(p) : href,
      descripcion: p ? nombres.descripcion(p) ?? (p.grupo ? nombres.grupo(p.grupo) : undefined) : undefined,
    };
  };
  const filasPaginas = (hrefs: string[]): Fila[] => {
    const primeras = hrefs.slice(0, PAGINAS_VISIBLES).map(filaPagina);
    const resto = hrefs.slice(PAGINAS_VISIBLES);
    if (resto.length === 0) return primeras;
    const lista = resto.slice(0, 4).map((h) => filaPagina(h).titulo).join(', ');
    return [...primeras, { icono: Grid3x3, titulo: t('paginasMas.titulo', { n: resto.length }), descripcion: t('paginasMas.descripcion', { lista }) }];
  };
  const filasPersonas = (personas: PersonaResuelve[]): Fila[] =>
    personas.map((p) => ({ icono: User, titulo: p.nombre, descripcion: t(`papel.${p.papel}`) }));
  const filaModulo = (codigo: string): Fila => {
    const m = moduloPorCodigo(codigo);
    return { icono: m?.icono ?? LayoutGrid, titulo: nombres.modulo(codigo) ?? codigo };
  };

  // ─── Botones ──────────────────────────────────────────────────────────────
  const ancho = 'w-full sm:w-auto';
  const volverInicio = (
    <Link href="/app/inicio" className={clasesBoton({ variante: 'secundario', className: ancho })}>
      {t('volverInicio')}
    </Link>
  );
  const botonAvisar = (primario: boolean) => {
    const yaHecho = acceso.yaAvisado;
    const etiqueta = enviando
      ? t('avisar.enviando')
      : yaHecho
        ? causa === 'cargo'
          ? t('avisar.yaPedido')
          : t('avisar.yaAvisado')
        : causa === 'cargo'
          ? t('avisar.pedirAcceso')
          : t('avisar.boton');
    return (
      <button
        type="button"
        onClick={() => void avisar()}
        disabled={enviando || yaHecho}
        aria-disabled={enviando || yaHecho}
        className={clasesBoton({ variante: primario ? 'primario' : 'secundario', className: ancho })}
      >
        <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {etiqueta}
      </button>
    );
  };
  const primeraVisible = acceso.paginas[0] ?? nav?.paginas[0]?.href ?? '/app/inicio';
  const nombrePrimeraVisible = filaPagina(primeraVisible).titulo;
  const IconoModulo = nav?.icono ?? LayoutGrid;

  let pantalla: Pantalla;
  switch (principal) {
    case 'encender':
      pantalla = {
        ilustracion: <Cohete className="h-28 w-auto lg:h-32" />,
        titulo: t('apagado.admin.titulo', vars),
        descripcion: acceso.plan?.cupo == null ? t('apagado.admin.descripcionSinTope', vars) : t('apagado.admin.descripcion', vars),
        subtitulo: t('apagado.admin.subtitulo', vars),
        subtituloMovil: t('apagado.admin.subtituloMovil'),
        acciones: (
          <>
            <Link
              href={`/app/organizacion/modulos?resaltar=${encodeURIComponent(acceso.modulo ?? '')}`}
              className={clasesBoton({ className: ancho })}
            >
              <Power aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('apagado.admin.encender', vars)}
            </Link>
            {volverInicio}
          </>
        ),
        izquierda: { titulo: t('apagado.admin.paginasTitulo'), filas: filasPaginas(acceso.paginas) },
        derecha: {
          titulo: t('apagado.admin.queParaTitulo'),
          filas: [
            { icono: Users, titulo: t('apagado.admin.menuTitulo'), descripcion: t('apagado.admin.menuDesc', vars) },
            {
              icono: Crown,
              titulo: t('apagado.admin.cupoTitulo'),
              descripcion:
                acceso.plan?.cupo == null
                  ? t('apagado.admin.cupoDescSinTope')
                  : t('apagado.admin.cupoDesc', { usados: (acceso.plan?.usados ?? 0) + 1, cupo: acceso.plan.cupo }),
            },
            { icono: Clock, titulo: t('apagado.admin.despuesTitulo'), descripcion: t('apagado.admin.despuesDesc') },
          ],
        },
        panelMovil: 'izquierda',
      };
      break;
    case 'verPlanes': {
      const sinPlan = causa === 'otroPlan';
      const usados = acceso.plan?.usados ?? 0;
      pantalla = {
        ilustracion: <Planeta className="h-24 w-auto lg:h-28" />,
        titulo: sinPlan ? t('otroPlan.admin.titulo', vars) : t('limite.admin.titulo', vars),
        descripcion: sinPlan ? t('otroPlan.admin.descripcion', vars) : t('limite.admin.descripcion', vars),
        subtitulo: sinPlan ? t('otroPlan.admin.subtitulo', vars) : t('limite.admin.subtitulo', vars),
        subtituloMovil: sinPlan ? t('otroPlan.admin.subtituloMovil') : t('limite.admin.subtituloMovil'),
        acciones: (
          <>
            <Link
              href={`/app/organizacion/plan${acceso.planesConCupo[0] ? `?plan=${encodeURIComponent(acceso.planesConCupo[0].codigo)}` : ''}`}
              className={clasesBoton({ className: ancho })}
            >
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('limite.admin.verPlanes')}
            </Link>
            <Link href="/app/organizacion/plan" className={clasesBoton({ variante: 'secundario', className: ancho })}>
              {t('limite.admin.aMedida')}
            </Link>
            {!sinPlan && (
              <Link href="/app/organizacion/modulos" className={clasesBoton({ variante: 'fantasma', className: cn(ancho, 'text-fg') })}>
                {t('limite.admin.apagarOtro')}
              </Link>
            )}
          </>
        ),
        izquierda: {
          titulo: t('limite.admin.encendidosTitulo', { usados, cupo: acceso.plan?.cupo ?? usados }),
          filas: acceso.opcionalesEncendidos.map(filaModulo),
        },
        derecha: {
          titulo: t('limite.admin.disponibleTitulo'),
          filas: [
            ...acceso.planesConCupo.map((p) => ({
              icono: p.cupo === null ? Sparkles : Crown,
              titulo: t('limite.admin.planTitulo', { plan: p.nombre }),
              descripcion:
                p.cupo === null
                  ? t('limite.admin.planSinTope')
                  : t('limite.admin.planCupo', { cupo: p.cupo, libres: Math.max(0, p.cupo - usados - 1) }),
            })),
            { icono: Grid3x3, titulo: t('limite.admin.aMedida'), descripcion: t('limite.admin.aMedidaDesc') },
          ],
        },
        panelMovil: 'derecha',
      };
      break;
    }
    case 'mostrarPagina':
      pantalla = {
        ilustracion: <Luna className="h-28 w-auto lg:h-32" />,
        titulo: t('pagina.admin.titulo', vars),
        descripcion: t('pagina.admin.descripcion', vars),
        subtitulo: t('pagina.admin.subtitulo', vars),
        subtituloMovil: t('pagina.admin.subtituloMovil'),
        acciones: (
          <>
            <button
              type="button"
              onClick={() => void mostrarPagina()}
              disabled={mostrando || !paginaNav}
              className={clasesBoton({ className: ancho })}
            >
              <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {mostrando ? t('pagina.admin.mostrando') : t('pagina.admin.mostrar')}
            </button>
            <Link href={primeraVisible} className={clasesBoton({ variante: 'secundario', className: ancho })}>
              {t('pagina.admin.irA', { pagina: nombrePrimeraVisible })}
            </Link>
          </>
        ),
        izquierda: {
          titulo: t('pagina.admin.alMostrarTitulo'),
          filas: [
            { icono: Eye, titulo: t('pagina.admin.vuelveTitulo'), descripcion: t('pagina.admin.vuelveDesc', vars) },
            { icono: Crown, titulo: t('pagina.admin.cupoTitulo'), descripcion: t('pagina.admin.cupoDesc') },
            { icono: EyeOff, titulo: t('pagina.admin.ocultarTitulo'), descripcion: t('pagina.admin.ocultarDesc', vars) },
          ],
        },
        derecha: { titulo: t('pagina.admin.visiblesTitulo', vars), filas: filasPaginas(acceso.paginas) },
        panelMovil: 'izquierda',
      };
      break;
    case 'irAModulo':
      pantalla = {
        ilustracion: <Luna className="h-28 w-auto lg:h-32" />,
        titulo: t('pagina.miembro.titulo'),
        descripcion: t('pagina.miembro.descripcion', vars),
        subtitulo: t('pagina.miembro.subtitulo'),
        acciones: (
          <>
            <Link href={primeraVisible} className={clasesBoton({ className: ancho })}>
              <IconoModulo aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('pagina.miembro.irA', vars)}
            </Link>
            {acceso.puedeAvisar && botonAvisar(false)}
          </>
        ),
        izquierda: { titulo: t('pagina.miembro.quienTitulo'), filas: filasPersonas(acceso.personas), vacio: t('sinPersonas') },
        derecha: { titulo: t('pagina.miembro.puedesTitulo'), filas: filasPaginas(acceso.paginas) },
        panelMovil: 'derecha',
      };
      break;
    case 'editarCargo':
    case 'pedirAcceso':
      pantalla = {
        ilustracion: <ViajeroDePie className="h-32 w-auto lg:h-36" />,
        titulo: t('cargo.titulo', vars),
        descripcion: acceso.cargo?.nombre ? t('cargo.descripcion', vars) : t('cargo.descripcionSinNombre', vars),
        subtitulo: t('cargo.subtitulo'),
        subtituloMovil: t('cargo.subtituloMovil'),
        acciones: (
          <>
            {principal === 'editarCargo' ? (
              <Link
                href={acceso.cargo?.id ? `/app/hrm/cargos/${encodeURIComponent(acceso.cargo.id)}` : '/app/hrm/cargos'}
                className={clasesBoton({ className: ancho })}
              >
                {t('cargo.editarCargo')}
              </Link>
            ) : (
              botonAvisar(true)
            )}
            {volverInicio}
          </>
        ),
        izquierda: { titulo: t('cargo.quienTitulo'), filas: filasPersonas(acceso.personas), vacio: t('sinPersonas') },
        derecha: { titulo: t('cargo.incluyeTitulo'), filas: (acceso.cargo?.modulos ?? []).map(filaModulo), vacio: t('cargo.incluyeVacio') },
        panelMovil: 'izquierda',
      };
      break;
    case 'avisar':
    default: {
      const apagado = causa === 'apagado';
      pantalla = {
        ilustracion: apagado ? <ViajeroSentado className="h-28 w-auto lg:h-32" /> : <Planeta className="h-24 w-auto lg:h-28" />,
        titulo: apagado ? t('apagado.miembro.titulo', vars) : t('limite.miembro.titulo', vars),
        descripcion: apagado ? t('apagado.miembro.descripcion') : t('limite.miembro.descripcion'),
        subtitulo: apagado ? t('apagado.miembro.subtitulo', vars) : t('limite.miembro.subtitulo', vars),
        subtituloMovil: apagado ? t('apagado.miembro.subtituloMovil') : t('limite.miembro.subtituloMovil'),
        acciones: (
          <>
            {botonAvisar(true)}
            {volverInicio}
          </>
        ),
        izquierda: {
          titulo: apagado ? t('apagado.miembro.quienTitulo') : t('limite.miembro.quienTitulo'),
          filas: filasPersonas(acceso.personas),
          vacio: t('sinPersonas'),
        },
        derecha: {
          titulo: t('apagado.miembro.recibeTitulo'),
          filas: [
            {
              icono: Bell,
              titulo: t('apagado.miembro.notifTitulo'),
              descripcion: apagado ? t('apagado.miembro.notifDesc', vars) : t('limite.miembro.notifDesc', vars),
            },
            { icono: Clock, titulo: t('apagado.miembro.diaTitulo'), descripcion: t('apagado.miembro.diaDesc') },
          ],
        },
        panelMovil: 'izquierda',
      };
    }
  }

  const esPagina = causa === 'paginaOculta';
  const tituloCabecera = esPagina && nombrePagina ? nombrePagina : nombreModulo;
  const idTitulo = 'modulo-no-habilitado-titulo';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-6">
      <PageHeader
        titulo={tituloCabecera}
        subtitulo={pantalla.subtitulo}
        icono={esPagina ? paginaNav?.icono ?? IconoModulo : IconoModulo}
        migas={[{ etiqueta: t('inicio'), href: '/app/inicio' }, { etiqueta: nav ? tNav(nav.etiqueta) : nombreModulo }]}
        volverA="/app/inicio"
        movil={{ subtitulo: pantalla.subtituloMovil ?? pantalla.subtitulo }}
      />

      <section
        aria-labelledby={idTitulo}
        className="flex flex-col gap-6 rounded-xl border border-line bg-surface px-4 py-8 lg:gap-8 lg:px-8 lg:py-10"
      >
        <div className="flex flex-col items-center gap-6 text-center lg:gap-8">
          <div className="flex h-28 items-end justify-center lg:h-36">{pantalla.ilustracion}</div>
          <div className="flex max-w-md flex-col gap-2">
            <h2 id={idTitulo} className="text-lg font-semibold text-fg">
              {pantalla.titulo}
            </h2>
            <p className="text-sm text-fg-secondary">{pantalla.descripcion}</p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
            {pantalla.acciones}
          </div>
          <div role="status" aria-live="polite" className="sr-only">
            {anuncio}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            titulo={pantalla.izquierda.titulo}
            filas={pantalla.izquierda.filas}
            vacio={pantalla.izquierda.vacio}
            className={pantalla.panelMovil === 'izquierda' ? undefined : 'max-lg:hidden'}
          />
          {pantalla.derecha && (
            <Panel
              titulo={pantalla.derecha.titulo}
              filas={pantalla.derecha.filas}
              vacio={pantalla.derecha.vacio}
              className={pantalla.panelMovil === 'derecha' ? undefined : 'max-lg:hidden'}
            />
          )}
        </div>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-secondary">
          <span className="max-lg:hidden">{t('ayuda.pregunta')}</span>
          <a href={AYUDA_HREF} className="font-medium text-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {t('ayuda.enlace')}
          </a>
        </p>
      </section>
    </div>
  );
}
