'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Building2,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  Upload,
  User,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  StatCard,
  StatusBadge,
  Stepper,
  calcularRango,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService } from '@/lib/services/supplierService';
import { extensionAdmitida, leerMatriz, TAMANO_MAXIMO_ARCHIVO, type Matriz } from '@/lib/inventario/importacion/lector';
import { BOM, aCsv } from '@/lib/inventario/importacion/reporte';
import { usePermisosCatalogo } from '@/components/inventario/categorias/usePermisosCatalogo';
import { RUTA_PROVEEDORES } from '../useAccionesProveedor';
import {
  CAMPOS_PROVEEDOR,
  PLANTILLA_PROVEEDORES,
  aRevision,
  autoMapear,
  faltantes,
  filaCabeceraProveedores,
  filasDesdeMatriz,
  filtrarRevision,
  reasignar,
  type CampoProveedor,
  type FilaProveedor,
  type FiltroMostrar,
  type Mapeo,
  type RevisionProveedores,
} from './importarProveedoresLogica';

type Paso = 'archivo' | 'columnas' | 'revisar' | 'resultado';
const NINGUNO = '__ninguno__';
const MUESTRAS = 3;

interface FilaTabla {
  fila: number;
  nombre: string;
  documento: string;
  tipo: string | undefined;
  plazo: string | undefined;
  accion: 'crear' | 'actualizar' | 'error';
  motivo: string | null;
  existenteId: number | null;
}

/**
 * «Importar proveedores» (Figma `973:185225`, móvil `975:185874`): asistente de
 * cuatro pasos — Archivo · Columnas · Revisar · Resultado.
 *
 * La revisión la hace el servidor con la MISMA función que después importa
 * (`fn_proveedores_importar`): cada fila sale como «Crear», «Actualizar» (mismo
 * documento que un proveedor existente) o «No se importa» con su motivo. En
 * «Revisar» se eligen las filas; «Importar N proveedores» las aplica en una
 * transacción. Permiso de crear del catálogo en el servidor y en la interfaz.
 */
