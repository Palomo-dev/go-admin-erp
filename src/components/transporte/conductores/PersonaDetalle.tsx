'use client';

/**
 * Catálogo común › ficha de la persona: conductor o domiciliario (Figma «23 Transporte» › sección 4,
 * 2874:2806; nota 2874:3961). La misma pantalla en `/app/transporte/conductores/[id]` y
 * `/app/logistica/conductores/[id]`: la ruta decide las migas y los enlaces.
 *
 * Lee con `obtenerPersonaCatalogo` (driver_credentials + empleo + cargo de RR. HH., nunca un rol),
 * `transportService` (vehículos, viajes, sedes), `listarDocumentos` (Flota) y
 * `fichaCatalogoService` (envíos del domiciliario y novedades). Escribe SOLO con las acciones de la
 * lista: editar (página del formulario), activar o desactivar, subir documento (`DialogoDocumento`
 * de Flota), historial, duplicar y eliminar.
 *
 * `trips.driver_id` apunta a `auth.users`: los viajes se buscan por el USUARIO de la persona (antes
 * el historial los buscaba por el id de la credencial y nunca encontraba nada).
 *
 * Fuera (la base no lo tiene, MCP 2026-11-24): liquidación por viaje, puntualidad del mes, la fecha
 * desde la que tiene el vehículo y el aviso por WhatsApp de los vencimientos.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bus, Copy, FileUp, History, Pencil, Power, RefreshCw, Trash2, UserRound } from 'lucide-react';
import {
  AvisoTonal,
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
import { obtenerPersonaCatalogo, type PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { DocumentoError, guardarDocumento, listarDocumentos, type DatosDocumento } from '@/lib/services/transporte/documentosService';
import { listarEnviosFicha, listarNovedadesFicha, type EnvioFicha, type NovedadFicha } from '@/lib/services/transporte/fichaCatalogoService';
import { documentosFlota, type DocumentoTabla, type TipoDocumento } from '@/lib/transporte/documentosFlota';
import {
  CARGO_EXTERNO,
  CARGO_SIN,
  RUTAS_CATALOGO,
  TONO_DOCS,
  claveCargo,
  filasConductores,
  filasVehiculos,
  moduloDeRuta,
  resumenDocumentos,
  rutaFicha,
} from '@/lib/transporte/catalogoComun';
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
import {
  TarjetaDocumentosFicha,
  TarjetaEnviosFicha,
  TarjetaNovedadesFicha,
  TarjetaViajesFicha,
  useCapacidadVehiculo,
  useTipoDocumento,
} from '@/components/transporte/fichas/TarjetasFicha';
import { DriverStatusDialog } from './DriverStatusDialog';
import { HojaHistorial } from '@/components/transporte/fichas/HojaHistorial';

type Carga = 'cargando' | 'error' | 'listo';

export function PersonaDetalle({ id }: { id: string }) {
  const t = useTranslations('catalogoComun.detallePersona');
  const tp = useTranslations('catalogoComun.conductores');
  const tv = useTranslations('catalogoComun.vehiculos');
  const tvd = useTranslations('catalogoComun.detalleVehiculo');
  const tc = useTranslations('catalogoComun.comun');
  const tf = useTranslations('catalogoComun.comun.ficha');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const tFlota = useTranslations('transporte.flota');
  const router = useRouter();
  const modulo = moduloDeRuta(usePathname());
  const rutas = RUTAS_CATALOGO[modulo];
  const entero = useFormatoEntero();
  const { getToday, formatPlain } = useFormatDate();
  const hoy = getToday();
  const organizationId = Number(getOrganizationId()) || null;
  const capacidadDe = useCapacidadVehiculo();
  const tipoDocumento = useTipoDocumento();
  const [pestanaUrl, setPestana] = useOpcionUrl<PestanaFicha>('pestana', PESTANAS_FICHA, 'resumen');

  const [persona, setPersona] = useState<PersonaCatalogo | null>(null);
  const [vehiculos, setVehiculos] = useState<Vehicle[]>([]);
  const [tabla, setTabla] = useState<DocumentoTabla[]>([]);
  const [viajes, setViajes] = useState<Trip[]>([]);
  const [envios, setEnvios] = useState<{ envios: EnvioFicha[]; total: number }>({ envios: [], total: 0 });
  const [novedades, setNovedades] = useState<NovedadFicha[]>([]);
  const [sedes, setSedes] = useState<{ id: number; name: string }[]>([]);
  const [carga, setCarga] = useState<Carga>('cargando');
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [guardando, setGuardando] = useState(false);

  const [aEstado, setAEstado] = useState(false);
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
        // Filtra por la organización de la sesión: de otra organización responde null.
        const p = await obtenerPersonaCatalogo(supabase, organizationId, id);
        if (!p) {
          if (!cancelado) {
            setPersona(null);
            setNoEncontrado(true);
            setCarga('listo');
          }
          return;
        }
        const [v, d, vj, en, s] = await Promise.all([
          transportService.getVehicles(organizationId, null),
          listarDocumentos(supabase, organizationId).catch(() => [] as DocumentoTabla[]),
          p.userId ? transportService.getDriverTrips(p.userId) : Promise.resolve([] as Trip[]),
          listarEnviosFicha(supabase, organizationId, { driverId: p.id }).catch(() => ({ envios: [] as EnvioFicha[], total: 0 })),
          transportService.getBranches(organizationId).catch(() => [] as { id: number; name: string }[]),
        ]);
        const nv = await listarNovedadesFicha(supabase, organizationId, [
          { tipo: 'trip', ids: vj.map((x) => x.id) },
          { tipo: 'shipment', ids: en.envios.map((x) => x.id) },
        ]).catch(() => [] as NovedadFicha[]);
        if (cancelado) return;
        setPersona(p);
        setNoEncontrado(false);
        setVehiculos(v);
        setTabla(d);
        setViajes(vj);
        setEnvios(en);
        setSedes(s);
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
      persona
        ? documentosFlota(
            [],
            [{ id: persona.id, full_name: persona.nombre, license_category: persona.licenciaCategoria, license_expiry: persona.licenciaVence, medical_certificate_expiry: persona.examenVence }],
            hoy,
            tabla,
          )
        : [],
    [persona, hoy, tabla],
  );
  const fila = useMemo(() => (persona ? filasConductores([persona], vehiculos, resumenDocumentos(docsFlota))[0] : null), [persona, vehiculos, docsFlota]);
  const documentos = useMemo(() => (persona ? documentosDeDueno('conductor', persona.id, docsFlota, tabla) : []), [persona, docsFlota, tabla]);
  const peor = useMemo(() => peorDocumento(documentos.filter((d) => d.bloquea)), [documentos]);
  const enCurso = useMemo(() => viajeEnCurso(viajes), [viajes]);
  const vehiculoAsignado = useMemo(() => {
    const v = fila?.vehiculo ? vehiculos.find((x) => x.id === fila.vehiculo?.id) : undefined;
    if (!v) return null;
    const docsV = documentosFlota(
      [{ id: v.id, plate: v.plate, vehicle_type: v.vehicle_type, soat_expiry: v.soat_expiry ?? null, techno_expiry: v.techno_expiry ?? null, insurance_expiry: v.insurance_expiry ?? null, operating_card_expiry: v.operating_card_expiry ?? null }],
      [],
      hoy,
      tabla,
    );
    return filasVehiculos([v], persona ? [persona] : [], resumenDocumentos(docsV))[0];
  }, [fila, vehiculos, hoy, tabla, persona]);
  const placaDe = useMemo(() => new Map(vehiculos.map((v) => [v.id, v.plate])), [vehiculos]);

  // ── Textos ─────────────────────────────────────────────────────────────────
  const tipoTexto = (tipo: string) => (tTipos.has(tipo) ? tTipos(tipo) : tipo);
  const cargoTexto = (f: { cargo: string | null; externo: boolean }) => {
    const clave = claveCargo(f);
    return clave === CARGO_EXTERNO ? tc('externo') : clave === CARGO_SIN ? tp('sinCargo') : clave;
  };
  const documentoTexto = persona?.documento
    ? [persona.documentoTipo, /^\d+$/.test(persona.documento) ? entero(Number(persona.documento)) : persona.documento].filter(Boolean).join(' ')
    : null;
  const sede = persona?.sedeId ? sedes.find((s) => s.id === persona.sedeId)?.name ?? null : null;
  const siNo = (v: boolean) => (v ? tf('si') : tf('no'));
  const subtitulo = persona
    ? [cargoTexto(persona), documentoTexto, persona.vinculadoDesde ? t('vinculadoDesde', { fecha: formatPlain(persona.vinculadoDesde) }) : null, sede].filter(Boolean).join(' · ') || undefined
    : undefined;
  const licencia = fila?.licencia;
  const fichaRuta = rutaFicha(modulo, 'persona', id);

  // ── Acciones (las mismas de la lista) ──────────────────────────────────────
  const cambiarEstado = async (cid: string, activo: boolean) => {
    setGuardando(true);
    try {
      await transportService.updateDriver(cid, { is_active: activo });
      toastSuccess(activo ? tp('toast.activado') : tp('toast.desactivado'));
      setAEstado(false);
      recargar();
    } catch {
      toastError(tp('toast.errorEstado'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!persona) return;
    try {
      await transportService.deleteDriver(persona.id);
      toastSuccess(tp('toast.eliminado', { nombre: persona.nombre }));
      setAEliminar(false);
      router.push(rutas.conductores);
    } catch {
      toastError(tp('toast.errorEliminar'));
    }
  };

  const guardarDocumentoPersona = async (datos: DatosDocumento, archivo: File | null) => {
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

  const subirDocumento = (tipo: TipoDocumento = 'licencia') => persona && setDocumento({ inicial: { de: 'conductor', duenoId: persona.id, tipo } });
  const accionEditar: AccionFila = { id: 'editar', etiqueta: tp('acciones.editar'), icono: Pencil, onSelect: () => router.push(`${fichaRuta}/editar`) };
  const accionDocumento: AccionFila = { id: 'documento', etiqueta: tp('acciones.subirDocumento'), icono: FileUp, onSelect: () => subirDocumento() };
  const acciones: AccionFila[] = [
    { id: 'estado', etiqueta: persona?.activo ? tp('acciones.desactivar') : tp('acciones.activar'), icono: Power, onSelect: () => setAEstado(true) },
    { id: 'historial', etiqueta: tp('acciones.historial'), icono: History, onSelect: () => setHistorial(true) },
    { id: 'duplicar', etiqueta: tp('acciones.duplicar'), icono: Copy, onSelect: () => router.push(`${rutas.conductores}/nuevo?duplicar=${encodeURIComponent(id)}`), separadorAntes: true },
    { id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: recargar },
    { id: 'eliminar', etiqueta: tp('acciones.eliminar'), icono: Trash2, onSelect: () => setAEliminar(true), destructiva: true, separadorAntes: true },
  ];

  const migas = [{ etiqueta: tc(`migas.${modulo}`), href: rutas.inicio }, { etiqueta: tp('titulo'), href: rutas.conductores }, { etiqueta: persona?.nombre || t('cargando') }];

  if (noEncontrado || (carga === 'error' && !persona)) {
    return (
      <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
        <PageHeader titulo={tp('titulo')} migas={migas.slice(0, 2)} variante="form" volverA={rutas.conductores} />
        <div className="rounded-xl border border-line bg-surface">
          {noEncontrado ? (
            <EmptyState variante="search" titulo={t('noEncontrado.titulo')} descripcion={t('noEncontrado.descripcion')} accion={{ etiqueta: t('noEncontrado.volver'), href: rutas.conductores }} />
          ) : (
            <EmptyState variante="error" titulo={tf('errorCarga')} onReintentar={recargar} />
          )}
        </div>
      </div>
    );
  }

  const cargando = carga === 'cargando' && !persona;
  const pestanas = [
    { valor: 'resumen' as const, etiqueta: tf('pestanas.resumen') },
    { valor: 'documentos' as const, etiqueta: tf('pestanas.documentos'), contador: documentos.length },
    { valor: 'viajes' as const, etiqueta: tf('pestanas.viajes'), contador: viajes.length },
    ...(envios.total > 0 ? [{ valor: 'envios' as const, etiqueta: tf('pestanas.envios'), contador: envios.total }] : []),
    { valor: 'novedades' as const, etiqueta: tf('pestanas.novedades'), contador: novedadesAbiertas(novedades) || undefined },
  ];
  const pestana: PestanaFicha = pestanas.some((p) => p.valor === pestanaUrl) ? pestanaUrl : 'resumen';

  // Aviso del documento que manda si bloquea el despacho y está vencido o por vencer.
  const aviso =
    persona && peor.vence && peor.tipo && (peor.estado === 'vencido' || peor.estado === 'por_vencer') ? (
      <AvisoTonal
        tono={peor.estado === 'vencido' ? 'peligro' : 'advertencia'}
        rol={peor.estado === 'vencido' ? 'alert' : 'status'}
        titulo={
          peor.estado === 'vencido'
            ? t('aviso.vencidoTitulo', { documento: tipoDocumento(peor.tipo) })
            : t('aviso.porVencerTitulo', { documento: tipoDocumento(peor.tipo), count: peor.dias ?? 0 })
        }
        descripcion={t(peor.estado === 'vencido' ? 'aviso.vencidoDescripcion' : 'aviso.porVencerDescripcion', { fecha: formatPlain(peor.vence), nombre: persona.nombre || '—' })}
        accion={{ etiqueta: tp('acciones.subirDocumento'), onClick: () => subirDocumento(peor.tipo as TipoDocumento) }}
      />
    ) : null;

  const tarjetaDocumentos = (
    <TarjetaDocumentosFicha
      filas={documentos}
      titulo={t('documentos.titulo')}
      descripcion={t('documentos.descripcion')}
      columnaNumero="numeroEntidad"
      aviso={aviso}
      carga={carga}
      onSubir={() => subirDocumento()}
      onRenovar={(f) => subirDocumento(f.tipo as TipoDocumento)}
      onReintentar={recargar}
    />
  );
  const tarjetaViajes = (limite?: number) => (
    <TarjetaViajesFicha
      viajes={viajes}
      otro={{ columna: 'vehiculo', nombre: (v) => (v.vehicle_id ? placaDe.get(v.vehicle_id) ?? null : null) }}
      descripcion={limite ? tf('viajes.delMes', { count: viajesDelMes(viajes, hoy) }) : tf('viajes.ultimos', { n: entero(viajes.length) })}
      carga={carga}
      limite={limite}
      onVerTodos={() => setPestana('viajes')}
      onReportarNovedad={setNovedadDe}
      onReintentar={recargar}
      vacioDescripcion={persona && !persona.userId ? t('viajesSinUsuario') : undefined}
    />
  );
  const codigoViaje = new Map(viajes.map((v) => [v.id, v.trip_code]));
  const numeroEnvio = new Map(envios.envios.map((e) => [e.id, e.shipment_number]));
  const tarjetaNovedades = (limite?: number) => (
    <TarjetaNovedadesFicha
      novedades={novedades}
      descripcion={t('novedadesDescripcion')}
      referencia={(n) => (n.reference_type === 'trip' ? codigoViaje.get(n.reference_id ?? '') ?? null : numeroEnvio.get(n.reference_id ?? '') ?? null)}
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

  const datos = persona && (
    <Tarjeta titulo={t('datos.titulo')} icono={UserRound}>
      <ListaDatos etiqueta={t('datos.titulo')}>
        <FilaDato etiqueta={t('datos.documento')} valor={documentoTexto ?? '—'} />
        <FilaDato etiqueta={t('datos.telefono')} valor={persona.telefono ?? '—'} />
        <FilaDato etiqueta={t('datos.sangre')} valor={persona.sangre ?? '—'} />
        <FilaDato etiqueta={t('datos.emergencia')} valor={[persona.emergenciaNombre, persona.emergenciaTelefono].filter(Boolean).join(' · ') || '—'} />
        <FilaDato
          etiqueta={t('datos.categoria')}
          valor={persona.licenciaCategoria ? [persona.licenciaCategoria, tp.has(`categorias.${persona.licenciaCategoria}`) ? tp(`categorias.${persona.licenciaCategoria}`) : null].filter(Boolean).join(' · ') : '—'}
        />
        {persona.restricciones && <FilaDato etiqueta={t('datos.restricciones')} valor={persona.restricciones} />}
        <FilaDato etiqueta={t('datos.pasajeros')} valor={siNo(persona.certificadoPasajeros)} />
        <FilaDato etiqueta={t('datos.peligrosas')} valor={siNo(persona.mercanciasPeligrosas)} />
        {persona.tipoVehiculo && <FilaDato etiqueta={t('datos.tipoVehiculo')} valor={tipoTexto(persona.tipoVehiculo)} />}
        <FilaDato etiqueta={t('datos.cargo')} valor={cargoTexto(persona)} />
        <FilaDato etiqueta={t('datos.sede')} valor={sede ?? t('datos.todasLasSedes')} />
      </ListaDatos>
    </Tarjeta>
  );

  const vehiculo = persona && (
    <Tarjeta titulo={t('vehiculo.titulo')} icono={Bus}>
      {vehiculoAsignado ? (
        <ListaDatos etiqueta={t('vehiculo.titulo')}>
          <FilaDato
            etiqueta={t('vehiculo.vehiculo')}
            valor={`${vehiculoAsignado.placa} · ${tipoTexto(vehiculoAsignado.tipo)}`}
            href={rutaFicha(modulo, 'vehiculo', vehiculoAsignado.id)}
          />
          <FilaDato etiqueta={t('vehiculo.capacidad')} valor={capacidadDe(vehiculoAsignado) ?? '—'} />
          <FilaDato etiqueta={t('vehiculo.estado')} valor={tv(`estados.${vehiculoAsignado.estado}`)} />
          <FilaDato
            etiqueta={t('vehiculo.documentos')}
            valor={<StatusBadge estado={vehiculoAsignado.docs.estado} tono={TONO_DOCS[vehiculoAsignado.docs.estado]} etiqueta={tvd(`docs.${vehiculoAsignado.docs.estado}`)} />}
          />
        </ListaDatos>
      ) : (
        <EmptyState
          compacto
          icono={Bus}
          titulo={t('vehiculo.vacioTitulo')}
          descripcion={t('vehiculo.vacioDescripcion')}
          accion={{ etiqueta: t('vehiculo.irVehiculos'), href: rutas.vehiculos }}
        />
      )}
    </Tarjeta>
  );

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={persona?.nombre || t('cargando')}
        subtitulo={subtitulo}
        migas={migas}
        variante="form"
        volverA={rutas.conductores}
        cargando={cargando}
        acciones={
          persona && (
            <>
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={accionDocumento.onSelect}>
                <FileUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {accionDocumento.etiqueta}
              </button>
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={accionEditar.onSelect}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {accionEditar.etiqueta}
              </button>
              <RowActionsMenu orientacion="horizontal" tamano="md" titulo={persona.nombre || tp('titulo')} acciones={acciones} />
            </>
          )
        }
        movil={{ titulo: persona?.nombre || tp('titulo'), subtitulo: persona ? cargoTexto(persona) : undefined, menu: persona ? [accionEditar, accionDocumento, ...acciones] : [] }}
        debajo={
          persona && (
            <>
              {persona.activo ? (
                <StatusBadge estado="active" tono="exito" etiqueta={tp('estados.activo')} />
              ) : (
                <StatusBadge estado="inactive" tono="neutro" etiqueta={tp('estados.inactivo')} />
              )}
              <StatusBadge estado="cargo" tono="marca" apariencia="contorno" etiqueta={cargoTexto(persona)} />
              {licencia && (
                <StatusBadge
                  estado={licencia.estado}
                  tono={TONO_DOCS[licencia.estado]}
                  etiqueta={
                    licencia.vence
                      ? t(licencia.estado === 'vencido' ? 'licencia.vencio' : 'licencia.vence', { fecha: formatPlain(licencia.vence) })
                      : t('licencia.sin')
                  }
                />
              )}
              {enCurso && (
                <StatusBadge
                  estado={enCurso.status}
                  tono="informacion"
                  apariencia="contorno"
                  etiqueta={tf('enCurso', { codigo: enCurso.trip_code, estado: tf(`viajes.estados.${enCurso.status}`) })}
                />
              )}
            </>
          )
        }
      />

      <TabBar<PestanaFicha> id="ficha-persona" etiqueta={tf('pestanas.etiqueta')} valor={pestana} onValorChange={setPestana} pestanas={pestanas} />

      {pestana === 'resumen' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
          <div className="order-last flex min-w-0 flex-col gap-4 lg:order-none lg:gap-5">
            {tarjetaDocumentos}
            {tarjetaViajes(FILAS_RESUMEN)}
            {envios.total > 0 && tarjetaEnvios(FILAS_RESUMEN)}
            {tarjetaNovedades(FILAS_RESUMEN)}
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            {datos}
            {vehiculo}
          </div>
        </div>
      )}
      {pestana === 'documentos' && tarjetaDocumentos}
      {pestana === 'viajes' && tarjetaViajes()}
      {pestana === 'envios' && tarjetaEnvios()}
      {pestana === 'novedades' && tarjetaNovedades()}

      <DriverStatusDialog open={aEstado} onOpenChange={setAEstado} driver={persona?.credencial ?? null} onToggleStatus={cambiarEstado} isUpdating={guardando} />
      <HojaHistorial
        objetivo={historial && persona ? { de: 'persona', persona } : null}
        organizationId={organizationId}
        onCerrar={() => setHistorial(false)}
        nombreOtro={(v) => (v.vehicle_id ? placaDe.get(v.vehicle_id) ?? null : null)}
      />
      {documento && persona && (
        <DialogoDocumento
          vehiculos={[]}
          conductores={[{ id: persona.id, nombre: persona.nombre || '—' }]}
          inicial={documento.inicial}
          onCerrar={() => setDocumento(null)}
          onGuardar={guardarDocumentoPersona}
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
        titulo={tp('eliminar.titulo', { nombre: persona?.nombre ?? '' })}
        descripcion={tp('eliminar.descripcion')}
        textoConfirmar={tp('eliminar.confirmar')}
        textoCancelar={tc('cancelar')}
        tono="peligro"
        icono={Trash2}
        onConfirmar={() => void eliminar()}
      />
    </div>
  );
}
