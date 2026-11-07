'use client';

/**
 * Certificados de retención (Figma «07 Finanzas» 2335:138003, captura
 * `docs/design/figma/88-tributario-certificados.png`): retenciones practicadas
 * a cada tercero en el periodo (retefuente, reteIVA, reteICA) y el estado de su
 * certificado. Vista previa, expedición, impresión y PDF son el diálogo que ya
 * usan el proveedor, la factura de compra, la CxP y el asiento
 * (`CertificadoRetencionesDialog`, motor de documentos): una pieza para todas.
 *
 * Página de trabajo (se expiden certificados con número), así que vive en
 * Finanzas › Tributario; el informe «Retenciones practicadas» sigue en Reportes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Download, FileBadge, FileCheck2, UserPen } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  FormField,
  KpiStrip,
  SearchInput,
  StatCard,
  StatusBadge,
  clasesBoton,
  useParametrosUrl,
  type ColumnaTabla,
  type TonoBadge,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { etiquetaPeriodo, periodoNumero } from '@/lib/finanzas/tributario/periodos';
import { filtrarCertificados, porExpedir, type EstadoCertificado, type FilaCertificado } from '@/lib/finanzas/tributario/certificados';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import { CertificadoRetencionesDialog } from '@/components/finanzas/cuentas-por-pagar/CertificadoRetencionesDialog';
import { tributarioCliente, RUTAS_TRIBUTARIO, type CertificadosCliente } from '../tributarioCliente';
import { CabeceraTributario, ErrorLectura, codigoDe, type Lectura } from '../piezas';

const TONO: Record<EstadoCertificado, TonoBadge> = {
  expedido: 'exito',
  desactualizado: 'advertencia',
  sin_expedir: 'neutro',
  falta_tercero: 'advertencia',
};

/** Alcance del periodo dentro del año: el año completo o un bimestre. */
const ALCANCES = ['anual', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'] as const;
type Alcance = (typeof ALCANCES)[number];

export function CertificadosRetencionPage() {
  const t = useTranslations('finanzasTributarioR4.certificados');
  const tc = useTranslations('finanzasTributarioR4.comun');
  const locale = useLocale();
  const { formatear } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const anioActual = Number(hoy.slice(0, 4));
  const { leer, fijar } = useParametrosUrl();
  const router = useRouter();

  const anios = useMemo(() => Array.from({ length: 5 }, (_, i) => anioActual - i), [anioActual]);
  const anioUrl = Number(leer('anio'));
  const anio = anios.includes(anioUrl) ? anioUrl : anioActual - 1;
  const alcance: Alcance = (ALCANCES as readonly string[]).includes(leer('p') ?? '') ? (leer('p') as Alcance) : 'anual';
  const periodo = alcance === 'anual' ? periodoNumero('anual', anio, 1) : periodoNumero('bimestral', anio, Number(alcance.slice(1)));
  const futuro = periodo.desde > hoy;

  const [q, setQ] = useState('');
  const [lectura, setLectura] = useState<Lectura<CertificadosCliente>>({ estado: 'cargando' });
  const [dialogo, setDialogo] = useState<FilaCertificado | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [expidiendo, setExpidiendo] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; fallidos: number } | null>(null);

  const cargar = useCallback(async () => {
    if (futuro) return;
    setLectura({ estado: 'cargando' });
    try {
      setLectura({ estado: 'listo', datos: await tributarioCliente.certificados(periodo.desde, periodo.hasta) });
    } catch (err) {
      setLectura({ estado: 'error', codigo: codigoDe(err) });
    }
  }, [periodo.desde, periodo.hasta, futuro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const datos = lectura.estado === 'listo' ? lectura.datos : null;
  const visibles = useMemo(() => (datos ? filtrarCertificados(datos.filas, q) : []), [datos, q]);
  const pendientes = useMemo(() => (datos ? porExpedir(datos.filas) : []), [datos]);

  const columnas: ColumnaTabla<FilaCertificado>[] = [
    { id: 'tercero', encabezado: t('columnas.tercero'), celda: (f) => <span className="font-medium text-fg">{f.proveedor ?? '—'}</span> },
    {
      id: 'nit',
      encabezado: t('columnas.nit'),
      variante: 'mono',
      ocultarDebajo: 'sm',
      celda: (f) => f.nit ?? <span className="text-warning-text">{t('faltaNit')}</span>,
    },
    { id: 'retefuente', encabezado: t('columnas.retefuente'), variante: 'importe', alinear: 'derecha', ocultarDebajo: 'lg', celda: (f) => formatear(f.retefuente) },
    { id: 'reteiva', encabezado: t('columnas.reteiva'), variante: 'importe', alinear: 'derecha', ocultarDebajo: 'lg', celda: (f) => formatear(f.reteiva) },
    { id: 'reteica', encabezado: t('columnas.reteica'), variante: 'importe', alinear: 'derecha', ocultarDebajo: 'lg', celda: (f) => formatear(f.reteica) },
    { id: 'retenido', encabezado: t('columnas.retenido'), variante: 'importe', alinear: 'derecha', celda: (f) => formatear(f.retenido) },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (f) => (
        <span className="flex flex-col items-start gap-0.5">
          <StatusBadge estado={f.estado} etiqueta={t(`estados.${f.estado}`)} tono={TONO[f.estado]} />
          {f.certificado && <span className="text-xs text-fg-secondary">{f.certificado.numero}</span>}
        </span>
      ),
    },
  ];

  const exportar = () => {
    if (!datos) return;
    const filas: (string | number | null)[][] = [
      [t('columnas.tercero'), t('columnas.nit'), t('columnas.retefuente'), t('columnas.reteiva'), t('columnas.reteica'), t('columnas.retenido'), t('columnas.estado'), t('columnas.numero')],
      ...datos.filas.map((f) => [f.proveedor, f.nit, f.retefuente, f.reteiva, f.reteica, f.retenido, t(`estados.${f.estado}`), f.certificado?.numero ?? null]),
    ];
    descargarCsv(`retenciones-${datos.desde}-${datos.hasta}.csv`, aCsv(filas));
  };

  const expedirTodos = async () => {
    if (!datos) return;
    setExpidiendo(true);
    let ok = 0;
    let fallidos = 0;
    // Uno a uno: la RPC numera con candado por organización y año.
    for (const f of pendientes) {
      try {
        await tributarioCliente.expedirCertificado(f.proveedorId, datos.desde, datos.hasta);
        ok += 1;
      } catch {
        fallidos += 1;
      }
    }
    setExpidiendo(false);
    setConfirmar(false);
    setResultado({ ok, fallidos });
    void cargar();
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <CabeceraTributario
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={FileBadge}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={exportar} disabled={!datos || datos.filas.length === 0}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tc('exportar')}
            </button>
            <button
              type="button"
              className={clasesBoton({ variante: 'primario' })}
              onClick={() => setConfirmar(true)}
              disabled={pendientes.length === 0}
              title={pendientes.length === 0 ? t('nadaPorExpedir') : undefined}
            >
              <FileCheck2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('expedirTodos')}
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-[10rem_14rem_1fr] sm:items-end">
        <FormField etiqueta={t('anio')}>
          {(c) => <SelectNativo id={c.id} valor={String(anio)} onCambiar={(v) => fijar({ anio: v })} opciones={anios.map((a) => ({ valor: String(a), etiqueta: String(a) }))} />}
        </FormField>
        <FormField etiqueta={t('periodo')}>
          {(c) => (
            <SelectNativo
              id={c.id}
              valor={alcance}
              onCambiar={(v) => fijar({ p: v === 'anual' ? null : v })}
              opciones={ALCANCES.map((a) => ({
                valor: a,
                etiqueta: a === 'anual' ? t('anioCompleto') : etiquetaPeriodo(periodoNumero('bimestral', anio, Number(a.slice(1))), locale),
              }))}
            />
          )}
        </FormField>
        <SearchInput value={q} onChange={setQ} placeholder={t('buscar')} etiqueta={t('buscar')} />
      </div>

      {futuro && <AvisoTonal tono="informacion" titulo={t('futuro.titulo')} descripcion={t('futuro.descripcion')} />}

      {resultado && (
        <AvisoTonal
          tono={resultado.fallidos > 0 ? 'advertencia' : 'exito'}
          titulo={t('resultado.titulo', { ok: resultado.ok })}
          descripcion={resultado.fallidos > 0 ? t('resultado.fallidos', { n: resultado.fallidos }) : undefined}
        />
      )}

      {lectura.estado === 'error' && !futuro && <ErrorLectura codigo={lectura.codigo} onReintentar={() => void cargar()} />}

      {datos && datos.filas.length > 0 && (
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard etiqueta={t('kpis.retenido')} valor={formatear(datos.resumen.retenido)} detalle={t('kpis.terceros', { n: datos.resumen.terceros })} />
          <StatCard etiqueta={t('kpis.expedidos')} valor={datos.resumen.expedidos} tono="exito" />
          <StatCard etiqueta={t('kpis.pendientes')} valor={datos.resumen.pendientes} tono={datos.resumen.pendientes ? 'advertencia' : undefined} />
          <StatCard etiqueta={t('kpis.faltaTercero')} valor={datos.resumen.faltaTercero} tono={datos.resumen.faltaTercero ? 'advertencia' : undefined} />
        </KpiStrip>
      )}

      {!futuro && lectura.estado !== 'error' && (
        <DataTable<FilaCertificado>
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={visibles}
          obtenerId={(f) => String(f.proveedorId)}
          estado={lectura.estado === 'cargando' ? 'cargando' : datos && datos.filas.length === 0 ? 'vacio' : visibles.length === 0 ? 'sinResultados' : 'listo'}
          termino={q}
          onLimpiarFiltros={() => setQ('')}
          vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
          onFilaClick={(f) => (f.estado === 'falta_tercero' ? undefined : setDialogo(f))}
          acciones={(f) => [
            f.estado === 'falta_tercero'
              ? { id: 'completar', etiqueta: t('completarTercero'), icono: UserPen, onSelect: () => router?.push(`/app/inventario/proveedores/${f.proveedorId}`) }
              : { id: 'certificado', etiqueta: f.certificado ? t('verCertificado') : t('expedir'), icono: FileBadge, onSelect: () => setDialogo(f) },
          ]}
        />
      )}

      <p className="text-sm text-fg-secondary">
        {t('informe')}{' '}
        <Link href={RUTAS_TRIBUTARIO.reporteRetenciones} className="font-medium text-brand hover:underline">
          {t('informeEnlace')}
        </Link>
      </p>

      {dialogo && (
        <CertificadoRetencionesDialog
          abierto
          onAbiertoChange={(a) => {
            if (!a) {
              setDialogo(null);
              void cargar();
            }
          }}
          proveedorId={dialogo.proveedorId}
          proveedorNombre={dialogo.proveedor ?? ''}
          rangoInicial={datos ? { desde: datos.desde, hasta: datos.hasta } : { desde: periodo.desde, hasta: periodo.hasta }}
        />
      )}

      <ConfirmDialog
        abierto={confirmar}
        onAbiertoChange={setConfirmar}
        titulo={t('confirmar.titulo')}
        descripcion={t('confirmar.descripcion', { n: pendientes.length, periodo: etiquetaPeriodo(periodo, locale) })}
        textoConfirmar={t('confirmar.boton')}
        textoCancelar={tc('cancelar')}
        onConfirmar={() => expedirTodos()}
        tono="marca"
        icono={FileCheck2}
        cargando={expidiendo}
      />
    </div>
  );
}
