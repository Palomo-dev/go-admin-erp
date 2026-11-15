'use client';

/**
 * Perfil del cargo (Figma `95-hrm-01-04`): perfil y funciones, competencias
 * con nivel esperado, escala salarial por sede (solo con el permiso de
 * salario; la lectura queda en el registro), plazas del cargo, documentos que
 * exige y últimos cambios.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { IdCard, Check, FileText, Info, Lock, Pencil, Users } from 'lucide-react';
import { DataTable, EmptyState, PageHeader, Tarjeta, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { DOCUMENTOS_SENSIBLES } from '@/lib/hrm/estructura/logica';
import type { EscalaVigente, RespuestaCargo } from '@/lib/hrm/estructura/tipos';
import { BadgePlaza, RUTA_CARGOS, RUTA_HRM, useCarga, useFormatoMoneda, useNivel } from '../comun';

const FECHA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export function DetalleCargo({ id }: { id: string }) {
  const t = useTranslations('hrmEstructura.cargos.detalle');
  const tcg = useTranslations('hrmEstructura.cargos');
  const tc = useTranslations('hrmEstructura.comun');
  const td = useTranslations('hrmEstructura.documentos');
  const nivel = useNivel();
  const moneda = useFormatoMoneda();
  const { formatDate } = useFormatDate();
  const { carga, recargar } = useCarga<RespuestaCargo>(`/api/hrm/estructura/cargos/${encodeURIComponent(id)}`);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const c = datos?.cargo ?? null;
  const nombreSede = (s: number | null) => (s === null ? t('todasLasSedes') : datos?.sedes.find((x) => x.id === s)?.nombre ?? t('sede', { id: s }));

  const migas = [
    { etiqueta: tc('rrhh'), href: RUTA_HRM },
    { etiqueta: tcg('titulo'), href: RUTA_CARGOS },
    { etiqueta: c?.nombre ?? '…' },
  ];

  if (carga.estado === 'sinPermiso' || carga.estado === 'error' || carga.estado === 'noExiste') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={tcg('titulo')} variante="detail" volverA={RUTA_CARGOS} icono={IdCard} migas={migas} />
        {carga.estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" titulo={tcg('sinPermiso.titulo')} descripcion={tcg('sinPermiso.descripcion')} accion={{ etiqueta: tc('volver'), href: RUTA_CARGOS }} />
        ) : carga.estado === 'noExiste' ? (
          <EmptyState variante="empty" icono={IdCard} titulo={t('noExiste')} accion={{ etiqueta: tc('volver'), href: RUTA_CARGOS }} />
        ) : (
          <EmptyState variante="error" titulo={tcg('error.titulo')} descripcion={tcg('error.descripcion')} onReintentar={() => void recargar()} />
        )}
      </div>
    );
  }

  const escalas = datos?.escalas ?? null;
  const columnasEscala: ColumnaTabla<EscalaVigente>[] = [
    { id: 'sede', encabezado: t('escala.sede'), celda: (e) => <span className="font-medium text-fg">{nombreSede(e.sede_id)}</span> },
    { id: 'minimo', encabezado: t('escala.minimo'), variante: 'importe', alinear: 'izquierda', celda: (e) => moneda(e.minimo) },
    { id: 'medio', encabezado: t('escala.medio'), variante: 'importe', alinear: 'izquierda', celda: (e) => moneda(e.medio) },
    { id: 'maximo', encabezado: t('escala.maximo'), variante: 'importe', alinear: 'izquierda', celda: (e) => moneda(e.maximo) },
    {
      id: 'personas',
      encabezado: t('escala.personas'),
      ocultarDebajo: 'md',
      celda: (e) =>
        e.debajo + e.encima === 0 ? (
          <span className="text-fg-secondary">{e.personas ? t('escala.dentro', { n: e.personas }) : t('escala.nadie')}</span>
        ) : (
          <span className="text-warning-text">
            {[e.debajo ? t('escala.debajo', { n: e.personas, x: e.debajo }) : null, e.encima ? t('escala.encima', { n: e.personas, x: e.encima }) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ),
    },
  ];

  const subtitulo = c
    ? [c.area, c.reporta_a ? t('reportaA', { cargo: c.reporta_a.nombre }) : null, t('personasEnCargo', { n: c.personas })].filter(Boolean).join(' · ')
    : undefined;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={c?.nombre ?? tcg('titulo')}
        subtitulo={subtitulo}
        variante="detail"
        volverA={RUTA_CARGOS}
        icono={IdCard}
        migas={migas}
        cargando={carga.estado === 'cargando'}
        badge={c?.nivel ? <Badge tono="neutro">{t('nivel', { nivel: nivel(c.nivel) })}</Badge> : undefined}
        acciones={
          c ? (
            <>
              <Link href={`${RUTA_HRM}?cargo=${encodeURIComponent(c.id)}`} className={clasesBoton({ variante: 'secundario' })}>
                <Users aria-hidden className="size-4" strokeWidth={1.5} />
                {t('verEmpleados', { n: c.personas })}
              </Link>
              {datos?.permisos.editar && (
                <Link href={`${RUTA_CARGOS}/${c.id}/editar`} className={clasesBoton({ variante: 'primario' })}>
                  <Pencil aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('editar')}
                </Link>
              )}
            </>
          ) : undefined
        }
        movil={{
          accion: datos?.permisos.editar && c ? (
            <Link
              href={`${RUTA_CARGOS}/${c.id}/editar`}
              aria-label={t('editar')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Pencil aria-hidden className="size-5" strokeWidth={1.5} />
            </Link>
          ) : undefined,
        }}
      />

      {!c ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            <Tarjeta titulo={t('perfil')}>
              <div className="flex flex-col gap-4">
                <p className="text-sm text-fg">{c.proposito || t('sinProposito')}</p>
                {c.funciones.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-medium text-fg-muted">{t('funciones')}</h3>
                    <ul className="flex flex-col gap-2">
                      {c.funciones.map((f, i) => (
                        <li key={i} className="flex gap-2 text-sm text-fg">
                          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-subtle px-3 py-2.5">
                    <p className="text-xs text-fg-muted">{t('educacion')}</p>
                    <p className="text-sm text-fg">{c.educacion || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-subtle px-3 py-2.5">
                    <p className="text-xs text-fg-muted">{t('experiencia')}</p>
                    <p className="text-sm text-fg">{c.experiencia || '—'}</p>
                  </div>
                </div>
              </div>
            </Tarjeta>

            <Tarjeta titulo={t('competencias')} accion={<span className="text-xs text-fg-muted">{t('nivelEsperado')}</span>}>
              {c.competencias.length === 0 ? (
                <p className="text-sm text-fg-secondary">{t('sinCompetencias')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {c.competencias.map((k) => (
                    <li key={k.id ?? k.nombre} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                      <span className="min-w-0 flex-1 text-sm text-fg">{k.nombre}</span>
                      <span className="flex items-center gap-3">
                        <Badge tono="neutro" tamano="sm">
                          {t(`tipos.${k.tipo}`)}
                        </Badge>
                        <span className="flex gap-1" aria-hidden>
                          {[1, 2, 3, 4].map((n) => (
                            <span key={n} className={n <= k.nivel ? 'size-2.5 rounded-full bg-brand' : 'size-2.5 rounded-full bg-line-strong'} />
                          ))}
                        </span>
                        <span className="w-12 text-right text-xs text-fg-secondary">{t('nivelDe', { n: k.nivel })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>

            {datos?.permisos.salario && escalas && (
              <Tarjeta
                titulo={t('escala.titulo')}
                accion={
                  <Badge tono="neutro" apariencia="contorno" tamano="sm">
                    {t('escala.sensible')}
                  </Badge>
                }
              >
                <div className="flex flex-col gap-3">
                  {escalas.vigentes.length === 0 ? (
                    <p className="text-sm text-fg-secondary">{t('escala.sinEscala')}</p>
                  ) : (
                    <DataTable
                      etiqueta={t('escala.titulo')}
                      columnas={columnasEscala}
                      filas={escalas.vigentes}
                      obtenerId={(e) => e.id}
                      densidad="compacta"
                      tarjetaMovil={(e) => (
                        <div className="rounded-lg border border-line p-3">
                          <p className="text-sm font-medium text-fg">{nombreSede(e.sede_id)}</p>
                          <p className="text-xs tabular-nums text-fg-secondary">{`${moneda(e.minimo)} · ${moneda(e.medio)} · ${moneda(e.maximo)}`}</p>
                        </div>
                      )}
                    />
                  )}
                  {escalas.programadas.length > 0 && (
                    <p className="text-xs text-fg-secondary">
                      {t('escala.programada', {
                        fecha: formatPlainDate(escalas.programadas[0].desde, FECHA),
                        sedes: escalas.programadas.map((e) => nombreSede(e.sede_id)).join(', '),
                      })}
                    </p>
                  )}
                  <p className="flex gap-2 text-xs text-fg-secondary">
                    <Info aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
                    {t('escala.nota')}
                  </p>
                  {datos.permisos.editar && datos.permisos.salario_editar && (
                    <Link href={`${RUTA_CARGOS}/${c.id}/editar#escala`} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })}>
                      <Pencil aria-hidden className="size-4" strokeWidth={1.5} />
                      {t('escala.editar')}
                    </Link>
                  )}
                </div>
              </Tarjeta>
            )}
          </div>

          <div className="flex flex-col gap-4 lg:gap-5">
            <Tarjeta titulo={t('plazas')}>
              {c.plazas.length === 0 ? (
                <p className="text-sm text-fg-secondary">{t('sinPlazas')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {c.plazas.map((p) => (
                    <li key={p.sede_id} className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">{nombreSede(p.sede_id)}</p>
                        <p className="text-xs text-fg-secondary">
                          {p.aprobadas ? t('ocupadasDe', { ocupadas: p.ocupadas, aprobadas: p.aprobadas }) : t('personasSinPlaza', { n: p.ocupadas })}
                        </p>
                      </div>
                      <BadgePlaza aprobadas={p.aprobadas} ocupadas={p.ocupadas} />
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>

            <Tarjeta titulo={t('documentos')}>
              <ul className="flex flex-col gap-2.5">
                {c.documentos.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm text-fg">
                    {DOCUMENTOS_SENSIBLES.has(d) ? (
                      <Lock aria-label={t('documentoSensible')} className="mt-0.5 size-4 shrink-0 text-warning-text" strokeWidth={1.5} />
                    ) : (
                      <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                    )}
                    {td.has(d) ? td(d) : d}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-fg-muted">{c.documentos_propios ? t('documentosNota') : t('documentosBase')}</p>
            </Tarjeta>

            <Tarjeta titulo={t('cambios')}>
              <ul className="flex flex-col gap-2 text-sm text-fg-secondary">
                {(escalas?.historial ?? []).slice(0, 3).map((h) => (
                  <li key={h.id}>
                    {t('cambioEscala', { sede: nombreSede(h.sede_id), fecha: formatPlainDate(h.desde, FECHA), por: h.por ?? t('alguien') })}
                  </li>
                ))}
                {c.actualizado && <li>{t('perfilActualizado', { fecha: formatDate(c.actualizado) })}</li>}
              </ul>
            </Tarjeta>
          </div>
        </div>
      )}
    </div>
  );
}
