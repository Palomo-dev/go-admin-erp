'use client';

/**
 * Registrar domiciliario — alta rápida (Figma 2800:8493).
 *
 * Un domiciliario EXTERNO no necesita contrato en Recursos humanos: nombre, celular y documento, la
 * sede y en qué reparte; queda disponible de inmediato para asignar. Si es empleado,
 * «Traer desde Recursos humanos» lo vincula a su empleo (el disparador completa su cuenta para
 * «Mis envíos»).
 *
 * Logística 1b (Figma «21 Logística» 3152-10466 … 3153-10988): además del tipo, el vehículo
 * CONCRETO. Moto, carro y camioneta: se elige de la flota (uso Logística o Ambos) o se crea en el
 * mismo paso (placa, dueño, SOAT, tecnomecánica, capacidad); bici, opcional y sin placa; a pie, sin
 * vehículo. Queda en `driver_credentials.default_vehicle_id` por la RPC `logistica_vincular_vehiculo`
 * (también para un externo sin cuenta). El uso nace «Logística»; la casilla lo pasa a «Ambos».
 *
 * Se exporta para que «Asignar» (Por despachar) lo abra con `textoConfirmar="Registrar y asignar"`.
 * El permiso lo decide el servidor (`POST /api/logistica/domiciliarios`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bike, Info, Plus } from 'lucide-react';
import { AvisoTonal, CampoFecha, ChipsOpcion, Dialogo, FormField, SettingRow, StatusBadge, clasesBoton } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { toastWarning } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { deliveryIntegrationService, type DeliveryVehicle } from '@/lib/services/deliveryIntegrationService';
import { CATEGORIAS_POR_TIPO } from '@/lib/transporte/formulariosCatalogo';
import { DUENOS, placaObligatoria, requiereVehiculo, usoConAmbos, type Dueno } from '@/lib/logistica/vehiculoAsignacion';
import { Input } from '@/components/ui/input';
import { PhoneField } from '@/components/kit/PhoneField';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranch } from '@/lib/context/BranchContext';
import {
  TIPOS_DOCUMENTO,
  TIPOS_VEHICULO,
  altaDomiciliarioSchema,
  type TipoDocumento,
  type TipoVehiculo,
} from '@/lib/logistica/domiciliarios';
import type { CandidatosAlta, DomiciliarioFila } from '@/lib/services/logistica/domiciliariosService';
import { LogisticaApiError, leerCandidatos, registrarDomiciliario } from '../logisticaApi';

export interface RegistrarDomiciliarioDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onRegistrado: (d: DomiciliarioFila) => void;
  /** «Registrar» por defecto; «Registrar y asignar» desde el diálogo de asignar. */
  textoConfirmar?: string;
  /** Candidatos ya leídos por la pantalla (si no, se leen al abrir). */
  candidatos?: CandidatosAlta | null;
  /**
   * «Registrarme como domiciliario» desde Mis envíos: la cuenta de la sesión queda elegida (y su
   * nombre y celular) en cuanto llegan los candidatos. El resto del formulario es el mismo.
   */
  usuarioPropio?: string | null;
}

const SIN = '__sin__';
const NUEVO = '__nuevo__';
const CATEGORIAS = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'] as const;

