'use client';

/**
 * Detalle de una persona en el período (Figma 20.18): Resumen (devengados,
 * deducciones e IBC con la regla del 40 %), Seguridad social y parafiscales,
 * Retención en la fuente, Deducciones y su límite, y Provisiones. Todo sale de la
 * colilla que guardó el motor (ítems y bases): aquí no se recalcula nada.
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { AlertTriangle, FileUser, Info } from 'lucide-react';
import { AvisoTonal, EmptyState, FilaDato, ListaDatos, PageHeader, Skeleton, Tarjeta, TabBar, clasesBoton, useOpcionUrl } from '@/components/kit';
import { RUTA_NOMINA, rutaColilla, rutaPeriodo, usePeriodo, usePersonasNomina, type ColillaPeriodo } from './apiNomina';
import {
  CODIGOS_SEGURIDAD_SOCIAL,
  agruparItems,
  claveAlerta,
  contarAlertas,
  esSalarial,
  estadoPeriodo,
  suma,
  variacionNeto,
  type ItemColilla,
} from './nominaLogica';
import { EstadoPeriodoBadge, useDinero, useNombrePeriodo } from './piezasNomina';
import { MIGA_RRHH } from './NominaPage';
import { VariacionBadge } from './SeccionEmpleados';

const PESTANAS = ['resumen', 'seguridad', 'retencion', 'deducciones', 'provisiones'] as const;
type Pestana = (typeof PESTANAS)[number];

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '';
  return `${Math.round(Number(v) * 10000) / 100} %`;
}

/** Tabla de ítems con su total (Concepto · Cantidad · Valor). */
export function TablaItems({ titulo, items, total, etiquetaTotal, conBase }: { titulo: string; items: readonly ItemColilla[]; total?: number; etiquetaTotal?: string; conBase?: boolean }) {
  const t = useTranslations('hrmNomina.detalle');
  const dinero = useDinero();
  return (
    <Tarjeta titulo={titulo} sinRelleno>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-fg-secondary">{t('sinItems')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line bg-subtle text-left text-xs font-medium text-fg-secondary">
                <th scope="col" className="px-4 py-2.5">{t('columnas.concepto')}</th>
                <th scope="col" className="px-4 py-2.5 text-right">{t('columnas.cantidad')}</th>
                {conBase ? <th scope="col" className="hidden px-4 py-2.5 text-right sm:table-cell">{t('columnas.base')}</th> : null}
                <th scope="col" className="px-4 py-2.5 text-right">{t('columnas.valor')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((i, n) => {
                const s = esSalarial(i.codigo);
                return (
                  <tr key={`${i.codigo}-${n}`}>
                    <td className="px-4 py-3">
                      <p className="text-fg">
                        {i.nombre}
                        {i.tasa ? <span className="text-fg-secondary"> ({pct(i.tasa)})</span> : null}
                      </p>
                      {i.tipo === 'earning' && s !== null ? <p className="text-xs text-fg-secondary">{s ? t('salarial') : t('noSalarial')}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg-secondary">{i.cantidad ? i.cantidad : '—'}</td>
                    {conBase ? <td className="hidden px-4 py-3 text-right tabular-nums text-fg-secondary sm:table-cell">{i.base ? dinero(i.base) : '—'}</td> : null}
                    <td className="px-4 py-3 text-right tabular-nums text-fg">{dinero(i.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
            {total !== undefined ? (
              <tfoot>
                <tr className="border-t border-line bg-subtle">
                  <th scope="row" colSpan={conBase ? 3 : 2} className="px-4 py-3 text-left font-medium text-fg">
                    {etiquetaTotal}
                  </th>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">{dinero(total)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

function Alertas({ c }: { c: ColillaPeriodo }) {
  const ta = useTranslations('hrmNomina.alertas');
  const l = c.alertas ?? [];
  if (l.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {l.map((a, i) => (
        <AvisoTonal
          key={`${a.codigo}-${i}`}
          compacto
          tono={a.severidad === 'bloqueo' ? 'peligro' : 'advertencia'}
          icono={a.severidad === 'bloqueo' ? AlertTriangle : Info}
          titulo={ta(claveAlerta(a.codigo), { n: Number((a.detalle as Record<string, unknown> | null)?.cantidad ?? 0) })}
        />
      ))}
    </div>
  );
}

export function DetalleEmpleadoPeriodo({ id, vinculo }: { id: string; vinculo: string }) {
  const t = useTranslations('hrmNomina.detalle');
  const tn = useTranslations('hrmNomina');
  const router = useRouter();
  const dinero = useDinero();
  const nombrar = useNombrePeriodo();
  const [pestana, setPestana] = useOpcionUrl<Pestana>('pestana', PESTANAS, 'resumen', 'replace');
  const { carga, recargar } = usePeriodo(id);
  const { carga: cargaPersonas } = usePersonasNomina();
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const c = datos?.colillas.find((x) => x.vinculo_id === vinculo) ?? null;
  const persona = cargaPersonas.estado === 'listo' ? cargaPersonas.datos.personas.find((x) => x.vinculo_id === vinculo) ?? null : null;
  const g = useMemo(() => agruparItems(c?.items), [c]);
  const b = (c?.bases ?? {}) as Record<string, unknown>;
  const num = (k: string) => (typeof b[k] === 'number' ? (b[k] as number) : null);
  const periodoNombre = datos ? nombrar({ nombre: datos.periodo.name, tipo: datos.periodo.kind, desde: datos.periodo.period_start, hasta: datos.periodo.period_end }) : '';
  const migas = [
    { etiqueta: tn('migas.rrhh'), href: MIGA_RRHH },
    { etiqueta: tn('titulo'), href: RUTA_NOMINA },
    { etiqueta: periodoNombre || tn('migas.periodos'), href: rutaPeriodo(id) },
  ];

  if (carga.estado !== 'listo' || !c) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
        <PageHeader variante="form" titulo={t('titulo')} volverA={rutaPeriodo(id)} migas={migas} cargando={carga.estado === 'cargando'} />
        {carga.estado === 'cargando' ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : carga.estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso')} accion={{ etiqueta: t('volver'), href: rutaPeriodo(id) }} />
        ) : carga.estado === 'listo' || carga.estado === 'noExiste' ? (
          <EmptyState variante="empty" titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} accion={{ etiqueta: t('volver'), href: rutaPeriodo(id) }} />
        ) : (
          <EmptyState variante="error" onReintentar={() => void recargar()} />
        )}
      </div>
    );
  }

  const bloqueada = contarAlertas(c.alertas).bloqueos > 0;
  const ss = g.deducciones.filter((i) => CODIGOS_SEGURIDAD_SOCIAL.has(i.codigo));
  const otrasDed = g.deducciones.filter((i) => !CODIGOS_SEGURIDAD_SOCIAL.has(i.codigo));
  const retencion = (b.retencion ?? null) as { procedimiento?: number; porcentaje?: number | null; retencion_mes?: number; depuracion?: Record<string, number> } | null;
  const subtitulo = [
    persona?.cargo,
    persona?.area,
    persona?.sede,
    num('salario_mensual') ? t('salarioMensual', { valor: dinero(num('salario_mensual')) }) : null,
    num('dias_trabajados') !== null ? t('nDias', { n: num('dias_trabajados') ?? 0 }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="form"
        titulo={c.nombre ?? persona?.nombre ?? '—'}
        subtitulo={subtitulo}
        volverA={rutaPeriodo(id)}
        migas={migas}
        badge={
          <span className="flex items-center gap-1">
            <EstadoPeriodoBadge estado={estadoPeriodo(datos?.periodo.status)} tamano="md" />
            <VariacionBadge v={variacionNeto(c.alertas)} />
          </span>
        }
        acciones={
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => router.push(rutaColilla(id, vinculo))}>
            <FileUser aria-hidden className="size-4" strokeWidth={1.5} />
            {t('verColilla')}
          </button>
        }
        movil={{ subtitulo, menu: [{ id: 'colilla', etiqueta: t('verColilla'), icono: FileUser, onSelect: () => router.push(rutaColilla(id, vinculo)) }] }}
      />

      <TabBar
        id="detalle-empleado"
        etiqueta={t('etiqueta')}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={PESTANAS.map((p) => ({ valor: p, etiqueta: t(`pestanas.${p}`) }))}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {pestana === 'resumen' ? (
            <>
              <TablaItems titulo={t('devengados')} items={g.devengados} total={suma(g.devengados)} etiquetaTotal={t('totalDevengado')} />
              <TablaItems titulo={t('deducciones')} items={g.deducciones} total={suma(g.deducciones)} etiquetaTotal={t('totalDeducciones')} />
              <div className="flex items-center justify-between rounded-xl bg-brand-tint px-5 py-4">
                <p className="text-sm font-medium text-brand-deep">{t('netoPagar', { devengado: dinero(c.devengado), deducciones: dinero(c.deducciones) })}</p>
                <p className="text-xl font-semibold tabular-nums text-brand-deep">{bloqueada ? t('bloqueada') : dinero(c.neto)}</p>
              </div>
            </>
          ) : pestana === 'seguridad' ? (
            <>
              <TablaItems titulo={t('aportesTrabajador')} items={ss} total={suma(ss)} etiquetaTotal={t('total')} conBase />
              <TablaItems titulo={t('aportesEmpleador')} items={g.aportes} total={suma(g.aportes)} etiquetaTotal={t('total')} conBase />
            </>
          ) : pestana === 'retencion' ? (
            <Tarjeta titulo={t('retencion.titulo')}>
              {!retencion ? (
                <p className="text-sm text-fg-secondary">{t('retencion.noAplica')}</p>
              ) : (
                <ListaDatos divisores>
                  <FilaDato etiqueta={t('retencion.procedimiento')} valor={t('retencion.proc', { n: retencion.procedimiento ?? 1 })} />
                  {(['ingresos', 'incr', 'ingreso_neto', 'deduccion_dependientes', 'deduccion_medicina', 'deduccion_vivienda', 'exenta_voluntarios', 'exenta_25', 'limite_40', 'beneficios_aplicados', 'base'] as const).map((k) =>
                    retencion.depuracion && typeof retencion.depuracion[k] === 'number' ? (
                      <FilaDato key={k} etiqueta={t(`retencion.depuracion.${k}`)} valor={dinero(retencion.depuracion[k])} sangria={k === 'ingresos' || k === 'base' ? 0 : 1} />
                    ) : null
                  )}
                  {retencion.porcentaje ? <FilaDato etiqueta={t('retencion.porcentaje')} valor={pct(retencion.porcentaje)} /> : null}
                  <FilaDato etiqueta={t('retencion.delMes')} valor={dinero(retencion.retencion_mes ?? 0)} separadorAntes />
                  <FilaDato etiqueta={t('retencion.estePeriodo')} valor={dinero(suma(g.deducciones.filter((i) => i.codigo === 'RETENCION_FUENTE')))} tamano="lg" />
                </ListaDatos>
              )}
            </Tarjeta>
          ) : pestana === 'deducciones' ? (
            <>
              <TablaItems titulo={t('otrasDeducciones')} items={otrasDed} total={suma(otrasDed)} etiquetaTotal={t('total')} />
              <AvisoTonal tono="informacion" titulo={t('limite.titulo')} descripcion={t('limite.descripcion')} />
            </>
          ) : (
            <TablaItems titulo={t('provisiones')} items={g.provisiones} total={suma(g.provisiones)} etiquetaTotal={t('total')} conBase />
          )}
          <Alertas c={c} />
        </div>

        <div className="flex flex-col gap-4">
          <Tarjeta titulo={t('ibc.titulo')}>
            <ListaDatos>
              <FilaDato etiqueta={t('ibc.salarioMensual')} valor={dinero(num('salario_mensual'))} />
              <FilaDato etiqueta={t('ibc.exceso40')} valor={dinero(num('exceso_40'))} />
              <FilaDato etiqueta={t('ibc.minimo')} valor={dinero(num('ibc_minimo'))} />
              <FilaDato etiqueta={t('ibc.maximo')} valor={dinero(num('ibc_maximo'))} />
              <FilaDato etiqueta={t('ibc.ibc')} valor={dinero(num('ibc'))} tamano="lg" separadorAntes />
              <FilaDato etiqueta={t('ibc.arl')} valor={dinero(num('ibc_arl'))} />
              <FilaDato etiqueta={t('ibc.parafiscales')} valor={dinero(num('base_parafiscales'))} />
              <FilaDato etiqueta={t('ibc.prestaciones')} valor={dinero(num('base_prestaciones'))} />
            </ListaDatos>
            <p className="mt-3 text-[13px] leading-[18px] text-fg-secondary">{t('ibc.nota')}</p>
            {b.exonerado_114_1 === true ? <p className="mt-2 text-[13px] text-fg-secondary">{t('ibc.exonerado')}</p> : null}
          </Tarjeta>
          <Tarjeta titulo={t('costo.titulo')}>
            <ListaDatos>
              <FilaDato etiqueta={t('costo.devengado')} valor={dinero(c.devengado)} />
              <FilaDato etiqueta={t('costo.aportes')} valor={dinero(suma(g.aportes))} />
              <FilaDato etiqueta={t('costo.provisiones')} valor={dinero(suma(g.provisiones))} />
              <FilaDato etiqueta={t('costo.total')} valor={dinero(c.costo_empleador)} tamano="lg" separadorAntes />
            </ListaDatos>
          </Tarjeta>
          {g.informativos.length > 0 ? (
            <Tarjeta titulo={t('informativos')}>
              <ListaDatos>
                {g.informativos.map((i, n) => (
                  <FilaDato key={`${i.codigo}-${n}`} etiqueta={i.nombre} valor={dinero(i.valor)} />
                ))}
              </ListaDatos>
            </Tarjeta>
          ) : null}
        </div>
      </div>
    </div>
  );
}