export function ImportarProveedores() {
  const t = useTranslations('proveedores.importar');
  const tc = useTranslations('proveedores.comun');
  const n = useFormatoEntero();
  const router = useRouter();
  const { toast } = useToast();
  const permisos = usePermisosCatalogo();
  const refArchivo = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState<Paso>('archivo');
  const [archivo, setArchivo] = useState<string | null>(null);
  const [matriz, setMatriz] = useState<Matriz>([]);
  const [filaCabecera, setFilaCabecera] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo>([]);
  const [filas, setFilas] = useState<FilaProveedor[]>([]);
  const [revision, setRevision] = useState<RevisionProveedores | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [mostrar, setMostrar] = useState<FiltroMostrar>('todas');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(10);
  const [trabajando, setTrabajando] = useState<null | 'leyendo' | 'revisando' | 'importando'>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const pasos = [
    { valor: 'archivo' as const, etiqueta: t('pasos.archivo') },
    { valor: 'columnas' as const, etiqueta: t('pasos.columnas') },
    { valor: 'revisar' as const, etiqueta: t('pasos.revisar') },
    { valor: 'resultado' as const, etiqueta: t('pasos.resultado') },
  ];

  const codigo = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '');

  const descargarPlantilla = () => {
    const blob = new Blob([BOM + PLANTILLA_PROVEEDORES], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('nombrePlantilla');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const leer = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!extensionAdmitida(file.name)) return setError(t('errores.formato'));
    if (file.size > TAMANO_MAXIMO_ARCHIVO) return setError(t('errores.tamano'));
    setTrabajando('leyendo');
    try {
      const m = leerMatriz(await file.arrayBuffer(), file.name);
      if (m.length < 2) {
        setError(t('errores.vacio'));
        return;
      }
      const cab = filaCabeceraProveedores(m);
      setArchivo(file.name);
      setMatriz(m);
      setFilaCabecera(cab);
      setMapeo(autoMapear(m[cab] ?? []));
      setRevision(null);
      setPaso('columnas');
    } catch {
      setError(t('errores.leer'));
    } finally {
      setTrabajando(null);
    }
  };

  const revisar = async () => {
    const leidas = filasDesdeMatriz(matriz, filaCabecera, mapeo);
    if (leidas.length === 0) return setError(t('errores.vacio'));
    setError(null);
    setTrabajando('revisando');
    try {
      const r = aRevision(await supplierService.importarProveedores(getOrganizationId(), leidas, false));
      setFilas(leidas);
      setRevision(r);
      setElegidas(new Set(r.filas.filter((f) => f.accion !== 'error').map((f) => String(f.fila))));
      setPagina(1);
      setPaso('revisar');
    } catch (e) {
      setError(codigo(e) === '42501' ? t('errores.sinPermiso') : t('errores.revisar'));
    } finally {
      setTrabajando(null);
    }
  };

  const importar = async () => {
    if (!revision) return;
    setTrabajando('importando');
    try {
      const r = aRevision(
        await supplierService.importarProveedores(
          getOrganizationId(),
          filas,
          true,
          [...elegidas].map(Number),
        ),
      );
      setRevision(r);
      setPaso('resultado');
      toast({ title: t('toast.importados', { creados: r.creados, actualizados: r.actualizados }) });
    } catch (e) {
      toast({ variant: 'destructive', title: codigo(e) === '42501' ? t('errores.sinPermiso') : t('errores.importar') });
    } finally {
      setTrabajando(null);
    }
  };

  const reiniciar = () => {
    setPaso('archivo');
    setArchivo(null);
    setMatriz([]);
    setFilas([]);
    setRevision(null);
    setElegidas(new Set());
    setBusqueda('');
    setMostrar('todas');
    setError(null);
    if (refArchivo.current) refArchivo.current.value = '';
  };

  // ── Datos de la tabla «Revisar» ──────────────────────────────────────────
  const porFila = useMemo(() => new Map(filas.map((f) => [f.fila, f])), [filas]);
  const textoMotivo = (motivo: string | null, repetida: number | null) =>
    motivo ? t(`motivos.${motivo}`, { fila: repetida ?? 0 }) : null;
  const tabla: FilaTabla[] = useMemo(
    () =>
      (revision?.filas ?? []).map((r) => {
        const f = porFila.get(r.fila);
        return {
          fila: r.fila,
          nombre: String(f?.name ?? ''),
          documento: String(f?.nit ?? ''),
          tipo: typeof f?.supplier_type === 'string' ? f.supplier_type : undefined,
          plazo: typeof f?.credit_days === 'string' ? f.credit_days : undefined,
          accion: r.accion,
          motivo: textoMotivo(r.motivo, r.fila_repetida),
          existenteId: r.existente_id,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textoMotivo depende solo de t
    [revision, porFila, t],
  );
  const visibles = filtrarRevision(tabla, busqueda, mostrar);
  const rango = calcularRango(pagina, tamano, visibles.length);
  const paginaFilas = visibles.slice((rango.pagina - 1) * tamano, rango.pagina * tamano);
  const aImportar = [...elegidas].length;

  const etiquetaTipo = (tipo: string | undefined) =>
    tipo === 'person' ? t('tipos.persona') : tipo === 'company' || !tipo ? t('tipos.empresa') : tipo;
  const plazoTexto = (p: string | undefined) => (p === undefined ? '—' : p === '0' ? t('contado') : t('dias', { n: p }));
  const resultadoBadge = (f: FilaTabla) =>
    f.accion === 'crear' ? (
      <StatusBadge estado="valida" etiqueta={t('resultadoFila.valida')} tono="exito" tamano="sm" />
    ) : f.accion === 'actualizar' ? (
      <StatusBadge estado="existe" etiqueta={t('resultadoFila.yaExiste')} tono="informacion" tamano="sm" />
    ) : (
      <StatusBadge estado="error" etiqueta={t('resultadoFila.error')} tono="peligro" tamano="sm" />
    );
  const accionTexto = (f: FilaTabla) => {
    if (f.accion === 'error') return <span className="font-medium text-danger-text">{t('acciones.noSeImporta')}</span>;
    const incluida = elegidas.has(String(f.fila));
    const texto = f.accion === 'crear' ? t('acciones.crear') : t('acciones.actualizar');
    return <span className={incluida ? 'font-medium text-fg' : 'text-fg-muted'}>{incluida ? texto : t('acciones.excluida')}</span>;
  };
  const alternarFila = (f: FilaTabla, incluir: boolean) =>
    setElegidas((s) => {
      const nuevo = new Set(s);
      if (incluir) nuevo.add(String(f.fila));
      else nuevo.delete(String(f.fila));
      return nuevo;
    });
  const accionesFila = (f: FilaTabla): AccionFila[] => [
    {
      id: 'incluir',
      etiqueta: elegidas.has(String(f.fila)) ? t('acciones.excluir') : t('acciones.incluir'),
      icono: elegidas.has(String(f.fila)) ? MinusCircle : PlusCircle,
      onSelect: () => alternarFila(f, !elegidas.has(String(f.fila))),
      deshabilitada: f.accion === 'error',
      motivo: t('acciones.motivoError'),
    },
    {
      id: 'existente',
      etiqueta: t('acciones.verExistente'),
      icono: Building2,
      onSelect: () => void irAExistente(f.existenteId),
      oculta: !f.existenteId,
    },
  ];
  const irAExistente = async (id: number | null) => {
    if (!id) return;
    const { data } = await supplierService.getSupplierById(id, getOrganizationId());
    if (data?.uuid) window.open(`${RUTA_PROVEEDORES}/${data.uuid}`, '_blank', 'noopener');
  };

  const columnas: ColumnaTabla<FilaTabla>[] = [
    { id: 'fila', encabezado: t('columnas.fila'), ancho: 72, variante: 'importe', celda: (f) => f.fila },
    {
      id: 'proveedor',
      encabezado: t('columnas.proveedor'),
      celda: (f) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{f.nombre || '—'}</p>
          <p className={cn('truncate text-xs', f.accion === 'error' ? 'text-danger-text' : 'text-fg-secondary')}>
            {f.accion === 'error' && f.motivo ? f.motivo : f.documento ? t('documento', { doc: f.documento }) : '—'}
          </p>
        </div>
      ),
    },
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      ancho: 110,
      ocultarDebajo: 'md',
      celda: (f) => <StatusBadge estado={f.tipo ?? 'company'} etiqueta={etiquetaTipo(f.tipo)} tono="neutro" tamano="sm" />,
    },
    { id: 'resultado', encabezado: t('columnas.resultado'), ancho: 120, celda: resultadoBadge },
    { id: 'plazo', encabezado: t('columnas.plazo'), ancho: 110, ocultarDebajo: 'lg', celda: (f) => plazoTexto(f.plazo) },
    { id: 'accion', encabezado: t('columnas.accion'), ancho: 130, celda: accionTexto },
  ];

  // ── Encabezado y pie ─────────────────────────────────────────────────────
  const subtitulo = archivo
    ? t('subtituloArchivo', { archivo, count: Math.max(0, matriz.length - filaCabecera - 1), n: n(Math.max(0, matriz.length - filaCabecera - 1)) })
    : t('subtitulo');

  if (permisos.resueltos && !permisos.crear) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader titulo={t('titulo')} icono={Upload} migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: tc('titulo'), href: RUTA_PROVEEDORES }, { etiqueta: t('miga') }]} />
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: tc('titulo'), href: RUTA_PROVEEDORES }} />
      </div>
    );
  }

  const cabeceras = matriz[filaCabecera] ?? [];
  const columnasArchivo = Math.max(cabeceras.length, ...matriz.slice(filaCabecera + 1, filaCabecera + 1 + MUESTRAS).map((f) => f?.length ?? 0), 0);
  const falta = faltantes(mapeo);

  return (
    <div className="flex flex-col gap-4 pb-24 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={Upload}
        variante="form"
        volverA={RUTA_PROVEEDORES}
        migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: tc('titulo'), href: RUTA_PROVEEDORES }, { etiqueta: t('miga') }]}
        acciones={
          <>
            <button type="button" onClick={descargarPlantilla} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('descargarPlantilla')}
            </button>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[
                { id: 'otro', etiqueta: t('otroArchivo'), icono: RefreshCw, onSelect: reiniciar, oculta: paso === 'archivo' },
                { id: 'proveedores', etiqueta: t('verProveedores'), icono: Building2, onSelect: () => router.push(RUTA_PROVEEDORES) },
              ]}
            />
          </>
        }
        movil={{ subtitulo: t('pasoMovil', { n: pasos.findIndex((p) => p.valor === paso) + 1, filas: n(filas.length || Math.max(0, matriz.length - 1)) }) }}
        debajo={
          <Stepper
            pasos={pasos}
            actual={paso}
            etiqueta={t('pasos.etiqueta')}
            resumenMovil={(num, total, etiqueta) => t('pasos.resumen', { n: num, total, etiqueta })}
            onPasoClick={(v) => {
              if (paso === 'resultado') return;
              if (v === 'archivo') reiniciar();
              else if (v === 'columnas' && archivo) setPaso('columnas');
            }}
          />
        }
      />

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {error}
        </p>
      )}

      {paso === 'archivo' && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => refArchivo.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              refArchivo.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setArrastrando(false);
            void leer(e.dataTransfer.files?.[0]);
          }}
          aria-label={t('archivo.elegir')}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            arrastrando ? 'border-brand bg-brand-tint' : 'border-line-strong bg-surface',
          )}
        >
          {trabajando === 'leyendo' ? (
            <Loader2 aria-hidden="true" className="size-6 animate-spin text-fg-muted" />
          ) : (
            <FileSpreadsheet aria-hidden="true" className="size-8 text-fg-muted" strokeWidth={1.5} />
          )}
          <p className="text-sm font-medium text-fg">{t('archivo.arrastra')}</p>
          <p className="text-xs text-fg-secondary">{t('archivo.formatos')}</p>
          <input ref={refArchivo} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => void leer(e.target.files?.[0])} />
        </div>
      )}

      {paso === 'columnas' && (
        <section aria-labelledby="titulo-columnas" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div>
            <h2 id="titulo-columnas" className="text-base font-semibold text-fg">
              {t('columnasPaso.titulo')}
            </h2>
            <p className="text-sm text-fg-secondary">
              {t('columnasPaso.descripcion', { reconocidas: mapeo.filter(Boolean).length, total: columnasArchivo })}
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {Array.from({ length: columnasArchivo }, (_, col) => {
              const muestras = matriz
                .slice(filaCabecera + 1, filaCabecera + 1 + MUESTRAS)
                .map((f) => (f?.[col] === null || f?.[col] === undefined ? '' : String(f[col])))
                .filter(Boolean)
                .join(' · ');
              const idSelect = `columna-${col}`;
              return (
                <li key={col} className="grid gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
                  <div className="min-w-0">
                    <label htmlFor={idSelect} className="block truncate text-sm font-medium text-fg">
                      {String(cabeceras[col] ?? '') || t('columnasPaso.sinNombre', { n: col + 1 })}
                    </label>
                    <p className="truncate text-xs text-fg-secondary">{muestras || '—'}</p>
                  </div>
                  <Select
                    value={mapeo[col] ?? NINGUNO}
                    onValueChange={(v) => setMapeo((m) => reasignar(m, col, v === NINGUNO ? null : (v as CampoProveedor)))}
                  >
                    <SelectTrigger id={idSelect} className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NINGUNO}>{t('columnasPaso.noImportar')}</SelectItem>
                      {CAMPOS_PROVEEDOR.map((c) => (
                        <SelectItem key={c} value={c}>
                          {t(`campos.${c}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
          {falta.length > 0 && (
            <p role="alert" className="text-sm text-danger-text">
              {t('columnasPaso.faltan', { campos: falta.map((c) => t(`campos.${c}`)).join(', ') })}
            </p>
          )}
        </section>
      )}

      {paso === 'revisar' && revision && (
        <>
          <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
            <StatCard etiqueta={t('kpis.leidas')} valor={n(revision.total)} detalle={archivo ?? undefined} icono={FileSpreadsheet} />
            <StatCard etiqueta={t('kpis.crean')} valor={n(revision.crear)} detalle={t('kpis.creanDetalle')} tono="exito" tendencia="sube" icono={PlusCircle} onClick={() => setMostrar('crear')} />
            <StatCard etiqueta={t('kpis.actualizan')} valor={n(revision.actualizar)} detalle={t('kpis.actualizanDetalle')} icono={RefreshCw} onClick={() => setMostrar('actualizar')} />
            <StatCard
              etiqueta={t('kpis.errores')}
              valor={n(revision.con_error)}
              detalle={t('kpis.erroresDetalle')}
              tono={revision.con_error ? 'peligro' : 'neutro'}
              tendencia={revision.con_error ? 'baja' : undefined}
              icono={AlertCircle}
              onClick={() => setMostrar('error')}
            />
          </KpiStrip>

          <ListToolbar
            busqueda={<SearchInput value={busqueda} onChange={(v) => { setBusqueda(v); setPagina(1); }} placeholder={t('buscar')} etiqueta={t('buscar')} />}
            filtros={
              <FilterPanel conteo={mostrar === 'todas' ? 0 : 1} onLimpiar={() => setMostrar('todas')} textoVerResultados={t('verResultados', { n: visibles.length })}>
                <FormField etiqueta={t('filtros.mostrar')}>
                  {(c) => (
                    <SegmentedControl
                      aria-labelledby={c.idEtiqueta}
                      anchoCompleto
                      valor={mostrar}
                      onValorChange={(v) => {
                        setMostrar(v);
                        setPagina(1);
                      }}
                      opciones={[
                        { valor: 'todas', etiqueta: t('filtros.todas') },
                        { valor: 'crear', etiqueta: t('filtros.crear') },
                        { valor: 'actualizar', etiqueta: t('filtros.actualizar') },
                        { valor: 'error', etiqueta: t('filtros.error') },
                      ]}
                    />
                  )}
                </FormField>
              </FilterPanel>
            }
            chips={
              <FilterChips
                chips={mostrar === 'todas' ? [] : [{ clave: 'mostrar', etiqueta: `${t('filtros.mostrar')}: ${t(`filtros.${mostrar}`)}` }]}
                onQuitar={() => setMostrar('todas')}
                onLimpiarTodo={() => {
                  setMostrar('todas');
                  setBusqueda('');
                }}
              />
            }
          />

          <DataTable
            etiqueta={t('pasos.revisar')}
            columnas={columnas}
            filas={paginaFilas}
            obtenerId={(f) => String(f.fila)}
            estado={visibles.length === 0 ? 'sinResultados' : 'listo'}
            seleccion={elegidas}
            onSeleccionChange={(s) =>
              setElegidas(new Set([...s].filter((id) => tabla.find((f) => String(f.fila) === id)?.accion !== 'error')))
            }
            etiquetaFila={(f) => f.nombre || t('filaN', { n: f.fila })}
            acciones={accionesFila}
            tonoFila={(f) => (f.accion === 'error' ? 'peligro' : undefined)}
            tarjetaMovil={(f) => (
              <ListCard
                icono={f.tipo === 'person' ? User : Building2}
                titulo={f.nombre || '—'}
                subtitulo={f.accion === 'error' ? f.motivo : [f.documento ? t('documento', { doc: f.documento }) : null, plazoTexto(f.plazo)].filter(Boolean).join(' · ')}
                meta={`${t('filaN', { n: f.fila })} · ${f.accion === 'crear' ? t('acciones.seCrea') : f.accion === 'actualizar' ? t('acciones.seActualiza') : t('acciones.noSeImporta').toLowerCase()}`}
                estado={resultadoBadge(f)}
                acciones={accionesFila(f)}
              />
            )}
            sinResultados={{ descripcion: t('sinResultados') }}
            onLimpiarFiltros={() => {
              setMostrar('todas');
              setBusqueda('');
            }}
            termino={busqueda || undefined}
            pie={
              <Pagination
                pagina={rango.pagina}
                tamano={tamano}
                total={visibles.length}
                onPaginaChange={setPagina}
                onTamanoChange={(v) => {
                  setTamano(v);
                  setPagina(1);
                }}
                sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'femenino' }}
              />
            }
          />
        </>
      )}

      {paso === 'resultado' && revision && (
        <section className="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface px-4 py-10 text-center">
          <CircleCheck aria-hidden="true" className="size-10 text-success-text" strokeWidth={1.5} />
          <div>
            <h2 className="text-lg font-semibold text-fg">{t('resultado.titulo')}</h2>
            <p className="text-sm text-fg-secondary">
              {t('resultado.detalle', { creados: revision.creados, actualizados: revision.actualizados, errores: revision.con_error })}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {revision.con_error > 0 && (
              <button
                type="button"
                onClick={() => {
                  const errores = tabla.filter((f) => f.accion === 'error');
                  const csv = aCsv([[t('columnas.fila'), t('columnas.proveedor'), t('columnas.documento'), t('columnas.motivo')], ...errores.map((f) => [f.fila, f.nombre, f.documento, f.motivo ?? ''])]);
                  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = t('nombreErrores');
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
                className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
              >
                <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('resultado.descargarErrores')}
              </button>
            )}
            <button type="button" onClick={reiniciar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('otroArchivo')}
            </button>
            <Link href={RUTA_PROVEEDORES} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
              {t('verProveedores')}
            </Link>
          </div>
        </section>
      )}

      {(paso === 'columnas' || paso === 'revisar') && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:sticky lg:-mx-6 lg:px-6">
          {paso === 'revisar' && revision && (
            <p className="mb-2 text-xs text-fg-secondary sm:hidden">
              {t('resumenMovil', { crean: revision.crear, actualizan: revision.actualizar, errores: revision.con_error })}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Link href={RUTA_PROVEEDORES} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'md' }), 'hidden sm:inline-flex')}>
              {t('cancelar')}
            </Link>
            <button
              type="button"
              onClick={() => (paso === 'revisar' ? setPaso('columnas') : reiniciar())}
              disabled={!!trabajando}
              className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'flex-1 sm:flex-none')}
            >
              {t('atras')}
            </button>
            {paso === 'columnas' ? (
              <button
                type="button"
                onClick={() => void revisar()}
                disabled={falta.length > 0 || !!trabajando}
                className={cn(clasesBoton({ variante: 'primario', tamano: 'md' }), 'flex-1 sm:flex-none')}
              >
                {trabajando === 'revisando' && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                {t('revisarFilas')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void importar()}
                disabled={aImportar === 0 || !!trabajando}
                title={aImportar === 0 ? t('nadaElegido') : undefined}
                className={cn(clasesBoton({ variante: 'primario', tamano: 'md' }), 'flex-1 sm:flex-none')}
              >
                {trabajando === 'importando' && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                {t('importarN', { count: aImportar, n: n(aImportar) })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportarProveedores;
