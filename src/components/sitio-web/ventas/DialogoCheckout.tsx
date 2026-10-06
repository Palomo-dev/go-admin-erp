'use client';

/**
 * «Editar opciones» del checkout del sitio (Figma B/10-01, tarjeta Checkout):
 * lo ÚNICO que se edita en Ventas en línea (B/10-04 nota 1). Guarda con
 * `PUT /api/sitio-web/ventas/checkout` (servidor, lista blanca) a través de
 * `useVentasSitio`; nada se escribe desde el navegador.
 *
 * - Sellos de confianza: se edita el texto. El icono que ya guarda el sitio
 *   público se conserva tal cual (el sitio lo pinta como texto); el ERP lo
 *   muestra con un icono de lucide, sin emojis.
 * - Compra como invitado y pedido mínimo: sin la migración pendiente se ven
 *   deshabilitados con el motivo.
 * - Tarifa plana y envío gratis: la alternativa del sitio cuando no hay una
 *   tarifa por zona de Transporte (B/10-04 nota 3).
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { BadgeCheck, Lock, Plus, RotateCcw, ShieldCheck, Trash2, Truck, type LucideIcon } from 'lucide-react';
import { CampoNumero, ChipsOpcion, Dialogo, FormField, FormSection, SegmentedControl, SettingRow, clasesBoton } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import type { AjustesCheckout } from '@/lib/website/ventasSitio.server';
import { MAX_SELLOS, MAX_TEXTO_SELLO, type CambiosCheckout, type SelloConfianza, type TipoEntrega } from './estadoVentas';
import { CajaIcono } from '../ui/CajaIcono';
import { ICONO_ENTREGA, ICONO_MODO_CHECKOUT, ICONO_SECCION_CHECKOUT } from './iconosVentas';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { useTextosVentas } from './textos';

/** Icono de lucide para el icono guardado por el sitio (emojis heredados). */
export function iconoSello(icono: string): LucideIcon {
  if (icono.includes('\u{1F512}') || /lock|candado/i.test(icono)) return Lock;
  if (icono.includes('\u{1F69A}') || /truck|envio/i.test(icono)) return Truck;
  if (icono.includes('\u21A9') || icono.includes('\u{1F504}') || /devol|return/i.test(icono)) return RotateCcw;
  if (icono.includes('\u2705') || /check/i.test(icono)) return BadgeCheck;
  return ShieldCheck;
}

/** Cambios entre lo guardado y el formulario (solo los campos tocados). */
export function diferenciasCheckout(a: AjustesCheckout, b: AjustesCheckout): CambiosCheckout {
  const c: CambiosCheckout = {};
  if (a.modo !== b.modo) c.modo = b.modo;
  if ([...a.tiposEntrega].sort().join() !== [...b.tiposEntrega].sort().join()) c.tiposEntrega = b.tiposEntrega;
  if (!b.pendienteMigracion && a.invitado !== b.invitado) c.invitado = b.invitado;
  if (!b.pendienteMigracion && a.pedidoMinimo !== b.pedidoMinimo) c.pedidoMinimo = b.pedidoMinimo;
  if (a.sellos !== b.sellos) c.sellos = b.sellos;
  if (JSON.stringify(a.listaSellos) !== JSON.stringify(b.listaSellos)) c.listaSellos = b.listaSellos;
  if (a.logosPago !== b.logosPago) c.logosPago = b.logosPago;
  if (a.ventaEnLinea !== b.ventaEnLinea) c.ventaEnLinea = b.ventaEnLinea;
  if (a.envioActivo !== b.envioActivo) c.envioActivo = b.envioActivo;
  if (a.tarifaPlana !== b.tarifaPlana) c.tarifaPlana = b.tarifaPlana;
  if (a.envioGratisDesde !== b.envioGratisDesde) c.envioGratisDesde = b.envioGratisDesde;
  return c;
}

export interface DialogoCheckoutProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  ajustes: AjustesCheckout;
  simboloMoneda: string;
  onGuardar: (cambios: CambiosCheckout) => Promise<void>;
  /** Giro restaurante: ofrece «Comer aquí» (`dine_in`). */
  esRestaurante?: boolean;
}

