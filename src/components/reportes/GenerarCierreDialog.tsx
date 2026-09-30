'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { ChipsOpcion, Dialogo } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { toastSuccess } from '@/components/ui/use-toast';
import { entregarArchivo, obtenerDescarga, prepararDescarga } from '@/lib/documents/cliente';
import { esIdiomaDocumento } from '@/lib/documents/tipos';
import { reportePermitido } from '@/lib/services/reportes/alcanceSucursal';
import { clienteReportes, ErrorPeticionReportes, type PedidoCierre } from '@/lib/services/reportes/clienteReportes';
import type { ResumenCierre } from '@/lib/services/reportes/cierres/cierres.server';
import { PLANTILLAS_CIERRE, reportesDePlantilla, type PlantillaCierre } from '@/lib/services/reportes/cierres/snapshot';
import { resolverPeriodo } from '@/lib/services/reportes/periodosService';
import type { PeriodoCierre, TipoCierre } from '@/lib/services/reportes/types';
import type { PedidoCierreUi } from './accionesReportes';
import { clasesSelect } from './BarraFiltros';
import { SelectorPeriodo } from './SelectorPeriodo';
import type { ContextoReportes } from './useContextoReportes';
import { useMensajeError } from './useMensajeError';

type FormatoCierre = 'carta' | '80mm' | 'excel';
const TIPOS: readonly TipoCierre[] = ['diario', 'semanal', 'quincenal', 'mensual', 'trimestral', 'semestral', 'anual', 'personalizado'];