export function RegistrarDomiciliarioDialog({
  abierto,
  onAbiertoChange,
  onRegistrado,
  textoConfirmar,
  candidatos: candidatosProp,
  usuarioPropio,
}: RegistrarDomiciliarioDialogProps) {
  const t = useTranslations('logistica.domiciliario.alta');
  const tv = useTranslations('logisticaVehiculo');
  const { getToday } = useFormatDate();
  const { branches, selectedBranchId } = useBranch();
  const [candidatos, setCandidatos] = useState<CandidatosAlta | null>(candidatosProp ?? null);

  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('CC');
  const [documento, setDocumento] = useState('');
  const [sede, setSede] = useState<number | null>(selectedBranchId ?? null);
  const [vehiculo, setVehiculo] = useState<TipoVehiculo | null>(null);
  const [cobraContraentrega, setCobraContraentrega] = useState(true);
  const [esEmpleado, setEsEmpleado] = useState(false);
  const [empleo, setEmpleo] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Logística 1b: vehículo concreto, licencia y uso.
  const [flota, setFlota] = useState<DeliveryVehicle[] | null>(null);
  const [defectoDe, setDefectoDe] = useState<Map<string, string>>(new Map());
  const [vehiculoSel, setVehiculoSel] = useState<string | null>(null);
  const [placa, setPlaca] = useState('');
  const [dueno, setDueno] = useState<Dueno>('company');
  const [soat, setSoat] = useState('');
  const [tecno, setTecno] = useState('');
  const [kg, setKg] = useState('');
  const [m3, setM3] = useState('');
  const [licCategoria, setLicCategoria] = useState<string | null>(null);
  const [licVence, setLicVence] = useState('');
  const [usoAmbos, setUsoAmbos] = useState(false);

  useEffect(() => {
    if (candidatosProp) setCandidatos(candidatosProp);
  }, [candidatosProp]);

  // Sede por defecto: la del header (o la única). Se lee al abrir, no en cada render: el
  // contexto puede entregar un arreglo nuevo y eso no debe borrar lo que se está escribiendo.
  const sedePorDefecto = useRef<number | null>(null);
  sedePorDefecto.current = selectedBranchId ?? (branches.length === 1 ? branches[0].id ?? null : null);
  const candidatosIniciales = useRef(candidatosProp);
  candidatosIniciales.current = candidatosProp;

  useEffect(() => {
    if (!abierto) return;
    setNombre('');
    setCelular('');
    setTipoDocumento('CC');
    setDocumento('');
    setSede(sedePorDefecto.current);
    setVehiculo(null);
    setCobraContraentrega(true);
    setEsEmpleado(false);
    setEmpleo(null);
    setUsuario(null);
    setIntentado(false);
    setError(null);
    setVehiculoSel(null);
    setPlaca('');
    setDueno('company');
    setSoat('');
    setTecno('');
    setKg('');
    setM3('');
    setLicCategoria(null);
    setLicVence('');
    setUsoAmbos(false);
    const org = Number(getOrganizationId()) || 0;
    if (org) {
      // Flota de Logística (uso Logística o Ambos) y quién tiene cada vehículo por defecto.
      deliveryIntegrationService.getAvailableVehicles(org).then(setFlota).catch(() => setFlota([]));
      supabase
        .from('driver_credentials')
        .select('full_name, default_vehicle_id')
        .eq('organization_id', org)
        .not('default_vehicle_id', 'is', null)
        .then(({ data }) => setDefectoDe(new Map(((data ?? []) as { full_name: string | null; default_vehicle_id: string }[]).map((d) => [d.default_vehicle_id, d.full_name ?? '']))));
    }
    if (!candidatosIniciales.current) {
      leerCandidatos()
        .then(setCandidatos)
        .catch(() => setCandidatos({ empleados: [], miembros: [] }));
    }
  }, [abierto]);

  const tipoFlota = vehiculo && vehiculo !== 'on_foot' ? vehiculo : null;
  const creaNuevo = vehiculoSel === NUEVO;
  const numero = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return s.trim() && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const alta = {
    nombre,
    celular,
    tipoDocumento,
    documento,
    branchId: sede ?? 0,
    tipoVehiculo: vehiculo,
    cobraContraentrega,
    employmentId: esEmpleado ? empleo : null,
    userId: esEmpleado ? null : usuario,
    uso: usoConAmbos('logistica', usoAmbos),
    licenciaCategoria: licCategoria as (typeof CATEGORIAS)[number] | null,
    licenciaVence: licCategoria ? licVence || null : null,
    vehiculoId: tipoFlota && vehiculoSel && vehiculoSel !== NUEVO ? vehiculoSel : null,
    vehiculoNuevo:
      tipoFlota && creaNuevo
        ? { placa, tipo: tipoFlota as 'motorcycle', dueno, soat: soat || null, tecnomecanica: tecno || null, kg: numero(kg), m3: numero(m3) }
        : null,
  };
  const validacion = altaDomiciliarioSchema.safeParse(alta);
  // Moto, carro y camioneta: el vehículo concreto es obligatorio (elegido o nuevo).
  const faltaVehiculo = requiereVehiculo(vehiculo) && !alta.vehiculoId && !alta.vehiculoNuevo;
  const opcionesFlota = useMemo(
    () => (flota ?? []).filter((v) => !tipoFlota || v.vehicle_type === tipoFlota || tipoFlota === 'other'),
    [flota, tipoFlota],
  );
  const vehiculoElegido = opcionesFlota.find((v) => v.id === vehiculoSel) ?? null;
  const tipoParaLicencia = vehiculoElegido?.vehicle_type ?? tipoFlota;
  const categoriasPide = tipoParaLicencia ? CATEGORIAS_POR_TIPO[tipoParaLicencia] ?? null : null;
  const categoriaNoSirve = !!(licCategoria && categoriasPide && !categoriasPide.includes(licCategoria));
  const tipoTxt = (x: string | null | undefined) => (x && tv.has(`tiposCorto.${x}`) ? tv(`tiposCorto.${x}`) : x ?? '');
  const campoConError = (campo: string) =>
    intentado && !validacion.success && validacion.error.issues.some((i) => i.path[0] === campo) ? t(`errores.${campo}`) : null;
  const faltaEmpleo = intentado && esEmpleado && !empleo;

  // Cuenta propia ya elegida (Mis envíos › Registrarme): una vez por apertura, cuando llegan los candidatos.
  const propioAplicado = useRef(false);
  useEffect(() => {
    if (!abierto) {
      propioAplicado.current = false;
      return;
    }
    if (!usuarioPropio || propioAplicado.current || !candidatos) return;
    const m = candidatos.miembros.find((x) => x.userId === usuarioPropio);
    propioAplicado.current = true;
    if (!m) return;
    setUsuario(m.userId);
    setNombre((n) => n || m.nombre);
    if (m.telefono) setCelular((c) => c || (m.telefono as string));
  }, [abierto, usuarioPropio, candidatos]);

  const elegirEmpleado = (id: string) => {
    const e = candidatos?.empleados.find((x) => x.employmentId === id);
    setEmpleo(id === SIN ? null : id);
    if (e) {
      setNombre(e.nombre);
      if (e.telefono) setCelular(e.telefono);
      if (e.branchId) setSede(e.branchId);
    }
  };

  const guardar = async () => {
    setIntentado(true);
    setError(null);
    if (!validacion.success || (esEmpleado && !empleo) || faltaVehiculo) return;
    setGuardando(true);
    try {
      const r = await registrarDomiciliario(validacion.data);
      // La persona quedó; si el vehículo no, se dice por qué (se puede completar en su ficha).
      if (r.domiciliario.vehiculo_error) {
        const c = r.domiciliario.vehiculo_error;
        toastWarning(tv('alta.avisoVehiculo'), tv.has(`alta.erroresVehiculo.${c}`) ? tv(`alta.erroresVehiculo.${c}`) : tv('alta.erroresVehiculo.ERROR'));
      }
      onRegistrado(r.domiciliario);
      onAbiertoChange(false);
    } catch (err) {
      const codigo = err instanceof LogisticaApiError ? err.codigo : 'ERROR';
      setError(t.has(`errores.servidor.${codigo}`) ? t(`errores.servidor.${codigo}`) : t('errores.servidor.ERROR'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Bike}
      ancho={520}
      primario={{
        etiqueta: guardando ? t('guardando') : textoConfirmar ?? (creaNuevo && tipoFlota ? tv('alta.registrarConVehiculo') : categoriaNoSirve ? tv('alta.guardarIgual') : t('registrar')),
        onClick: guardar,
        cargando: guardando,
      }}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        <FormField etiqueta={t('nombre')} obligatorio error={campoConError('nombre')}>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={120} />
        </FormField>

        <PhoneField
          etiqueta={t('celular')}
          valor={celular}
          onValor={setCelular}
          obligatorio
          ayuda={t('celularAyuda')}
          error={campoConError('celular')}
          defaultIso="CO"
          autoComplete="tel"
        />

        <div className="grid grid-cols-[112px_1fr] gap-3">
          <FormField etiqueta={t('tipoDocumento')} obligatorio={!esEmpleado}>
            {(c) => (
              <Select value={tipoDocumento} onValueChange={(v) => setTipoDocumento(v as TipoDocumento)}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('documento')} obligatorio={!esEmpleado} error={campoConError('documento')}>
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" maxLength={30} />
          </FormField>
        </div>

        <FormField etiqueta={t('sede')} obligatorio error={campoConError('branchId')}>
          {(c) => (
            <Select value={sede ? String(sede) : undefined} onValueChange={(v) => setSede(Number(v))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegirSede')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {/* Logística 1b: «¿En qué reparte?» (sigue siendo el tipo, como atajo) + el vehículo concreto. */}
        <div className="flex flex-col gap-2">
          <span id="alta-reparte" className="text-sm font-medium text-fg">
            {tv('alta.reparte')}
          </span>
          <ChipsOpcion<TipoVehiculo>
            aria-labelledby="alta-reparte"
            opciones={(['motorcycle', 'car', 'van', 'bicycle', 'on_foot', 'other'] as const).filter((v) => TIPOS_VEHICULO.includes(v)).map((v) => ({ valor: v, etiqueta: t(`vehiculos.${v}`) }))}
            valor={vehiculo}
            onValorChange={(v) => {
              setVehiculo(v === vehiculo ? null : v);
              setVehiculoSel(null);
            }}
          />
        </div>

        {tipoFlota && !creaNuevo && (
          <div className="flex flex-col gap-2">
            <span id="alta-vehiculo" className="flex items-center gap-2 text-sm font-medium text-fg">
              {t('vehiculo')}
              <StatusBadge
                estado={requiereVehiculo(vehiculo) ? 'obligatorio' : 'opcional'}
                tono={requiereVehiculo(vehiculo) ? 'advertencia' : 'neutro'}
                etiqueta={requiereVehiculo(vehiculo) ? tv('asignar.obligatorio', { tipo: tipoTxt(vehiculo) }) : tv('asignar.opcionalEn', { tipo: tipoTxt(vehiculo) })}
              />
            </span>
            <Select value={vehiculoSel ?? SIN} onValueChange={(v) => setVehiculoSel(v === SIN ? null : v)}>
              <SelectTrigger aria-labelledby="alta-vehiculo" aria-invalid={(intentado && faltaVehiculo) || undefined} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={tv('alta.elegir')} />
              </SelectTrigger>
              <SelectContent>
                {!requiereVehiculo(vehiculo) && <SelectItem value={SIN}>{tv('sinVehiculo.bicycle')}</SelectItem>}
                {opcionesFlota.map((v) => {
                  const de = defectoDe.get(v.id);
                  return (
                    <SelectItem key={v.id} value={v.id} disabled={!!de}>
                      {[v.plate ?? tv('sinPlaca'), tipoTxt(v.vehicle_type), tv(`duenoCorto.${v.ownership ?? 'company'}`), de ? tv('alta.deOtro', { nombre: de }) : null].filter(Boolean).join(' · ')}
                    </SelectItem>
                  );
                })}
                <SelectItem value={NUEVO}>
                  <span className="flex items-center gap-1.5 text-brand">
                    <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {tv('alta.crearNuevo')}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {intentado && faltaVehiculo && <p className="text-xs text-danger-text">{tv('alta.errores.vehiculo')}</p>}
            <p className="text-xs text-fg-muted">{tv('alta.ayudaFlota')}</p>
          </div>
        )}

        {tipoFlota && creaNuevo && (
          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              {tv('alta.vehiculoNuevo')}
              <StatusBadge estado="nuevo" tono="informacion" etiqueta={tv('alta.seCreaConElla')} />
            </span>
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-3">
              <FormField
                etiqueta={tv('alta.placa')}
                obligatorio={placaObligatoria(tipoFlota, dueno)}
                ayuda={placaObligatoria(tipoFlota, dueno) ? tv('alta.placaAyuda') : tv('alta.placaOpcional')}
                error={intentado && !validacion.success && validacion.error.issues.some((i) => i.path[0] === 'vehiculoNuevo') ? tv('alta.errores.placa') : null}
              >
                <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} maxLength={20} autoComplete="off" />
              </FormField>
              <div className="flex flex-col gap-1.5">
                <span id="alta-dueno" className="text-sm font-medium text-fg">
                  {tv('alta.dueno')} *
                </span>
                <ChipsOpcion<Dueno> aria-labelledby="alta-dueno" opciones={DUENOS.map((d) => ({ valor: d, etiqueta: tv(`duenos.${d}`) }))} valor={dueno} onValorChange={setDueno} />
                <p className="text-xs text-fg-muted">{tv(`alta.duenoAyuda.${dueno}`, { nombre: nombre.trim() || tv('alta.laPersona') })}</p>
              </div>
              {tipoFlota !== 'bicycle' && dueno !== 'third_party' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField etiqueta={tv('alta.soat')}>{(c) => <CampoFecha id={c.id} valor={soat} onValorChange={(v) => setSoat(v ?? '')} limpiable hoy={getToday()} />}</FormField>
                  <FormField etiqueta={tv('alta.tecnomecanica')}>{(c) => <CampoFecha id={c.id} valor={tecno} onValorChange={(v) => setTecno(v ?? '')} limpiable hoy={getToday()} />}</FormField>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <FormField etiqueta={tv('alta.kg')}>
                  <Input value={kg} onChange={(e) => setKg(e.target.value)} inputMode="decimal" />
                </FormField>
                <FormField etiqueta={tv('alta.m3')} ayuda={tv('alta.capacidadAyuda')}>
                  <Input value={m3} onChange={(e) => setM3(e.target.value)} inputMode="decimal" />
                </FormField>
              </div>
              <AvisoTonal tono="informacion" compacto titulo={tv('alta.quedaPorDefecto.titulo')} descripcion={tv('alta.quedaPorDefecto.descripcion')} />
            </div>
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-start' })} onClick={() => setVehiculoSel(null)}>
              {tv('alta.mejorFlota')}
            </button>
          </div>
        )}

        {vehiculo === 'on_foot' && (
          <p className="flex items-start gap-2 text-xs text-fg-muted">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            {tv('alta.aPie')}
          </p>
        )}

        {vehiculo && vehiculo !== 'on_foot' && vehiculo !== 'bicycle' && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg">{tv('alta.licencia')}</span>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                etiqueta={tv('alta.categoria')}
                ayuda={categoriasPide ? tv('alta.categoriaAyuda', { tipo: tipoTxt(tipoParaLicencia), categorias: categoriasPide.join(' / ') }) : undefined}
                error={categoriaNoSirve ? tv('alta.categoriaPide', { tipo: tipoTxt(tipoParaLicencia), categorias: (categoriasPide ?? []).join(' / ') }) : null}
              >
                {(c) => (
                  <Select value={licCategoria ?? SIN} onValueChange={(v) => setLicCategoria(v === SIN ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN}>{tv('alta.sinLicencia')}</SelectItem>
                      {CATEGORIAS.map((x) => (
                        <SelectItem key={x} value={x}>
                          {x}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={tv('alta.vence')} ayuda={tv('alta.venceAyuda')} error={intentado && licCategoria && !licVence ? tv('alta.errores.licencia') : null}>
                {(c) => <CampoFecha id={c.id} valor={licVence} onValorChange={(v) => setLicVence(v ?? '')} limpiable hoy={getToday()} />}
              </FormField>
            </div>
            {categoriaNoSirve && <AvisoTonal tono="advertencia" compacto titulo={tv('alta.categoriaIncorrecta.titulo', { tipo: tipoTxt(tipoParaLicencia) })} descripcion={tv('alta.categoriaIncorrecta.descripcion')} />}
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-fg">
            {tv('alta.uso')}
            <StatusBadge estado="uso" tono="informacion" etiqueta={tv(`usos.${usoAmbos ? 'both' : 'logistics'}`)} />
          </span>
          <p className="text-xs text-fg-muted">{tv('alta.usoAyuda')}</p>
          <label className="flex items-center gap-2 text-sm text-fg">
            <Checkbox checked={usoAmbos} onCheckedChange={(v) => setUsoAmbos(v === true)} />
            {tv('alta.usoAmbos')}
          </label>
        </div>

        <SettingRow titulo={t('cobraContraentrega')} descripcion={t('cobraContraentregaAyuda')} htmlFor="alta-cobra-contraentrega" className="rounded-xl border border-line px-4">
          <Switch id="alta-cobra-contraentrega" checked={cobraContraentrega} onCheckedChange={setCobraContraentrega} />
        </SettingRow>

        <SettingRow titulo={t('esEmpleado')} descripcion={t('esEmpleadoAyuda')} htmlFor="alta-es-empleado" className="rounded-xl border border-line px-4">
          <Switch
            id="alta-es-empleado"
            checked={esEmpleado}
            onCheckedChange={(v) => {
              setEsEmpleado(v);
              if (!v) setEmpleo(null);
            }}
          />
        </SettingRow>

        {esEmpleado ? (
          <FormField etiqueta={t('traerDeRrhh')} obligatorio error={faltaEmpleo ? t('errores.empleo') : null} ayuda={candidatos && candidatos.empleados.length === 0 ? t('sinEmpleados') : undefined}>
            {(c) => (
              <Select value={empleo ?? undefined} onValueChange={elegirEmpleado} disabled={!candidatos || candidatos.empleados.length === 0}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={candidatos ? t('elegirEmpleado') : t('cargando')} />
                </SelectTrigger>
                <SelectContent>
                  {candidatos?.empleados.map((e) => (
                    <SelectItem key={e.employmentId} value={e.employmentId}>
                      {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : (
          candidatos &&
          candidatos.miembros.length > 0 && (
            <FormField etiqueta={t('cuenta')} ayuda={t('cuentaAyuda')}>
              {(c) => (
                <Select value={usuario ?? SIN} onValueChange={(v) => setUsuario(v === SIN ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>{t('sinCuenta')}</SelectItem>
                    {candidatos.miembros.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )
        )}
      </div>
    </Dialogo>
  );
}
