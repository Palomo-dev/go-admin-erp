'use client';

/**
 * Transferencias bancarias · lista (Figma `2329:130945`), con el kit. Sigue
 * aparte de Movimientos (decisión 5 del Contador), aunque Movimientos también
 * las muestra en su pestaña «Traslados». Sustituye a `TransferenciasPage`
 * (`/finanzas/transferencias` redirige aquí).
 *
 * Conserva: KPIs total transferido · este mes · operaciones · pendientes,
 * buscar por cuenta o referencia, exportar CSV, ver detalle, anular con motivo,
 * nueva transferencia y actualizar. «Este mes» ahora usa el mes de la
 * organización (antes, la medianoche del navegador).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeftRight, Download, Eye, Plus, RefreshCw, XCircle } from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  DialogoMotivo,
  KpiStrip,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  clasesBoton,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { transferenciasService, type BankTransfer } from '@/lib/services/transferenciasService';
import { resumirMovimientos, unirMovimientos, coincideBusqueda } from '@/lib/finanzas/tesoreria/movimientosLista';
import { RUTAS_TESORERIA, rutaTransferencia } from '@/lib/finanzas/tesoreria/rutas';
import { NuevaTransferenciaDialogo, descargarCsv } from '../compartido';

const TAMANO = 25;
const TONO_ESTADO = { completed: 'exito', pending: 'advertencia', cancelled: 'peligro' } as const;

export function TransferenciasLista() {
  const t = useTranslations('finanzasTesoreriaR3.transferencias');
  const tc = useTranslations('finanzasTesoreriaR3.comun');
  const te = useTranslations('tesoreria');
  const router = useRouter();
  const { branchFilter } = useBranch();
  const { formatear } = useMonedaOrganizacion();
  const { formatDate, getToday, toDate } = useFormatDate();
  const [transferencias, setTransferencias] = useState<BankTransfer[]>([]);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [termino, setTermino] = useState('');
  const [pagina, setPagina] = useState(1);
  const [nueva, setNueva] = useState(false);
  const [anulando, setAnulando] = useState<BankTransfer | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      setTransferencias(await transferenciasService.getTransfers(branchFilter));
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [branchFilter]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useEffect(() => setPagina(1), [termino]);

  // Misma fila y mismo resumen que Movimientos (pestaña Traslados): una sola lógica.
  const filas = useMemo(() => unirMovimientos([], [], transferencias), [transferencias]);
  const resumen = useMemo(() => resumirMovimientos(filas, getToday(), (iso) => toDate(new Date(iso))), [filas, getToday, toDate]);
  const pendientes = transferencias.filter((x) => x.status === 'pending').length;
  const visibles = useMemo(() => {
    const claves = new Set(filas.filter((f) => coincideBusqueda(f, termino)).map((f) => f.id));
    return transferencias.filter((x) => claves.has(x.id));
  }, [filas, termino, transferencias]);

  const exportar = () => {
    const celda = (v: string | number) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lineas = [
      [t('csv.id'), t('csv.fecha'), t('csv.origen'), t('csv.destino'), t('csv.monto'), t('csv.referencia'), t('csv.estado')].map(celda).join(','),
      ...visibles.map((x) =>
        [x.id, formatDate(x.transfer_date), x.from_account?.name ?? '', x.to_account?.name ?? '', x.amount, x.reference ?? '', t(`estados.${x.status}`)].map(celda).join(','),
      ),
    ];
    descargarCsv(`transferencias_${getToday()}.csv`, lineas.join('\n'));
  };

  const confirmarAnulacion = async (motivo: string) => {
    if (!anulando) return;
    setOcupado(true);
    setErrorAnular(null);
    try {
      const r = await transferenciasService.cancelTransfer(anulando.id, motivo);
      if (!r.success) {
        setErrorAnular(te(`errores.${r.codigo ?? 'desconocido'}`));
        return;
      }
      toast.success(t('anulada'));
      setAnulando(null);
      void cargar();
    } finally {
      setOcupado(false);
    }
  };

  const columnas: ColumnaTabla<BankTransfer>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (x) => <span className="whitespace-nowrap text-fg-secondary">{formatDate(x.transfer_date)}</span>, ancho: 120 },
    { id: 'origen', encabezado: t('columnas.origen'), celda: (x) => <span className="font-medium text-fg">{x.from_account?.name ?? '—'}</span> },
    { id: 'destino', encabezado: t('columnas.destino'), celda: (x) => x.to_account?.name ?? '—' },
    { id: 'monto', encabezado: t('columnas.monto'), variante: 'importe', celda: (x) => formatear(Number(x.amount)) },
    { id: 'referencia', encabezado: t('columnas.referencia'), variante: 'mono', celda: (x) => x.reference ?? '—', ocultarDebajo: 'lg' },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (x) => <StatusBadge estado={x.status} etiqueta={t(`estados.${x.status}`)} tono={TONO_ESTADO[x.status]} /> },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ArrowLeftRight}
        migas={[{ etiqueta: tc('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: tc('migas.tesoreria'), href: RUTAS_TESORERIA.movimientos }, { etiqueta: t('titulo') }]}
        movil={{ accionesEnFila: true }}
        acciones={
          <>
            <button type="button" onClick={exportar} disabled={visibles.length === 0} className={clasesBoton({ variante: 'secundario' })}>
              <Download className="h-4 w-4" aria-hidden />
              {tc('exportar')}
            </button>
            <button type="button" onClick={() => setNueva(true)} className={clasesBoton({ variante: 'primario' })}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('nueva')}
            </button>
            <RowActionsMenu
              acciones={[{ id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: () => void cargar() }]}
              titulo={t('titulo')}
              orientacion="horizontal"
              tamano="md"
            />
          </>
        }
        debajo={<BranchBadgeActiva />}
      />

      <SearchInput value={termino} onChange={setTermino} placeholder={t('buscar')} etiqueta={t('buscar')} />

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard etiqueta={t('kpi.total')} valor={formatear(resumen.total)} tamano="sm" cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.mes')} valor={formatear(resumen.mes)} tamano="sm" cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.operaciones')} valor={resumen.registros} tamano="sm" cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.pendientes')} valor={pendientes} tamano="sm" tono={pendientes > 0 ? 'advertencia' : 'neutro'} cargando={estado === 'cargando'} />
      </KpiStrip>

      <DataTable<BankTransfer>
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles.slice((pagina - 1) * TAMANO, pagina * TAMANO)}
        obtenerId={(x) => x.id}
        estado={estado === 'listo' && transferencias.length > 0 && visibles.length === 0 ? 'sinResultados' : estado}
        termino={termino}
        onLimpiarFiltros={() => setTermino('')}
        onReintentar={() => void cargar()}
        onFilaClick={(x) => router.push(rutaTransferencia(x.id))}
        etiquetaFila={(x) => x.reference ?? t('titulo')}
        acciones={(x) => [
          { id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => router.push(rutaTransferencia(x.id)) },
          { id: 'anular', etiqueta: t('anular'), icono: XCircle, destructiva: true, onSelect: () => setAnulando(x), oculta: x.status !== 'completed' },
        ]}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), accion: { etiqueta: t('nueva'), onClick: () => setNueva(true) } }}
        tarjetaMovil={(x) => (
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">
                {x.from_account?.name ?? '—'} → {x.to_account?.name ?? '—'}
              </p>
              <p className="text-xs text-fg-secondary">
                {formatDate(x.transfer_date)} {x.reference ? `· ${x.reference}` : ''}
              </p>
              <div className="mt-1">
                <StatusBadge estado={x.status} etiqueta={t(`estados.${x.status}`)} tono={TONO_ESTADO[x.status]} />
              </div>
            </div>
            <span className="font-semibold tabular-nums text-fg">{formatear(Number(x.amount))}</span>
          </div>
        )}
        pie={
          visibles.length > TAMANO ? (
            <Pagination pagina={pagina} tamano={TAMANO} total={visibles.length} onPaginaChange={setPagina} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }} />
          ) : undefined
        }
      />

      <NuevaTransferenciaDialogo
        abierto={nueva}
        onAbiertoChange={setNueva}
        onHecha={() => {
          setNueva(false);
          void cargar();
        }}
      />
      <DialogoMotivo
        abierto={!!anulando}
        onAbiertoChange={(a) => !a && !ocupado && (setAnulando(null), setErrorAnular(null))}
        titulo={t('anularTitulo')}
        descripcion={te('anular.descripcion')}
        textoConfirmar={t('anular')}
        consecuencias={[t('anularConsecuencia')]}
        cargando={ocupado}
        error={errorAnular}
        onConfirmar={(m) => void confirmarAnulacion(m)}
      />
    </div>
  );
}
