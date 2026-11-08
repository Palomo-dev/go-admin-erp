'use client';

/**
 * Mayor contable (Figma 990:75517 listo · 990:76399 sin cuenta · 993:79250
 * móvil). Página de trabajo de Contabilidad y, dentro del visor de Reportes, el
 * reporte «Mayor por cuenta»: un solo componente y una sola función de cálculo
 * (`ReportesContablesService.getLedger`), decisión 1 del dueño (2026-11-07).
 *
 * Arranca sin cuenta: elegir una agrupadora por defecto daba «0 movimientos».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpen, Download } from 'lucide-react';
import {
  AvisoTonal,
  ChipDocumento,
  ChipsOpcion,
  DataTable,
  DateRangeButton,
  EmptyState,
  FilterPanel,
  KpiCompacto,
  KpiStrip,
  PageHeader,
  Pagination,
  SelectorCuenta,
  StatCard,
  clasesBoton,
  inicioDeMes,
  type ColumnaTabla,
  type OpcionCuenta,
  type RangoFechas,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useVisorInforme } from '@/components/reportes/especiales/contextoVisor';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { celdasCsv } from '@/lib/finanzas/pendientesContables';
import { documentoDeOrigen, numeroCorto } from '@/lib/finanzas/contabilidad/origenAsiento';
import {
  cuentaDeUrl,
  descripcionLinea,
  filasMayor,
  paginaDe,
  saldoMayor,
  type FilaMayor,
} from '@/lib/finanzas/contabilidad/mayorLogica';
import { ReportesContablesService, type FiltrosMayor, type LedgerAccount } from '../ReportesContablesService';
import { ContabilidadService, type ChartAccount } from '../ContabilidadService';
import { EnlaceAsiento, useNumeroAsiento } from '../piezas';

type Estado = 'sinCuenta' | 'cargando' | 'listo' | 'error';
type Cuenta = Pick<ChartAccount, 'account_code' | 'name' | 'type'>;

const TAMANOS = [25, 50, 100] as const;

export function MayorContablePage() {
  const visor = useVisorInforme();
  // Dentro del visor de Reportes la cabecera móvil es la del visor.
  return visor ? <MayorContable /> : <PaginaMayor />;
}

function PaginaMayor() {
  const t = useTranslations('finanzasContabilidadR3.mayor');
  useCabeceraMovil({ modo: 'page', titulo: t('titulo'), volverA: '/app/finanzas/contabilidad' });
  return <MayorContable />;
}

function MayorContable() {
  const t = useTranslations('finanzasContabilidadR3.mayor');
  const tc = useTranslations('finanzasContabilidadR3.comun');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const visor = useVisorInforme();
  const branchCtx = useBranchOpcional();
  const sucursales = branchCtx?.branches ?? [];
  const { formatear } = useMonedaOrganizacion();
  const { formatDate, formatPlain, getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const numero = useNumeroAsiento();

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuenta, setCuenta] = useState<string | null>(() => cuentaDeUrl(searchParams?.get('cuenta')));
  const [rango, setRango] = useState<RangoFechas | null>(null);
  const [filtros, setFiltros] = useState<FiltrosMayor>({});
  const [nitBorrador, setNitBorrador] = useState('');
  const [centros, setCentros] = useState<{ id: string; code: string; name: string }[]>([]);
  const [mayor, setMayor] = useState<LedgerAccount | null>(null);
  const [estado, setEstado] = useState<Estado>(cuenta ? 'cargando' : 'sinCuenta');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<number>(25);
  const consulta = useRef(0);

  // Periodo: el del visor en Reportes; en la página, el mes en curso de la organización.
  useEffect(() => {
    if (visor) {
      setRango({ desde: visor.desde, hasta: visor.hasta });
      return;
    }
    if (tzLoading) return;
    setRango((previo) => previo ?? { desde: inicioDeMes(getToday()), hasta: getToday() });
  }, [visor, visor?.desde, visor?.hasta, tzLoading, getToday]);

  useEffect(() => {
    ContabilidadService.obtenerCuentasLigero()
      .then(setCuentas)
      .catch((error) => console.error('No se pudo leer el plan de cuentas para el mayor:', error));
    ContabilidadService.listarCentrosCosto()
      .then(setCentros)
      .catch(() => setCentros([]));
  }, []);

  const cargar = useCallback(async () => {
    if (!cuenta || !rango) return;
    const turno = ++consulta.current;
    setEstado('cargando');
    try {
      const datos = await ReportesContablesService.getLedger(cuenta, rango.desde, rango.hasta, filtros);
      if (turno !== consulta.current) return;
      setMayor(datos);
      setPagina(1);
      setEstado(datos ? 'listo' : 'error');
    } catch (error) {
      if (turno !== consulta.current) return;
      console.error('No se pudo consultar el mayor:', error);
      setMayor(null);
      setEstado('error');
    }
  }, [cuenta, rango, filtros]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const elegirCuenta = (c: OpcionCuenta) => {
    setCuenta(c.account_code);
    // La cuenta queda en la URL: se comparte y «atrás» la conserva.
    if (!visor) {
      const q = new URLSearchParams(searchParams?.toString() ?? '');
      q.set('cuenta', c.account_code);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    }
  };

  const buscarCuenta = useCallback(
    async (texto: string, desde: number) => {
      const s = texto.trim().toLowerCase();
      const lista = s ? cuentas.filter((c) => c.account_code.startsWith(s) || c.name.toLowerCase().includes(s)) : cuentas;
      return { items: lista.slice(desde, desde + 50).map((c) => ({ account_code: c.account_code, name: c.name })), total: lista.length };
    },
    [cuentas],
  );

  const cuentaElegida = useMemo(() => {
    const c = cuentas.find((x) => x.account_code === cuenta);
    if (c) return { account_code: c.account_code, name: c.name };
    if (mayor && mayor.account_code === cuenta) return { account_code: mayor.account_code, name: mayor.name };
    return cuenta ? { account_code: cuenta, name: '' } : null;
  }, [cuentas, cuenta, mayor]);

  const filas = useMemo(() => (mayor ? filasMayor(mayor) : []), [mayor]);
  const visibles = useMemo(() => paginaDe(filas, pagina, tamano), [filas, pagina, tamano]);

  const conLado = (saldo: number) => {
    if (!mayor) return '';
    const { valor, lado } = saldoMayor(saldo, mayor);
    return lado ? `${formatear(valor)} ${lado}` : formatear(0);
  };
  const importe = (v: number) => (Math.abs(v) < 0.005 ? '' : formatear(v));
  const nFiltros = (filtros.branchId != null ? 1 : 0) + (filtros.terceroNit ? 1 : 0) + (filtros.costCenterId ? 1 : 0);

  const columnas = useMemo<ColumnaTabla<FilaMayor>[]>(
    () => [
      {
        id: 'fecha',
        encabezado: t('columnas.fecha'),
        ancho: 120,
        celda: (f) =>
          f.tipo === 'movimiento' ? (
            <span className={f.linea.source === 'reversal' ? 'text-fg-muted' : 'text-fg'}>{formatDate(f.linea.entry_date)}</span>
          ) : (
            <span className="font-semibold text-fg">{rango ? formatPlain(f.tipo === 'inicial' ? rango.desde : rango.hasta) : ''}</span>
          ),
      },
      {
        id: 'asiento',
        encabezado: t('columnas.asiento'),
        ancho: 96,
        celda: (f) =>
          f.tipo === 'movimiento' ? (
            f.linea.source === 'reversal' ? (
              <span className="text-fg-muted">{numero(f.linea.journal_entry_id)}</span>
            ) : (
              <EnlaceAsiento id={f.linea.journal_entry_id} />
            )
          ) : null,
      },
      {
        id: 'documento',
        encabezado: t('columnas.documento'),
        ocultarDebajo: 'xl',
        celda: (f) => {
          if (f.tipo !== 'movimiento' || !f.linea.source_id) return null;
          const doc = documentoDeOrigen(f.linea.source, f.linea.source_id);
          if (!doc || doc.tipo === 'asiento') return null;
          return <ChipDocumento tipo={doc.tipo} numero={numeroCorto(f.linea.source_id)} href={doc.href} />;
        },
      },
      {
        id: 'descripcion',
        encabezado: t('columnas.descripcion'),
        celda: (f) =>
          f.tipo === 'inicial' ? (
            <span className="font-semibold text-fg">{t('saldoInicial')}</span>
          ) : f.tipo === 'final' ? (
            <span className="font-semibold text-fg">{t('saldoFinalTras', { n: f.movimientos })}</span>
          ) : (
            <span className={f.linea.source === 'reversal' ? 'text-fg-muted' : 'text-fg'}>
              {descripcionLinea(f.linea) ?? '—'}
              {f.linea.tercero_nit && <span className="block text-xs text-fg-secondary">{[f.linea.tercero_nombre, f.linea.tercero_nit].filter(Boolean).join(' · ')}</span>}
            </span>
          ),
      },
      {
        id: 'debito',
        encabezado: tc('tabla.debito'),
        variante: 'importe',
        celda: (f) => (f.tipo === 'movimiento' ? importe(f.linea.debit) : f.tipo === 'final' ? <span className="font-semibold">{formatear(f.debitos)}</span> : null),
      },
      {
        id: 'credito',
        encabezado: tc('tabla.credito'),
        variante: 'importe',
        celda: (f) => (f.tipo === 'movimiento' ? importe(f.linea.credit) : f.tipo === 'final' ? <span className="font-semibold">{formatear(f.creditos)}</span> : null),
      },
      {
        id: 'saldo',
        encabezado: t('columnas.saldo'),
        variante: 'importe',
        celda: (f) => (
          <span className="font-semibold text-fg">{conLado(f.tipo === 'movimiento' ? f.linea.running_balance : f.saldo)}</span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- conLado e importe dependen de mayor y formatear
    [t, tc, formatDate, formatPlain, numero, rango, mayor, formatear],
  );

  const exportar = () => {
    if (!mayor) return;
    const encabezado = ['fecha', 'asiento', 'descripcion', 'debito', 'credito', 'saldo'].map((c) => t(`csv.${c}`));
    const lineas = mayor.entries.map((e) =>
      [formatDate(e.entry_date), e.journal_entry_id, descripcionLinea(e) ?? '', e.debit, e.credit, e.running_balance].map(celdasCsv).join(','),
    );
    const contenido = `﻿${[encabezado.map(celdasCsv).join(','), ...lineas].join('\n')}`;
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = t('csv.archivo', { cuenta: mayor.account_code });
    enlace.click();
    URL.revokeObjectURL(url);
  };

  const subtitulo = mayor
    ? `${mayor.account_code} · ${mayor.name}${nFiltros ? '' : ` · ${t('todaLaOrganizacion')}`}`
    : t('subtituloSinCuenta');

  const hoy = tzLoading ? undefined : getToday();

  const barra = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="min-w-0 flex-1 lg:max-w-md">
        <SelectorCuenta etiqueta={t('cuenta')} valor={cuentaElegida} buscar={buscarCuenta} onCambiar={elegirCuenta} />
      </div>
      {!visor && rango && hoy && (
        <DateRangeButton
          valor={rango}
          onValorChange={setRango}
          hoy={hoy}
          etiqueta={t('periodo')}
          onLimpiar={() => setRango({ desde: inicioDeMes(hoy), hasta: hoy })}
        />
      )}
      <div className="lg:ml-auto">
        <FilterPanel
          conteo={nFiltros}
          onLimpiar={() => {
            setFiltros({});
            setNitBorrador('');
          }}
          nota={t('filtros.nota')}
        >
          <div className="space-y-4">
            {sucursales.length > 1 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-fg">{t('filtros.sucursal')}</legend>
                <ChipsOpcion<string>
                  etiqueta={t('filtros.sucursal')}
                  valor={filtros.branchId != null ? String(filtros.branchId) : 'todas'}
                  onValorChange={(v) => setFiltros((f) => ({ ...f, branchId: v === 'todas' ? null : Number(v) }))}
                  opciones={[{ valor: 'todas', etiqueta: t('filtros.todas') }, ...sucursales.map((b) => ({ valor: String(b.id), etiqueta: b.name }))]}
                />
              </fieldset>
            )}
            <label className="block space-y-2">
              <span className="block text-sm font-medium text-fg">{t('filtros.tercero')}</span>
              <Input
                value={nitBorrador}
                inputMode="numeric"
                placeholder={t('filtros.terceroAyuda')}
                onChange={(e) => setNitBorrador(e.target.value)}
                onBlur={() => setFiltros((f) => ({ ...f, terceroNit: nitBorrador.trim() || null }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setFiltros((f) => ({ ...f, terceroNit: nitBorrador.trim() || null }));
                }}
              />
            </label>
            {centros.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-fg">{t('filtros.centro')}</legend>
                <ChipsOpcion<string>
                  etiqueta={t('filtros.centro')}
                  valor={filtros.costCenterId ?? 'todos'}
                  onValorChange={(v) => setFiltros((f) => ({ ...f, costCenterId: v === 'todos' ? null : v }))}
                  opciones={[{ valor: 'todos', etiqueta: t('filtros.todos') }, ...centros.map((c) => ({ valor: c.id, etiqueta: `${c.code} · ${c.name}` }))]}
                />
              </fieldset>
            )}
          </div>
        </FilterPanel>
      </div>
    </div>
  );

  const kpis = mayor && (
    <>
      <KpiStrip etiqueta={t('kpis.resumen')} className="hidden lg:grid">
        <StatCard
          etiqueta={t('kpis.saldoInicial')}
          valor={mayor.filtrado ? '—' : conLado(mayor.opening_balance)}
          detalle={mayor.filtrado ? t('kpis.inicialConFiltros') : undefined}
        />
        <StatCard etiqueta={t('kpis.debitos')} valor={formatear(mayor.total_debit)} detalle={t('kpis.movimientos', { n: mayor.entries.length })} />
        <StatCard etiqueta={t('kpis.creditos')} valor={formatear(mayor.total_credit)} />
        <StatCard etiqueta={mayor.filtrado ? t('kpis.acumulado') : t('kpis.saldoFinal')} valor={conLado(mayor.closing_balance)} />
      </KpiStrip>
      <div className="lg:hidden">
        <KpiCompacto
          cifras={[
            { etiqueta: t('kpis.saldoInicial'), valor: mayor.filtrado ? '—' : conLado(mayor.opening_balance) },
            { etiqueta: t('kpis.saldoFinal'), valor: conLado(mayor.closing_balance) },
            { etiqueta: t('kpis.debitos'), valor: formatear(mayor.total_debit) },
            { etiqueta: t('kpis.creditos'), valor: formatear(mayor.total_credit) },
          ]}
        />
      </div>
    </>
  );

  return (
    <div className={visor ? 'space-y-4' : 'space-y-6 p-4 sm:p-6 lg:p-8'}>
      {!visor && (
        <PageHeader
          titulo={t('titulo')}
          subtitulo={subtitulo}
          icono={BookOpen}
          migas={[
            { etiqueta: tc('migas.finanzas'), href: '/app/finanzas' },
            { etiqueta: tc('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
            { etiqueta: t('titulo') },
          ]}
          movil={{ accionesEnFila: true }}
          acciones={
            <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={!mayor || mayor.entries.length === 0} onClick={exportar}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar')}
            </button>
          }
        />
      )}

      {barra}

      {estado === 'sinCuenta' && (
        <EmptyState variante="empty" icono={BookOpen} titulo={t('sinCuenta.titulo')} descripcion={t('sinCuenta.descripcion')} />
      )}

      {estado === 'error' && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={t('error.titulo')}
          descripcion={t('error.descripcion')}
          accion={{ etiqueta: t('error.reintentar'), onClick: () => void cargar() }}
        />
      )}

      {(estado === 'listo' || estado === 'cargando') && (
        <>
          {kpis}
          {mayor?.truncated && <AvisoTonal tono="informacion" titulo={t('truncado.titulo')} descripcion={t('truncado.descripcion')} />}
          {mayor?.filtrado && <AvisoTonal tono="informacion" titulo={t('filtrado.titulo')} descripcion={t('filtrado.descripcion')} />}
          <DataTable
            etiqueta={t('tabla')}
            columnas={columnas}
            filas={visibles}
            obtenerId={(f) => f.id}
            estado={estado === 'cargando' ? 'cargando' : 'listo'}
            atributosFila={(f) => ({ 'data-tipo': f.tipo })}
            tarjetaMovil={(f) => <TarjetaMayor fila={f} conLado={conLado} importe={formatear} />}
            pie={
              filas.length > tamano ? (
                <Pagination
                  pagina={pagina}
                  tamano={tamano}
                  total={filas.length}
                  onPaginaChange={setPagina}
                  onTamanoChange={(n) => {
                    setPagina(1);
                    setTamano(n);
                  }}
                  opcionesTamano={TAMANOS}
                  sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
                />
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}

function TarjetaMayor({ fila, conLado, importe }: { fila: FilaMayor; conLado: (v: number) => string; importe: (v: number) => string }) {
  const t = useTranslations('finanzasContabilidadR3.mayor');
  const { formatDate } = useFormatDate();
  if (fila.tipo !== 'movimiento') {
    return (
      <div className="flex items-center justify-between rounded-xl border border-line bg-subtle p-4 text-sm font-semibold">
        <span className="text-fg">{fila.tipo === 'inicial' ? t('saldoInicial') : t('saldoFinalTras', { n: fila.movimientos })}</span>
        <span className="tabular-nums text-fg">{conLado(fila.saldo)}</span>
      </div>
    );
  }
  const l = fila.linea;
  const doc = l.source_id ? documentoDeOrigen(l.source, l.source_id) : null;
  const reversa = l.source === 'reversal';
  return (
    <div className="space-y-1 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <EnlaceAsiento id={l.journal_entry_id} className={reversa ? 'text-fg-muted' : undefined} />
          {doc && doc.tipo !== 'asiento' && l.source_id && <ChipDocumento tipo={doc.tipo} numero={numeroCorto(l.source_id)} href={doc.href} />}
        </span>
        <span className="text-sm text-fg-secondary">{formatDate(l.entry_date)}</span>
      </div>
      <p className={reversa ? 'text-sm text-fg-muted' : 'text-sm text-fg'}>{descripcionLinea(l) ?? '—'}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg-secondary">{l.debit > 0 ? `D ${importe(l.debit)}` : `C ${importe(l.credit)}`}</span>
        <span className="font-semibold tabular-nums text-fg">{conLado(l.running_balance)}</span>
      </div>
    </div>
  );
}
