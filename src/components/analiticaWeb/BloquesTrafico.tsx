'use client';

/**
 * Bloques de tráfico de la analítica web (Figma B/09-01, E-analitica/02 y 16):
 * «De dónde llegan», «Páginas más vistas», «Conversión a pedido» y
 * «Conversión a reserva» (esta última solo para restaurantes). Pintan lo que
 * trae `fn_analitica_web_trafico` (`lib/analiticaWeb/trafico`): aquí no se
 * calcula negocio. Sin la función en la base, cada bloque dice que aún no
 * está disponible (sin error).
 */
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, Tarjeta } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { conversionPagina, embudoPedido, embudoReserva, fuentesConPorcentaje, type PasoEmbudo } from '@/lib/analiticaWeb/trafico';
import { useTextosSeoAnalitica } from '@/components/sitio-web/seoanalitica/textos';
import type { TraficoEstado } from './useAnaliticaWeb';
import { ICONO_BLOQUE_ANALITICA, ICONO_FUENTE_TRAFICO } from './iconosAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';

/** Pedidos online en POS: «Ver pedidos en POS › Pedidos online». */
export const RUTA_PEDIDOS_ONLINE = '/app/pos/pedidos-online';

function useFormatos() {
  const locale = useLocale();
  return {
    nf: new Intl.NumberFormat(locale),
    pf: new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }),
  };
}

function EsqueletoBloque() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-6 rounded-md" />
      ))}
    </div>
  );
}

function Contenido({ trafico, children }: { trafico: TraficoEstado; children: React.ReactNode }) {
  const t = useTextosSeoAnalitica();
  if (trafico.cargando && !trafico.datos) return <EsqueletoBloque />;
  if (!trafico.disponible || !trafico.datos) return <p className="text-sm text-fg-secondary">{t('analitica.noDisponible')}</p>;
  return <>{children}</>;
}

export function DeDondeLlegan({ trafico }: { trafico: TraficoEstado }) {
  const t = useTextosSeoAnalitica();
  const { nf, pf } = useFormatos();
  const filas = trafico.datos ? fuentesConPorcentaje(trafico.datos.fuentes) : [];
  return (
    <Tarjeta titulo={t('analitica.fuentes.titulo')} descripcion={t('analitica.fuentes.descripcion')} icono={ICONO_BLOQUE_ANALITICA.fuentes}>
      <Contenido trafico={trafico}>
        {filas.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('analitica.fuentes.vacio')}</p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="fuentes">
            {filas.map((f) => {
              const Icono = ICONO_FUENTE_TRAFICO[f.fuente];
              return (
                <li key={f.fuente} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2 text-fg">
                      {/* El icono del canal (16 px), el mismo de SEO y redes. */}
                      <Icono aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
                      <span className="truncate">{t(`analitica.fuentes.${f.fuente}`)}</span>
                    </span>
                    <span className="tabular-nums text-fg-secondary">
                      {t('analitica.fuentes.valor', {
                        n: nf.format(f.sesiones),
                        pct: pf.format(f.pct),
                      })}
                    </span>
                  </div>
                  <span className="ml-6 block h-1.5 rounded-full bg-subtle" aria-hidden="true">
                    <span className="block h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, f.pct * 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Contenido>
    </Tarjeta>
  );
}

export function PaginasMasVistas({ trafico }: { trafico: TraficoEstado }) {
  const t = useTextosSeoAnalitica();
  const { nf, pf } = useFormatos();
  const filas = trafico.datos?.paginas ?? [];
  return (
    <Tarjeta titulo={t('analitica.paginas.titulo')} descripcion={t('analitica.paginas.descripcion')} icono={ICONO_BLOQUE_ANALITICA.paginas}>
      <Contenido trafico={trafico}>
        {filas.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('analitica.paginas.vacio')}</p>
        ) : (
          <table className="w-full text-[13px]" data-testid="paginas-mas-vistas">
            <caption className="sr-only">{t('analitica.paginas.titulo')}</caption>
            <thead>
              <tr className="text-left text-xs text-fg-secondary">
                <th scope="col" className="py-1.5 font-medium">
                  {t('analitica.paginas.pagina')}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t('analitica.paginas.visitas')}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t('analitica.paginas.conversion')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filas.map((p) => {
                const c = conversionPagina(p);
                return (
                  <tr key={p.ruta}>
                    <td className="max-w-0 truncate py-2 pr-2 text-fg">{p.ruta === '/' ? t('analitica.paginas.inicio') : p.ruta}</td>
                    <td className="py-2 text-right tabular-nums text-fg">{nf.format(p.visitas)}</td>
                    <td className="py-2 text-right tabular-nums text-fg-secondary">{c === null || p.conversiones === 0 ? '—' : pf.format(c)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Contenido>
    </Tarjeta>
  );
}

function Embudo({ pasos, etiqueta }: { pasos: PasoEmbudo[]; etiqueta: (clave: string) => string }) {
  const { nf } = useFormatos();
  return (
    <ol className="flex flex-col gap-2">
      {pasos.map((p) => (
        <li key={p.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
          <div className="relative flex h-7 items-center">
            <span
              aria-hidden="true"
              className={cn('absolute inset-y-0 left-0 rounded-md', p.final ? 'bg-success' : 'bg-brand-tint')}
              style={{ width: `${Math.max(8, p.ancho * 100)}%` }}
            />
            <span className={cn('relative ml-auto pr-2 text-right', p.final ? 'text-fg' : 'text-fg-secondary')}>{etiqueta(p.clave)}</span>
          </div>
          <span className="w-16 text-right font-semibold tabular-nums text-fg">{nf.format(p.valor)}</span>
        </li>
      ))}
    </ol>
  );
}

export function ConversionPedido({ trafico }: { trafico: TraficoEstado }) {
  const t = useTextosSeoAnalitica();
  const { pf } = useFormatos();
  const e = trafico.datos ? embudoPedido(trafico.datos) : null;
  return (
    <Tarjeta
      titulo={t('analitica.pedido.titulo')}
      icono={ICONO_BLOQUE_ANALITICA.pedido}
      accion={e ? <StatusBadge estado="bien" etiqueta={pf.format(e.tasa)} /> : undefined}
      pie={
        <p className="text-xs text-fg-muted">
          {t('analitica.pedido.fuente')}{' '}
          <Link href={RUTA_PEDIDOS_ONLINE} className="text-link underline-offset-2 hover:underline">
            {t('analitica.pedido.verPedidos')}
          </Link>
        </p>
      }
    >
      <Contenido trafico={trafico}>{e && <Embudo pasos={e.pasos} etiqueta={(c) => t(`analitica.pedido.${c}`)} />}</Contenido>
    </Tarjeta>
  );
}

export function ConversionReserva({ trafico }: { trafico: TraficoEstado }) {
  const t = useTextosSeoAnalitica();
  const { pf } = useFormatos();
  const e = trafico.datos ? embudoReserva(trafico.datos) : null;
  return (
    <Tarjeta
      titulo={t('analitica.reserva.titulo')}
      icono={ICONO_BLOQUE_ANALITICA.reserva}
      accion={e ? <StatusBadge estado="bien" etiqueta={pf.format(e.tasa)} /> : undefined}
      pie={<p className="text-xs text-fg-muted">{t('analitica.reserva.fuente')}</p>}
    >
      <Contenido trafico={trafico}>{e && <Embudo pasos={e.pasos} etiqueta={(c) => t(`analitica.reserva.${c}`)} />}</Contenido>
    </Tarjeta>
  );
}
