'use client';

/**
 * Desempeño del equipo (Figma CRM 1412:838392) y, en móvil, «Mi desempeño»
 * (1413:1051). Datos de `GET /api/crm/teams/performance`: ganado = ganadas
 * con `closed_at` en el mes de la organización, llamadas = `calls` del
 * vendedor, reuniones = `calendar_events` confirmados, conversión = ganadas /
 * leads asignados, ciclo = `created_at` → `closed_at`. Admin y supervisores
 * ven a todos; un vendedor, su fila y el promedio (resuelto en el servidor).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, CalendarDays, Download, TriangleAlert, Trophy, Users } from 'lucide-react';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatCard } from '@/components/kit/StatCard';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Skeleton } from '@/components/ui/skeleton';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { tonoVsCuota } from '@/lib/services/crm/equipoComercialModel';
import { cn } from '@/utils/Utils';
import { CabeceraEquipo } from '../CabeceraEquipo';
import { useRecursoCrm } from '../useRecursoCrm';
import { csv, montoCompacto, type PestanaEquipo } from '../equipoPantallaLogica';
import type { VistaDesempeno } from '../types';

/** «Septiembre 2026» del mes `YYYY-MM` (día calendario, sin zona horaria). */
function etiquetaMes(mes: string, locale: string, conAno = true): string {
  const [y, m] = mes.split('-').map(Number);
  const s = new Intl.DateTimeFormat(locale, { month: 'long', ...(conAno ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DesempenoTab({ onPestana }: { onPestana: (p: PestanaEquipo) => void }) {
  const t = useTranslations('crm.equipo.pantalla');
  const td = useTranslations('crm.equipo.pantalla.desempeno');
  const locale = useLocaleIntl();
  const escritorio = useEsEscritorio();
  const [filtro, setFiltro] = useState<{ equipo: string; mes: string }>({ equipo: '', mes: '' });
  const query = new URLSearchParams({ ...(filtro.equipo ? { team_id: filtro.equipo } : {}), ...(filtro.mes ? { mes: filtro.mes } : {}) }).toString();
  const { estado, datos, recargar } = useRecursoCrm<VistaDesempeno>(`/api/crm/teams/performance${query ? `?${query}` : ''}`);
  const moneda = useMonedaOrganizacion();
  const entero = useFormatoEntero();
  const decimal = (n: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  const mesTexto = datos ? etiquetaMes(datos.mes, locale) : '';

  const exportar = () => {
    if (!datos) return;
    const texto = csv(
      [td('columnas.puesto'), td('columnas.vendedor'), td('columnas.ganado'), td('columnas.cuota'), td('columnas.vsCuota'), td('columnas.llamadas'), td('columnas.reuniones'), td('columnas.conversion'), td('columnas.ciclo')],
      datos.filas.map((f) => [f.rank, f.nombre, f.ganado, f.cuota, f.pct, f.llamadas, f.reuniones, f.conversion, f.cicloMedio]),
    );
    const url = URL.createObjectURL(new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `desempeno-${datos.mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const subtitulo = datos ? [mesTexto, datos.equipoNombre].filter(Boolean).join(' · ') : td('cargando');

  return (
    <>
      <CabeceraEquipo
        pestana="desempeno"
        onPestana={onPestana}
        titulo={td('titulo')}
        icono={BarChart3}
        subtitulo={subtitulo}
        cargando={estado === 'cargando' && !!datos}
        volverA="/app/crm/equipo"
        acciones={
          estado !== 'sinPermiso' && (
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={exportar} disabled={!datos || datos.filas.length === 0}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {td('exportar')}
            </button>
          )
        }
        movil={{ titulo: td('tituloMovil'), subtitulo }}
      />

      {estado === 'sinPermiso' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : estado === 'error' && !datos ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={recargar} />
        </div>
      ) : !datos ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[118px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[304px] rounded-xl" />
        </div>
      ) : datos.equipos.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState icono={Users} titulo={t('equipo.vacioTitulo')} descripcion={t('equipo.vacioDescripcion')} accion={{ etiqueta: td('irEquipos'), onClick: () => onPestana('equipos') }} />
        </div>
      ) : !escritorio ? (
        <MiDesempeno datos={datos} mesTexto={etiquetaMes(datos.mes, locale, false)} decimal={decimal} />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="w-full sm:w-[320px]">
              <SelectCrm
                aria-label={td('filtroEquipo')}
                valor={datos.equipoId ?? ''}
                onValorChange={(v) => setFiltro((f) => ({ ...f, equipo: v }))}
                opciones={datos.equipos.map((e) => ({ valor: e.id, etiqueta: td('equipoOpcion', { nombre: e.nombre }) }))}
              />
            </div>
            <div className="w-full sm:w-[320px]">
              <SelectCrm
                aria-label={td('filtroMes')}
                valor={datos.mes}
                onValorChange={(v) => setFiltro((f) => ({ ...f, mes: v }))}
                opciones={datos.meses.map((m) => ({
                  valor: m,
                  etiqueta: (
                    <span className="flex items-center gap-2">
                      <CalendarDays aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                      {etiquetaMes(m, locale)}
                    </span>
                  ),
                }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              etiqueta={td('kpi.ganado')}
              valor={montoCompacto(datos.resumen.ganado, moneda)}
              detalle={datos.resumen.pct === null ? td('kpi.sinCuota') : td('kpi.deCuota', { pct: datos.resumen.pct, cuota: montoCompacto(datos.resumen.cuota, moneda) })}
              tono={datos.resumen.pct === null ? 'neutro' : datos.resumen.pct >= 100 ? 'exito' : 'advertencia'}
              iconoDetalle={datos.resumen.pct !== null && datos.resumen.pct < 100 ? TriangleAlert : undefined}
            />
            <StatCard
              etiqueta={td('kpi.llamadas')}
              valor={entero(datos.resumen.llamadas)}
              detalle={datos.resumen.contactoEfectivo === null ? td('kpi.sinLlamadas') : td('kpi.contactoEfectivo', { pct: datos.resumen.contactoEfectivo })}
            />
            <StatCard
              etiqueta={td('kpi.reuniones')}
              valor={entero(datos.resumen.reuniones)}
              detalle={td('kpi.frenteA', { signo: datos.resumen.reuniones - datos.reunionesMesAnterior >= 0 ? '+' : '−', n: Math.abs(datos.resumen.reuniones - datos.reunionesMesAnterior), mes: etiquetaMes(mesAnteriorDe(datos.mes), locale, false).toLowerCase() })}
              tono={datos.resumen.reuniones > datos.reunionesMesAnterior ? 'exito' : datos.resumen.reuniones < datos.reunionesMesAnterior ? 'peligro' : 'neutro'}
              tendencia={datos.resumen.reuniones > datos.reunionesMesAnterior ? 'sube' : datos.resumen.reuniones < datos.reunionesMesAnterior ? 'baja' : undefined}
            />
            <StatCard
              etiqueta={td('kpi.conversion')}
              valor={datos.resumen.conversion === null ? '—' : `${decimal(datos.resumen.conversion)} %`}
              detalle={datos.verTodo ? td('kpi.promedioEquipo') : td('kpi.tuConversion')}
            />
          </div>

          {datos.filas.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState icono={Users} titulo={td('vacioTitulo')} descripcion={datos.verTodo ? td('vacioDescripcion') : td('vacioVendedor')} />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-xs font-semibold leading-4 text-fg-secondary">
                      <th scope="col" className="px-4 py-2.5">{td('columnas.vendedor')}</th>
                      <th scope="col" className="w-[140px] px-3 py-2.5">{td('columnas.ganado')}</th>
                      <th scope="col" className="w-[120px] px-3 py-2.5">{td('columnas.vsCuota')}</th>
                      <th scope="col" className="w-[90px] px-3 py-2.5">{td('columnas.llamadas')}</th>
                      <th scope="col" className="w-[90px] px-3 py-2.5">{td('columnas.reuniones')}</th>
                      <th scope="col" className="w-[100px] px-3 py-2.5">{td('columnas.conversion')}</th>
                      <th scope="col" className="w-[110px] px-4 py-2.5">{td('columnas.ciclo')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.filas.map((f) => (
                      <tr key={f.user_id} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="w-3.5 text-xs leading-4 text-fg-muted tabular-nums">{datos.verTodo ? f.rank : ''}</span>
                            <AvatarIniciales nombre={f.nombre} />
                            <span className="truncate text-sm font-medium leading-5 text-fg">{f.nombre}</span>
                            {datos.verTodo && f.rank === 1 && f.ganado > 0 && <Trophy aria-label={td('primerPuesto')} className="size-4 shrink-0 text-warning" strokeWidth={1.5} />}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-sm font-medium leading-5 text-fg tabular-nums">{formatMoneda(f.ganado, moneda.paraDocumento(f.moneda))}</td>
                        <td className="px-3 py-2.5">
                          {f.pct === null ? <span className="text-[13px] text-fg-muted">—</span> : <StatusBadge estado="pct" etiqueta={`${f.pct} %`} tono={tonoVsCuota(f.pct)} />}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] leading-[18px] text-fg-secondary tabular-nums">{entero(f.llamadas)}</td>
                        <td className="px-3 py-2.5 text-[13px] leading-[18px] text-fg-secondary tabular-nums">{entero(f.reuniones)}</td>
                        <td className="px-3 py-2.5 text-[13px] leading-[18px] text-fg-secondary tabular-nums">{f.conversion === null ? '—' : `${decimal(f.conversion)} %`}</td>
                        <td className="px-4 py-2.5 text-[13px] leading-[18px] text-fg-secondary tabular-nums">{f.cicloMedio === null ? '—' : td('dias', { n: f.cicloMedio })}</td>
                      </tr>
                    ))}
                    {datos.promedio && (
                      <tr className="bg-subtle/60">
                        <td className="px-4 py-2.5 text-sm font-medium leading-5 text-fg-secondary">{td('promedioFila')}</td>
                        <td className="px-3 py-2.5 text-sm leading-5 text-fg-secondary tabular-nums">{formatMoneda(datos.promedio.ganado, moneda)}</td>
                        <td className="px-3 py-2.5">{datos.promedio.pct === null ? '—' : <StatusBadge estado="pct" etiqueta={`${datos.promedio.pct} %`} tono={tonoVsCuota(datos.promedio.pct)} />}</td>
                        <td className="px-3 py-2.5 text-[13px] text-fg-secondary tabular-nums">{entero(datos.promedio.llamadas)}</td>
                        <td className="px-3 py-2.5 text-[13px] text-fg-secondary tabular-nums">{entero(datos.promedio.reuniones)}</td>
                        <td className="px-3 py-2.5 text-[13px] text-fg-secondary tabular-nums">{datos.promedio.conversion === null ? '—' : `${decimal(datos.promedio.conversion)} %`}</td>
                        <td className="px-4 py-2.5 text-[13px] text-fg-secondary tabular-nums">{datos.promedio.cicloMedio === null ? '—' : td('dias', { n: datos.promedio.cicloMedio })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function mesAnteriorDe(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** «Mi desempeño» (Figma 1413:1051): mi cifra y el ranking por porcentaje, sin montos de otros. */
function MiDesempeno({ datos, mesTexto, decimal }: { datos: VistaDesempeno; mesTexto: string; decimal: (n: number) => string }) {
  const td = useTranslations('crm.equipo.pantalla.desempeno');
  const moneda = useMonedaOrganizacion();
  const entero = useFormatoEntero();
  const yo = datos.yo;
  if (!yo) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState icono={Users} titulo={td('movil.sinEquipoTitulo')} descripcion={td('movil.sinEquipoDescripcion')} />
      </div>
    );
  }
  const ctx = moneda.paraDocumento(yo.moneda);
  const puesto = td('movil.puesto', { puesto: yo.puesto, de: yo.de, equipo: datos.equipoNombre ?? '' });
  const mensaje =
    yo.pct === null
      ? td('movil.sinCuota')
      : yo.pct >= 100
        ? `${td('movil.superaste', { dias: datos.diasRestantes })} ${puesto}`
        : `${td('movil.faltan', { monto: formatMoneda(Math.max(0, (yo.cuota ?? 0) - yo.ganado), ctx), dias: datos.diasRestantes })} ${puesto}`;
  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-medium leading-4 text-fg-secondary">{td('movil.cuotaDe', { mes: mesTexto.toLowerCase() })}</p>
        <p className="text-[28px] font-semibold leading-9 tracking-[-0.4px] text-fg tabular-nums">{formatMoneda(yo.ganado, ctx)}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] leading-[18px] text-fg-secondary">{yo.cuota === null ? td('movil.sinCuotaCorto') : td('movil.deCuota', { cuota: formatMoneda(yo.cuota, ctx) })}</span>
          <span className="text-xs font-medium leading-4 text-fg tabular-nums">{yo.pct === null ? '—' : `${yo.pct} %`}</span>
        </div>
        <BarraProgreso valor={Math.min(yo.pct ?? 0, 100)} etiqueta={td('movil.cuotaDe', { mes: mesTexto.toLowerCase() })} textoValor={yo.pct === null ? undefined : `${yo.pct} %`} />
        <p className={cn('text-[13px] leading-[18px]', yo.pct !== null && yo.pct >= 100 ? 'text-success-text' : 'text-fg-secondary')}>{mensaje}</p>
      </section>
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: 'llamadas', v: entero(yo.llamadas) },
          { k: 'reuniones', v: entero(yo.reuniones) },
          { k: 'conversion', v: yo.conversion === null ? '—' : `${decimal(yo.conversion)} %` },
        ].map((x) => (
          <div key={x.k} className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-line bg-surface p-3">
            <span className="truncate text-xs leading-4 text-fg-secondary">{td(`columnas.${x.k}`)}</span>
            <span className="text-base font-semibold leading-[22px] text-fg tabular-nums">{x.v}</span>
          </div>
        ))}
      </div>
      {datos.ranking.length > 0 && (
        <ol aria-label={td('movil.ranking')} className="overflow-hidden rounded-xl border border-line bg-surface">
          {datos.ranking.map((r) => (
            <li key={r.rank} className={cn('flex items-center gap-2.5 px-3 py-3', r.es_yo && 'bg-brand-tint')}>
              <span className="w-3 text-xs leading-4 text-fg-muted tabular-nums">{r.rank}</span>
              <span className={cn('min-w-0 flex-1 truncate text-sm leading-5 text-fg', r.es_yo && 'font-medium')}>{r.es_yo ? td('movil.tu', { nombre: r.nombre }) : r.nombre}</span>
              <span className="text-sm font-medium leading-5 text-fg tabular-nums">{r.pct === null ? '—' : `${r.pct} %`}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
