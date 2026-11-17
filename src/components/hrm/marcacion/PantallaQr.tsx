'use client';

/**
 * Pantalla de QR (Figma 20.29.1, nodo 2658:120128, adaptada a una pantalla sin
 * kiosco; plan de Marcación D9). Se abre en un televisor o monitor de la sede con
 * la sesión de quien administra la asistencia (`hr.attendance.manage`); la
 * vinculación con clave propia del equipo llega con el kiosco (M1).
 *
 * El código cambia cada 30 s y sirve una sola vez: se calcula aquí, cada segundo,
 * con la clave del punto (`qrTotp.ts`), también sin internet. Con la página
 * visible se pregunta cada 3 s qué códigos del paso ya se usaron, para pasar al
 * siguiente apenas alguien marca (una fila de personas no espera 30 s).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { Expand, LogIn, MonitorSmartphone, WifiOff } from 'lucide-react';
import { EmptyState } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { contenidoQr, desfaseServidor, firmaQr, pasoDe, segundosRestantes, siguienteCodigo } from '@/lib/hrm/marcacion/qrTotp';
import { ErrorPersonas, pedir } from '../personas/apiPersonas';
import { RUTA_MARCACION } from './comunMarcacion';

interface InfoPantalla {
  reloj_id: string;
  org: number;
  nombre: string;
  sede: string | null;
  zona: string;
  clave: string | null;
  segundos: number;
  ahora: string;
}

interface UsosPantalla {
  paso: number;
  usado_hasta: number | null;
  activo: boolean;
  ahora: string;
}

type Fallo = 'sinSesion' | 'sinPermiso' | 'desactivada' | 'noExiste' | 'error';
type Estado = { tipo: 'cargando' } | { tipo: 'lista'; info: InfoPantalla; desfase: number } | { tipo: Fallo };

const CONSULTA_MS = 3_000;
const RECARGA_INFO_MS = 10 * 60_000;

function estadoDeError(e: unknown): Fallo {
  if (!(e instanceof ErrorPersonas)) return 'error';
  if (e.status === 401) return 'sinSesion';
  if (e.status === 403) return 'sinPermiso';
  if (e.status === 404) return 'noExiste';
  if (e.status === 409 && e.codigo === 'punto_inactivo') return 'desactivada';
  return 'error';
}

export function PantallaQr({ id }: { id: string }) {
  const t = useTranslations('hrmMarcacionRrhh.pantalla');
  const locale = useLocaleIntl();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [usos, setUsos] = useState<{ paso: number; usado: number | null } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [qr, setQr] = useState<{ paso: number; n: number; contenido: string } | null>(null);
  const [sinRed, setSinRed] = useState(false);
  const [completa, setCompleta] = useState(false);
  const base = `/api/hrm/marcacion/dispositivos/${encodeURIComponent(id)}/pantalla`;

  const cargarInfo = useCallback(async () => {
    try {
      const info = await pedir<InfoPantalla>(base);
      setEstado({ tipo: 'lista', info, desfase: desfaseServidor(info.ahora, Date.now()) });
      setSinRed(false);
    } catch (e) {
      const tipo = estadoDeError(e);
      // Sin internet con la clave ya cargada, la pantalla sigue mostrando el código.
      if (tipo === 'error') setSinRed(true);
      setEstado((actual) => (tipo === 'error' && actual.tipo === 'lista' ? actual : { tipo }));
    }
  }, [base]);

  useEffect(() => {
    void cargarInfo();
    const recarga = setInterval(() => {
      if (document.visibilityState === 'visible') void cargarInfo();
    }, RECARGA_INFO_MS);
    return () => clearInterval(recarga);
  }, [cargarInfo]);

  const lista = estado.tipo === 'lista' ? estado : null;
  const desfase = lista?.desfase ?? 0;
  const ahoraServidor = ahora + desfase;
  const paso = pasoDe(ahoraServidor);

  // Reloj de un segundo: cuenta regresiva y cambio de paso.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1_000);
    return () => clearInterval(reloj);
  }, []);

  // Qué códigos del paso ya se usaron: solo con la página visible.
  const pasoRef = useRef(paso);
  pasoRef.current = paso;
  useEffect(() => {
    if (!lista) return;
    let vivo = true;
    const consultar = async () => {
      if (document.visibilityState !== 'visible') return;
      const p = pasoRef.current;
      try {
        const r = await pedir<UsosPantalla>(`${base}?paso=${p}`);
        if (!vivo) return;
        setSinRed(false);
        if (!r.activo) {
          setEstado({ tipo: 'desactivada' });
          return;
        }
        setUsos({ paso: r.paso, usado: r.usado_hasta });
      } catch (e) {
        if (!vivo) return;
        const tipo = estadoDeError(e);
        if (tipo === 'error') setSinRed(true);
        else setEstado({ tipo });
      }
    };
    void consultar();
    const intervalo = setInterval(() => void consultar(), CONSULTA_MS);
    const alVolver = () => void consultar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [lista, base]);

  // Código que toca mostrar: el siguiente al último usado en este paso.
  const n = usos && usos.paso === paso ? siguienteCodigo(usos.usado) : 0;
  const clave = lista?.info.clave ?? null;
  const relojId = lista?.info.reloj_id ?? null;
  const org = lista?.info.org ?? null;
  useEffect(() => {
    if (!clave || !relojId || org === null) return;
    if (qr && qr.paso === paso && qr.n === n) return;
    let vivo = true;
    firmaQr(clave, relojId, paso, n)
      .then((firma) => {
        if (vivo) setQr({ paso, n, contenido: contenidoQr({ relojId, org, paso, n, firma }) });
      })
      .catch(() => {
        if (vivo) setEstado({ tipo: 'error' });
      });
    return () => {
      vivo = false;
    };
  }, [clave, relojId, org, paso, n, qr]);

  // La pantalla no se apaga mientras muestra el QR (si el navegador lo permite).
  useEffect(() => {
    if (!lista) return;
    type Bloqueo = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (tipo: 'screen') => Promise<Bloqueo> } };
    let bloqueo: Bloqueo | null = null;
    const pedirBloqueo = () => {
      if (document.visibilityState !== 'visible' || !nav.wakeLock) return;
      nav.wakeLock
        .request('screen')
        .then((b) => {
          bloqueo = b;
        })
        .catch(() => undefined);
    };
    pedirBloqueo();
    document.addEventListener('visibilitychange', pedirBloqueo);
    return () => {
      document.removeEventListener('visibilitychange', pedirBloqueo);
      void bloqueo?.release().catch(() => undefined);
    };
  }, [lista]);

  useEffect(() => {
    const alCambiar = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  if (!lista) {
    const tipo = estado.tipo;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        {tipo === 'cargando' ? (
          <p className="text-sm text-fg-secondary" role="status">
            {t('cargando')}
          </p>
        ) : (
          <EmptyState
            variante={tipo === 'sinPermiso' || tipo === 'sinSesion' ? 'forbidden' : tipo === 'error' ? 'error' : 'empty'}
            icono={tipo === 'sinSesion' ? LogIn : tipo === 'desactivada' || tipo === 'noExiste' ? MonitorSmartphone : undefined}
            titulo={t(`estados.${tipo}.titulo`)}
            descripcion={t(`estados.${tipo}.descripcion`)}
            accion={
              tipo === 'sinSesion'
                ? { etiqueta: t('iniciarSesion'), href: `/auth/login?redirectTo=${encodeURIComponent(`/marcacion/pantalla/${id}`)}`, icono: LogIn }
                : tipo === 'error'
                  ? { etiqueta: t('reintentar'), onClick: () => void cargarInfo() }
                  : { etiqueta: t('irADispositivos'), href: `${RUTA_MARCACION}?vista=dispositivos`, icono: MonitorSmartphone }
            }
          />
        )}
      </main>
    );
  }

  const { info } = lista;
  const zona = info.zona;
  const fechaServidor = new Date(ahoraServidor);
  const hora = new Intl.DateTimeFormat(locale, { timeZone: zona, hour: 'numeric', minute: '2-digit' }).format(fechaServidor);
  const fecha = new Intl.DateTimeFormat(locale, { timeZone: zona, weekday: 'long', day: 'numeric', month: 'long' }).format(fechaServidor);
  const restantes = segundosRestantes(ahoraServidor);
  const sede = info.sede ?? info.nombre;

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-canvas p-6 text-fg sm:p-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-brand text-[10px] font-bold text-fg-on-brand">
            GO
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{info.nombre}</p>
            {info.sede && <p className="truncate text-xs text-fg-secondary">{info.sede}</p>}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums leading-none text-fg sm:text-4xl" aria-live="off">
              {hora}
            </p>
            <p className="mt-1 text-sm text-fg-secondary">{fecha}</p>
          </div>
          {!completa && typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button
              type="button"
              onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
              aria-label={t('pantallaCompleta')}
              title={t('pantallaCompleta')}
              className="flex size-10 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Expand className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-xl flex-col items-center gap-5 rounded-2xl border border-line bg-surface px-6 py-8 text-center sm:px-10">
          <p className="text-lg font-medium text-fg">{t('escanea')}</p>
          <div className="w-full max-w-[min(60vh,420px)] rounded-xl border border-line bg-white p-4">
            {qr ? (
              <QRCodeSVG value={qr.contenido} size={512} level="M" marginSize={0} className="h-auto w-full" title={t('qrTitulo', { sede })} />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded-lg bg-subtle" aria-hidden="true" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-2xl font-semibold text-fg">{t('titulo')}</p>
            <p className="text-lg text-fg-secondary">{sede}</p>
            <p className="text-base text-fg-muted" aria-live="off">
              {t('cambiaEn', { n: restantes })}
            </p>
          </div>
          <p className="max-w-md text-sm text-fg-secondary">{t('instrucciones')}</p>
          {sinRed && (
            <p className="inline-flex items-center gap-2 rounded-full bg-warning-subtle px-3 py-1 text-xs font-medium text-warning-text" role="status">
              <WifiOff className="size-3.5" aria-hidden="true" />
              {t('sinInternet')}
            </p>
          )}
        </div>
      </section>

      <footer className="text-xs text-fg-muted">{t('pie')}</footer>
    </main>
  );
}
