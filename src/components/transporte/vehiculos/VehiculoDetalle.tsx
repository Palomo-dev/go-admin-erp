'use client';

/**
 * Catálogo común › ficha del vehículo (Figma «23 Transporte» › sección 3, 2872:1691; nota
 * 2872:2886). La misma pantalla en `/app/transporte/vehiculos/[id]` y `/app/logistica/vehiculos/[id]`:
 * la ruta decide las migas y los enlaces.
 *
 * Lee con `transportService` (vehículo, viajes, transportadoras, sedes), `listarPersonasCatalogo`,
 * `listarDocumentos` (Flota) y `fichaCatalogoService` (envíos, novedades, plano de puestos).
 * Escribe SOLO con las acciones de la lista: editar (página del formulario), cambiar estado,
 * asignar conductor, subir documento (`DialogoDocumento` de Flota), historial, duplicar y eliminar.
 *
 * Fuera (la base no lo tiene, MCP 2026-11-24): mantenimiento, combustible, costos del mes y
 * liquidación al propietario (Fase 3 de Transporte), odómetro, propietario o afiliado y «Consumo
 * anormal». Mantenimiento y combustible se muestran con un estado vacío honesto, sin botones.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bus, Copy, FileUp, Fuel, History, Pencil, RefreshCw, Repeat, Trash2, UserCog } from 'lucide-react';
import {
  EmptyState,
  FilaDato,
  ListaDatos,
  PageHeader,
  RowActionsMenu,
  StatusBadge,
  TabBar,
  Tarjeta,
  clasesBoton,
  useOpcionUrl,
  type AccionFila,
} from '@/components/kit';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { transportService, type Trip, type Vehicle } from '@/lib/services/transportService';
import { listarPersonasCatalogo, type PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { DocumentoError, guardarDocumento, listarDocumentos, type DatosDocumento } from '@/lib/services/transporte/documentosService';
import {
  listarEnviosFicha,
  listarNovedadesFicha,
  obtenerPlanoPuestos,
  type EnvioFicha,
  type NovedadFicha,
  type PlanoPuestos,
} from '@/lib/services/transporte/fichaCatalogoService';
import { documentosFlota, type DocumentoTabla, type TipoDocumento } from '@/lib/transporte/documentosFlota';
import { RUTAS_CATALOGO, TONO_DOCS, TONO_ESTADO_VEHICULO, filasVehiculos, moduloDeRuta, resumenDocumentos, rutaFicha } from '@/lib/transporte/catalogoComun';
import {
  FILAS_RESUMEN,
  PESTANAS_FICHA,
  documentosDeDueno,
  novedadesAbiertas,
  peorDocumento,
  viajeEnCurso,
  viajesDelMes,
  type PestanaFicha,
} from '@/lib/transporte/fichaCatalogo';
import { DialogoDocumento, type InicialDocumento } from '@/components/transporte/flota/DialogoDocumento';
import { ReportIncidentDialog } from '@/components/transporte/viajes/id/ReportIncidentDialog';
import { TarjetaDocumentosFicha, TarjetaEnviosFicha, TarjetaNovedadesFicha, TarjetaViajesFicha, useCapacidadVehiculo } from '@/components/transporte/fichas/TarjetasFicha';
import { HojaHistorial } from '@/components/transporte/fichas/HojaHistorial';
import { asignarConductorVehiculo, cambiarEstadoVehiculo } from '@/lib/services/transporte/vehiculoAccionesService';
import { CambiarEstadoDialogo } from './CambiarEstadoDialogo';
import { AsignarConductorDialogo } from './AsignarConductorDialogo';

type Carga = 'cargando' | 'error' | 'listo';
const NO_ENCONTRADO = new Set(['PGRST116', '22P02']);

export function VehiculoDetalle({ id }: { id: string }) {
  const t = useTranslations('catalogoComun.detalleVehiculo');
  const tv = useTranslations('catalogoComun.vehiculos');
  const tc = useTranslations('catalogoComun.comun');
  const tf = useTranslations('catalogoComun.comun.ficha');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const tFlota = useTranslations('transporte.flota');
  const router = useRouter();
  const modulo = moduloDeRuta(usePathname());
  const rutas = RUTAS_CATALOGO[modulo];
  const entero = useFormatoEntero();
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const organizationId = Number(getOrganizationId()) || null;
  const [pestanaUrl, setPestana] = useOpcionUrl<PestanaFicha>('pestana', PESTANAS_FICHA, 'resumen');

  const [vehiculo, setVehiculo] = useState<Vehicle | null>(null);
  const [personas, setPersonas] = useState<PersonaCatalogo[]>([]);
  const [tabla, setTabla] = useState<DocumentoTabla[]>([]);
  const [viajes, setViajes] = useState<Trip[]>([]);
  const [envios, setEnvios] = useState<{ envios: EnvioFicha[]; total: number }>({ envios: [], total: 0 });
  const [novedades, setNovedades] = useState<NovedadFicha[]>([]);
  const [plano, setPlano] = useState<PlanoPuestos | null>(null);
  const [carga, setCarga] = useState<Carga>('cargando');
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const [aEstado, setAEstado] = useState(false);
  const [aConductor, setAConductor] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [aEliminar, setAEliminar] = useState(false);
  const [documento, setDocumento] = useState<{ inicial: InicialDocumento } | null>(null);
  const [novedadDe, setNovedadDe] = useState<Trip | null>(null);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCarga('cargando');
    (async () => {
      try {
        const v = await transportService.getVehicleById(id).catch((e: { code?: string }) => {
          if (NO_ENCONTRADO.has(e?.code ?? '')) return null;
          throw e;
        });
        // La organización sale de la sesión: un vehículo de otra organización no existe aquí.
        if (!v || v.organization_id !== organizationId) {
          if (!cancelado) {
            setVehiculo(null);
            setNoEncontrado(true);
            setCarga('listo');
          }
          return;
        }
        const seatMapId = (v as Vehicle & { seat_map_id?: string | null }).seat_map_id ?? null;
        const [p, d, vj, en, pl] = await Promise.all([
          listarPersonasCatalogo(supabase, organizationId).catch(() => [] as PersonaCatalogo[]),
          listarDocumentos(supabase, organizationId).catch(() => [] as DocumentoTabla[]),
          transportService.getVehicleTrips(v.id),
          listarEnviosFicha(supabase, organizationId, { vehicleId: v.id }).catch(() => ({ envios: [] as EnvioFicha[], total: 0 })),
          seatMapId ? obtenerPlanoPuestos(supabase, organizationId, seatMapId).catch(() => null) : Promise.resolve(null),
        ]);
        const nv = await listarNovedadesFicha(supabase, organizationId, [
          { tipo: 'vehicle', ids: [v.id] },
          { tipo: 'trip', ids: vj.map((x) => x.id) },
          { tipo: 'shipment', ids: en.envios.map((x) => x.id) },
        ]).catch(() => [] as NovedadFicha[]);
        if (cancelado) return;
        setVehiculo(v);
        setNoEncontrado(false);
        setPersonas(p);
        setTabla(d);
        setViajes(vj);
        setEnvios(en);
        setPlano(pl);
        setNovedades(nv);
        setCarga('listo');
      } catch {
        if (!cancelado) setCarga('error');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id, organizationId, recarga]);

  // ── Derivados (las reglas de la lista y de Flota) ──────────────────────────
  const docsFlota = useMemo(
    () =>
      vehiculo
        ? documentosFlota(
            [
              {
                id: vehiculo.id,
                plate: vehiculo.plate,
                vehicle_type: vehiculo.vehicle_type,
                soat_expiry: vehiculo.soat_expiry ?? null,
                techno_expiry: vehiculo.techno_expiry ?? null,
                insurance_expiry: vehiculo.insurance_expiry ?? null,
                operating_card_expiry: vehiculo.operating_card_expiry ?? null,
              },
            ],
            [],
            hoy,
            tabla,
          )
        : [],
    [vehiculo, hoy, tabla],
  );
  const fila = useMemo(() => (vehiculo ? filasVehiculos([vehiculo], personas, resumenDocumentos(docsFlota))[0] : null), [vehiculo, personas, docsFlota]);
  const documentos = useMemo(() => (vehiculo ? documentosDeDueno('vehiculo', vehiculo.id, docsFlota, tabla) : []), [vehiculo, docsFlota, tabla]);
  const peor = useMemo(() => peorDocumento(documentos), [documentos]);
  const enCurso = useMemo(() => viajeEnCurso(viajes), [viajes]);
  const porUsuario = useMemo(() => new Map(personas.filter((p) => p.userId).map((p) => [p.userId as string, p])), [personas]);
  const personaConductor = vehiculo?.current_driver_id ? porUsuario.get(vehiculo.current_driver_id) ?? null : null;

  // ── Textos ─────────────────────────────────────────────────────────────────
  const capacidadDe = useCapacidadVehiculo();
  const tipoTexto = (tipo: string) => (tTipos.has(tipo) ? tTipos(tipo) : tipo);
  const capacidad = fila ? capacidadDe(fila) : null;
  const nombreConductor = fila?.conductor?.nombre || (fila?.conductorDesconocido ? tv('conductorDesconocido') : null);
  const titulo = fila ? [fila.placa, [tipoTexto(fila.tipo), fila.marcaModelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : t('cargando');
  const subtitulo = fila
    ? [fila.anio ? t('modelo', { anio: fila.anio }) : null, capacidad, nombreConductor && fila.conductor ? t('conductor', { nombre: nombreConductor }) : null].filter(Boolean).join(' · ') || undefined
    : undefined;
  const fichaRuta = rutaFicha(modulo, 'vehiculo', id);

  // ── Acciones (las mismas de la lista) ──────────────────────────────────────
  const cambiarEstado = async (estado: string, motivo: string | null) => {
    if (!vehiculo) return;
    setGuardando(true);
    try {
      await cambiarEstadoVehiculo(vehiculo, estado, motivo);
      toastSuccess(tv('toast.estado'));
      setAEstado(false);
      recargar();
    } catch {
      toastError(tv('toast.errorEstado'));
    } finally {
      setGuardando(false);
    }
  };

  const asignarConductor = async (p: PersonaCatalogo | null) => {
    if (!vehiculo) return;
    setGuardando(true);
    try {
      await asignarConductorVehiculo(vehiculo, p?.userId ?? null, { antes: nombreConductor, ahora: p?.nombre ?? null });
      toastSuccess(p ? tv('toast.conductorAsignado') : tv('toast.conductorQuitado'));
      setAConductor(false);
      recargar();
    } catch {
      toastError(tv('toast.errorConductor'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!vehiculo) return;
    try {
      await transportService.deleteVehicle(vehiculo.id);
      toastSuccess(tv('toast.eliminado', { placa: vehiculo.plate }));
      setAEliminar(false);
      router.push(rutas.vehiculos);
    } catch {
      toastError(tv('toast.errorEliminar'));
    }
  };

  const guardarDocumentoVehiculo = async (datos: DatosDocumento, archivo: File | null) => {
    if (!organizationId) return false;
    try {
      await guardarDocumento(supabase, organizationId, datos, archivo);
      toastSuccess(tFlota('toast.guardado'));
      recargar();
      return true;
    } catch (e) {
      toastError(tFlota(`errores.${e instanceof DocumentoError ? e.codigo : 'error'}`));
      return false;
    }
  };

  const subirDocumento = (tipo: TipoDocumento = 'soat') => vehiculo && setDocumento({ inicial: { de: 'vehiculo', duenoId: vehiculo.id, tipo } });
  const conConductor = !!(fila?.conductor || fila?.conductorDesconocido);
  const acciones: AccionFila[] = [
    { id: 'estado', etiqueta: tv('acciones.cambiarEstado'), icono: Repeat, onSelect: () => setAEstado(true) },
    { id: 'documento', etiqueta: tv('acciones.subirDocumento'), icono: FileUp, onSelect: () => subirDocumento() },
    { id: 'historial', etiqueta: tv('acciones.historial'), icono: History, onSelect: () => setHistorial(true) },
    { id: 'duplicar', etiqueta: tv('acciones.duplicar'), icono: Copy, onSelect: () => router.push(`${rutas.vehiculos}/nuevo?duplicar=${encodeURIComponent(id)}`), separadorAntes: true },
    { id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: recargar },
    { id: 'eliminar', etiqueta: tv('acciones.eliminar'), icono: Trash2, onSelect: () => setAEliminar(true), destructiva: true, separadorAntes: true },
  ];
  const accionConductor: AccionFila = {
    id: 'conductor',
    etiqueta: conConductor ? tv('acciones.cambiarConductor') : tv('acciones.asignarConductor'),
    icono: UserCog,
    onSelect: () => setAConductor(true),
  };
  const accionEditar: AccionFila = { id: 'editar', etiqueta: tv('acciones.editar'), icono: Pencil, onSelect: () => router.push(`${fichaRuta}/editar`) };

  const migas = [{ etiqueta: tc(`migas.${modulo}`), href: rutas.inicio }, { etiqueta: tv('titulo'), href: rutas.vehiculos }, { etiqueta: fila?.placa ?? t('cargando') }];

  if (noEncontrado || (carga === 'error' && !vehiculo)) {
    return (
      <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
        <PageHeader titulo={tv('titulo')} migas={migas.slice(0, 2)} variante="form" volverA={rutas.vehiculos} />
        <div className="rounded-xl border border-line bg-surface">
          {noEncontrado ? (
            <EmptyState variante="search" titulo={t('noEncontrado.titulo')} descripcion={t('noEncontrado.descripcion')} accion={{ etiqueta: t('noEncontrado.volver'), href: rutas.vehiculos }} />
          ) : (
            <EmptyState variante="error" titulo={tf('errorCarga')} onReintentar={recargar} />
          )}
        </div>
      </div>
    );
  }

  const cargando = carga === 'cargando' && !vehiculo;
  const pestanas = [
    { valor: 'resumen' as const, etiqueta: tf('pestanas.resumen') },
    { valor: 'documentos' as const, etiqueta: tf('pestanas.documentos'), contador: documentos.length },
    { valor: 'viajes' as const, etiqueta: tf('pestanas.viajes'), contador: viajes.length },
    ...(envios.total > 0 ? [{ valor: 'envios' as const, etiqueta: tf('pestanas.envios'), contador: envios.total }] : []),
    { valor: 'novedades' as const, etiqueta: tf('pestanas.novedades'), contador: novedadesAbiertas(novedades) || undefined },
  ];
  const pestana: PestanaFicha = pestanas.some((p) => p.valor === pestanaUrl) ? pestanaUrl : 'resumen';

  const tarjetaDocumentos = (
    <TarjetaDocumentosFicha
      filas={documentos}
      titulo={tf('documentos.titulo')}
      descripcion={tf('documentos.descripcion')}
      columnaNumero="numero"
      carga={carga}
      onSubir={() => subirDocumento()}
      onRenovar={(f) => subirDocumento(f.tipo as TipoDocumento)}
      onReintentar={recargar}
    />
  );
  const tarjetaViajes = (limite?: number) => (
    <TarjetaViajesFicha
      viajes={viajes}
      otro={{ columna: 'conductor', nombre: (v) => (v.driver_id ? porUsuario.get(v.driver_id)?.nombre || null : null) }}
      descripcion={limite ? tf('viajes.delMes', { count: viajesDelMes(viajes, hoy) }) : tf('viajes.ultimos', { n: entero(viajes.length) })}
      carga={carga}
      limite={limite}
      onVerTodos={() => setPestana('viajes')}
      onReportarNovedad={setNovedadDe}
      onReintentar={recargar}
    />
  );
  const codigoViaje = new Map(viajes.map((v) => [v.id, v.trip_code]));
  const numeroEnvio = new Map(envios.envios.map((e) => [e.id, e.shipment_number]));
  const tarjetaNovedades = (limite?: number) => (
    <TarjetaNovedadesFicha
      novedades={novedades}
      descripcion={t('novedadesDescripcion')}
      referencia={(n) => (n.reference_type === 'trip' ? codigoViaje.get(n.reference_id ?? '') ?? null : n.reference_type === 'shipment' ? numeroEnvio.get(n.reference_id ?? '') ?? null : null)}
      carga={carga}
      limite={limite}
      onVerTodos={() => setPestana('novedades')}
      onReintentar={recargar}
    />
  );
  const tarjetaEnvios = (limite?: number) => (
    <TarjetaEnviosFicha
      envios={envios.envios}
      total={envios.total}
      descripcion={t('enviosDescripcion')}
      carga={carga}
      limite={limite}
      onVerTodos={() => setPestana('envios')}
      onReintentar={recargar}
    />
  );

  const ficha = fila && vehiculo && (
    <Tarjeta titulo={t('ficha.titulo')} icono={Bus}>
      <ListaDatos etiqueta={t('ficha.titulo')}>
        <FilaDato etiqueta={t('ficha.placa')} valor={fila.placa} />
        <FilaDato etiqueta={t('ficha.tipo')} valor={tipoTexto(fila.tipo)} />
        <FilaDato etiqueta={t('ficha.marcaModelo')} valor={fila.marcaModelo || '—'} />
        <FilaDato etiqueta={t('ficha.anio')} valor={fila.anio ?? '—'} />
        {vehiculo.color && <FilaDato etiqueta={t('ficha.color')} valor={vehiculo.color} />}
        {vehiculo.vin && <FilaDato etiqueta={t('ficha.vin')} valor={vehiculo.vin} />}
        <FilaDato etiqueta={t('ficha.capacidad')} valor={capacidad ?? '—'} />
        {plano && (
          <FilaDato
            etiqueta={t('ficha.plano')}
            valor={plano.rows && plano.cols ? t('ficha.planoDetalle', { nombre: plano.name, filas: entero(plano.rows), columnas: entero(plano.cols) }) : plano.name}
          />
        )}
        <FilaDato
          etiqueta={t('ficha.conductor')}
          valor={nombreConductor ?? tv('sinAsignar')}
          href={personaConductor ? rutaFicha(modulo, 'persona', personaConductor.id) : undefined}
        />
        {fila.transportadora && <FilaDato etiqueta={t('ficha.transportadora')} valor={fila.transportadora} />}
        <FilaDato etiqueta={t('ficha.sede')} valor={fila.sede ?? '—'} />
      </ListaDatos>
    </Tarjeta>
  );
  const operacion = (
    <Tarjeta titulo={t('operacion.titulo')} icono={Fuel}>
      <EmptyState compacto icono={Fuel} titulo={t('operacion.vacioTitulo')} descripcion={t('operacion.vacioDescripcion')} />
    </Tarjeta>
  );

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={titulo}
        subtitulo={subtitulo}
        migas={migas}
        variante="form"
        volverA={rutas.vehiculos}
        cargando={cargando}
        acciones={
          vehiculo && (
            <>
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setAConductor(true)}>
                <UserCog aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {accionConductor.etiqueta}
              </button>
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={accionEditar.onSelect}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {accionEditar.etiqueta}
              </button>
              <RowActionsMenu orientacion="horizontal" tamano="md" titulo={fila?.placa ?? tv('titulo')} acciones={acciones} />
            </>
          )
        }
        movil={{ titulo: fila?.placa ?? tv('titulo'), subtitulo: fila ? tipoTexto(fila.tipo) : undefined, menu: vehiculo ? [accionEditar, accionConductor, ...acciones] : [] }}
        debajo={
          fila && (
            <>
              {enCurso && (
                <StatusBadge
                  estado={enCurso.status}
                  tono="informacion"
                  apariencia="solido"
                  etiqueta={tf('enCurso', { codigo: enCurso.trip_code, estado: tf(`viajes.estados.${enCurso.status}`) })}
                />
              )}
              <StatusBadge estado={fila.estado} tono={TONO_ESTADO_VEHICULO[fila.estado]} etiqueta={tv(`estados.${fila.estado}`)} />
              <StatusBadge estado={fila.tipo} tono="marca" apariencia="contorno" etiqueta={tipoTexto(fila.tipo)} />
              <StatusBadge estado={peor.estado} tono={TONO_DOCS[peor.estado]} etiqueta={t(`docs.${peor.estado}`)} />
            </>
          )
        }
      />

      <TabBar<PestanaFicha> id="ficha-vehiculo" etiqueta={tf('pestanas.etiqueta')} valor={pestana} onValorChange={setPestana} pestanas={pestanas} />

      {pestana === 'resumen' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
          <div className="order-last flex min-w-0 flex-col gap-4 lg:order-none lg:gap-5">
            {tarjetaDocumentos}
            {tarjetaViajes(FILAS_RESUMEN)}
            {tarjetaNovedades(FILAS_RESUMEN)}
            {envios.total > 0 && tarjetaEnvios(FILAS_RESUMEN)}
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            {ficha}
            {operacion}
          </div>
        </div>
      )}
      {pestana === 'documentos' && tarjetaDocumentos}
      {pestana === 'viajes' && tarjetaViajes()}
      {pestana === 'envios' && tarjetaEnvios()}
      {pestana === 'novedades' && tarjetaNovedades()}

      {aEstado && <CambiarEstadoDialogo vehiculo={vehiculo} guardando={guardando} onCerrar={() => setAEstado(false)} onCambiar={(e, m) => void cambiarEstado(e, m)} />}
      {aConductor && <AsignarConductorDialogo vehiculo={vehiculo} personas={personas} guardando={guardando} onCerrar={() => setAConductor(false)} onAsignar={(p) => void asignarConductor(p)} />}
      <HojaHistorial
        objetivo={historial && vehiculo ? { de: 'vehiculo', vehiculo } : null}
        organizationId={organizationId}
        onCerrar={() => setHistorial(false)}
        nombreOtro={(v) => (v.driver_id ? porUsuario.get(v.driver_id)?.nombre || null : null)}
      />
      {documento && vehiculo && (
        <DialogoDocumento
          vehiculos={[{ id: vehiculo.id, nombre: vehiculo.plate }]}
          conductores={[]}
          inicial={documento.inicial}
          onCerrar={() => setDocumento(null)}
          onGuardar={guardarDocumentoVehiculo}
        />
      )}
      {novedadDe && organizationId && (
        <ReportIncidentDialog
          open
          onOpenChange={(v) => !v && setNovedadDe(null)}
          tripId={novedadDe.id}
          organizationId={organizationId}
          onSuccess={() => {
            setNovedadDe(null);
            recargar();
          }}
        />
      )}
      <ConfirmDialog
        abierto={aEliminar}
        onAbiertoChange={setAEliminar}
        titulo={tv('eliminar.titulo', { placa: vehiculo?.plate ?? '' })}
        descripcion={tv('eliminar.descripcion')}
        textoConfirmar={tv('eliminar.confirmar')}
        textoCancelar={tc('cancelar')}
        tono="peligro"
        icono={Trash2}
        onConfirmar={() => void eliminar()}
      />
    </div>
  );
}
