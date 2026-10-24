'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Banknote,
  BookOpen,
  Boxes,
  Calculator,
  ClipboardList,
  FileCheck2,
  FileText,
  GitBranch,
  Landmark,
  Percent,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  DataTable,
  EmptyState,
  FormField,
  PageHeader,
  StatCard,
  Tarjeta,
  clasesBoton,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { cargarEntrada } from '@/lib/finanzas/estados/cargar';
import { construirInforme, paqueteEstados } from '@/lib/finanzas/estados/construir';
import { exportarExcel, exportarPaquete, exportarPdf } from '@/lib/finanzas/estados/exportar';
import {
  TITULOS_INFORME,
  type ColumnaInforme,
  type EntradaInforme,
  type FilaInforme,
  type IdInforme,
  type InformeResultado,
} from '@/lib/finanzas/estados/tipos';
import { DESCRIPCION } from '@/lib/services/reportes/modulos/estadosFinancierosReports';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { primerDiaDelAnioDe } from '@/lib/services/fiscalCalendar';
import { supabase } from '@/lib/supabase/config';
import { formatNumeroMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { cn } from '@/utils/Utils';

const PAQUETE = new Set<IdInforme>([
  'situacion-financiera',
  'resultados-integral',
  'cambios-patrimonio',
  'flujo-indirecto',
  'notas-estados',
  'certificacion-estados',
]);

const ICONO: Record<IdInforme, LucideIcon> = {
  'situacion-financiera': Calculator,
  'resultados-integral': TrendingUp,
  'cambios-patrimonio': GitBranch,
  'flujo-indirecto': Banknote,
  'notas-estados': FileText,
  'certificacion-estados': FileCheck2,
  'libro-mayor': BookOpen,
  'auxiliar-cuenta': BookOpen,
  'auxiliar-centro': GitBranch,
  'inventarios-balances': Boxes,
  'conciliacion-inventario': ClipboardList,
  'kardex': Boxes,
  indicadores: BarChart3,
  'punto-equilibrio': Target,
  'formulario-300': Percent,
  'formulario-350': Percent,
  'ica-municipal': Landmark,
  reteica: Landmark,
  exogena: FileText,
  'certificado-220': FileCheck2,
  'certificado-retenciones': FileCheck2,
  'conciliacion-fiscal': Calculator,
  'informe-gestion': ClipboardList,
  'registro-accionistas': Users,
  pila: Users,
};

const CAMPO =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand';

type Formato = ColumnaInforme['tipo'];

function tipoCelda(columna: ColumnaInforme, fila: FilaInforme): Formato {
  const propio = fila.formato;
  if (
    (columna.key === 'actual' || columna.key === 'anterior' || columna.key === 'variacion') &&
    (propio === 'moneda' || propio === 'porcentaje' || propio === 'numero' || propio === 'texto')
  ) {
    return propio;
  }
  return columna.tipo;
}

function presentar(
  valor: string | number | null | undefined,
  tipo: Formato,
  moneda: ContextoMoneda,
  formatPlain: (value: string | null | undefined) => string,
): string {
  if (valor == null || valor === '') return '—';
  if (tipo === 'texto' || typeof valor !== 'number') {
    const texto = String(valor);
    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? formatPlain(texto) : texto;
  }
  if (!Number.isFinite(valor)) return '—';
  if (tipo === 'porcentaje') return `${new Intl.NumberFormat(moneda.locale, { maximumFractionDigits: 2 }).format(valor)} %`;
  if (tipo === 'numero') return new Intl.NumberFormat(moneda.locale, { maximumFractionDigits: 2 }).format(valor);
  return formatNumeroMoneda(valor, moneda);
}

function hrefAuxiliar(cuenta: string, desde: string, hasta: string, sucursalId: number | null, centroId: string | null): string {
  const consulta = new URLSearchParams({ cuenta, desde, hasta });
  if (sucursalId) consulta.set('sucursal', String(sucursalId));
  if (centroId) consulta.set('centro', centroId);
  return `/app/finanzas/contabilidad/informes/auxiliar-cuenta?${consulta.toString()}`;
}

export function InformeEstadosPage({
  informe,
  cuentaInicial = null,
  desdeInicial = null,
  hastaInicial = null,
  sucursalInicial = null,
  centroInicial = null,
}: {
  informe: IdInforme;
  cuentaInicial?: string | null;
  desdeInicial?: string | null;
  hastaInicial?: string | null;
  sucursalInicial?: number | null;
  centroInicial?: string | null;
}) {
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const { getToday, formatPlain } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const { organization, isLoading: orgLoading } = useOrganization();
  const [desde, setDesde] = useState(desdeInicial ?? '');
  const [hasta, setHasta] = useState(hastaInicial ?? '');
  const [sucursalId, setSucursalId] = useState<number | null>(sucursalInicial);
  const [centroId, setCentroId] = useState<string | null>(centroInicial);
  const [cuenta, setCuenta] = useState(cuentaInicial ?? '');
  const [cuentaAplicada, setCuentaAplicada] = useState(cuentaInicial ?? '');
  const [sedes, setSedes] = useState<{ id: number; name: string }[]>([]);
  const [centros, setCentros] = useState<{ id: string; name: string }[]>([]);
  const [entrada, setEntrada] = useState<EntradaInforme | null>(null);
  const [resultado, setResultado] = useState<InformeResultado | null>(null);
  const [estado, setEstado] = useState<'inicial' | 'cargando' | 'listo' | 'error'>('inicial');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    if (tzLoading) return;
    const hoy = getToday();
    setDesde((prev) => prev || primerDiaDelAnioDe(hoy));
    setHasta((prev) => prev || hoy);
  }, [tzLoading, getToday]);

  useEffect(() => {
    const orgId = organization?.id ?? 0;
    if (orgId <= 0) return;
    let vivo = true;
    void Promise.all([
      supabase.from('branches').select('id, name').eq('organization_id', orgId).order('name'),
      supabase.from('cost_centers').select('id, name').eq('organization_id', orgId).eq('is_active', true).order('name'),
    ]).then(([sedesRes, centrosRes]) => {
      if (!vivo) return;
      if (!sedesRes.error && Array.isArray(sedesRes.data)) {
        setSedes(sedesRes.data.map((fila) => ({ id: Number(fila.id), name: String(fila.name ?? '') })));
      }
      if (!centrosRes.error && Array.isArray(centrosRes.data)) {
        setCentros(centrosRes.data.map((fila) => ({ id: String(fila.id), name: String(fila.name ?? '') })));
      }
    });
    return () => {
      vivo = false;
    };
  }, [organization?.id]);

  useEffect(() => {
    if (tzLoading) return;
    const orgId = organization?.id ?? 0;
    if (!desde || !hasta || orgId <= 0) return;
    if (desde > hasta) {
      setEstado('error');
      setError('La fecha inicial es posterior a la final.');
      return;
    }
    let vivo = true;
    setEstado('cargando');
    setError(null);
    void cargarEntrada({
      organizationId: orgId,
      desde,
      hasta,
      sucursalId,
      centroId,
      cuenta: cuentaAplicada || null,
    })
      .then((cargada) => {
        if (!vivo) return;
        setEntrada(cargada);
        setResultado(construirInforme(informe, cargada));
        setEstado('listo');
      })
      .catch((fallo: unknown) => {
        if (!vivo) return;
        setEntrada(null);
        setResultado(null);
        setEstado('error');
        setError(fallo instanceof Error ? fallo.message : 'No se pudo armar el informe.');
      });
    return () => {
      vivo = false;
    };
  }, [tzLoading, organization?.id, desde, hasta, sucursalId, centroId, cuentaAplicada, informe, reintento]);

  const columnas = useMemo<ColumnaTabla<FilaInforme>[]>(() => {
    if (!resultado) return [];
    const primera = resultado.columnas[0]?.key;
    return resultado.columnas.map((columna) => ({
      id: columna.key,
      encabezado: columna.titulo,
      variante: columna.tipo === 'texto' ? 'texto' : 'importe',
      celda: (fila) => {
        const texto = presentar(fila[columna.key] as string | number | null, tipoCelda(columna, fila), moneda, formatPlain);
        const nivel = columna.key === primera ? Number(fila.nivel ?? 0) : 0;
        return (
          <span className={cn(fila.esTotal === 1 && 'font-semibold')} style={nivel > 0 ? { paddingLeft: nivel * 16 } : undefined}>
            {texto}
          </span>
        );
      },
    }));
  }, [resultado, moneda, formatPlain]);

  async function exportar(kind: 'excel' | 'pdf' | 'paquete') {
    if (!resultado || !entrada || exportando) return;
    setExportando(true);
    setAviso(null);
    try {
      if (kind === 'excel') await exportarExcel(resultado);
      else if (kind === 'pdf') await exportarPdf(resultado);
      else await exportarPaquete(paqueteEstados(entrada), entrada.perfil.entidad);
    } catch (fallo: unknown) {
      setAviso(fallo instanceof Error ? fallo.message : 'No se pudo exportar.');
    } finally {
      setExportando(false);
    }
  }

  function abrirDetalle(fila: FilaInforme) {
    const codigo = String(fila.cuenta ?? '');
    if (!/^\d{2,}$/.test(codigo)) return;
    router.push(hrefAuxiliar(codigo, desde, hasta, sucursalId, centroId));
  }

  if (!orgLoading && !organization?.id) {
    return (
      <EmptyState
        variante="forbidden"
        titulo="No hay una organización activa"
        descripcion="Entra de nuevo para ver los estados financieros."
      />
    );
  }

  const listo = estado === 'listo' && resultado && !resultado.oculto;
  const filas = resultado?.filas ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo={TITULOS_INFORME[informe]}
        subtitulo={DESCRIPCION[informe]}
        icono={ICONO[informe]}
        acciones={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/finanzas/contabilidad/configuracion-estados" className={clasesBoton({ variante: 'fantasma' })}>
              Configuración
            </Link>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={!listo || exportando} onClick={() => void exportar('pdf')}>
              PDF
            </button>
            {PAQUETE.has(informe) && (
              <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={!listo || exportando} onClick={() => void exportar('paquete')}>
                PDF de los estados
              </button>
            )}
            <button type="button" className={clasesBoton({ variante: 'primario' })} disabled={!listo || exportando} onClick={() => void exportar('excel')}>
              Excel
            </button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FormField etiqueta="Desde">
          <CampoFecha valor={desde} onValorChange={setDesde} max={hasta || undefined} />
        </FormField>
        <FormField etiqueta="Hasta">
          <CampoFecha valor={hasta} onValorChange={setHasta} min={desde || undefined} />
        </FormField>
        <FormField etiqueta="Sucursal">
          <select className={CAMPO} value={sucursalId ?? ''} onChange={(e) => setSucursalId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todas las sedes</option>
            {sedes.map((sede) => (
              <option key={sede.id} value={sede.id}>
                {sede.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField etiqueta="Centro de costo">
          <select className={CAMPO} value={centroId ?? ''} onChange={(e) => setCentroId(e.target.value || null)}>
            <option value="">Todos los centros</option>
            {centros.map((centro) => (
              <option key={centro.id} value={centro.id}>
                {centro.name}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {informe === 'auxiliar-cuenta' && (
        <FormField etiqueta="Cuenta o auxiliar" ayuda="Se aplica al salir del campo. Vacío muestra todas las cuentas con movimiento.">
          <input
            className={CAMPO}
            value={cuenta}
            onChange={(e) => setCuenta(e.target.value)}
            onBlur={() => setCuentaAplicada(cuenta.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setCuentaAplicada(cuenta.trim());
            }}
          />
        </FormField>
      )}

      {centroId && (informe === 'kardex' || informe === 'conciliacion-inventario') && (
        <AvisoTonal
          tono="informacion"
          titulo="El kárdex se lleva por sede"
          descripcion="La mercancía no tiene centro de costo. El auxiliar 1435 sí respeta el centro cuando el asiento lo trae."
        />
      )}
      {resultado?.borrador && <AvisoTonal tono="advertencia" titulo="Borrador" descripcion={resultado.lectura[0]} />}
      {aviso && <AvisoTonal tono="peligro" titulo="No se pudo exportar" descripcion={aviso} />}
      {resultado && resultado.diferencia != null && resultado.diferencia !== 0 && (
        <AvisoTonal
          tono="peligro"
          titulo="El informe no cuadra"
          descripcion={`La diferencia es ${formatNumeroMoneda(resultado.diferencia, moneda)}.`}
        />
      )}

      {resultado && resultado.kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {resultado.kpis.map((kpi) => (
            <StatCard
              key={kpi.titulo}
              etiqueta={kpi.titulo}
              valor={presentar(kpi.valor, kpi.formato === 'porcentaje' ? 'porcentaje' : kpi.formato === 'numero' ? 'numero' : 'moneda', moneda, formatPlain)}
            />
          ))}
        </div>
      )}

      {estado === 'error' && (
        <EmptyState variante="error" titulo="No se pudo armar el informe" descripcion={error ?? undefined} onReintentar={() => setReintento((n) => n + 1)} />
      )}

      {resultado?.oculto && (
        <EmptyState
          variante="empty"
          titulo="Este informe no se presenta"
          descripcion={resultado.motivoOculto ?? undefined}
          accion={{ etiqueta: 'Abrir la configuración', href: '/app/finanzas/contabilidad/configuracion-estados' }}
        />
      )}

      {!resultado?.oculto && estado !== 'error' && (
        <DataTable
          etiqueta={TITULOS_INFORME[informe]}
          columnas={columnas}
          filas={filas}
          obtenerId={(fila) => String(fila.id)}
          estado={estado === 'cargando' || estado === 'inicial' ? 'cargando' : 'listo'}
          densidad={columnas.length > 6 ? 'compacta' : 'comoda'}
          onFilaClick={informe === 'libro-mayor' ? abrirDetalle : undefined}
          etiquetaFila={(fila) => String(fila.concepto ?? fila.id)}
          tarjetaMovil={
            filas.length > 0 && filas.length <= 40
              ? (fila) => (
                  <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
                    {resultado?.columnas.map((columna) => (
                      <div key={columna.key} className="flex items-start justify-between gap-4">
                        <span className="text-xs text-fg-secondary">{columna.titulo}</span>
                        <span className="text-right text-sm tabular-nums text-fg">
                          {presentar(fila[columna.key] as string | number | null, tipoCelda(columna, fila), moneda, formatPlain)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              : undefined
          }
          vacio={{ titulo: 'Sin filas en este corte', descripcion: 'Cambia la fecha, la sede o el centro de costo.' }}
        />
      )}

      {listo && (resultado.borrador ? resultado.lectura.slice(1) : resultado.lectura).length > 0 && (
        <Tarjeta titulo="Lectura">
          <ul className="flex flex-col gap-2">
            {(resultado.borrador ? resultado.lectura.slice(1) : resultado.lectura).map((linea, indice) => (
              <li key={`${indice}-${linea.slice(0, 24)}`} className="text-sm text-fg">
                {linea}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
