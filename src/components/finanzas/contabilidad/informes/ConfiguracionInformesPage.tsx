'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Settings } from 'lucide-react';
import { DataTable, Dialogo, EmptyState, FormField, FormSection, PageHeader, Tarjeta } from '@/components/kit';
import { SettingsSaveBar } from '@/components/kit/SettingsSaveBar';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { plantillaNotasPredeterminada, resolverPlantillaNotas, type ConfiguracionCertificacion, type PlantillaNotas } from '@/lib/finanzas/informes/notasCertificacion';
import type { AnotacionAsientoInforme } from '@/lib/finanzas/informes/configuracion';
import { CONTROL_INFORME } from './catalogo';
import { AnotacionesAsientosForm } from './AnotacionesAsientosForm';
import { ParametrosFiscalesForm } from './ParametrosFiscalesForm';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';

interface CuentaConfig {
  account_code: string;
  name: string;
  clasificacion_corriente: 'corriente' | 'no_corriente' | 'segun_plazo' | null;
  costo_comportamiento: 'fijo' | 'variable' | null;
  es_ori: boolean;
  equivalente_efectivo: boolean;
  plazo_meses: number | null;
}

interface ConfiguracionPantalla {
  version: number;
  grupo_niif: 2 | 3;
  presenta_cambios_patrimonio: boolean;
  notas: PlantillaNotas;
  certificacion: ConfiguracionCertificacion;
  cuentas: CuentaConfig[];
  parametros_fiscales: Record<string, unknown>;
  anotaciones_asientos: Record<string, AnotacionAsientoInforme>;
}

