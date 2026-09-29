'use client';

/**
 * Bloque «Hoy» del panel completo del inicio (Figma `445:137185`, bloque
 * `447:72950`): hasta cinco `TarjetaHoy` con lo accionable de la sucursal
 * activa. Sustituye a `DashboardAlertas` (avisos sin acción, sin moneda y sin
 * sucursal).
 *
 * Datos: `GET /api/inicio/hoy` (organización de la sesión). Qué casillas se
 * pintan y en qué orden lo decide `casillasHoy()` (lib/dashboard/bloqueHoy).
 * Se refresca al cambiar de sucursal, al pulsar «Actualizar» de la página
 * (`version`) y cada 2 min mientras la pestaña esté visible (§P5 de la
 * auditoría: nada de intervalos de 30 s).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { casillasHoy, cosasPorAtender, type CasillaHoy, type DatosHoy, type TextoHoy } from '@/lib/dashboard/bloqueHoy';
import { TarjetaHoy } from './TarjetaHoy';

const INTERVALO_MS = 120_000;
/** En móvil se ven primero las casillas más urgentes (AUDITORIA-DASHBOARD-INICIO §P6). */
const VISIBLES_MOVIL = 3;

interface BloqueHoyProps {
  organizationId: number;
  /** Sucursal del selector del header; `null` = todas las que ve la persona. */
  sucursal: number | null;
  /** Sube cuando la página pide «Actualizar». */
  version?: number;
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error' }
  | { fase: 'listo'; datos: DatosHoy; generadoEn: string };

export function BloqueHoy({ organizationId, sucursal, version = 0 }: BloqueHoyProps) {
  const t = useTranslations('home.hoy');
  const { formatTime } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [verTodas, setVerTodas] = useState(false);
  const pedido = useRef(0);

  const cargar = useCallback(
    async (silencioso: boolean) => {
      const id = ++pedido.current;
      if (!silencioso) setEstado({ fase: 'cargando' });
      try {
        const qs = sucursal ? `?sucursal=${sucursal}` : '';
        const res = await fetch(`/api/inicio/hoy${qs}`, {
          headers: { 'X-Organization-Id': String(organizationId) },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DatosHoy & { generadoEn: string };
        if (id === pedido.current) setEstado({ fase: 'listo', datos: json, generadoEn: json.generadoEn });
      } catch {
        // La recarga silenciosa conserva lo último que se vio.
        if (id === pedido.current && !silencioso) setEstado({ fase: 'error' });
      }
    },
    [organizationId, sucursal]
  );

  useEffect(() => {
    cargar(false);
  }, [cargar, version]);

  useEffect(() => {
    const tic = window.setInterval(() => {
      if (document.visibilityState === 'visible') cargar(true);
    }, INTERVALO_MS);
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar(true);
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(tic);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  const casillas = useMemo(() => (estado.fase === 'listo' ? casillasHoy(estado.datos) : []), [estado]);
  const porAtender = cosasPorAtender(casillas);
  const ocultasMovil = casillas.slice(VISIBLES_MOVIL).map((c) => t(`etiquetas.${c.id}`));
  const texto = (x: TextoHoy) => t(x.clave, x.params);
  const cifra = (c: CasillaHoy) =>
    c.cifra.tipo === 'moneda'
      ? // Formato de la moneda (es-CO para COP: «$ 3.480.000»), como el resto de cifras de la app.
        formatMoneda(c.cifra.valor, c.cifra.moneda || moneda.code, { decimals: 0 })
      : texto(c.cifra.texto);

  return (
    <section aria-labelledby="inicio-hoy-titulo" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="inicio-hoy-titulo" className="text-lg font-semibold leading-6 text-fg">
          {t('titulo')}
        </h2>
        {estado.fase === 'listo' && casillas.length > 0 && (
          <StatusBadge
            estado="porAtender"
            etiqueta={t('porAtender', { n: porAtender })}
            tono={porAtender > 0 ? 'advertencia' : 'exito'}
            apariencia="suave"
          />
        )}
        {estado.fase === 'listo' && (
          <p className="ml-auto text-xs text-fg-secondary max-sm:hidden" role="status">
            {t('actualizadoALas', { hora: formatTime(estado.generadoEn) })}
          </p>
        )}
      </div>

      {estado.fase === 'cargando' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[152px] rounded-xl" />
          ))}
        </div>
      ) : estado.fase === 'error' ? (
        <EmptyState variante="error" compacto onReintentar={() => cargar(false)} />
      ) : casillas.length === 0 ? (
        <EmptyState compacto titulo={t('vacioTitulo')} descripcion={t('vacioDesc')} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {casillas.map((c, i) => (
              <TarjetaHoy
                key={c.id}
                tono={c.tono}
                etiqueta={t(`etiquetas.${c.id}`)}
                estado={t(`estados.${c.estado}`)}
                cifra={cifra(c)}
                detalle={texto(c.detalle)}
                accion={{ etiqueta: texto(c.accion.etiqueta), href: c.accion.href }}
                // Móvil (Figma 448:205300): las tres más urgentes; el resto tras «Ver las N».
                className={!verTodas && i >= VISIBLES_MOVIL ? 'max-sm:hidden' : undefined}
              />
            ))}
          </div>
          {!verTodas && ocultasMovil.length > 0 && (
            <button
              type="button"
              onClick={() => setVerTodas(true)}
              className="mt-3 w-full rounded-lg py-2 text-sm font-medium text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand sm:hidden"
            >
              {t('verTodas', { n: casillas.length, resto: ocultasMovil.join(', ') })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