export function DialogoCheckout({ abierto, onAbiertoChange, ajustes, simboloMoneda, onGuardar, esRestaurante = false }: DialogoCheckoutProps) {
  const t = useTextosVentas();
  const { toast } = useToast();
  const id = useId();
  const [form, setForm] = useState<AjustesCheckout>(ajustes);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) setForm(ajustes);
  }, [abierto, ajustes]);

  const cambios = useMemo(() => diferenciasCheckout(ajustes, form), [ajustes, form]);
  const hayCambios = Object.keys(cambios).length > 0;
  const sellosValidos = form.listaSellos.every((s) => s.texto.trim().length > 0);
  // Retiro o domicilio siempre: «Comer aquí» solo se suma (el checkout del sitio necesita uno de los dos).
  const entregaValida = form.tiposEntrega.some((x) => x !== 'dine_in');
  const valido = entregaValida && sellosValidos;
  const ayudaEntrega = esRestaurante ? t('ventas.checkout.tiposEntregaAyudaRestaurante') : t('ventas.checkout.tiposEntregaAyuda');
  const motivoPendiente = form.pendienteMigracion ? t('ventas.checkout.pendienteMigracion') : undefined;

  const poner = <K extends keyof AjustesCheckout>(k: K, v: AjustesCheckout[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ponerSello = (i: number, texto: string) =>
    setForm((f) => ({ ...f, listaSellos: f.listaSellos.map((s, j) => (j === i ? { ...s, texto: texto.slice(0, MAX_TEXTO_SELLO) } : s)) }));

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar(cambios);
      toast({ title: t('ventas.checkout.guardado') });
      onAbiertoChange(false);
    } catch (error) {
      toast({ title: t('ventas.checkout.error', { mensaje: (error as Error).message }), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const opcionesEntrega: { valor: TipoEntrega; etiqueta: string; icono: LucideIcon }[] = [
    { valor: 'pickup', etiqueta: t('ventas.checkout.entregaRetiro'), icono: ICONO_ENTREGA.pickup },
    { valor: 'delivery_own', etiqueta: t('ventas.checkout.entregaPropio'), icono: ICONO_ENTREGA.delivery_own },
    { valor: 'delivery_third_party', etiqueta: t('ventas.checkout.entregaTercero'), icono: ICONO_ENTREGA.delivery_third_party },
    // «Comer aquí» solo en restaurantes: el sitio lo ofrece en el checkout y con el QR de la mesa.
    ...(esRestaurante ? [{ valor: 'dine_in' as const, etiqueta: t('ventas.checkout.entregaComerAqui'), icono: ICONO_ENTREGA.dine_in }] : []),
  ];

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={t('ventas.checkout.titulo')}
      descripcion={t('ventas.checkout.descripcion')}
      ancho={672}
      primario={{
        etiqueta: t('ventas.checkout.guardar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: !hayCambios || !valido,
      }}
    >
      <div className="flex flex-col gap-4">
        <FormSection titulo={t('ventas.checkout.seccionCompra')} icono={ICONO_SECCION_CHECKOUT.compra}>
          <FormField etiqueta={t('ventas.checkout.modo')}>
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                opciones={[
                  { valor: 'steps', etiqueta: t('ventas.checkout.modoPasos'), icono: ICONO_MODO_CHECKOUT.steps },
                  { valor: 'one_page', etiqueta: t('ventas.checkout.modoUnaPagina'), icono: ICONO_MODO_CHECKOUT.one_page },
                ]}
                valor={form.modo}
                onValorChange={(v) => poner('modo', v)}
              />
            )}
          </FormField>
          <FormField etiqueta={t('ventas.checkout.tiposEntrega')} ayuda={ayudaEntrega} error={entregaValida ? null : ayudaEntrega}>
            {(campo) => (
              <ChipsOpcion
                multiple
                aria-labelledby={campo.idEtiqueta}
                opciones={opcionesEntrega}
                valor={form.tiposEntrega}
                onValorChange={(v) => poner('tiposEntrega', v)}
              />
            )}
          </FormField>
          <SettingRow titulo={t('ventas.checkout.ventaEnLinea')} descripcion={t('ventas.checkout.ventaEnLineaAyuda')} htmlFor={`${id}-venta`}>
            <Switch id={`${id}-venta`} checked={form.ventaEnLinea} onCheckedChange={(v) => poner('ventaEnLinea', v)} />
          </SettingRow>
          <SettingRow titulo={t('ventas.checkout.invitado')} descripcion={motivoPendiente ?? t('ventas.checkout.invitadoAyuda')} htmlFor={`${id}-invitado`}>
            <Switch id={`${id}-invitado`} checked={form.invitado} disabled={form.pendienteMigracion} onCheckedChange={(v) => poner('invitado', v)} />
          </SettingRow>
          <FormField etiqueta={t('ventas.checkout.pedidoMinimo')} ayuda={motivoPendiente ?? t('ventas.checkout.pedidoMinimoAyuda')}>
            <CampoNumero
              valor={form.pedidoMinimo}
              onValorChange={(v) => poner('pedidoMinimo', v)}
              prefijo={simboloMoneda}
              minimo={0}
              decimales={0}
              disabled={form.pendienteMigracion}
            />
          </FormField>
        </FormSection>

        <FormSection titulo={t('ventas.checkout.seccionConfianza')} icono={ICONO_SECCION_CHECKOUT.confianza}>
          <SettingRow titulo={t('ventas.checkout.sellos')} descripcion={t('ventas.checkout.sellosAyuda')} htmlFor={`${id}-sellos`}>
            <Switch id={`${id}-sellos`} checked={form.sellos} onCheckedChange={(v) => poner('sellos', v)} />
          </SettingRow>
          {form.sellos && (
            <ul className="flex flex-col gap-2">
              {form.listaSellos.map((s: SelloConfianza, i) => {
                const Icono = iconoSello(s.icono);
                return (
                  <li key={i} className="flex items-center gap-2">
                    <CajaIcono icono={Icono} />
                    <Input
                      value={s.texto}
                      onChange={(e) => ponerSello(i, e.target.value)}
                      aria-label={t('ventas.checkout.textoSello', { n: i + 1 })}
                      aria-invalid={s.texto.trim() === ''}
                      maxLength={MAX_TEXTO_SELLO}
                      className="h-10 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, listaSellos: f.listaSellos.filter((_, j) => j !== i) }))}
                      aria-label={t('ventas.checkout.quitarSello', { texto: s.texto })}
                      className={clasesBoton({ variante: 'fantasma', tamano: 'md' }) + ' w-10 px-0'}
                    >
                      <Trash2 aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                    </button>
                  </li>
                );
              })}
              {form.listaSellos.length < MAX_SELLOS && (
                <li>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, listaSellos: [...f.listaSellos, { icono: '', texto: '' }] }))}
                    className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                  >
                    <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                    {t('ventas.checkout.agregarSello')}
                  </button>
                </li>
              )}
            </ul>
          )}
          <SettingRow titulo={t('ventas.checkout.logosPago')} descripcion={t('ventas.checkout.logosPagoAyuda')} htmlFor={`${id}-logos`}>
            <Switch id={`${id}-logos`} checked={form.logosPago} onCheckedChange={(v) => poner('logosPago', v)} />
          </SettingRow>
        </FormSection>

        <FormSection titulo={t('ventas.checkout.seccionEnvio')} descripcion={t('ventas.checkout.seccionEnvioAyuda')} icono={ICONO_SECCION_CHECKOUT.envio}>
          <SettingRow titulo={t('ventas.checkout.envioActivo')} htmlFor={`${id}-envio`}>
            <Switch id={`${id}-envio`} checked={form.envioActivo} onCheckedChange={(v) => poner('envioActivo', v)} />
          </SettingRow>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('ventas.checkout.tarifaPlana')}>
              <CampoNumero valor={form.tarifaPlana} onValorChange={(v) => poner('tarifaPlana', v)} prefijo={simboloMoneda} minimo={0} decimales={0} disabled={!form.envioActivo} />
            </FormField>
            <FormField etiqueta={t('ventas.checkout.envioGratisDesde')} ayuda={t('ventas.checkout.envioGratisAyuda')}>
              <CampoNumero valor={form.envioGratisDesde} onValorChange={(v) => poner('envioGratisDesde', v)} prefijo={simboloMoneda} minimo={0} decimales={0} disabled={!form.envioActivo} />
            </FormField>
          </div>
        </FormSection>
      </div>
    </Dialogo>
  );
}