export function GenerarCierreDialog({
  pedido,
  onCerrar,
  ctx,
  periodoInicial,
  hoy,
  onListo,
}: {
  pedido: PedidoCierreUi | null;
  onCerrar: () => void;
  ctx: ContextoReportes;
  periodoInicial: PeriodoCierre;
  hoy: string;
  onListo: () => void;
}) {
  const t = useTranslations('reportes.cierreDlg');
  const idioma = useLocale();
  const tTipo = useTranslations('reportes.tipos');
  const tGrupo = useTranslations('reportes.grupos');
  const tFiltros = useTranslations('reportes.filtros');
  const mensaje = useMensajeError();
  const disponibles = useMemo(
    () => ctx.grupos.flatMap((g) => g.reportes).filter((r) => reportePermitido(r, ctx.accesoTotal)),
    [ctx.grupos, ctx.accesoTotal],
  );
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [sucursalId, setSucursalId] = useState<number | null>(ctx.sucursalEncabezado);
  const [plantilla, setPlantilla] = useState<PlantillaCierre>('completo');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [formato, setFormato] = useState<FormatoCierre>('carta');
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<'previa' | 'generar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{ id: string; numero: string } | null>(null);
  const [existente, setExistente] = useState<string | null>(null);
  const [previa, setPrevia] = useState<ResumenCierre | null>(null);

  useEffect(() => {
    if (!pedido) return;
    const inicial = pedido.plantilla ?? (pedido.reportes?.length ? 'personalizada' : 'completo');
    setPlantilla(inicial);
    setElegidos(reportesDePlantilla(inicial, disponibles, pedido.reportes ?? []).map((r) => r.id));
    setPeriodo(periodoInicial);
    setSucursalId(ctx.accesoTotal ? null : ctx.sucursalEncabezado);
    setError(null);
    setPendiente(null);
    setExistente(null);
    setPrevia(null);
    setAbiertos(pedido.reportes?.length ? [disponibles.find((r) => r.id === pedido.reportes?.[0])?.grupo ?? ''] : []);
  }, [pedido, disponibles, periodoInicial, ctx.sucursalEncabezado, ctx.accesoTotal]);

  const cambiarPlantilla = (p: PlantillaCierre) => {
    setPlantilla(p);
    if (p !== 'personalizada') setElegidos(reportesDePlantilla(p, disponibles).map((r) => r.id));
  };

  const capitulos = ctx.grupos
    .map((g) => ({ id: g.grupo.id, reportes: g.reportes.filter((r) => disponibles.some((d) => d.id === r.id)) }))
    .filter((c) => c.reportes.length > 0);

  const marcar = (ids: string[], activo: boolean) => {
    setPlantilla('personalizada');
    setElegidos((prev) => (activo ? [...new Set([...prev, ...ids])] : prev.filter((id) => !ids.includes(id))));
  };

  const cuerpo = (reemplaza?: string): PedidoCierre => ({
    periodo: {
      tipo: periodo.tipo,
      fechaInicio: periodo.fechaInicio,
      fechaFin: periodo.fechaFin,
      horaInicio: periodo.horaInicio ?? null,
      horaFin: periodo.horaFin ?? null,
    },
    plantilla,
    reportes: elegidos,
    sucursalId,
    reemplaza: reemplaza ?? null,
  });

  const cerrarPestana = (pestana: Window | null) => {
    if (!pestana || pestana.closed) return;
    try {
      pestana.close();
    } catch {
      // El navegador no deja cerrarla.
    }
  };

  const bajarArchivo = async (id: string, pestana: Window | null) => {
    const idiomaDoc = esIdiomaDocumento(idioma) ? idioma : undefined;
    const archivo =
      formato === 'excel'
        ? await clienteReportes.archivoExcelCierre(id, idioma)
        : await obtenerDescarga('cierre-periodo', id, { papel: formato === '80mm' ? '80mm' : 'carta', idioma: idiomaDoc });
    entregarArchivo(archivo.blob, archivo.nombre, pestana);
  };

  const generar = async (reemplaza?: string) => {
    if (elegidos.length === 0) {
      setError(t('vacio'));
      return;
    }
    // Antes del await: si la pestaña se abre después, el navegador la bloquea
    // y no baja nada aunque el cierre sí se haya guardado.
    const pestana = prepararDescarga(t('descargando'));
    setOcupado('generar');
    setError(null);
    setPendiente(null);
    let guardadoId: string | null = null;
    let guardadoNumero: string | null = null;
    try {
      const guardado = await clienteReportes.generarCierre(cuerpo(reemplaza));
      guardadoId = guardado.id;
      guardadoNumero = guardado.numero;
      toastSuccess(t('listo', { numero: guardado.numero }));
      onListo();
      await bajarArchivo(guardado.id, pestana);
      onCerrar();
    } catch (e) {
      cerrarPestana(pestana);
      if (guardadoId && guardadoNumero) {
        setPendiente({ id: guardadoId, numero: guardadoNumero });
        setError(t('sinArchivo', { numero: guardadoNumero }));
      } else if (e instanceof ErrorPeticionReportes && e.codigo === 'cierre_existente' && e.existente) setExistente(e.existente);
      else setError(mensaje(e));
    } finally {
      setOcupado(null);
    }
  };

  const bajarPendiente = async () => {
    if (!pendiente) return;
    const pestana = prepararDescarga(t('descargando'));
    setOcupado('generar');
    setError(null);
    try {
      await bajarArchivo(pendiente.id, pestana);
      onCerrar();
    } catch (e) {
      cerrarPestana(pestana);
      setError(mensaje(e));
    } finally {
      setOcupado(null);
    }
  };

  const vistaPrevia = async () => {
    setOcupado('previa');
    setError(null);
    try {
      setPrevia(await clienteReportes.vistaPreviaCierre(cuerpo()));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setOcupado(null);
    }
  };

  const elegirTipo = (tipo: TipoCierre) => {
    const referencia = periodo.fechaFin < hoy ? periodo.fechaFin : hoy;
    const resuelto = resolverPeriodo(tipo, tipo === 'personalizado' ? hoy : referencia, { from: periodo.fechaInicio, to: periodo.fechaFin < hoy ? periodo.fechaFin : hoy });
    setPeriodo({ ...resuelto, horaInicio: periodo.horaInicio ?? null, horaFin: periodo.horaFin ?? null });
  };

  return (
    <Dialogo
      abierto={pedido !== null}
      onAbiertoChange={(abierto) => !abierto && ocupado === null && onCerrar()}
      icono={FileText}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={672}
      secundarios={[{ etiqueta: t('vistaPrevia'), onClick: () => void vistaPrevia(), cargando: ocupado === 'previa', deshabilitada: ocupado !== null || elegidos.length === 0 }]}
      primario={{
        etiqueta: existente ? t('recalcular') : t('generar'),
        onClick: () => void generar(existente ?? undefined),
        cargando: ocupado === 'generar',
        deshabilitada: ocupado !== null || elegidos.length === 0,
      }}
    >
      <Campo etiqueta={t('tipo')}>
        <ChipsOpcion opciones={TIPOS.map((v) => ({ valor: v, etiqueta: tTipo(v) }))} valor={periodo.tipo} onValorChange={elegirTipo} />
      </Campo>
      <Campo etiqueta={t('periodo')}>
        <SelectorPeriodo periodo={periodo} hoy={hoy} mostrarTipos={false} onPeriodoChange={setPeriodo} anchoCompleto />
        <p className="text-xs text-fg-secondary">{t('notaFranja')}</p>
      </Campo>
      <Campo etiqueta={t('sucursal')}>
        <select
          className={clasesSelect}
          aria-label={t('sucursal')}
          disabled={ctx.sucursalFija}
          value={sucursalId ?? 'todas'}
          onChange={(e) => setSucursalId(e.target.value === 'todas' ? null : Number(e.target.value))}
        >
          {ctx.accesoTotal && <option value="todas">{tFiltros('todasLasSucursales')}</option>}
          {ctx.sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta={t('plantilla')}>
        <ChipsOpcion opciones={PLANTILLAS_CIERRE.map((v) => ({ valor: v, etiqueta: t(`plantillas.${v}`) }))} valor={plantilla} onValorChange={cambiarPlantilla} />
      </Campo>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-fg-secondary">{t('capitulos')}</p>
        <p className="text-xs text-fg-muted">{t('resumenCap', { c: capitulos.length, r: elegidos.length })}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {capitulos.map((c) => {
          const ids = c.reportes.map((r) => r.id);
          const marcados = ids.filter((id) => elegidos.includes(id)).length;
          const abierto = abiertos.includes(c.id);
          return (
            <li key={c.id} className="rounded-lg border border-line">
              <div className="flex items-center gap-2 px-3 py-2">
                <Checkbox
                  checked={marcados === 0 ? false : marcados === ids.length ? true : 'indeterminate'}
                  onCheckedChange={(v) => marcar(ids, v === true)}
                  aria-label={tGrupo(c.id)}
                />
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setAbiertos((p) => (abierto ? p.filter((x) => x !== c.id) : [...p, c.id]))}>
                  <span className="flex-1 truncate text-sm font-medium text-fg">{tGrupo(c.id)}</span>
                  <span className="text-xs text-fg-secondary">{t('de', { n: marcados, t: ids.length })}</span>
                  <ChevronDown aria-hidden className={cn('size-4 text-fg-secondary transition-transform', abierto && 'rotate-180')} strokeWidth={1.5} />
                </button>
              </div>
              {abierto && (
                <ul className="grid gap-1 border-t border-line px-3 py-2 sm:grid-cols-2">
                  {c.reportes.map((r) => (
                    <li key={r.id}>
                      <label className="flex items-center gap-2 text-sm text-fg">
                        <Checkbox checked={elegidos.includes(r.id)} onCheckedChange={(v) => marcar([r.id], v === true)} aria-label={r.titulo} />
                        <span className="truncate">{r.titulo}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-secondary">{t('sinDatos')}</p>
      <Campo etiqueta={t('formato')}>
        <ChipsOpcion<FormatoCierre>
          opciones={[
            { valor: 'carta', etiqueta: t('carta') },
            { valor: '80mm', etiqueta: t('mm80') },
            { valor: 'excel', etiqueta: t('excel') },
          ]}
          valor={formato}
          onValorChange={setFormato}
        />
      </Campo>
      {previa && (
        <p className="text-sm text-fg-secondary">
          {t('resumenCap', { c: previa.capitulos.length, r: previa.capitulos.reduce((s, c) => s + c.reportes.length, 0) })}
          {previa.errores.length > 0 && ` · ${t('erroresPrevios', { n: previa.errores.length })}`}
        </p>
      )}
      {existente && <p className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning-text">{t('existente')}</p>}
      {error && <p className="text-sm text-danger-text">{error}</p>}
      {pendiente && (
        <button type="button" className="self-start text-sm font-medium text-link" onClick={() => void bajarPendiente()} disabled={ocupado !== null}>
          {t('bajar')}
        </button>
      )}
    </Dialogo>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-fg-secondary">{etiqueta}</p>
      {children}
    </div>
  );
}
