'use client';

/**
 * Diálogos de Logística › Envíos (Figma «21 Logística», sección 12): cambiar estado de varios
 * 2965:9890, devolver a la sede 2965:9958, cancelar envío 2965:10022 e imprimir guías 2965:10078.
 * Los usan la lista y el detalle del envío.
 *
 * Todo cambio de estado va por `logistica_cambiar_estado` (`deliveryIntegrationService.changeStatus`)
 * envío por envío: «solo pasan los que pueden» según la tabla canónica de transiciones, y uno que
 * falla no deshace a los demás. El dinero no se mueve aquí: la devolución del dinero y el reingreso
 * de la mercancía se registran en el pedido (POS › Devoluciones), que es la ruta única del kardex.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Printer, RefreshCw, RotateCcw } from 'lucide-react';
import { CampoNumero, CodigoBarras, Dialogo, FormField, TarjetaSeleccionable } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import { canonicoDeEstado, MOTIVOS_NOVEDAD, type MotivoNovedad } from '@/lib/logistica/estadosEnvio';
import { ESTADOS_CAMBIO_ESTADO, particionPorTransicion, type EstadoCambioEstado } from '@/lib/logistica/envios';
import { avisarCliente } from '../logisticaApi';

const claseCampo = 'h-10 border-line-strong bg-surface';

/** Las props del campo para un `<input>`/`<textarea>`: `idEtiqueta` es para `aria-labelledby`, no va al DOM. */
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
      if (avisar && r.aviso && e.sourceType && e.sourceId) void avisarCliente({ source_type: e.sourceType, source_id: e.sourceId }, r.aviso);
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

// ── Imprimir guías (2965:10078) ────────────────────────────────────────────────

export interface EnvioParaGuia extends EnvioEnDialogo {
  cliente: string | null;
  telefono: string | null;
  direccion: string | null;
  barrio: string | null;
  ciudad: string | null;
  zona?: string | null;
  contraentrega: number;
  pesoKg?: number | null;
  codigoRequerido: boolean;
}

export interface DialogoImprimirGuiasProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  envios: readonly EnvioParaGuia[];
  organizacion: string | null;
  onImprimir: (copias: number) => Promise<void> | void;
}

export function DialogoImprimirGuias({ abierto, onAbiertoChange, envios, organizacion, onImprimir }: DialogoImprimirGuiasProps) {
  const t = useTranslations('logistica.envios.dialogos.guias');
  const moneda = useMonedaOrganizacion();
  const [copias, setCopias] = useState<number | null>(1);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (abierto) setCopias(1);
  }, [abierto]);

  const total = envios.length * Math.max(1, copias ?? 1);
  const p = envios[0];

  const confirmar = async () => {
    setEnviando(true);
    try {
      await onImprimir(Math.max(1, copias ?? 1));
      onAbiertoChange(false);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('titulo', { count: envios.length })}
      descripcion={t('descripcion')}
      icono={Printer}
      ancho={520}
      primario={{ etiqueta: t('confirmar', { count: total }), onClick: () => void confirmar(), cargando: enviando, deshabilitada: envios.length === 0 }}
      textoCancelar={t('cancelar')}
      pie={<span className="text-xs text-fg-muted">{t('pie')}</span>}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('formato')}>
            {(cp) => (
              <p id={cp.id} className="flex h-10 items-center rounded-lg border border-line bg-surface-muted px-3 text-sm text-fg-secondary">
                {t('formatoTermica')}
              </p>
            )}
          </FormField>
          <FormField etiqueta={t('copias')}>
            {(cp) => <CampoNumero id={cp.id} aria-labelledby={cp.idEtiqueta} valor={copias} onValorChange={setCopias} decimales={0} minimo={1} maximo={10} alinear="izquierda" />}
          </FormField>
        </div>
        {p && (
          <div className="rounded-lg bg-surface-muted p-4" aria-label={t('vistaPrevia')}>
            <div className="mx-auto flex max-w-[260px] flex-col gap-2 rounded-md border border-line bg-surface p-3 text-xs text-fg">
              <div className="flex items-center justify-between gap-2 font-semibold">
                <span className="truncate">{organizacion ?? ''}</span>
                <span className="shrink-0">{p.numero}</span>
              </div>
              <CodigoBarras valor={p.numero} textoSinCodigo={p.numero} className="h-10" />
              <p className="font-semibold">{t('para', { nombre: [p.cliente, p.telefono].filter(Boolean).join(' · ') || '—' })}</p>
              <p className="text-fg-secondary">{[p.direccion, [p.barrio, p.ciudad].filter(Boolean).join(', '), p.zona].filter(Boolean).join(' · ') || '—'}</p>
              {p.contraentrega > 0 && <p className="font-semibold text-danger-text">{t('contraentrega', { monto: moneda.formatear(p.contraentrega) })}</p>}
              <p className="text-fg-muted">
                {[p.pesoKg != null ? t('peso', { kg: p.pesoKg }) : null, t('bulto'), p.codigoRequerido ? t('pedirCodigo') : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        )}
      </div>
    </Dialogo>
  );
}