export function ConfiguracionInformesPage() {
  const [guardada, setGuardada] = useState<ConfiguracionPantalla | null>(null);
  const [actual, setActual] = useState<ConfiguracionPantalla | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [conflicto, setConflicto] = useState(false);
  const [cuenta, setCuenta] = useState<CuentaConfig | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const ambito = useRef(0);
  const generacion = useRef(0);
  const lectura = useRef<AbortController | null>(null);
  const escritura = useRef<AbortController | null>(null);
  const orgCargada = useRef<number | null>(null);
  const cargar = useCallback(async () => {
    const org = getOrganizationId();
    const turno = ++generacion.current;
    ambito.current = org;
    lectura.current?.abort();
    escritura.current?.abort();
    const abort = new AbortController();
    lectura.current = abort;
    orgCargada.current = null;
    setActual(null);
    setGuardada(null);
    setCuenta(null);
    setBusqueda('');
    setGuardando(false);
    setCargando(true);
    setError('');
    setMensaje('');
    setConflicto(false);
    try {
      if (!Number.isSafeInteger(org) || org <= 0) throw new Error('Selecciona una organización antes de configurar los informes.');
      const respuesta = await fetch('/api/finanzas/informes/configuracion', { cache: 'no-store', headers: { 'X-Organization-Id': String(org) }, signal: abort.signal });
      const body = await respuesta.json();
      if (abort.signal.aborted || turno !== generacion.current || getOrganizationId() !== org) return;
      if (!respuesta.ok) throw new Error(typeof body.error === 'string' ? body.error : 'No se pudo cargar la configuración.');
      if (!body || !Number.isInteger(body.version) || ![2, 3].includes(body.grupo_niif) || !Array.isArray(body.cuentas) || !body.certificacion?.representante || !body.certificacion?.contador) throw new Error('La configuración recibida está incompleta. Vuelve a consultar.');
      const valor = body as ConfiguracionPantalla;
      valor.notas = resolverPlantillaNotas(valor.grupo_niif, valor.notas);
      orgCargada.current = org;
      setActual(valor);
      setGuardada(valor);
    } catch (fallo) { if (!abort.signal.aborted && turno === generacion.current) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la configuración.'); }
    finally { if (!abort.signal.aborted && turno === generacion.current) setCargando(false); }
  }, []);
  useEffect(() => {
    const cambiarOrganizacion = () => { if (getOrganizationId() !== ambito.current) void cargar(); };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, cambiarOrganizacion);
    void cargar();
    return () => {
      window.removeEventListener(ORGANIZATION_CHANGED_EVENT, cambiarOrganizacion);
      lectura.current?.abort();
      escritura.current?.abort();
    };
  }, [cargar]);
  const cambios = actual && guardada && JSON.stringify(actual) !== JSON.stringify(guardada) ? 1 : 0;
  const errorEquivalente = cuenta?.equivalente_efectivo && (cuenta.plazo_meses === null || !Number.isFinite(cuenta.plazo_meses) || cuenta.plazo_meses < 0 || cuenta.plazo_meses > 3)
    ? 'Indica un vencimiento original entre cero y tres meses para clasificar la inversión como equivalente de efectivo.' : '';

  const guardar = async () => {
    const org = orgCargada.current;
    if (!actual || !guardada || org === null || guardando) return;
    if (getOrganizationId() !== org) { void cargar(); return; }
    const turno = generacion.current;
    const abort = new AbortController();
    escritura.current?.abort();
    escritura.current = abort;
    setGuardando(true);
    setError('');
    setMensaje('');
    try {
      const cuentas = actual.cuentas.filter((item) => JSON.stringify(item) !== JSON.stringify(guardada.cuentas.find((previa) => previa.account_code === item.account_code))).map((item) => {
        const previa = guardada.cuentas.find((cuentaGuardada) => cuentaGuardada.account_code === item.account_code);
        if (item.clasificacion_corriente !== previa?.clasificacion_corriente) return item;
        // La clasificación pertenece al PUC: cambiar ORI o el costo no debe
        // reenviar ni reemplazar una clasificación que otra pantalla editó.
        const metadatos: Partial<CuentaConfig> = { ...item };
        delete metadatos.clasificacion_corriente;
        return metadatos;
      });
      // El servidor contrasta esta organización del snapshot con la cookie y
      // la pertenencia de la sesión, incluso si cambia de pestaña al enviar.
      const respuesta = await fetch('/api/finanzas/informes/configuracion', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Organization-Id': String(org) }, signal: abort.signal, body: JSON.stringify({ ...actual, cuentas }) });
      const body = await respuesta.json();
      if (abort.signal.aborted || turno !== generacion.current || getOrganizationId() !== org) return;
      if (!respuesta.ok) { setConflicto(respuesta.status === 409); throw new Error(typeof body.error === 'string' ? body.error : 'No se pudo guardar la configuración.'); }
      if (!body || !Number.isInteger(body.version) || !Array.isArray(body.cuentas)) throw new Error('No se recibió la versión guardada. Vuelve a cargar antes de editar de nuevo.');
      setActual(body as ConfiguracionPantalla);
      setGuardada(body as ConfiguracionPantalla);
      setMensaje('La configuración quedó guardada para esta organización.');
    } catch (fallo) { if (!abort.signal.aborted && turno === generacion.current) setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar la configuración.'); }
    finally { if (!abort.signal.aborted && turno === generacion.current) setGuardando(false); }
  };

  const cambiarNota = (clave: keyof PlantillaNotas, valor: string) => setActual((previa) => previa ? { ...previa, notas: { ...previa.notas, [clave]: valor } } : previa);
  const cambiarGrupo = (grupo: 2 | 3) => setActual((previa) => {
    if (!previa) return previa;
    const eraPredeterminado = previa.notas.basesPreparacion === plantillaNotasPredeterminada(previa.grupo_niif).basesPreparacion;
    return { ...previa, grupo_niif: grupo, notas: { ...previa.notas, basesPreparacion: eraPredeterminado ? plantillaNotasPredeterminada(grupo).basesPreparacion : previa.notas.basesPreparacion } };
  });
  const cambiarCertificado = (clave: 'entidad' | 'nit' | 'dictamen', valor: string) => setActual((previa) => previa ? { ...previa, certificacion: { ...previa.certificacion, [clave]: valor } } : previa);
  const cambiarFirmante = (firmante: 'representante' | 'contador' | 'revisorFiscal', campo: 'nombre' | 'cedula' | 'tarjetaProfesional', valor: string) => setActual((previa) => previa ? { ...previa, certificacion: { ...previa.certificacion, [firmante]: { nombre: '', cedula: '', ...previa.certificacion[firmante], [campo]: valor } } } : previa);

  if (cargando) return <div className="p-6"><DataTable etiqueta="Configuración de informes" filas={[]} columnas={[]} obtenerId={() => ''} estado="cargando" /></div>;
  if (!actual) return <EmptyState variante="error" titulo={error || 'No se pudo cargar la configuración'} onReintentar={() => void cargar()} />;
  return <div className="flex min-h-full flex-col gap-6 bg-canvas p-4 pb-24 text-fg sm:p-6 lg:p-8">
    <PageHeader titulo="Configuración de estados financieros" subtitulo="Grupo NIIF, notas, certificación y clasificación de cuentas por organización." icono={Settings} variante="form" volverA="/app/finanzas/contabilidad" migas={[{ etiqueta: 'Contabilidad', href: '/app/finanzas/contabilidad' }, { etiqueta: 'Configuración de estados' }]} />
    {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} accion={conflicto ? { etiqueta: 'Recargar y descartar cambios locales', onClick: () => void cargar() } : undefined} />}
    {mensaje && <AvisoTonal tono="exito" rol="status" titulo={mensaje} />}
    <fieldset disabled={guardando} aria-busy={guardando || undefined} className="flex min-w-0 flex-col gap-6">
    <FormSection titulo="Marco de preparación" icono={BookOpen} descripcion="El cambio de grupo no modifica los asientos ni reemplaza el texto que ya personalizaste.">
      <FormField etiqueta="Grupo NIIF"><select className={CONTROL_INFORME} value={actual.grupo_niif} onChange={(evento) => cambiarGrupo(Number(evento.target.value) as 2 | 3)}><option value="2">Grupo 2 · NIIF para las pymes · Anexo 2</option><option value="3">Grupo 3 · Microempresas · Anexo 3</option></select></FormField>
      <FormField etiqueta="Cambios en el patrimonio (grupo 3)"><select className={CONTROL_INFORME} value={actual.presenta_cambios_patrimonio ? 'si' : 'no'} onChange={(evento) => setActual({ ...actual, presenta_cambios_patrimonio: evento.target.value === 'si' })}><option value="no">No presentar el estado opcional</option><option value="si">Presentar cambios en el patrimonio</option></select></FormField>
    </FormSection>
    <FormSection titulo="Notas editables" descripcion="Revisa los textos predeterminados antes de presentar los estados. El detalle por rubro se genera con el mismo corte y comparativo.">
      {([{ clave: 'entidad', etiqueta: 'Entidad y actividad económica' }, { clave: 'basesPreparacion', etiqueta: 'Bases de preparación' }, { clave: 'politicas', etiqueta: 'Políticas contables' }, { clave: 'revelaciones', etiqueta: 'Otras revelaciones' }] as const).map(({ clave, etiqueta }) => <FormField key={clave} etiqueta={etiqueta} className="sm:col-span-2"><textarea rows={5} className={`${CONTROL_INFORME} h-auto py-3`} value={actual.notas[clave]} onChange={(evento) => cambiarNota(clave, evento.target.value)} /></FormField>)}
    </FormSection>
    <FormSection titulo="Certificación y firmas" descripcion="Certificación: artículo 37, Ley 222 de 1995. El dictamen del artículo 38 es opcional y lo prepara el revisor fiscal.">
      <FormField etiqueta="Nombre o razón social"><input className={CONTROL_INFORME} value={actual.certificacion.entidad} onChange={(evento) => cambiarCertificado('entidad', evento.target.value)} /></FormField>
      <FormField etiqueta="NIT"><input className={CONTROL_INFORME} value={actual.certificacion.nit} onChange={(evento) => cambiarCertificado('nit', evento.target.value)} /></FormField>
      {(['representante', 'contador', 'revisorFiscal'] as const).map((firmante) => <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3" key={firmante}>
        <FormField etiqueta={`${firmante === 'representante' ? 'Representante legal' : firmante === 'contador' ? 'Contador' : 'Revisor fiscal (opcional)'} · Nombre`}><input className={CONTROL_INFORME} value={actual.certificacion[firmante]?.nombre ?? ''} onChange={(evento) => cambiarFirmante(firmante, 'nombre', evento.target.value)} /></FormField>
        <FormField etiqueta="Cédula"><input className={CONTROL_INFORME} value={actual.certificacion[firmante]?.cedula ?? ''} onChange={(evento) => cambiarFirmante(firmante, 'cedula', evento.target.value)} /></FormField>
        {firmante !== 'representante' && <FormField etiqueta="Tarjeta profesional"><input className={CONTROL_INFORME} value={actual.certificacion[firmante]?.tarjetaProfesional ?? ''} onChange={(evento) => cambiarFirmante(firmante, 'tarjetaProfesional', evento.target.value)} /></FormField>}
      </div>)}
      <FormField etiqueta="Dictamen del revisor fiscal (opcional)" className="sm:col-span-2"><textarea rows={6} className={`${CONTROL_INFORME} h-auto py-3`} value={actual.certificacion.dictamen ?? ''} onChange={(evento) => cambiarCertificado('dictamen', evento.target.value)} /></FormField>
    </FormSection>
    <AnotacionesAsientosForm valor={actual.anotaciones_asientos ?? {}} onChange={(anotaciones_asientos) => setActual({ ...actual, anotaciones_asientos })} />
    <ParametrosFiscalesForm valor={actual.parametros_fiscales ?? {}} onChange={(parametros_fiscales) => setActual({ ...actual, parametros_fiscales })} />
    <Tarjeta titulo="Clasificación por cuenta o auxiliar" descripcion="La marca específica del auxiliar prevalece sobre la cuenta. Conserva los valores predeterminados cuando eliges Heredar.">
      <FormField etiqueta="Buscar cuenta"><input type="search" className={CONTROL_INFORME} value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Código o nombre" /></FormField>
      <DataTable etiqueta="Clasificación de cuentas" filas={actual.cuentas.filter((item) => `${item.account_code} ${item.name}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))} obtenerId={(item) => item.account_code} onFilaClick={setCuenta} columnas={[
        { id: 'cuenta', encabezado: 'Cuenta', celda: (item) => `${item.account_code} · ${item.name}` },
        { id: 'corriente', encabezado: 'Clasificación', celda: (item) => item.clasificacion_corriente === 'corriente' ? 'Corriente' : item.clasificacion_corriente === 'no_corriente' ? 'No corriente' : item.clasificacion_corriente === 'segun_plazo' ? 'Según plazo' : 'Heredar' },
        { id: 'costo', encabezado: 'Costo', celda: (item) => item.costo_comportamiento === 'fijo' ? 'Fijo' : item.costo_comportamiento === 'variable' ? 'Variable' : 'Predeterminado' },
        { id: 'ori', encabezado: 'ORI', celda: (item) => item.es_ori ? 'Sí' : 'No' },
        { id: 'equivalente', encabezado: 'Equivalente de efectivo', celda: (item) => item.equivalente_efectivo ? `Sí · ${item.plazo_meses ?? '—'} meses` : 'No' },
      ]} />
    </Tarjeta>
    </fieldset>
    <SettingsSaveBar cambios={cambios} guardando={guardando} deshabilitado={conflicto} motivo={conflicto ? 'Recarga la configuración para obtener la versión vigente antes de guardar.' : undefined} onGuardar={() => void guardar()} onDescartar={() => { if (conflicto) { void cargar(); return; } setActual(guardada); setError(''); }} />
    <Dialogo abierto={Boolean(cuenta)} onAbiertoChange={(abierto) => { if (!abierto) setCuenta(null); }} titulo={cuenta ? `${cuenta.account_code} · ${cuenta.name}` : 'Clasificar cuenta'} primario={{ etiqueta: 'Aplicar clasificación', deshabilitada: Boolean(errorEquivalente), motivo: errorEquivalente, onClick: () => { if (cuenta && !errorEquivalente) { setActual({ ...actual, cuentas: actual.cuentas.map((item) => item.account_code === cuenta.account_code ? cuenta : item) }); setCuenta(null); } } }}>
      {cuenta && <div className="grid gap-4">
        <FormField etiqueta="Corriente / no corriente"><select className={CONTROL_INFORME} value={cuenta.clasificacion_corriente ?? ''} onChange={(evento) => setCuenta({ ...cuenta, clasificacion_corriente: (evento.target.value || null) as CuentaConfig['clasificacion_corriente'] })}><option value="">Heredar clasificación</option><option value="corriente">Corriente (12 meses o menos)</option><option value="no_corriente">No corriente</option><option value="segun_plazo">Según plazo</option></select></FormField>
        <FormField etiqueta="Costo fijo / variable"><select className={CONTROL_INFORME} value={cuenta.costo_comportamiento ?? ''} onChange={(evento) => setCuenta({ ...cuenta, costo_comportamiento: (evento.target.value || null) as CuentaConfig['costo_comportamiento'] })}><option value="">Predeterminado: 51 fijo, comisiones 52 variables y clase 6 variable</option><option value="fijo">Fijo</option><option value="variable">Variable</option></select></FormField>
        {cuenta.account_code.startsWith('38') && <FormField etiqueta="Otro resultado integral"><select className={CONTROL_INFORME} value={cuenta.es_ori ? 'si' : 'no'} onChange={(evento) => setCuenta({ ...cuenta, es_ori: evento.target.value === 'si' })}><option value="no">No clasificar como ORI</option><option value="si">Clasificar como ORI</option></select></FormField>}
        {cuenta.account_code.startsWith('12') && <>
          <FormField etiqueta="Equivalente de efectivo"><select className={CONTROL_INFORME} value={cuenta.equivalente_efectivo ? 'si' : 'no'} onChange={(evento) => setCuenta({ ...cuenta, equivalente_efectivo: evento.target.value === 'si' })}><option value="no">No</option><option value="si">Sí, con vencimiento original de 3 meses o menos</option></select></FormField>
          <FormField etiqueta="Vencimiento original en meses" ayuda="Para ser equivalente debe ser de tres meses o menos." error={errorEquivalente}><input className={CONTROL_INFORME} type="number" min="0" max="1200" step="0.1" value={cuenta.plazo_meses ?? ''} onChange={(evento) => setCuenta({ ...cuenta, plazo_meses: evento.target.value === '' ? null : Number(evento.target.value) })} /></FormField>
        </>}
      </div>}
    </Dialogo>
  </div>;
}
