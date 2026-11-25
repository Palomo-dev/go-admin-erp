'use client';

/**
 * Diálogos de Logística › Envíos (Figma «21 Logística», sección 12): cambiar estado de varios
 * 2965:9890, devolver a la sede 2965:9958, cancelar envío 2965:10022 e imprimir guías (diálogo
 * 3226:15989 con el rótulo estándar de la sección 3223:15627).
 * Los usan la lista y el detalle del envío.
 *
 * Todo cambio de estado va por `logistica_cambiar_estado` (`deliveryIntegrationService.changeStatus`)
 * envío por envío: «solo pasan los que pueden» según la tabla canónica de transiciones, y uno que
 * falla no deshace a los demás. El dinero no se mueve aquí: la devolución del dinero y el reingreso
 * de la mercancía se registran en el pedido (POS › Devoluciones), que es la ruta única del kardex.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, ChevronLeft, ChevronRight, Printer, RefreshCw, RotateCcw } from 'lucide-react';
import { normalizePaperWidth } from '@printing';
import { CampoNumero, Dialogo, FormField, SegmentedControl, SettingRow, TarjetaSeleccionable } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import { canonicoDeEstado, MOTIVOS_NOVEDAD, type MotivoNovedad } from '@/lib/logistica/estadosEnvio';
import { camposEditables, ESTADOS_CAMBIO_ESTADO, particionPorTransicion, type EstadoCambioEstado } from '@/lib/logistica/envios';
import { avisarCliente } from '../logisticaApi';
import { abrirConfiguracion } from '@/components/configuracion/dialogo/abrirConfiguracion';
import { HojaRotulosA4 } from '../rotulo/HojaRotulosA4';
import { RotuloEnvio } from '../rotulo/RotuloEnvio';
import { formatoInicialRotulo, hayTermicaEnLinea, leerFormatoRecordado, recordarFormato, type EstacionRotulos } from '../rotulo/trabajoRotulos';
import { useImpresionLogistica, type RotuloListo } from '../useImpresionLogistica';
import { hojasA4, ROTULOS_POR_HOJA, type DatosRotulo, type FormatoRotulo } from '@/lib/logistica/rotuloEnvio';

const claseCampo = 'h-10 border-line-strong bg-surface';

/** Las props del campo para un `<input>`/`<textarea>`: `idEtiqueta` es para `aria-labelledby`, no va al DOM. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- se separa a propósito para no pasarlo al DOM.
const control = ({ idEtiqueta: _idEtiqueta, ...resto }: { idEtiqueta: string; id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-required'?: boolean }) => resto;

/** Lo que un diálogo necesita de cada envío (lo cumplen la fila de Envíos y la del detalle). */
export interface EnvioEnDialogo {
  id: string;
  numero: string;
  status: string;
  pedido: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  pagado?: boolean;
  sede?: string | null;
}

/** «ENV-0712, ENV-0715 y ENV-0718» (con «y N más» si son muchos). */
function useListaNumeros() {
  const t = useTranslations('logistica.envios.dialogos');
  return (numeros: readonly string[], max = 3) => {
    if (numeros.length === 0) return '';
    const vistos = numeros.slice(0, max);
    const resto = numeros.length - vistos.length;
    if (resto > 0) return t('lista.mas', { lista: vistos.join(', '), n: resto });
    if (vistos.length === 1) return vistos[0];
    return t('lista.y', { lista: vistos.slice(0, -1).join(', '), ultimo: vistos[vistos.length - 1] });
  };
}

function useEstadoTexto() {
  const tEnvio = useTranslations('logistica.envio');
  return (estado: string) => {
    const c = canonicoDeEstado(estado);
    return c ? tEnvio(`estados.${c}`) : estado;
  };
}

