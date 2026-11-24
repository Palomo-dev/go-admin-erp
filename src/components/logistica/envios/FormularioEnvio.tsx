'use client';

/**
 * Nuevo envío (`/app/logistica/envios/nuevo`, también «Duplicar» con `?duplicar=<id>`) y Editar
 * (`/app/logistica/envios/[id]/editar`). Figma «21 Logística», sección 12: nuevo 2963:8719 y editar
 * 2965:9202 (mismo formulario; según el estado se bloquean secciones y un aviso dice qué sí se
 * puede cambiar y dónde se hace lo demás).
 *
 * - El costo del envío sale del cálculo único de zonas (`useCotizacionDomicilio` →
 *   `logistica_cotizar_envio`, canal `manual`) y se decide con `decidirEnvioServidor`, la misma regla
 *   del pedido manual: el valor de la zona solo se cambia con permiso (lo resuelve el servidor).
 * - Con pedido de la tienda vinculado, el envío se crea por la ruta única del pedido
 *   (`createShipmentFromWebOrder`): destinatario, contenido, valor, costo y contraentrega salen del
 *   pedido, no de este formulario.
 * - Qué se puede editar lo decide `camposEditables` (envios.ts); el servicio vuelve a filtrar.
 * - Conserva lo que pedía el formulario viejo: remitente, flete, seguro, tipo de paquete, frágil,
 *   firma, líneas, notas y paradas de un viaje.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Lock, Package, Plus, Printer, Store, Trash2, Truck, UserRound } from 'lucide-react';
import {
  CampoFecha,
  CampoNumero,
  EmptyState,
  FilaDato,
  FormField,
  FormSection,
  ListaDatos,
  PageHeader,
  SelectorEntidad,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { PhoneInput, telefonoOpcionalValido } from '@/components/kit/PhoneInput';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { ElegirCliente, type ClienteDocumento } from '@/components/finanzas/documento/terceros';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { cn } from '@/utils/Utils';
import {
  actualizarEnvio,
  crearEnvio,
  leerEnvioEditable,
  opcionesEnvios,
  pedidosSinEnvio,
  type EnvioEditable,
  type OpcionesEnvios,
  type PedidoParaEnvio,
} from '@/lib/services/logistica/enviosService';
import {
  MODOS_ENTREGA,
  TIPOS_PAQUETE,
  camposEditables,
  etapaDeEnvio,
  faltanteFormulario,
  pesoDeLineas,
  valorDeLineas,
  type CampoEnvio,
  type DatosFormularioEnvio,
  type LineaPaquete,
  type ModoEntrega,
  type TipoPaquete,
} from '@/lib/logistica/envios';
import { canonicoDeEstado } from '@/lib/logistica/estadosEnvio';
import { cargoDeCotizacion, decidirEnvioServidor, estadoCotizacion, nombreZona } from '@/lib/logistica/presentacionEnvio';
import { RUTAS_LOGISTICA, rutaEnvio } from '@/lib/logistica/rutas';
import { useCotizacionDomicilio } from '../cotizar/useCotizacionDomicilio';
import { useImpresionLogistica } from '../useImpresionLogistica';

const claseCampo = 'h-10 border-line-strong bg-surface';

/** Las props del campo para un `<input>`/`<textarea>`: `idEtiqueta` es para `aria-labelledby`, no va al DOM. */
const control = ({ idEtiqueta: _idEtiqueta, ...resto }: { idEtiqueta: string; id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-required'?: boolean }) => resto;
const SIN_DOMICILIARIO = '__despues__';

let contadorLineas = 0;
const nuevaLinea = (): LineaPaquete => ({ clave: `n${++contadorLineas}`, id: null, descripcion: '', cantidad: 1, pesoKg: null, valor: null });

export function datosVacios(sedeId: number | null, remitente: string): DatosFormularioEnvio {
  return {
    pedidoWebId: null,
    sedeId,
    remitente,
    telefonoRemitente: '',
    clienteId: null,
    destinatario: '',
    telefono: '',
    direccion: '',
    barrio: '',
    ciudad: '',
    indicaciones: '',
    lineas: [nuevaLinea()],
    tipoPaquete: 'small_box',
    pesoKg: null,
    valorDeclarado: null,
    fragil: false,
    firma: false,
    modo: 'own',
    domiciliarioId: null,
    transportadoraId: null,
    guia: '',
    viajeId: null,
    paradaOrigenId: null,
    paradaDestinoId: null,
    promesa: null,
    costoEnvio: null,
    seguro: null,
    cobrarContraentrega: false,
    contraentrega: null,
    notas: '',
  };
}

/** «Duplicar»: el mismo destino y paquete, sin pedido, guía, domiciliario ni estado. */
export function datosParaDuplicar(e: EnvioEditable): DatosFormularioEnvio {
  return {
    ...e.datos,
    pedidoWebId: null,
    domiciliarioId: null,
    guia: '',
    promesa: null,
    lineas: e.datos.lineas.length > 0 ? e.datos.lineas.map((l) => ({ ...l, id: null, clave: `d${++contadorLineas}` })) : [nuevaLinea()],
  };
}

export interface FormularioEnvioProps {
  /** Envío a editar; sin él, es un envío nuevo. */
  id?: string;
  /** Envío a duplicar (solo en nuevo). */
  duplicarDe?: string | null;
}

export function FormularioEnvio({ id, duplicarDe }: FormularioEnvioProps) {
  const t = useTranslations('logistica.envios.form');
  const tEnvio = useTranslations('logistica.envio');
  const router = useRouter();
  const locale = useLocale();
  const moneda = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const { branches, selectedBranchId, branchFilter } = useBranch();
  const { getToday, formatDateTime, formatPlain } = useFormatDate();
  const { imprimirGuias } = useImpresionLogistica();
  const organizationId = getOrganizationId();
  const nuevo = !id;
  const simbolo = useMemo(() => {
    try {
      return new Intl.NumberFormat(moneda.locale, { style: 'currency', currency: moneda.code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? moneda.code;
    } catch {
      return moneda.code;
    }
  }, [moneda.locale, moneda.code]);

  const [original, setOriginal] = useState<EnvioEditable | null>(null);
  const [datos, setDatos] = useState<DatosFormularioEnvio>(() => datosVacios(branchFilter ?? selectedBranchId ?? null, ''));
  const [opciones, setOpciones] = useState<OpcionesEnvios | null>(null);
  const [pedido, setPedido] = useState<PedidoParaEnvio | null>(null);
  const [cliente, setCliente] = useState<ClienteDocumento | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_existe' | 'error'>(id || duplicarDe ? 'cargando' : 'listo');
  const [guardando, setGuardando] = useState<'guardar' | 'imprimir' | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [costoTocado, setCostoTocado] = useState(false);
  const [pesoTocado, setPesoTocado] = useState(false);
  const [valorTocado, setValorTocado] = useState(false);

  const poner = useCallback(<K extends keyof DatosFormularioEnvio>(k: K, v: DatosFormularioEnvio[K]) => setDatos((d) => ({ ...d, [k]: v })), []);

  // Remitente por defecto: la organización y la sede que despacha.
  useEffect(() => {
    if (!nuevo || duplicarDe || !organization?.name) return;
    const sede = branches.find((b) => b.id === datos.sedeId)?.name;
    setDatos((d) => (d.remitente ? d : { ...d, remitente: [organization.name, sede].filter(Boolean).join(' · '), telefonoRemitente: d.telefonoRemitente || organization.phone || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.name, branches.length]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    opcionesEnvios(supabase, organizationId)
      .then((o) => !cancelado && setOpciones(o))
      .catch(() => !cancelado && setOpciones({ domiciliarios: [], transportadoras: [], viajes: [], zonas: [], paradas: [] }));
    const cargar = id ?? duplicarDe;
    if (cargar) {
      leerEnvioEditable(supabase, organizationId, cargar)
        .then((e) => {
          if (cancelado) return;
          if (!e) return setEstado('no_existe');
          if (id) {
            setOriginal(e);
            setDatos(e.datos);
          } else {
            setDatos(datosParaDuplicar(e));
          }
          if (e.datos.clienteId) setCliente({ id: e.datos.clienteId, nombre: e.datos.destinatario || '—', telefono: e.datos.telefono || null });
          setCostoTocado(true);
          setPesoTocado(true);
          setValorTocado(true);
          setEstado('listo');
        })
        .catch(() => !cancelado && setEstado('error'));
    }
    return () => {
      cancelado = true;
    };
  }, [organizationId, id, duplicarDe]);

  const vinculado = nuevo ? !!datos.pedidoWebId : !!original?.sourceId;
  const editables = useMemo(() => camposEditables({ status: original?.status, vinculado, nuevo }), [original?.status, vinculado, nuevo]);
  const ed = (c: CampoEnvio) => editables.has(c);
  const etapa = original ? etapaDeEnvio(original.status) : 'nuevo';

  // Peso y valor declarado se sugieren con la suma de las líneas mientras no se escriban a mano.
  const pesoLineas = pesoDeLineas(datos.lineas);
  const valorLineas = valorDeLineas(datos.lineas);
  useEffect(() => {
    if (!pesoTocado && ed('peso')) poner('pesoKg', pesoLineas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pesoLineas, pesoTocado]);
  useEffect(() => {
    if (!valorTocado && ed('valorDeclarado')) poner('valorDeclarado', valorLineas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorLineas, valorTocado]);

  // ── Costo del envío: el cálculo único de zonas ─────────────────────────────
  // Solo el domicilio propio va por zonas; la transportadora y el viaje de Transporte llevan su propio flete.
  const cotizar = !vinculado && datos.modo === 'own' && ed('costo');
  const cot = useCotizacionDomicilio({
    activo: cotizar,
    branchId: datos.sedeId,
    canal: 'manual',
    subtotal: Number(datos.valorDeclarado) || 0,
    direccion: { ciudad: datos.ciudad || null, barrio: datos.barrio || null },
    pesoKg: datos.pesoKg,
  });
  const cargoZona = cargoDeCotizacion(cot.cotizacion);
  const estadoCot = estadoCotizacion(cot.cotizacion);
  const zonaFija = cotizar && (estadoCot === 'en_zona' || estadoCot === 'fuera_tarifa_general') && !cot.puedeEditarCargo;
  useEffect(() => {
    if (!cotizar) return;
    const precio = estadoCot === 'en_zona' || estadoCot === 'fuera_tarifa_general' ? cot.cotizacion?.precio ?? null : null;
    if (precio !== null && (!costoTocado || zonaFija)) poner('costoEnvio', precio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cot.cotizacion, cotizar]);
  const decision = cotizar ? decidirEnvioServidor({ cotizacion: cot.cotizacion, enviado: datos.costoEnvio, puedeEditar: cot.puedeEditarCargo }) : null;

  // Contraentrega por defecto: el valor declarado (lo que el domiciliario cobra al entregar).
  useEffect(() => {
    if (datos.cobrarContraentrega && datos.contraentrega === null && ed('contraentrega')) poner('contraentrega', datos.valorDeclarado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.cobrarContraentrega]);

  // ── Pedido vinculado ────────────────────────────────────────────────────────
  const elegirPedido = (p: PedidoParaEnvio) => {
    setPedido(p);
    setDatos((d) => ({
      ...d,
      pedidoWebId: p.id,
      destinatario: p.cliente ?? '',
      telefono: p.telefono ?? '',
      direccion: p.direccion ?? '',
      ciudad: p.ciudad ?? '',
      barrio: p.barrio ?? '',
      valorDeclarado: p.total,
    }));
  };
  const quitarPedido = () => {
    setPedido(null);
    setDatos((d) => ({ ...d, pedidoWebId: null }));
  };

  const elegirCliente = (c: ClienteDocumento) => {
    setCliente(c);
    setDatos((d) => ({ ...d, clienteId: c.id, destinatario: c.nombre, telefono: c.telefono || d.telefono }));
  };

  // ── Guardar ─────────────────────────────────────────────────────────────────
  const falta = faltanteFormulario(datos);
  const telefonoMalo = !datos.pedidoWebId && (!telefonoOpcionalValido(datos.telefono) || !telefonoOpcionalValido(datos.telefonoRemitente));
  const error = (campo: NonNullable<ReturnType<typeof faltanteFormulario>>) => (intentado && falta === campo ? t(`faltante.${campo}`) : null);

  const guardar = async (imprimir: boolean) => {
    setIntentado(true);
    if (falta || telefonoMalo) {
      toastError(t('revisa'), falta ? t(`faltante.${falta}`) : t('telefonoInvalido'));
      return;
    }
    if (decision && !decision.ok) {
      toastError(t('revisa'), t(`cotizacion.${decision.codigo}`));
      return;
    }
    setGuardando(imprimir ? 'imprimir' : 'guardar');
    const extra = {
      zonaId: decision?.ok && (decision.fuente === 'zona' || decision.fuente === 'editado') ? cot.cotizacion?.zona?.id ?? null : null,
      fuenteCosto: decision?.ok ? decision.fuente : null,
    };
    const listos = decision?.ok ? { ...datos, costoEnvio: decision.envio } : datos;
    try {
      const r = original ? await actualizarEnvio(original, listos, extra) : await crearEnvio(organizationId, listos, extra);
      toastSuccess(original ? t('okEditar') : t('okCrear'));
      if (r.asignacionFallida) toastError(t('asignacionFallida'));
      if (imprimir) await imprimirGuias([{ id: r.id, branchId: datos.sedeId }]);
      router.push(rutaEnvio(r.id));
    } catch (e) {
      toastError(t('errorGuardar'), e instanceof Error && e.message === 'PEDIDO_NO_ENCONTRADO' ? t('pedidoNoEncontrado') : undefined);
    } finally {
      setGuardando(null);
    }
  };

  const migas = [
    { etiqueta: t('migas.logistica'), href: RUTAS_LOGISTICA.porDespachar },
    { etiqueta: t('migas.envios'), href: RUTAS_LOGISTICA.envios },
    ...(original ? [{ etiqueta: original.numero, href: rutaEnvio(original.id) }] : []),
  ];
  const volverA = original ? rutaEnvio(original.id) : RUTAS_LOGISTICA.envios;

  if (estado === 'no_existe' || estado === 'error') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader variante="detail" titulo={nuevo ? t('tituloNuevo') : t('tituloEditarSin')} volverA={RUTAS_LOGISTICA.envios} migas={migas} />
        <EmptyState variante={estado === 'error' ? 'error' : undefined} icono={Package} titulo={estado === 'error' ? t('errorCarga') : t('noExiste')} accion={{ etiqueta: t('volver'), href: RUTAS_LOGISTICA.envios }} />
      </div>
    );
  }

  const sedeNombre = branches.find((b) => b.id === datos.sedeId)?.name ?? null;
  const subtitulo = original
    ? [tEnvio(`estados.${canonicoDeEstado(original.status) ?? 'created'}`), original.domiciliario ? t('loLleva', { nombre: original.domiciliario }) : null, t('creado', { fecha: formatDateTime(original.creado) })]
        .filter(Boolean)
        .join(' · ')
    : [t('subtituloNuevo'), sedeNombre].filter(Boolean).join(' · ');

  const ocupado = guardando !== null || estado === 'cargando';
  const botonGuardar = (ancho?: boolean) => (
    <button type="button" className={clasesBoton({ variante: 'primario', className: ancho ? 'w-full' : undefined })} onClick={() => void guardar(false)} disabled={ocupado} aria-busy={guardando === 'guardar' || undefined}>
      <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {original ? t('guardarCambios') : t('crear')}
    </button>
  );
  const botonImprimir = (ancho?: boolean) =>
    original ? null : (
      <button type="button" className={clasesBoton({ variante: 'secundario', className: ancho ? 'w-full' : undefined })} onClick={() => void guardar(true)} disabled={ocupado} aria-busy={guardando === 'imprimir' || undefined}>
        <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('crearImprimir')}
      </button>
    );

  const candado = (bloqueada: boolean) => (bloqueada ? <Lock aria-label={t('bloqueada')} className="size-4 text-fg-muted" strokeWidth={1.5} /> : undefined);
  const nombreDe = (lista: readonly { id: string; nombre: string }[] | undefined, valor: string | null) => (valor ? lista?.find((o) => o.id === valor)?.nombre ?? null : null);
  const numero = (v: number | null | undefined, max = 2) => (v == null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: max }).format(v));
  const lineasConTexto = datos.lineas.filter((l) => l.descripcion.trim()).length;
  const destinatarioBloqueado = !ed('direccion');
  const paqueteBloqueado = !ed('lineas') && !ed('peso');
  const selectOpcion = (valor: string | null, onCambio: (v: string | null) => void, lista: readonly { id: string; nombre: string; detalle?: string | null }[], placeholder: string, cp: { id: string; idEtiqueta: string }, deshabilitado: boolean, vacio?: string) => (
    <Select value={valor ?? (vacio ? SIN_DOMICILIARIO : undefined)} onValueChange={(v) => onCambio(v === SIN_DOMICILIARIO ? null : v)} disabled={deshabilitado}>
      <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {vacio && <SelectItem value={SIN_DOMICILIARIO}>{vacio}</SelectItem>}
        {lista.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {[o.nombre, o.detalle].filter(Boolean).join(' · ')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const ayudaCosto = vinculado
    ? t('costo.delPedido')
    : datos.modo !== 'own'
      ? t('costo.transportadora')
      : cot.estado === 'cargando'
        ? t('costo.calculando')
        : estadoCot === 'en_zona'
          ? t('costo.zona', { zona: nombreZona(cot.cotizacion) ?? '—' }) + (cot.puedeEditarCargo ? ` ${t('costo.conPermiso')}` : '')
          : estadoCot === 'sin_zonas' || estadoCot === null
            ? t('costo.libre')
            : t(`costo.${estadoCot}`);

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        variante="detail"
        titulo={original ? t('tituloEditar', { numero: original.numero }) : t('tituloNuevo')}
        icono={Truck}
        subtitulo={subtitulo}
        cargando={estado === 'cargando'}
        volverA={volverA}
        migas={migas}
        acciones={
          <>
            <Link href={volverA} className={clasesBoton({ variante: 'fantasma' })}>
              {t('cancelar')}
            </Link>
            {botonImprimir()}
            {botonGuardar()}
          </>
        }
      />

      {etapa === 'en_camino' && <AvisoTonal tono="advertencia" rol="status" titulo={t('aviso.enCamino')} />}
      {etapa === 'cerrado' && <AvisoTonal tono="informacion" rol="status" titulo={t('aviso.cerrado')} />}
      {duplicarDe && nuevo && estado === 'listo' && <AvisoTonal tono="informacion" compacto titulo={t('aviso.duplicado')} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5" aria-busy={estado === 'cargando' || undefined}>
          {/* 1 · Origen */}
          <FormSection titulo={t('origen.titulo')} descripcion={t('origen.descripcion')} icono={Store} columnas={2}>
            <FormField etiqueta={t('origen.pedido')} ayuda={nuevo ? t('origen.pedidoAyuda') : undefined}>
              {(cp) =>
                nuevo ? (
                  <SelectorEntidad<PedidoParaEnvio>
                    id={cp.id}
                    layout="campo"
                    etiqueta={t('origen.pedido')}
                    icono={Package}
                    valor={pedido}
                    aOpcion={(p) => ({ id: p.id, titulo: [p.numero, p.cliente, moneda.formatear(p.total)].filter(Boolean).join(' · '), subtitulo: [p.direccion, p.ciudad].filter(Boolean).join(', ') || null })}
                    buscar={(texto) => pedidosSinEnvio(supabase, organizationId, texto, datos.sedeId)}
                    onCambiar={elegirPedido}
                    onQuitar={quitarPedido}
                    textos={{ placeholder: t('origen.pedidoPlaceholder'), buscar: t('origen.pedidoBuscar'), vacio: t('origen.pedidoVacio'), sinResultados: t('origen.pedidoVacio') }}
                  />
                ) : (
                  <Input id={cp.id} value={original?.pedido ?? t('origen.sinPedido')} disabled className={claseCampo} />
                )
              }
            </FormField>
            <FormField etiqueta={t('origen.sede')} obligatorio error={error('sede')}>
              {(cp) =>
                selectOpcion(
                  datos.sedeId ? String(datos.sedeId) : null,
                  (v) => poner('sedeId', v ? Number(v) : null),
                  branches.map((b) => ({ id: String(b.id), nombre: b.name })),
                  t('elegir'),
                  cp,
                  !ed('sede'),
                )
              }
            </FormField>
            <FormField etiqueta={t('origen.remitente')}>
              {(cp) => <Input {...control(cp)} value={datos.remitente} onChange={(e) => poner('remitente', e.target.value)} disabled={!ed('remitente')} className={claseCampo} />}
            </FormField>
            <FormField etiqueta={t('origen.telefonoRemitente')}>
              {(cp) => <PhoneInput id={cp.id} value={datos.telefonoRemitente} onChange={(v) => poner('telefonoRemitente', v)} disabled={!ed('remitente')} />}
            </FormField>
          </FormSection>

          {/* 2 · Destinatario */}
          <FormSection
            titulo={t('destinatario.titulo')}
            descripcion={vinculado ? t('destinatario.delPedido') : t('destinatario.descripcion')}
            icono={UserRound}
            columnas={2}
            accion={candado(destinatarioBloqueado || vinculado)}
            className={cn((destinatarioBloqueado || vinculado) && 'opacity-80')}
          >
            <FormField etiqueta={t('destinatario.cliente')}>
              {(cp) => (
                <ElegirCliente
                  cliente={cliente}
                  sucursal={datos.sedeId}
                  layout="campo"
                  onCambiar={elegirCliente}
                  onQuitar={() => {
                    setCliente(null);
                    poner('clienteId', null);
                  }}
                  id={cp.id}
                  deshabilitado={!ed('cliente') || vinculado}
                />
              )}
            </FormField>
            <FormField etiqueta={t('destinatario.recibe')} obligatorio error={error('destinatario')}>
              {(cp) => <Input {...control(cp)} value={datos.destinatario} onChange={(e) => poner('destinatario', e.target.value)} disabled={!ed('cliente') || vinculado} className={claseCampo} autoComplete="off" />}
            </FormField>
            <FormField etiqueta={t('destinatario.telefono')} obligatorio error={error('telefono')}>
              {(cp) => <PhoneInput id={cp.id} value={datos.telefono} onChange={(v) => poner('telefono', v)} disabled={!ed('telefono') || vinculado} />}
            </FormField>
            <FormField etiqueta={t('destinatario.direccion')} obligatorio error={error('direccion')}>
              {(cp) => <Input {...control(cp)} value={datos.direccion} onChange={(e) => poner('direccion', e.target.value)} disabled={!ed('direccion') || vinculado} className={claseCampo} />}
            </FormField>
            <FormField
              etiqueta={t('destinatario.barrio')}
              ayuda={cotizar && estadoCot === 'en_zona' && cargoZona !== null ? t('destinatario.zona', { zona: nombreZona(cot.cotizacion) ?? '—', modo: tEnvio('modos.own'), precio: moneda.formatear(cargoZona) }) : undefined}
            >
              {(cp) => <Input {...control(cp)} value={datos.barrio} onChange={(e) => poner('barrio', e.target.value)} disabled={!ed('barrio') || vinculado} className={claseCampo} />}
            </FormField>
            <FormField etiqueta={t('destinatario.ciudad')} obligatorio error={error('ciudad')}>
              {(cp) => <Input {...control(cp)} value={datos.ciudad} onChange={(e) => poner('ciudad', e.target.value)} disabled={!ed('ciudad') || vinculado} className={claseCampo} />}
            </FormField>
            <FormField etiqueta={t('destinatario.indicaciones')} className="md:col-span-2">
              {(cp) => <Input {...control(cp)} value={datos.indicaciones} onChange={(e) => poner('indicaciones', e.target.value)} disabled={!ed('indicaciones') || vinculado} className={claseCampo} />}
            </FormField>
          </FormSection>

          {/* 3 · Paquete */}
          <FormSection
            titulo={t('paquete.titulo')}
            descripcion={vinculado ? t('paquete.delPedido') : t('paquete.descripcion')}
            icono={Package}
            columnas={1}
            accion={candado(paqueteBloqueado)}
            className={cn(paqueteBloqueado && 'opacity-80')}
          >
            {!vinculado && (
              <div className="flex flex-col gap-2">
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-surface-muted text-xs text-fg-secondary">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">{t('paquete.contenido')}</th>
                        <th className="w-24 px-3 py-2 text-left font-medium">{t('paquete.cantidad')}</th>
                        <th className="w-28 px-3 py-2 text-left font-medium">{t('paquete.peso')}</th>
                        <th className="w-36 px-3 py-2 text-left font-medium">{t('paquete.valor')}</th>
                        <th className="w-10 px-2 py-2">
                          <span className="sr-only">{t('paquete.quitar')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.lineas.map((linea, i) => {
                        const cambiar = (cambio: Partial<LineaPaquete>) => poner('lineas', datos.lineas.map((x) => (x.clave === linea.clave ? { ...x, ...cambio } : x)));
                        return (
                          <tr key={linea.clave} className="border-t border-line">
                            <td className="px-2 py-1.5">
                              <Input
                                aria-label={t('paquete.contenidoN', { n: i + 1 })}
                                value={linea.descripcion}
                                onChange={(e) => cambiar({ descripcion: e.target.value })}
                                disabled={!ed('lineas')}
                                className="h-9 border-line-strong bg-surface"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <CampoNumero aria-label={t('paquete.cantidadN', { n: i + 1 })} valor={linea.cantidad} onValorChange={(v) => cambiar({ cantidad: v ?? 1 })} decimales={0} minimo={1} tamano="sm" disabled={!ed('lineas')} />
                            </td>
                            <td className="px-2 py-1.5">
                              <CampoNumero aria-label={t('paquete.pesoN', { n: i + 1 })} valor={linea.pesoKg} onValorChange={(v) => cambiar({ pesoKg: v })} decimales={3} minimo={0} tamano="sm" disabled={!ed('lineas')} />
                            </td>
                            <td className="px-2 py-1.5">
                              <CampoNumero aria-label={t('paquete.valorN', { n: i + 1 })} valor={linea.valor} onValorChange={(v) => cambiar({ valor: v })} decimales={0} minimo={0} tamano="sm" disabled={!ed('lineas')} />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'w-8 px-0' })}
                                aria-label={t('paquete.quitarN', { n: i + 1 })}
                                onClick={() => poner('lineas', datos.lineas.length > 1 ? datos.lineas.filter((x) => x.clave !== linea.clave) : [nuevaLinea()])}
                                disabled={!ed('lineas')}
                              >
                                <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {ed('lineas') && (
                  <button type="button" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-link hover:underline" onClick={() => poner('lineas', [...datos.lineas, nuevaLinea()])}>
                    <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {t('paquete.agregar')}
                  </button>
                )}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              <FormField etiqueta={t('paquete.tipo')}>
                {(cp) => (
                  <Select value={datos.tipoPaquete} onValueChange={(v) => poner('tipoPaquete', v as TipoPaquete)} disabled={!ed('tipoPaquete')}>
                    <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_PAQUETE.map((p) => (
                        <SelectItem key={p} value={p}>
                          {t(`paquete.tipos.${p}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('paquete.pesoTotal')} ayuda={t('paquete.pesoTotalAyuda')}>
                {(cp) => (
                  <CampoNumero
                    id={cp.id}
                    aria-labelledby={cp.idEtiqueta}
                    valor={datos.pesoKg}
                    onValorChange={(v) => {
                      setPesoTocado(true);
                      poner('pesoKg', v);
                    }}
                    decimales={3}
                    minimo={0}
                    alinear="izquierda"
                    sufijo="kg"
                    disabled={!ed('peso')}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('paquete.valorDeclarado')} ayuda={t('paquete.valorDeclaradoAyuda')}>
                {(cp) => (
                  <CampoNumero
                    id={cp.id}
                    aria-labelledby={cp.idEtiqueta}
                    valor={datos.valorDeclarado}
                    onValorChange={(v) => {
                      setValorTocado(true);
                      poner('valorDeclarado', v);
                    }}
                    decimales={0}
                    minimo={0}
                    alinear="izquierda"
                    prefijo={simbolo}
                    disabled={!ed('valorDeclarado')}
                  />
                )}
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {(
                [
                  ['fragil', datos.fragil, (v: boolean) => poner('fragil', v), ed('fragil')],
                  ['firma', datos.firma, (v: boolean) => poner('firma', v), ed('firma')],
                ] as const
              ).map(([clave, valor, cambiar, habilitado]) => (
                <label key={clave} className="flex items-start gap-3 text-sm">
                  <Switch checked={valor} onCheckedChange={cambiar} disabled={!habilitado} aria-label={t(`paquete.${clave}`)} />
                  <span>
                    <span className="block font-medium text-fg">{t(`paquete.${clave}`)}</span>
                    <span className="block text-xs text-fg-muted">{t(`paquete.${clave}Ayuda`)}</span>
                  </span>
                </label>
              ))}
              <div className="flex items-start gap-3 text-sm">
                <Switch checked={datos.modo !== 'national_carrier' && (vinculado || (datos.cobrarContraentrega && Number(datos.contraentrega) > 0))} disabled aria-label={t('paquete.codigo')} />
                <span>
                  <span className="block font-medium text-fg">{t('paquete.codigo')}</span>
                  <span className="block text-xs text-fg-muted">{t('paquete.codigoAyuda')}</span>
                </span>
              </div>
            </div>
          </FormSection>

          {/* 4 · Entrega y cobro */}
          <FormSection titulo={t('entrega.titulo')} descripcion={t('entrega.descripcion')} icono={Truck} columnas={2}>
            <FormField etiqueta={t('entrega.modo')} obligatorio ayuda={t('entrega.modoAyuda')}>
              {(cp) => (
                <Select value={datos.modo} onValueChange={(v) => poner('modo', v as ModoEntrega)} disabled={!ed('modo') || vinculado}>
                  <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODOS_ENTREGA.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`entrega.modos.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            {datos.modo === 'national_carrier' ? (
              <FormField etiqueta={t('entrega.transportadora')} obligatorio error={error('transportadora')} ayuda={(opciones?.transportadoras.length ?? 0) === 0 ? t('entrega.sinTransportadoras') : undefined}>
                {(cp) => selectOpcion(datos.transportadoraId, (v) => poner('transportadoraId', v), opciones?.transportadoras ?? [], t('elegir'), cp, !ed('modo'))}
              </FormField>
            ) : (
              <FormField etiqueta={t('entrega.domiciliario')} ayuda={t('entrega.domiciliarioAyuda')}>
                {(cp) => selectOpcion(datos.domiciliarioId, (v) => poner('domiciliarioId', v), opciones?.domiciliarios ?? [], t('elegir'), cp, !ed('domiciliario'), t('entrega.asignarDespues'))}
              </FormField>
            )}
            {datos.modo === 'national_carrier' && (
              <FormField etiqueta={t('entrega.guia')} ayuda={t('entrega.guiaAyuda')}>
                {(cp) => <Input {...control(cp)} value={datos.guia} onChange={(e) => poner('guia', e.target.value)} disabled={!ed('guia')} className={claseCampo} />}
              </FormField>
            )}
            {datos.modo === 'viaje' && (
              <>
                <FormField etiqueta={t('entrega.viaje')} obligatorio error={error('viaje')} ayuda={(opciones?.viajes.length ?? 0) === 0 ? t('entrega.sinViajes') : undefined}>
                  {(cp) => selectOpcion(datos.viajeId, (v) => poner('viajeId', v), opciones?.viajes ?? [], t('elegir'), cp, !ed('viaje'))}
                </FormField>
                <FormField etiqueta={t('entrega.paradaOrigen')}>
                  {(cp) => selectOpcion(datos.paradaOrigenId, (v) => poner('paradaOrigenId', v), opciones?.paradas ?? [], t('elegir'), cp, !ed('viaje'), t('entrega.sinParada'))}
                </FormField>
                <FormField etiqueta={t('entrega.paradaDestino')}>
                  {(cp) => selectOpcion(datos.paradaDestinoId, (v) => poner('paradaDestinoId', v), opciones?.paradas ?? [], t('elegir'), cp, !ed('viaje'), t('entrega.sinParada'))}
                </FormField>
              </>
            )}
            <FormField etiqueta={t('entrega.promesa')} ayuda={t('entrega.promesaAyuda')}>
              {(cp) => <CampoFecha id={cp.id} aria-labelledby={cp.idEtiqueta} valor={datos.promesa} onValorChange={(v) => poner('promesa', v || null)} hoy={getToday()} min={nuevo ? getToday() : undefined} limpiable disabled={!ed('promesa')} />}
            </FormField>
            <FormField etiqueta={t('entrega.costo')} ayuda={ayudaCosto}>
              {(cp) => (
                <CampoNumero
                  id={cp.id}
                  aria-labelledby={cp.idEtiqueta}
                  valor={vinculado ? null : datos.costoEnvio}
                  onValorChange={(v) => {
                    setCostoTocado(true);
                    poner('costoEnvio', v);
                  }}
                  decimales={0}
                  minimo={0}
                  alinear="izquierda"
                  prefijo={simbolo}
                  placeholder={vinculado ? t('costo.delPedidoCorto') : undefined}
                  disabled={!ed('costo') || vinculado || zonaFija}
                />
              )}
            </FormField>
            <FormField etiqueta={t('entrega.seguro')}>
              {(cp) => (
                <CampoNumero id={cp.id} aria-labelledby={cp.idEtiqueta} valor={datos.seguro} onValorChange={(v) => poner('seguro', v)} decimales={0} minimo={0} alinear="izquierda" prefijo={simbolo} disabled={!ed('seguro') || vinculado} />
              )}
            </FormField>
            <div className="flex flex-col gap-3 md:col-span-2">
              <label className="flex items-start gap-3 text-sm">
                <Switch checked={vinculado ? false : datos.cobrarContraentrega} onCheckedChange={(v) => poner('cobrarContraentrega', v)} disabled={!ed('contraentrega') || vinculado} aria-label={t('entrega.cobrar')} />
                <span>
                  <span className="block font-medium text-fg">{t('entrega.cobrar')}</span>
                  <span className="block text-xs text-fg-muted">
                    {vinculado
                      ? t('entrega.cobrarDelPedido')
                      : datos.cobrarContraentrega && Number(datos.contraentrega) > 0
                        ? t('entrega.cobrarDetalle', { monto: moneda.formatear(Number(datos.contraentrega)) })
                        : t('entrega.cobrarAyuda')}
                  </span>
                </span>
              </label>
              {!vinculado && datos.cobrarContraentrega && (
                <FormField etiqueta={t('entrega.montoCobrar')} obligatorio error={error('contraentrega')} className="md:max-w-xs">
                  {(cp) => (
                    <CampoNumero id={cp.id} aria-labelledby={cp.idEtiqueta} valor={datos.contraentrega} onValorChange={(v) => poner('contraentrega', v)} decimales={0} minimo={0} alinear="izquierda" prefijo={simbolo} disabled={!ed('contraentrega')} />
                  )}
                </FormField>
              )}
            </div>
            <FormField etiqueta={t('entrega.notas')} className="md:col-span-2">
              {(cp) => <Textarea {...control(cp)} value={datos.notas} onChange={(e) => poner('notas', e.target.value)} rows={2} disabled={!ed('notas')} className="border-line-strong bg-surface" />}
            </FormField>
          </FormSection>
        </div>

        {/* Resumen */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Tarjeta titulo={t('resumen.titulo')}>
            <ListaDatos>
              <FilaDato etiqueta={t('resumen.destino')} valor={[datos.barrio || datos.ciudad || null, cotizar ? nombreZona(cot.cotizacion) : null].filter(Boolean).join(' · ') || '—'} />
              <FilaDato
                etiqueta={t('resumen.modo')}
                valor={datos.modo === 'national_carrier' ? nombreDe(opciones?.transportadoras, datos.transportadoraId) ?? t('entrega.modos.national_carrier') : t(`entrega.modos.${datos.modo}`)}
              />
              <FilaDato etiqueta={t('resumen.promesa')} valor={datos.promesa ? formatPlain(datos.promesa) : cot.cotizacion?.tiempo?.texto ?? '—'} />
              <FilaDato etiqueta={t('resumen.peso')} valor={vinculado ? '—' : t('resumen.pesoValor', { kg: numero(datos.pesoKg), n: lineasConTexto })} />
              <FilaDato etiqueta={t('resumen.costo')} valor={vinculado ? t('costo.delPedidoCorto') : moneda.formatear(Number(decision?.ok ? decision.envio : datos.costoEnvio) || 0)} separadorAntes />
              <FilaDato
                etiqueta={t('resumen.contraentrega')}
                valor={vinculado ? (pedido?.pagado ? t('resumen.pagado') : t('costo.delPedidoCorto')) : datos.cobrarContraentrega ? moneda.formatear(Number(datos.contraentrega) || 0) : t('resumen.sinCobro')}
                tono="fuerte"
              />
            </ListaDatos>
            <p className="mt-3 rounded-lg bg-brand-tint p-3 text-xs text-brand">{original ? t('resumen.notaEditar') : t('resumen.notaNuevo')}</p>
            <div className="mt-3 flex flex-col gap-2">
              {botonGuardar(true)}
              {botonImprimir(true)}
            </div>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
