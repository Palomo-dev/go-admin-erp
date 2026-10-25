'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileBadge } from 'lucide-react';
import { CampoFecha, DataTable, FormField, FormSection, PageHeader, SupplierPicker, clasesBoton, type ProveedorPicker, type ColumnaTabla } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { buscarProveedores } from '@/lib/services/compras/lecturasCompras';
import { CertificadoRetencionesDialog } from '@/components/finanzas/cuentas-por-pagar/CertificadoRetencionesDialog';
import { CONTROL_INFORME, formatoCelda, type DocumentoInforme } from './catalogo';
import { exportarInformesExcel, exportarInformesPDF } from './exportar';

/** La RPC, la foto y la serie CR siguen siendo las del certificado canónico #265. */
export function RetencionesProveedoresPage() {
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const { branchFilter, branches, canSelectAll } = useBranch();
  const [organizacion, setOrganizacion] = useState(getOrganizationId);
  const [proveedor, setProveedor] = useState<ProveedorPicker | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [sucursal, setSucursal] = useState(branchFilter === null ? '' : String(branchFilter));
  const [centro, setCentro] = useState('');
  const [centros, setCentros] = useState<{ id: string; code: string; name: string }[]>([]);
  const [documento, setDocumento] = useState<DocumentoInforme | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');
  const hoy = getToday();
  useEffect(() => {
    const cambiar = () => { setOrganizacion(getOrganizationId()); setProveedor(null); setDesde(''); setHasta(''); setCentro(''); setCentros([]); setDocumento(null); setAbierto(false); };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, cambiar);
    return () => window.removeEventListener(ORGANIZATION_CHANGED_EVENT, cambiar);
  }, []);
  useEffect(() => { setSucursal(branchFilter === null ? '' : String(branchFilter)); setCentro(''); }, [branchFilter]);
  useEffect(() => {
    if (tzLoading) return;
    const fecha = getToday();
    setDesde((previo) => previo || `${fecha.slice(0, 4)}-01-01`);
    setHasta((previo) => previo || fecha);
  }, [getToday, tzLoading, organizacion]);
  const buscar = useCallback(async (texto: string, senal: AbortSignal): Promise<ProveedorPicker[]> => {
    if (organizacion !== getOrganizationId()) return [];
    return (await buscarProveedores(organizacion, texto, senal)).map((item) => ({ id: String(item.id), nombre: item.name, nit: item.nit, contacto: item.contact, telefono: item.phone }));
  }, [organizacion]);
  const proveedorId = Number(proveedor?.id);
  const rangoValido = Boolean(desde && hasta && desde <= hasta && hasta <= hoy);
  const habilitado = !tzLoading && organizacion > 0 && Number.isSafeInteger(proveedorId) && proveedorId > 0 && rangoValido;
  const filtrosContables = useMemo(() => ({ contabilizados: true as const, branch_id: sucursal ? Number(sucursal) : null, cost_center_id: centro || null }), [sucursal, centro]);
  const rango = useMemo(() => ({ desde, hasta }), [desde, hasta]);
  useEffect(() => { setAbierto(false); }, [desde, hasta, sucursal, centro, proveedorId]);
  useEffect(() => {
    if (tzLoading || !rangoValido || organizacion <= 0 || organizacion !== getOrganizationId()) { setDocumento(null); setCargando(false); return; }
    const abort = new AbortController();
    const query = new URLSearchParams({ desde, hasta });
    if (sucursal) query.set('branch_id', sucursal);
    if (centro) query.set('cost_center_id', centro);
    if (proveedorId > 0) query.set('supplier_id', String(proveedorId));
    setCargando(true); setError(''); setDocumento(null);
    void fetch(`/api/finanzas/informes/retenciones-proveedores?${query}`, { signal: abort.signal, cache: 'no-store', headers: { 'x-organization-id': String(organizacion) } }).then(async (respuesta) => {
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error || 'No se pudieron cargar las retenciones.');
      if (!abort.signal.aborted && organizacion === getOrganizationId()) { setCentros(datos.centros ?? []); setDocumento(datos.documento ?? null); }
    }).catch((fallo: unknown) => { if (!abort.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar las retenciones.'); }).finally(() => { if (!abort.signal.aborted) setCargando(false); });
    return () => abort.abort();
  }, [desde, hasta, sucursal, centro, proveedorId, organizacion, tzLoading, rangoValido]);
  const exportar = async (formato: 'pdf' | 'excel') => {
    if (!documento || !rangoValido || organizacion !== getOrganizationId()) return;
    setExportando(true); setError('');
    try {
      const encabezado = [`Proveedor: ${proveedor?.nombre ?? ''} · NIT ${proveedor?.nit ?? ''}`, `Periodo: ${desde} a ${hasta}`, `Sucursal: ${(branches ?? []).find((item) => String(item.id) === sucursal)?.name ?? 'Todas las autorizadas'} · Centro de costo: ${centros.find((item) => item.id === centro)?.name ?? 'Todos'}`, 'Comparativo con el mismo periodo del año anterior. Cifras en pesos enteros.'];
      const fn = formato === 'pdf' ? exportarInformesPDF : exportarInformesExcel;
      await fn([documento], `retenciones-proveedores-${hasta}`, encabezado);
    } catch (fallo) { setError(fallo instanceof Error ? fallo.message : 'No se pudo exportar el borrador.'); }
    finally { setExportando(false); }
  };
  return <div className="flex min-h-full flex-col gap-6 bg-canvas p-4 text-fg sm:p-6 lg:p-8">
    <PageHeader titulo="Certificado de retenciones a proveedores" subtitulo="Renta, IVA e ICA. Borrador comparativo desde asientos contabilizados; expedición con el motor de documentos." icono={FileBadge} migas={[{ etiqueta: 'Contabilidad', href: '/app/finanzas/contabilidad' }, { etiqueta: 'Retenciones a proveedores' }]} />
    <FormSection titulo="Proveedor y periodo" descripcion="Selecciona el corte, la sucursal y el centro de costo. La vista previa no expide ni consume un consecutivo.">
      <SupplierPicker key={organizacion} proveedor={proveedor} buscar={buscar} onCambiar={setProveedor} onQuitar={() => setProveedor(null)} etiqueta="Proveedor" />
      <FormField etiqueta="Desde"><CampoFecha valor={desde} onValorChange={setDesde} max={hasta || hoy} hoy={hoy} /></FormField>
      <FormField etiqueta="Hasta"><CampoFecha valor={hasta} onValorChange={setHasta} max={hoy} hoy={hoy} /></FormField>
      <FormField etiqueta="Sucursal"><select className={CONTROL_INFORME} value={sucursal} onChange={(evento) => { setSucursal(evento.target.value); setCentro(''); }}>{canSelectAll && <option value="">Todas las autorizadas</option>}{(branches ?? []).map((item) => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></FormField>
      <FormField etiqueta="Centro de costo"><select className={CONTROL_INFORME} value={centro} onChange={(evento) => setCentro(evento.target.value)}><option value="">Todos</option>{centros.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></FormField>
      <div className="flex flex-wrap items-end gap-2"><button type="button" className={clasesBoton()} disabled={!habilitado || cargando || Boolean(error)} onClick={() => setAbierto(true)}>Preparar certificado</button><button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={!documento || !rangoValido || cargando || exportando} onClick={() => void exportar('pdf')}>PDF comparativo</button><button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={!documento || !rangoValido || cargando || exportando} onClick={() => void exportar('excel')}>Excel</button></div>
    </FormSection>
    {!rangoValido && desde && hasta && <AvisoTonal tono="peligro" titulo="Revisa el periodo" descripcion="La fecha inicial debe ser anterior o igual al corte, sin fechas futuras." />}
    {error && <AvisoTonal tono="peligro" titulo="No se pudo preparar el certificado" descripcion={error} />}
    {documento?.avisos?.map((aviso, indice) => <AvisoTonal key={indice} tono="advertencia" titulo="Revisión del borrador" descripcion={aviso} />)}
    {documento?.tablas.map((tabla, indice) => {
      const columnas: ColumnaTabla<Record<string, string | number | null>>[] = tabla.columnas.map((columna) => ({ id: columna.clave, encabezado: columna.titulo, celda: (fila) => formatoCelda(fila[columna.clave], columna.formato) }));
      return <DataTable key={indice} etiqueta={tabla.titulo} columnas={columnas} filas={tabla.filas} obtenerId={(fila) => JSON.stringify(fila)} />;
    })}
    {proveedor && habilitado && <CertificadoRetencionesDialog key={organizacion} abierto={abierto} onAbiertoChange={setAbierto} proveedorId={proveedorId} proveedorNombre={proveedor.nombre} rangoInicial={rango} rangoFijo={rango} sucursalId={filtrosContables.branch_id} filtrosContables={filtrosContables} organizacionEsperada={organizacion} />}
  </div>;
}