/** Cambia el estado de una lista, uno por uno, y cuenta. */
async function cambiarVarios(
  envios: readonly EnvioEnDialogo[],
  estado: 'ready_for_pickup' | 'picked' | 'in_transit' | 'out_for_delivery' | 'returned' | 'cancelled',
  nota: string | null,
  avisar: boolean,
): Promise<{ ok: number; primerError: string | null }> {
  let ok = 0;
  let primerError: string | null = null;
  for (const e of envios) {
    try {
      const r = await deliveryIntegrationService.changeStatus(e.id, estado, { nota: nota ?? undefined });
      ok += 1;
      // «listo» sale siempre (como en Pedidos online); «en camino», según la casilla del diálogo.
      if ((avisar || r.aviso === 'listo') && r.aviso && e.sourceType && e.sourceId) void avisarCliente({ source_type: e.sourceType, source_id: e.sourceId }, r.aviso);
    } catch (err) {
      primerError ??= err instanceof EnvioError ? err.codigo : 'ERROR';
    }
  }
  return { ok, primerError };
}

function useMensajeError() {
  const t = useTranslations('logistica.envio');
  return (codigo: string) => (t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.ERROR'));
}

// ── Cambiar estado de varios (2965:9890) ───────────────────────────────────────

export interface DialogoCambiarEstadoProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  envios: readonly EnvioEnDialogo[];
  onHecho: () => void;
}

