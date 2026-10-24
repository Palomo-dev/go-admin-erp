'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { BookOpen, Download, FileSpreadsheet, RefreshCw, Settings } from 'lucide-react';
import { CampoFecha, DataTable, EmptyState, FormField, FormSection, ListCard, PageHeader, Tarjeta, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { CONTROL_INFORME, IDS_BORRADORES_TRIBUTARIOS, INFORMES_CONTABLES, formatoCelda, type DocumentoInforme, type IdInformeContable, type TablaInforme } from './catalogo';
import { exportarInformesExcel, exportarInformesPDF } from './exportar';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';

export interface RespuestaPantallaInformes {
  documentos: Partial<Record<IdInformeContable, DocumentoInforme>>;
  organizacion?: { nombre: string; nit: string };
  grupoNiif?: 2 | 3;
  patrimonioOpcional?: boolean;
  monedaBase?: string | null;
  centros?: { id: string; name: string; code?: string }[];
  cuentas?: { account_code: string; name: string }[];
  productos?: { id: number; name: string }[];
}

const ESTADOS_PAQUETE: IdInformeContable[] = ['situacion-financiera', 'resultados-integral', 'cambios-patrimonio', 'flujo-indirecto', 'notas-estados', 'certificacion'];
const RetencionesProveedoresPage = dynamic(() => import('./RetencionesProveedoresPage').then((modulo) => modulo.RetencionesProveedoresPage));

export function InformeContablePage({ informe }: { informe: IdInformeContable }) {
  if (informe === 'retenciones-proveedores') return <RetencionesProveedoresPage />;
  return <DocumentoContablePage informe={informe} />;
}

function DocumentoContablePage({ informe }: { informe: IdInformeContable }) {
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const { branches, branchFilter, canSelectAll } = useBranch();
  const hoy = getToday();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [sucursal, setSucursal] = useState(branchFilter === null ? '' : String(branchFilter));
  const [centro, setCentro] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [producto, setProducto] = useState('');
  const [nivel, setNivel] = useState(informe === 'mayor-consolidado' ? 'auxiliar' : '4');
  const [datos, setDatos] = useState<RespuestaPantallaInformes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exportando, setExportando] = useState(false);
  const [revision, setRevision] = useState(0);
  const ambito = useRef(0);
  const orgDatos = useRef<number | null>(null);
  const consulta = useRef<AbortController | null>(null);
  const definicion = INFORMES_CONTABLES.find((entrada) => entrada.id === informe)!;
  const errorFechas = desde > hasta ? 'La fecha inicial debe ser anterior o igual a la fecha final.' : '';

  useEffect(() => { setSucursal(branchFilter === null ? '' : String(branchFilter)); }, [branchFilter]);
  useEffect(() => {
    ambito.current = getOrganizationId();
    const cambiarOrganizacion = () => {
      const org = getOrganizationId();
      if (org === ambito.current) return;
      ambito.current = org;
      consulta.current?.abort();
      orgDatos.current = null;
      setDatos(null);
      setCentro('');
      setCuenta('');
      setProducto('');
      setSucursal('');
      setRevision((previa) => previa + 1);
    };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, cambiarOrganizacion);
    return () => { window.removeEventListener(ORGANIZATION_CHANGED_EVENT, cambiarOrganizacion); consulta.current?.abort(); };
  }, []);
  useEffect(() => {
    if (tzLoading) return;
    const query = new URLSearchParams(window.location.search);
    const inicio = query.get('desde');
    const fin = query.get('hasta');
    const hoyOrganizacion = getToday();
    setDesde((previo) => previo || (inicio && /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : `${hoyOrganizacion.slice(0, 4)}-01-01`));
    setHasta((previo) => previo || (fin && /^\d{4}-\d{2}-\d{2}$/.test(fin) ? fin : hoyOrganizacion));
    if (query.has('branch_id')) setSucursal(query.get('branch_id') ?? '');
    if (query.has('cost_center_id')) setCentro(query.get('cost_center_id') ?? '');
    if (query.has('cuenta')) setCuenta(query.get('cuenta') ?? '');
  }, [tzLoading, getToday]);

  useEffect(() => {
    if (tzLoading || !desde || !hasta) return;
    if (errorFechas) { setCargando(false); return; }
    const abort = new AbortController();
    consulta.current = abort;
    const org = getOrganizationId();
    orgDatos.current = null;
    const query = new URLSearchParams({ desde, hasta, nivel });
    if (sucursal) query.set('branch_id', sucursal);
    if (centro) query.set('cost_center_id', centro);
    if (cuenta) query.set('cuenta', cuenta);
    if (producto) query.set('product_id', producto);
    setCargando(true);
    setError('');
    // Conserva las opciones de los filtros durante la consulta; las cifras se
    // retiran para que ningún resultado del corte anterior quede exportable.
    setDatos((previo) => previo ? { ...previo, documentos: {} } : null);
    void fetch(`/api/finanzas/informes?${query}`, { signal: abort.signal, cache: 'no-store', headers: { 'X-Organization-Id': String(org) } })
      .then(async (respuesta) => {
        const body = await respuesta.json();
        if (!respuesta.ok) throw new Error(typeof body.error === 'string' ? body.error : 'No se pudieron cargar los informes.');
        if (!body || typeof body.documentos !== 'object' || body.documentos === null) throw new Error('El servidor no devolvió los informes esperados. Vuelve a consultar.');
        return body as RespuestaPantallaInformes;
      })
      .then((respuesta) => { if (!abort.signal.aborted && getOrganizationId() === org) { orgDatos.current = org; setDatos(respuesta); } })
      .catch((fallo: unknown) => { if (!abort.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el informe.'); })
      .finally(() => { if (!abort.signal.aborted) setCargando(false); });
    return () => abort.abort();
  }, [desde, hasta, sucursal, centro, cuenta, producto, nivel, revision, errorFechas, tzLoading]);

  const documento = datos?.documentos?.[informe];
  const grupo3 = datos?.grupoNiif === 3;
  const rotuloMoneda = datos?.monedaBase ? `Valores enteros · ${datos.monedaBase}` : 'Moneda base pendiente de verificación';
  const restringidoGrupo3 = grupo3 && (informe === 'flujo-indirecto' || (informe === 'cambios-patrimonio' && !datos.patrimonioOpcional));
  const encabezado = useMemo(() => [
    ...(datos?.organizacion ? [`${datos.organizacion.nombre} · NIT ${datos.organizacion.nit}`] : []),
    `Periodo: ${desde} a ${hasta} · Comparativo: mismo periodo del año anterior`,
    `Sucursal: ${branches.find((item) => String(item.id) === sucursal)?.name ?? 'Todas las autorizadas'} · Centro de costo: ${datos?.centros?.find((item) => String(item.id) === centro)?.name ?? 'Todos'}`,
    `${rotuloMoneda}. Solo asientos contabilizados; excluye borradores y anulados.`,
  ], [datos, desde, hasta, branches, sucursal, centro, rotuloMoneda]);

  const exportar = useCallback(async (formato: 'pdf' | 'excel', paquete = false) => {
    if (!datos || !documento || errorFechas) return;
    if (orgDatos.current !== getOrganizationId()) { setDatos(null); setError('La organización cambió. Vuelve a consultar antes de exportar.'); return; }
    setExportando(true);
    setError('');
    try {
      const documentos = paquete
        ? ESTADOS_PAQUETE.filter((id) => !grupo3 || ['situacion-financiera', 'resultados-integral', 'notas-estados', 'certificacion'].includes(id) || (id === 'cambios-patrimonio' && datos.patrimonioOpcional)).map((id) => {
          const estado = datos.documentos[id];
          if (!estado) throw new Error(`No se puede generar el paquete completo: falta ${INFORMES_CONTABLES.find((item) => item.id === id)?.titulo ?? id}.`);
          return estado;
        })
        : [documento];
      const nombre = `${paquete ? 'estados-financieros' : informe}-${hasta}`;
      if (formato === 'pdf') await exportarInformesPDF(documentos, nombre, encabezado);
      else await exportarInformesExcel(documentos, nombre, encabezado);
    } catch (fallo) { setError(fallo instanceof Error ? fallo.message : 'No se pudo exportar el informe.'); }
    finally { setExportando(false); }
  }, [datos, documento, encabezado, errorFechas, grupo3, hasta, informe]);

  const acciones = <>
    <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={!documento || cargando || exportando || Boolean(errorFechas) || restringidoGrupo3} onClick={() => void exportar('excel')}><FileSpreadsheet className="size-4" aria-hidden="true" />Excel</button>
    <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={!documento || cargando || exportando || Boolean(errorFechas) || restringidoGrupo3} onClick={() => void exportar('pdf')}><Download className="size-4" aria-hidden="true" />PDF</button>
    {ESTADOS_PAQUETE.includes(informe) && <button type="button" className={clasesBoton()} disabled={!documento || cargando || exportando || Boolean(errorFechas)} onClick={() => void exportar('pdf', true)}>PDF con los estados y notas</button>}
  </>;

  return <div className="flex min-h-full flex-col gap-6 bg-canvas p-4 text-fg sm:p-6 lg:p-8">
    <PageHeader titulo={grupo3 && informe === 'resultados-integral' ? 'Estado de resultados' : definicion.titulo} subtitulo={definicion.descripcion} icono={BookOpen} cargando={cargando} acciones={acciones} migas={[{ etiqueta: 'Finanzas', href: '/app/finanzas' }, { etiqueta: 'Contabilidad', href: '/app/finanzas/contabilidad' }, { etiqueta: definicion.titulo }]} debajo={<div className="flex flex-wrap items-center gap-2 lg:hidden">{acciones}</div>} />
    <FormSection titulo="Filtros del informe" columnas={3} descripcion="El comparativo usa las mismas fechas y filtros del año anterior.">
      <FormField etiqueta="Desde" error={errorFechas}><CampoFecha valor={desde} onValorChange={setDesde} hoy={hoy} limpiable={false} /></FormField>
      <FormField etiqueta="Fecha de corte / hasta"><CampoFecha valor={hasta} onValorChange={setHasta} hoy={hoy} limpiable={false} /></FormField>
      <FormField etiqueta="Sucursal"><select className={CONTROL_INFORME} value={sucursal} onChange={(evento) => setSucursal(evento.target.value)}>{canSelectAll && <option value="">Todas las autorizadas</option>}{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
      <FormField etiqueta="Centro de costo"><select className={CONTROL_INFORME} value={centro} onChange={(evento) => setCentro(evento.target.value)}><option value="">Todos</option>{datos?.centros?.map((item) => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)}</select></FormField>
      {['situacion-financiera', 'mayor-consolidado', 'inventarios-balances', 'notas-estados'].includes(informe) && <FormField etiqueta="Nivel PUC"><select className={CONTROL_INFORME} value={nivel} onChange={(evento) => setNivel(evento.target.value)}>{[1, 2, 4, 6].map((digitos) => <option value={digitos} key={digitos}>{digitos} dígitos</option>)}<option value="auxiliar">Auxiliar</option></select></FormField>}
      {['auxiliar-cuenta', 'auxiliar-centro'].includes(informe) && <FormField etiqueta="Cuenta"><select className={CONTROL_INFORME} value={cuenta} onChange={(evento) => setCuenta(evento.target.value)}><option value="">Todas las cuentas</option>{datos?.cuentas?.map((item) => <option key={item.account_code} value={item.account_code}>{item.account_code} · {item.name}</option>)}</select></FormField>}
      {['kardex-sede', 'punto-equilibrio'].includes(informe) && <FormField etiqueta="Producto" ayuda={informe === 'punto-equilibrio' ? 'Selecciona un producto para consultar unidades comparables. La contribución directa no distribuye los gastos comunes.' : undefined}><select className={CONTROL_INFORME} value={producto} onChange={(evento) => setProducto(evento.target.value)}><option value="">Todos los productos</option>{datos?.productos?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>}
    </FormSection>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-secondary"><p>{grupo3 ? 'Grupo 3 · Decreto 2420 de 2015, anexo 3' : 'Grupo 2 · NIIF para las pymes · Decreto 2420 de 2015, anexo 2'} · {rotuloMoneda}</p><Link className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} href="/app/finanzas/contabilidad/informes/configuracion"><Settings className="size-4" aria-hidden="true" />Configurar estados y notas</Link></div>
    {!cargando && datos && !datos.monedaBase && <AvisoTonal tono="advertencia" titulo="Moneda base pendiente de verificación" descripcion="Revisa la moneda de la organización antes de certificar o presentar estos valores." />}
    {(IDS_BORRADORES_TRIBUTARIOS as readonly string[]).includes(informe) && <AvisoTonal tono="advertencia" titulo="Borrador precalculado · revisión del contador requerida" descripcion="Revisa las fuentes, los parámetros del año y las diferencias antes de presentar. La exportación conserva las observaciones y los datos pendientes." />}
    {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} accion={{ etiqueta: 'Reintentar', onClick: () => setRevision((actual) => actual + 1) }} />}
    {restringidoGrupo3 ? <AvisoTonal titulo="Presentación del grupo 3" descripcion={informe === 'flujo-indirecto' ? 'Para este grupo se presentan situación financiera, resultados y notas.' : 'El estado de cambios en el patrimonio es opcional. Puedes habilitarlo en la configuración de la organización.'} /> : <>
      {cargando && <DataTable etiqueta={definicion.titulo} filas={[]} columnas={[]} obtenerId={() => ''} estado="cargando" />}
      {!cargando && documento && <>
        {documento.avisos?.map((aviso) => <AvisoTonal tono="advertencia" key={aviso} titulo={aviso} />)}
        {documento.textos?.length ? <Tarjeta titulo={documento.titulo}><div className="flex flex-col gap-4 text-sm leading-6 text-fg-secondary">{documento.textos.map((texto, indice) => <p className="whitespace-pre-line" key={indice}>{texto}</p>)}</div></Tarjeta> : null}
        {documento.tablas.map((tabla, indice) => <TablaEstado key={`${tabla.titulo}-${indice}`} tabla={tabla} alAbrirCuenta={informe === 'mayor-consolidado' ? (codigo) => { window.location.assign(`/app/finanzas/contabilidad/informes/auxiliar-cuenta?cuenta=${encodeURIComponent(codigo)}&desde=${desde}&hasta=${hasta}${sucursal ? `&branch_id=${sucursal}` : ''}${centro ? `&cost_center_id=${centro}` : ''}`); } : undefined} />)}
      </>}
      {!cargando && !error && !documento && <EmptyState variante="error" titulo="El informe no está disponible" descripcion="No se recibió un resultado válido. Vuelve a consultar para verificar los datos." onReintentar={() => setRevision((actual) => actual + 1)} />}
    </>}
    <div className="flex flex-wrap gap-2"><Link href="/app/finanzas/contabilidad" className={clasesBoton({ variante: 'secundario' })}>Volver a Contabilidad</Link><button type="button" disabled={cargando} onClick={() => setRevision((actual) => actual + 1)} className={clasesBoton({ variante: 'fantasma' })}><RefreshCw className="size-4" aria-hidden="true" />Actualizar</button></div>
  </div>;
}

function TablaEstado({ tabla, alAbrirCuenta }: { tabla: TablaInforme; alAbrirCuenta?: (codigo: string) => void }) {
  type Fila = TablaInforme['filas'][number] & { _id: string };
  const filas: Fila[] = tabla.filas.map((fila, indice) => ({ ...fila, _id: String(indice) }));
  const columnas: ColumnaTabla<Fila>[] = tabla.columnas.map((columna) => ({
    id: columna.clave,
    encabezado: columna.titulo,
    variante: columna.formato && columna.formato !== 'texto' ? 'importe' : 'texto',
    celda: (fila) => formatoCelda(fila[columna.clave], columna.formato),
  }));
  const codigoDe = (fila: Fila) => String(fila.cuenta ?? fila.codigo ?? fila.account_code ?? '');
  return <Tarjeta titulo={tabla.titulo} sinRelleno descripcion={alAbrirCuenta ? 'Selecciona una cuenta para consultar su auxiliar.' : undefined}>
    <DataTable etiqueta={tabla.titulo} columnas={columnas} filas={filas} obtenerId={(fila) => fila._id} onFilaClick={alAbrirCuenta ? (fila) => { const codigo = codigoDe(fila); if (codigo) alAbrirCuenta(codigo); } : undefined}
      tarjetaMovil={(fila) => <ListCard titulo={String(fila[tabla.columnas[0]?.clave] ?? tabla.titulo)} datos={tabla.columnas.slice(1).map((columna) => ({ icono: BookOpen, etiqueta: columna.titulo, texto: <span className="inline-block max-w-full whitespace-normal break-words">{columna.titulo}: {formatoCelda(fila[columna.clave], columna.formato)}</span> }))} onClick={alAbrirCuenta ? () => alAbrirCuenta(codigoDe(fila)) : undefined} />}
      vacio={{ titulo: 'Sin registros para estos filtros', descripcion: 'Prueba otro rango, sucursal o centro de costo.', accion: { etiqueta: 'Ver asientos', href: '/app/finanzas/contabilidad/asientos' } }} />
  </Tarjeta>;
}
