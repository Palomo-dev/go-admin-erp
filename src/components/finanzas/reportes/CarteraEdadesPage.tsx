'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileDown, ListChecks } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  DataTable,
  FormField,
  KpiStrip,
  PageHeader,
  StatCard,
  clasesBoton,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import {
  BANDAS,
  RPC_CARTERA,
  bandaMasAtrasada,
  leerCarteraEdades,
  porcentajeVencido,
  totalesPorBanda,
  type Banda,
  type CarteraEdades,
  type FilaDocumento,
  type FilaTercero,
  type TipoCartera,
} from '@/lib/finanzas/reportes/carteraEdades';
import { descargarExcel, descargarPdf } from '@/lib/finanzas/reportes/exportarReporte';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { supabase } from '@/lib/supabase/config';

type Agrupar = 'tercero' | 'documento';

/** La fila «Total» es una fila más de la tabla, con los totales del servidor. */
type FilaTabla = FilaTercero & { esTotal?: boolean };

const ID_TOTAL = '__total';

function esSinPermiso(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === '42501';
}

export function CarteraEdadesPage() {
  const t = useTranslations('carteraEdades');
  const { formatear } = useMonedaOrganizacion();
  const { getToday, formatPlain } = useFormatDate();
  const { isLoading: tzCargando } = useOrgTimezone();
  const { branchFilter } = useBranch();

  const [corte, setCorte] = useState('');
  const [tipo, setTipo] = useState<TipoCartera>('cxc');
  const [agrupar, setAgrupar] = useState<Agrupar>('tercero');
  const [cartera, setCartera] = useState<CarteraEdades | null>(null);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [abierto, setAbierto] = useState<FilaTercero | null>(null);
  const primera = useRef(false);

  const consultar = useCallback(
    async (dia: string, cual: TipoCartera) => {
      const organizacion = getOrganizationId();
      if (!organizacion || !dia) return;
      setEstado('cargando');
      try {
        const datos = await leerCarteraEdades(supabase, RPC_CARTERA[cual], organizacion, dia, branchFilter);
        setCartera(datos);
        setEstado('listo');
      } catch (e) {
        setCartera(null);
        setEstado(esSinPermiso(e) ? 'sinPermiso' : 'error');
      }
    },
    [branchFilter],
  );

  useEffect(() => {
    if (tzCargando || primera.current) return;
    primera.current = true;
    const hoy = getToday();
    setCorte(hoy);
    void consultar(hoy, 'cxc');
  }, [tzCargando, getToday, consultar]);

  const rotuloBanda = useCallback((b: Banda) => t(`bandas.${b === '+90' ? 'mas90' : b === 'corriente' ? 'corriente' : `d${b.replace('-', '_')}`}`), [t]);

  const filasTercero = useMemo<FilaTabla[]>(() => {
    if (!cartera || cartera.terceros.length === 0) return [];
    return [
      ...cartera.terceros,
      {
        terceroId: ID_TOTAL,
        tercero: t('total'),
        porBanda: totalesPorBanda(cartera),
        total: cartera.total,
        cantidad: cartera.documentos.length,
        esTotal: true,
      },
    ];
  }, [cartera, t]);

  const columnasTercero = useMemo<ColumnaTabla<FilaTabla>[]>(() => {
    const fuerte = (f: FilaTabla) => (f.esTotal ? 'font-semibold' : undefined);
    return [
      {
        id: 'tercero',
        encabezado: t('columnas.tercero'),
        celda: (f) => <span className={fuerte(f)}>{f.tercero}</span>,
      },
      ...BANDAS.map<ColumnaTabla<FilaTabla>>((b) => ({
        id: b,
        encabezado: rotuloBanda(b),
        variante: 'importe',
        celda: (f) => <span className={fuerte(f)}>{formatear(f.porBanda[b])}</span>,
      })),
      {
        id: 'total',
        encabezado: t('columnas.total'),
        variante: 'importe',
        celda: (f) => <span className="font-semibold">{formatear(f.total)}</span>,
      },
    ];
  }, [formatear, rotuloBanda, t]);

  const columnasDocumento = useMemo<ColumnaTabla<FilaDocumento>[]>(
    () => [
      { id: 'numero', encabezado: t('columnas.documento'), variante: 'mono', celda: (f) => f.numero ?? '—' },
      { id: 'tercero', encabezado: t('columnas.tercero'), celda: (f) => f.tercero },
      { id: 'vence', encabezado: t('columnas.vence'), celda: (f) => formatPlain(f.vence) },
      { id: 'dias', encabezado: t('columnas.dias'), variante: 'importe', celda: (f) => f.diasMora },
      { id: 'banda', encabezado: t('columnas.banda'), celda: (f) => rotuloBanda(f.banda) },
      { id: 'saldo', encabezado: t('columnas.saldo'), variante: 'importe', celda: (f) => formatear(f.saldo) },
    ],
    [formatPlain, formatear, rotuloBanda, t],
  );

  const nombreArchivo = `cartera-edades-${tipo}-${cartera?.corte ?? corte}`;

  const filasExportables = useCallback((): { columnas: string[]; filas: (string | number)[][] } => {
    if (!cartera) return { columnas: [], filas: [] };
    if (agrupar === 'tercero') {
      return {
        columnas: [t('columnas.tercero'), ...BANDAS.map(rotuloBanda), t('columnas.total')],
        filas: filasTercero.map((f) => [f.tercero, ...BANDAS.map((b) => f.porBanda[b]), f.total]),
      };
    }
    return {
      columnas: [t('columnas.documento'), t('columnas.tercero'), t('columnas.vence'), t('columnas.dias'), t('columnas.banda'), t('columnas.saldo')],
      filas: cartera.documentos.map((f) => [f.numero ?? '', f.tercero, f.vence, f.diasMora, rotuloBanda(f.banda), f.saldo]),
    };
  }, [agrupar, cartera, filasTercero, rotuloBanda, t]);

  const exportarExcel = async () => {
    const { columnas, filas } = filasExportables();
    await descargarExcel(
      nombreArchivo,
      filas.map((fila) => Object.fromEntries(columnas.map((c, i) => [c, fila[i]]))),
    );
  };

  const exportarPdf = async () => {
    const { columnas, filas } = filasExportables();
    await descargarPdf(nombreArchivo, `${t('titulo')} · ${formatPlain(cartera?.corte ?? corte)}`, columnas, filas);
  };

  const sinDatos = !cartera || estado !== 'listo';
  const anticipoMayor = cartera?.anticipos.origen === 'mayor';

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ListChecks}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.informes'), href: '/app/finanzas/reportes' },
          { etiqueta: t('titulo') },
        ]}
        movil={{ accionesEnFila: true, subtitulo: corte ? t('corteMovil', { fecha: formatPlain(corte) }) : undefined }}
        acciones={
          <>
            <button type="button" onClick={() => void exportarExcel()} disabled={sinDatos} className={clasesBoton({ variante: 'secundario' })}>
              <Download className="h-4 w-4" aria-hidden />
              {t('excel')}
            </button>
            <button type="button" onClick={() => void exportarPdf()} disabled={sinDatos} className={clasesBoton({ variante: 'primario' })}>
              <FileDown className="h-4 w-4" aria-hidden />
              {t('pdf')}
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <FormField etiqueta={t('filtros.corte')}>
          {(campo) => (
            <CampoFecha id={campo.id} valor={corte} onValorChange={setCorte} limpiable={false} max={getToday()} aria-labelledby={campo.idEtiqueta} />
          )}
        </FormField>
        <FormField etiqueta={t('filtros.tipo')}>
          {(campo) => (
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoCartera)}>
              <SelectTrigger id={campo.id} aria-labelledby={campo.idEtiqueta}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cxc">{t('filtros.clientes')}</SelectItem>
                <SelectItem value="cxp">{t('filtros.proveedores')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('filtros.agrupar')}>
          {(campo) => (
            <Select value={agrupar} onValueChange={(v) => setAgrupar(v as Agrupar)}>
              <SelectTrigger id={campo.id} aria-labelledby={campo.idEtiqueta}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tercero">{t('filtros.porTercero')}</SelectItem>
                <SelectItem value="documento">{t('filtros.porDocumento')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
        <button type="button" onClick={() => void consultar(corte, tipo)} disabled={!corte} className={clasesBoton({ variante: 'primario' })}>
          {t('consultar')}
        </button>
      </div>

      {cartera && (
        <KpiStrip etiqueta={t('kpi.resumen')}>
          <StatCard etiqueta={t('kpi.total')} valor={formatear(cartera.total)} tamano="sm" />
          <StatCard
            etiqueta={t('kpi.vencida')}
            valor={formatear(cartera.vencida)}
            detalle={t('kpi.porcentaje', { pct: porcentajeVencido(cartera) })}
            tono={cartera.vencida > 0 ? 'peligro' : 'neutro'}
            tamano="sm"
          />
          <StatCard
            etiqueta={anticipoMayor ? t('kpi.anticiposProveedores') : t('kpi.anticipos')}
            valor={formatear(cartera.anticipos.total)}
            detalle={anticipoMayor ? t('kpi.anticiposMayor', { cuenta: cartera.anticipos.cuenta }) : t('kpi.anticiposAparte')}
            tamano="sm"
          />
          <StatCard
            etiqueta={t('kpi.mayor', { cuenta: cartera.mayor.cuenta })}
            valor={formatear(cartera.mayor.saldo)}
            detalle={cartera.mayor.cuadra ? t('kpi.cuadra') : t('kpi.diferencia', { valor: formatear(cartera.mayor.diferencia) })}
            tono={cartera.mayor.cuadra ? 'exito' : 'peligro'}
            tamano="sm"
          />
        </KpiStrip>
      )}

      {cartera && !cartera.mayor.cuadra && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('noCuadra.titulo', { cuenta: cartera.mayor.cuenta })}
          descripcion={t('noCuadra.descripcion', { valor: formatear(cartera.mayor.diferencia) })}
        />
      )}

      {agrupar === 'tercero' ? (
        <DataTable<FilaTabla>
          etiqueta={t('titulo')}
          columnas={columnasTercero}
          filas={filasTercero}
          obtenerId={(f) => f.terceroId}
          estado={estado}
          onFilaClick={(f) => !f.esTotal && setAbierto(f)}
          onReintentar={() => void consultar(corte, tipo)}
          vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
          tarjetaMovil={(f) => <TarjetaTercero fila={f} formatear={formatear} rotuloBanda={rotuloBanda} onVer={() => setAbierto(f)} />}
        />
      ) : (
        <DataTable<FilaDocumento>
          etiqueta={t('titulo')}
          columnas={columnasDocumento}
          filas={cartera?.documentos ?? []}
          obtenerId={(f) => f.documentoId}
          estado={estado}
          onReintentar={() => void consultar(corte, tipo)}
          vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
          tarjetaMovil={(f) => (
            <div className="flex flex-col gap-1 p-4">
              <span className="font-medium text-fg">{f.tercero}</span>
              <span className="text-sm text-fg-secondary">
                {f.numero ?? '—'} · {formatPlain(f.vence)}
              </span>
              <span className="text-sm text-fg">{formatear(f.saldo)}</span>
              <span className="text-xs text-fg-secondary">{rotuloBanda(f.banda)}</span>
            </div>
          )}
        />
      )}

      <HojaDetalle
        abierto={abierto !== null}
        onAbiertoChange={(a) => !a && setAbierto(null)}
        titulo={abierto?.tercero ?? ''}
        subtitulo={abierto ? t('hoja.subtitulo', { total: formatear(abierto.total), n: abierto.cantidad }) : undefined}
      >
        <ul className="divide-y divide-line">
          {(cartera?.documentos ?? [])
            .filter((d) => d.terceroId === abierto?.terceroId)
            .map((d) => (
              <li key={d.documentoId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{d.numero ?? '—'}</p>
                  <p className="text-xs text-fg-secondary">
                    {t('hoja.vence', { fecha: formatPlain(d.vence) })} · {rotuloBanda(d.banda)}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-fg">{formatear(d.saldo)}</span>
              </li>
            ))}
        </ul>
      </HojaDetalle>
    </div>
  );
}

function TarjetaTercero({
  fila,
  formatear,
  rotuloBanda,
  onVer,
}: {
  fila: FilaTabla;
  formatear: (v: number) => string;
  rotuloBanda: (b: Banda) => string;
  onVer: () => void;
}) {
  const t = useTranslations('carteraEdades');
  const atraso = bandaMasAtrasada(fila);
  return (
    <div className="flex items-end justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium text-fg">{fila.tercero}</p>
        <p className="text-sm text-fg-secondary">{t('tarjeta.total', { valor: formatear(fila.total) })}</p>
        {atraso && !fila.esTotal && (
          <p className="text-xs text-fg-tertiary">
            {rotuloBanda(atraso)}: {formatear(fila.porBanda[atraso])}
          </p>
        )}
      </div>
      {!fila.esTotal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onVer();
          }}
          className="text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('tarjeta.ver')}
        </button>
      )}
    </div>
  );
}