export function DialogoCambiarEstado({ abierto, onAbiertoChange, envios, onHecho }: DialogoCambiarEstadoProps) {
  const t = useTranslations('logistica.envios.dialogos.estado');
  const lista = useListaNumeros();
  const estadoTexto = useEstadoTexto();
  const mensajeError = useMensajeError();
  const sugerido = useMemo<EstadoCambioEstado>(
    () => ESTADOS_CAMBIO_ESTADO.find((e) => particionPorTransicion(envios, e).pueden.length > 0) ?? 'out_for_delivery',
    [envios],
  );
  const [estado, setEstado] = useState<EstadoCambioEstado>(sugerido);
  const [nota, setNota] = useState('');
  const [avisar, setAvisar] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setEstado(sugerido);
    setNota('');
    setAvisar(true);
  }, [abierto, sugerido]);

  const { pueden, noPueden } = particionPorTransicion(envios, estado);
  const conAviso = estado === 'out_for_delivery' && pueden.some((e) => e.sourceType === 'web_order');

  const confirmar = async () => {
    if (pueden.length === 0) return;
    setEnviando(true);
    const r = await cambiarVarios(pueden, estado, nota.trim() || null, conAviso && avisar);
    setEnviando(false);
    if (r.ok > 0) toastSuccess(t('ok', { count: r.ok, estado: estadoTexto(estado) }));
    if (r.primerError) toastError(t('error'), mensajeError(r.primerError));
    onAbiertoChange(false);
    onHecho();
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={envios.length === 1 ? t('tituloUno', { numero: envios[0].numero }) : t('titulo', { count: envios.length })}
      descripcion={t('descripcion')}
      icono={RefreshCw}
      ancho={520}
      primario={{
        etiqueta: t('confirmar', { count: pueden.length }),
        onClick: () => void confirmar(),
        cargando: enviando,
        deshabilitada: pueden.length === 0,
        motivo: t('nadiePuede'),
      }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('nuevoEstado')} obligatorio>
          {(cp) => (
            <Select value={estado} onValueChange={(v) => setEstado(v as EstadoCambioEstado)}>
              <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_CAMBIO_ESTADO.map((e) => (
                  <SelectItem key={e} value={e}>
                    {estadoTexto(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div className="flex flex-col gap-2 rounded-lg bg-surface-muted p-3 text-sm" aria-live="polite">
          {pueden.length > 0 && (
            <p className="font-medium text-fg" data-testid="pueden">
              {t('pueden', { count: pueden.length, estado: estadoTexto(estado), lista: lista(pueden.map((e) => e.numero)) })}
            </p>
          )}
          {noPueden.length > 0 && (
            <p className="text-fg-secondary" data-testid="no-pueden">
              {t('noPueden', {
                count: noPueden.length,
                lista: lista(noPueden.map((e) => t('envioEnEstado', { numero: e.numero, estado: estadoTexto(e.status) })), 4),
              })}
            </p>
          )}
        </div>
        <FormField etiqueta={t('nota')}>
          {(cp) => <Textarea {...control(cp)} value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="border-line-strong bg-surface" />}
        </FormField>
        {conAviso && (
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={avisar} onCheckedChange={setAvisar} aria-label={t('avisar')} />
            <span>
              <span className="block font-medium text-fg">{t('avisar')}</span>
              <span className="block text-xs text-fg-muted">{t('avisarAyuda')}</span>
            </span>
          </label>
        )}
      </div>
    </Dialogo>
  );
}

// ── Devolver a la sede (2965:9958) ─────────────────────────────────────────────

export const DESTINOS_DEVOLUCION = ['reingreso', 'merma'] as const;
export type DestinoDevolucion = (typeof DESTINOS_DEVOLUCION)[number];

export interface DialogoDevolverProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  envios: readonly EnvioEnDialogo[];
  onHecho: () => void;
}

export function DialogoDevolver({ abierto, onAbiertoChange, envios, onHecho }: DialogoDevolverProps) {
  const t = useTranslations('logistica.envios.dialogos.devolver');
  const tEnvio = useTranslations('logistica.envio');
  const lista = useListaNumeros();
  const estadoTexto = useEstadoTexto();
  const mensajeError = useMensajeError();
  const [motivo, setMotivo] = useState<MotivoNovedad | null>(null);
  const [destino, setDestino] = useState<DestinoDevolucion>('reingreso');
  const [nota, setNota] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setMotivo(null);
    setDestino('reingreso');
    setNota('');
    setIntentado(false);
  }, [abierto]);

  const { pueden, noPueden } = particionPorTransicion(envios, 'returned');
  const pagados = pueden.filter((e) => e.pagado && e.pedido);
  const sede = envios[0]?.sede ?? null;

  const confirmar = async () => {
    setIntentado(true);
    if (!motivo || pueden.length === 0) return;
    setEnviando(true);
    const partes = [t('notaMotivo', { motivo: tEnvio(`motivos.${motivo}`) }), t(`notaDestino.${destino}`), nota.trim() || null].filter(Boolean);
    const r = await cambiarVarios(pueden, 'returned', partes.join(' · '), false);
    setEnviando(false);
    if (r.ok > 0) toastSuccess(t('ok', { count: r.ok }));
    if (r.primerError) toastError(t('error'), mensajeError(r.primerError));
    onAbiertoChange(false);
    onHecho();
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={envios.length === 1 ? t('tituloUno', { numero: envios[0].numero }) : t('titulo', { count: envios.length })}
      descripcion={t('descripcion')}
      icono={RotateCcw}
      ancho={520}
      primario={{ etiqueta: t('confirmar'), onClick: () => void confirmar(), cargando: enviando, deshabilitada: pueden.length === 0, motivo: t('nadiePuede') }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('motivo')} obligatorio error={intentado && !motivo ? t('faltaMotivo') : null}>
          {(cp) => (
            <Select value={motivo ?? undefined} onValueChange={(v) => setMotivo(v as MotivoNovedad)}>
              <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
                <SelectValue placeholder={t('elegir')} />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_NOVEDAD.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tEnvio(`motivos.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-fg">{t('productos')}</legend>
          <div role="radiogroup" aria-label={t('productos')} className="flex flex-col gap-2">
            {DESTINOS_DEVOLUCION.map((d) => (
              <TarjetaSeleccionable
                key={d}
                orientacion="horizontal"
                titulo={d === 'reingreso' ? (sede ? t('reingresoSede', { sede }) : t('reingreso')) : t('merma')}
                descripcion={t(`${d}Detalle`)}
                seleccionada={destino === d}
                onSeleccionar={() => setDestino(d)}
              />
            ))}
          </div>
        </fieldset>
        {pagados.length > 0 && (
          <AvisoTonal tono="informacion" compacto titulo={t('pagado', { count: pagados.length, pedido: lista(pagados.map((e) => e.pedido as string)) })} />
        )}
        {noPueden.length > 0 && (
          <AvisoTonal
            tono="advertencia"
            compacto
            titulo={t('noPueden', { count: noPueden.length, lista: lista(noPueden.map((e) => `${e.numero} (${estadoTexto(e.status)})`), 4) })}
          />
        )}
        <FormField etiqueta={t('nota')}>
          {(cp) => <Textarea {...control(cp)} value={nota} onChange={(e) => setNota(e.target.value)} rows={2} className="border-line-strong bg-surface" />}
        </FormField>
      </div>
    </Dialogo>
  );
}

// ── Cancelar envío (2965:10022) ────────────────────────────────────────────────

export const MOTIVOS_CANCELACION = ['cliente_desiste', 'pedido_anulado', 'direccion_invalida', 'duplicado', 'sin_existencias', 'otro'] as const;
export type MotivoCancelacion = (typeof MOTIVOS_CANCELACION)[number];

export interface DialogoCancelarProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  envios: readonly EnvioEnDialogo[];
  onHecho: () => void;
}

export function DialogoCancelar({ abierto, onAbiertoChange, envios, onHecho }: DialogoCancelarProps) {
  const t = useTranslations('logistica.envios.dialogos.cancelar');
  const lista = useListaNumeros();
  const estadoTexto = useEstadoTexto();
  const mensajeError = useMensajeError();
  const [motivo, setMotivo] = useState<MotivoCancelacion | null>(null);
  const [detalle, setDetalle] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setMotivo(null);
    setDetalle('');
    setIntentado(false);
  }, [abierto]);

  const { pueden, noPueden } = particionPorTransicion(envios, 'cancelled');
  const conPedido = pueden.filter((e) => e.pedido && e.sourceId);
  const falta = !motivo ? 'motivo' : motivo === 'otro' && detalle.trim().length < 3 ? 'detalle' : null;

  const confirmar = async () => {
    setIntentado(true);
    if (falta || !motivo || pueden.length === 0) return;
    setEnviando(true);
    const nota = [t(`motivos.${motivo}`), detalle.trim() || null].filter(Boolean).join(' · ');
    const r = await cambiarVarios(pueden, 'cancelled', nota, false);
    setEnviando(false);
    if (r.ok > 0) toastSuccess(t('ok', { count: r.ok }));
    if (r.primerError) toastError(t('error'), mensajeError(r.primerError));
    onAbiertoChange(false);
    onHecho();
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={envios.length === 1 ? t('tituloUno', { numero: envios[0].numero }) : t('titulo', { count: envios.length })}
      descripcion={t('descripcion')}
      icono={Ban}
      ancho={520}
      primario={{
        etiqueta: envios.length === 1 ? t('confirmarUno') : t('confirmar', { count: pueden.length }),
        onClick: () => void confirmar(),
        cargando: enviando,
        destructiva: true,
        deshabilitada: pueden.length === 0,
        motivo: t('nadiePuede'),
      }}
      textoCancelar={t('volver')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('motivo')} obligatorio error={intentado && falta === 'motivo' ? t('faltaMotivo') : null}>
          {(cp) => (
            <Select value={motivo ?? undefined} onValueChange={(v) => setMotivo(v as MotivoCancelacion)}>
              <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className={claseCampo}>
                <SelectValue placeholder={t('elegir')} />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_CANCELACION.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`motivos.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {motivo === 'otro' && (
          <FormField etiqueta={t('detalle')} obligatorio error={intentado && falta === 'detalle' ? t('faltaDetalle') : null}>
            {(cp) => <Textarea {...control(cp)} value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} className="border-line-strong bg-surface" />}
          </FormField>
        )}
        {conPedido.length > 0 && (
          <AvisoTonal tono="advertencia" compacto titulo={t('pedidoActivo', { count: conPedido.length, pedido: lista(conPedido.map((e) => e.pedido as string)) })} />
        )}
        {noPueden.length > 0 && (
          <AvisoTonal tono="informacion" compacto titulo={t('noPueden', { count: noPueden.length, lista: lista(noPueden.map((e) => `${e.numero} (${estadoTexto(e.status)})`), 4) })} />
        )}
      </div>
    </Dialogo>
  );
}

// ── Imprimir guías (Figma «21 Logística» 3226:15989) ──────────────────────────

export interface EnvioParaGuia extends EnvioEnDialogo {
  /** Sede del envío: decide la impresora de rótulos y el formato recordado. */
  branchId?: number | null;
  cliente?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  ciudad?: string | null;
  zona?: string | null;
  contraentrega?: number;
  pesoKg?: number | null;
  codigoRequerido?: boolean;
}

export interface OpcionesDialogoGuias {
  copias: number;
  formato: FormatoRotulo;
  /** Los rótulos de la vista previa (paquetes × copias): se imprimen esos mismos. */
  rotulos: RotuloListo[];
}

export interface DialogoImprimirGuiasProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  envios: readonly EnvioParaGuia[];
  /** Se conserva por compatibilidad: la marca sale del propio rótulo (tienda y sede). */
  organizacion?: string | null;
  onImprimir: (opciones: OpcionesDialogoGuias) => Promise<void> | void;
}

/** Escala de la vista previa por formato (Figma: térmica y 10 × 15 al 72 %, A4 al 36 %). */
const ESCALA_VISTA: Record<FormatoRotulo, number> = { '80mm': 0.72, '10x15': 0.72, a4: 0.36 };

/**
 * «Imprimir guías»: la vista previa ES el rótulo (`RotuloEnvio`, la misma pieza del PDF y de la
 * térmica) a escala. Se elige el formato (se recuerda por sede), las copias por envío, y se pasa
 * de una guía a otra con las flechas. Si la sede tiene impresora de rótulos en línea la térmica
 * va allá; si no, se abre el PDF a tamaño real.
 *
 * «Frágil — manipular con cuidado» se marca aquí por guía y se GUARDA en el envío
 * (`shipments.is_fragile`, con la RLS de Logística): la vista previa cambia al instante y lo que se
 * imprime ya lo lleva. Solo mientras el envío está en preparación (la misma regla del formulario).
 */
export function DialogoImprimirGuias({ abierto, onAbiertoChange, envios, onImprimir }: DialogoImprimirGuiasProps) {
  const t = useTranslations('logistica.envios.dialogos.guias');
  const { prepararRotulos, resolverRotulos, estacionRotulos, guardarFragil } = useImpresionLogistica();
  const [guardandoFragil, setGuardandoFragil] = useState(false);
  const [copias, setCopias] = useState<number | null>(1);
  const [enviando, setEnviando] = useState(false);
  const [datos, setDatos] = useState<DatosRotulo[] | null | 'error'>(null);
  const [estacion, setEstacion] = useState<EstacionRotulos | null>(null);
  const [formato, setFormato] = useState<FormatoRotulo | null>(null);
  const [indice, setIndice] = useState(0);
  const sede = envios.find((e) => e.branchId != null)?.branchId ?? null;
  const ids = envios.map((e) => e.id).join(',');

  useEffect(() => {
    if (!abierto) return;
    setCopias(1);
    setIndice(0);
    setFormato(leerFormatoRecordado(sede));
  }, [abierto, sede]);

  useEffect(() => {
    if (!abierto || !ids) return;
    let vigente = true;
    setDatos(null);
    prepararRotulos(ids.split(','))
      .then((r) => vigente && setDatos(r.length > 0 ? r : 'error'))
      .catch(() => vigente && setDatos('error'));
    return () => {
      vigente = false;
    };
    // prepararRotulos cambia con la organización; los rótulos se piden al abrir o al cambiar de envíos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, ids]);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setEstacion(null);
    estacionRotulos(sede).then((e) => {
      if (!vigente) return;
      setEstacion(e);
      setFormato((f) => f ?? formatoInicialRotulo(sede, e));
    });
    return () => {
      vigente = false;
    };
  }, [abierto, sede, estacionRotulos]);

  const elegido: FormatoRotulo = formato ?? '10x15';
  const nCopias = Math.max(1, copias ?? 1);
  const listos = Array.isArray(datos) ? datos : null;
  // Lo que sale en papel (paquetes × copias) y, para pasar con las flechas, una vez cada guía.
  const rotulos = useMemo(() => (listos ? resolverRotulos(listos, nCopias) : []), [listos, nCopias, resolverRotulos]);
  const guias = useMemo(() => (listos ? resolverRotulos(listos, 1) : []), [listos, resolverRotulos]);
  const hojas = useMemo(() => hojasA4(rotulos.map((r) => r.textos)), [rotulos]);
  const paginas = elegido === 'a4' ? hojas.length : guias.length;
  const actual = Math.min(indice, Math.max(0, paginas - 1));
  useEffect(() => setIndice(0), [elegido]);

  // «Frágil» de la guía que se está viendo (en 10 × 15 y 80 mm; en A4 la hoja lleva varias).
  const idActual = elegido !== 'a4' ? guias[actual]?.id ?? null : null;
  const datoActual = idActual && listos ? listos.find((d) => d.id === idActual) ?? null : null;
  const envioActual = idActual ? envios.find((e) => e.id === idActual) ?? null : null;
  const fragilEditable = !!envioActual && camposEditables({ status: envioActual.status, vinculado: !!envioActual.sourceId, nuevo: false }).has('fragil');
  const cambiarFragil = async (fragil: boolean) => {
    if (!idActual) return;
    const poner = (v: boolean) => setDatos((ds) => (Array.isArray(ds) ? ds.map((d) => (d.id === idActual ? { ...d, fragil: v } : d)) : ds));
    poner(fragil);
    setGuardandoFragil(true);
    try {
      await guardarFragil(idActual, fragil);
    } catch {
      poner(!fragil);
      toastError(t('fragilError'));
    } finally {
      setGuardandoFragil(false);
    }
  };

  const termica = elegido === '80mm' && hayTermicaEnLinea(estacion);
  const impresora = estacion?.impresoras[0] ?? null;
  const total = rotulos.length || envios.length * nCopias;
  const paquetes = listos ? guias.length : envios.length;
  const unidades = paquetes === envios.length ? 'envios' : 'paquetes';

  const confirmar = async () => {
    setEnviando(true);
    try {
      recordarFormato(sede, elegido);
      await onImprimir({ copias: nCopias, formato: elegido, rotulos });
      onAbiertoChange(false);
    } finally {
      setEnviando(false);
    }
  };

  const primario =
    elegido === 'a4' ? t('confirmarA4', { count: Math.max(1, hojas.length) }) : termica ? t('confirmarTermica', { count: total }) : t('confirmarPdf', { count: total });
  const resumen =
    elegido === 'a4'
      ? t('resumenA4', { unidades, n: paquetes, copias: nCopias, count: total, hojas: Math.max(1, hojas.length), libres: hojas.length * ROTULOS_POR_HOJA - total })
      : elegido === '80mm'
        ? t('resumenTermica', { unidades, n: paquetes, copias: nCopias, count: total })
        : t('resumenRotulo', { unidades, n: paquetes, copias: nCopias, count: total });
  const configurar = { etiqueta: t('configurar'), onClick: () => abrirConfiguracion({ seccionId: 'pos.general' }) };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('titulo', { count: envios.length })}
      descripcion={t('descripcion')}
      icono={Printer}
      ancho={520}
      primario={{ etiqueta: primario, onClick: () => void confirmar(), cargando: enviando, deshabilitada: envios.length === 0 || datos === null || datos === 'error' || guardandoFragil }}
      textoCancelar={t('cancelar')}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('formato')}>
          {(cp) => (
            <SegmentedControl<FormatoRotulo>
              id={cp.id}
              aria-labelledby={cp.idEtiqueta}
              anchoCompleto
              valor={elegido}
              onValorChange={setFormato}
              opciones={[
                { valor: '80mm', etiqueta: t('formatoTermica') },
                { valor: '10x15', etiqueta: t('formatoRotulo') },
                { valor: 'a4', etiqueta: t('formatoA4') },
              ]}
            />
          )}
        </FormField>
        <div className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,10rem)_1fr]">
          <FormField etiqueta={t('copias')}>
            {(cp) => <CampoNumero id={cp.id} aria-labelledby={cp.idEtiqueta} valor={copias} onValorChange={setCopias} decimales={0} minimo={1} maximo={10} alinear="izquierda" />}
          </FormField>
          <p className="text-xs text-fg-muted sm:self-end sm:pb-2.5" aria-live="polite">
            {resumen}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-muted p-4" aria-label={t('vistaPrevia')} data-testid="vista-previa-guia">
          {listos && paginas > 0 ? (
            <>
              <div className="max-w-full overflow-hidden rounded-sm border border-line bg-white shadow-sm" style={{ zoom: ESCALA_VISTA[elegido] }}>
                {elegido === 'a4' ? (
                  <HojaRotulosA4 rotulos={hojas[actual] ?? []} />
                ) : (
                  <RotuloEnvio textos={guias[actual].textos} formato={elegido === '80mm' ? '80mm' : '10x15'} />
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t('anterior')}
                  disabled={actual === 0}
                  onClick={() => setIndice(actual - 1)}
                  className="inline-flex size-8 items-center justify-center rounded-md border border-line-strong bg-surface text-fg hover:bg-hover disabled:opacity-40"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
                <span className="min-w-0 truncate text-sm text-fg" aria-live="polite">
                  {elegido === 'a4' ? t('posicionHoja', { n: actual + 1, total: paginas }) : t('posicion', { n: actual + 1, total: paginas, numero: guias[actual].textos.guideNumber })}
                </span>
                <button
                  type="button"
                  aria-label={t('siguiente')}
                  disabled={actual >= paginas - 1}
                  onClick={() => setIndice(actual + 1)}
                  className="inline-flex size-8 items-center justify-center rounded-md border border-line-strong bg-surface text-fg hover:bg-hover disabled:opacity-40"
                >
                  <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </div>
              <p className="text-xs text-fg-muted">
                {elegido === 'a4' ? t('escalaA4', { pct: 36 }) : elegido === '80mm' ? t('escalaTermica', { pct: 72 }) : t('escalaRotulo', { pct: 72 })}
              </p>
            </>
          ) : (
            <p className="flex h-[300px] w-full max-w-[272px] items-center justify-center rounded-md border border-line bg-surface px-4 text-center text-xs text-fg-muted" aria-live="polite">
              {datos === 'error' ? t('errorVista') : t('cargandoVista')}
            </p>
          )}
        </div>

        {datoActual && (
          <div className="rounded-lg border border-line bg-surface">
            <SettingRow
              htmlFor="guia-fragil"
              titulo={t('fragil')}
              descripcion={fragilEditable ? t('fragilAyuda', { numero: guias[actual]?.textos.guideNumber ?? '' }) : t('fragilBloqueado')}
            >
              <Switch
                id="guia-fragil"
                checked={datoActual.fragil}
                onCheckedChange={(v) => void cambiarFragil(v)}
                disabled={!fragilEditable || guardandoFragil}
              />
            </SettingRow>
          </div>
        )}

        {estacion &&
          (elegido === 'a4' ? (
            <AvisoTonal tono="informacion" compacto titulo={t('avisoA4Titulo')} descripcion={t('avisoA4')} />
          ) : termica && impresora ? (
            <AvisoTonal
              tono="informacion"
              compacto
              titulo={t('avisoTermicaTitulo', { impresora: impresora.name, ancho: normalizePaperWidth(impresora.paper_width).replace('mm', ' mm') })}
              descripcion={t('avisoTermica')}
              accion={{ etiqueta: t('cambiar'), onClick: configurar.onClick }}
            />
          ) : hayTermicaEnLinea(estacion) ? (
            <AvisoTonal tono="informacion" compacto titulo={t('avisoPdfTitulo')} descripcion={t('avisoPdf')} />
          ) : (
            <AvisoTonal tono="advertencia" compacto titulo={t('avisoSinImpresoraTitulo')} descripcion={t('avisoSinImpresora')} accion={configurar} />
          ))}
      </div>
    </Dialogo>
  );
}
