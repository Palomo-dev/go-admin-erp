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
 * - Formulario del checkout (Figma «16 Sitio web» › Checkout v2, Parte F 3141-93709): qué campos
 *   pide la tienda, en qué orden, cuáles obligatorios y sus textos, con la vista previa a la
 *   derecha (`formulario/`). Compra, Confianza y Envío se pliegan, como en el Figma. Pie: «Sin
 *   cambios» / «N cambios sin guardar» / «No se puede guardar: …», y «Descartar» con cambios.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, BadgeCheck, Lock, Plus, RotateCcw, ShieldCheck, Trash2, Truck, type LucideIcon } from 'lucide-react';
import { CampoNumero, Dialogo, FormField, FormSection, SegmentedControl, SettingRow, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import type { AjustesCheckout } from '@/lib/website/ventasSitio.server';
import { gruposMarcados, resumenDelTipo, type GrupoEnvio, type ResumenTarifasGrupo, type TarifasDomicilio } from '@/lib/website/tarifasDomicilio';
import { MAX_SELLOS, MAX_TEXTO_SELLO, type CambiosCheckout, type EnlaceVenta, type SelloConfianza, type TipoEntrega } from './estadoVentas';
import { CajaIcono } from '../ui/CajaIcono';
import { ICONO_ENTREGA, ICONO_MODO_CHECKOUT, ICONO_SECCION_CHECKOUT } from './iconosVentas';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { useTextosVentas } from './textos';
import { SelectorBarraPago } from './SelectorBarraPago';
import { SeccionFormularioCheckout } from './formulario/SeccionFormularioCheckout';
import { VistaPreviaFormulario } from './formulario/VistaPreviaFormulario';
import { contarCambiosFormulario, erroresConfigurador, filasIniciales, formularioParaGuardar, type FilaFormulario } from './formulario/formularioLogica';

/** Icono de lucide para el icono guardado por el sitio (emojis heredados). */
export function iconoSello(icono: string): LucideIcon {
  if (icono.includes('\u{1F512}') || /lock|candado/i.test(icono)) return Lock;
  if (icono.includes('\u{1F69A}') || /truck|envio/i.test(icono)) return Truck;
  if (icono.includes('\u21A9') || icono.includes('\u{1F504}') || /devol|return/i.test(icono)) return RotateCcw;
  if (icono.includes('\u2705') || /check/i.test(icono)) return BadgeCheck;
  return ShieldCheck;
}

/**
 * Un tipo de entrega con su casilla y lo que verá el cliente («En la tienda: …»). En los domicilios
 * marcados, el resumen de tarifas web: cuántas, desde cuánto y en cuánto tiempo, o el aviso de
 * que se cobra la tarifa plana sin tiempo de entrega (Figma 2686:57152).
 */
function FilaTipoEntrega({
  id, etiqueta, ayuda, marcado, onMarcar, resumen, envioActivo, tarifaPlana, simboloMoneda, enlaceTarifas,
}: {
  id: string;
  etiqueta: string;
  ayuda: string;
  marcado: boolean;
  onMarcar: (v: boolean) => void;
  resumen: ResumenTarifasGrupo | null;
  envioActivo: boolean;
  tarifaPlana: number | null;
  simboloMoneda: string;
  enlaceTarifas: EnlaceVenta | null;
}) {
  const t = useTextosVentas();
  const locale = useLocale();
  const precio = (n: number) => `${simboloMoneda} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)}`;
  const dias = (d: number) => (d === 0 ? t('ventas.checkout.tiempoHoy') : d === 1 ? t('ventas.checkout.tiempoManana') : t('ventas.checkout.tiempoDias', { n: d }));
  let tiempo: string | null = null;
  if (resumen && resumen.diasMin !== null && resumen.diasMax !== null) {
    tiempo = resumen.diasMin === resumen.diasMax ? dias(resumen.diasMin) : t('ventas.checkout.tiempoRango', { min: resumen.diasMin, max: resumen.diasMax });
  }
  const conTarifas = !!resumen && resumen.cantidad > 0;
  const enlaceVisible = !!enlaceTarifas?.visible;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <Checkbox id={id} checked={marcado} onCheckedChange={(v) => onMarcar(v === true)} />
        <label htmlFor={id} className="text-sm font-medium text-foreground">{etiqueta}</label>
      </div>
      <p className="pl-[26px] text-xs text-muted-foreground">{ayuda}</p>
      {resumen && (
        <div className="ml-[26px] flex flex-wrap items-center gap-3 rounded-md bg-muted px-3 py-2" data-resumen-tarifas="">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Badge tono={conTarifas ? 'exito' : 'advertencia'} tamano="sm" className="self-start">
              {conTarifas ? (resumen.cantidad === 1 ? t('ventas.checkout.tarifaWeb') : t('ventas.checkout.tarifasWeb', { n: resumen.cantidad })) : t('ventas.checkout.sinTarifasWeb')}
            </Badge>
            <p className="text-xs text-foreground">
              {conTarifas
                ? [t('ventas.checkout.tarifasDesde', { precio: precio(resumen.desde ?? 0) }), tiempo].filter(Boolean).join(' · ')
                : envioActivo
                  ? t('ventas.checkout.sinTarifasPlana', { precio: precio(tarifaPlana ?? 0) })
                  : t('ventas.checkout.sinTarifasGratis')}
            </p>
          </div>
          {enlaceVisible && (
            <Link href={enlaceTarifas!.href} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
              {conTarifas ? t('ventas.checkout.verEnTransporte') : t('ventas.checkout.agregarTarifa')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
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
  if (a.barraPago !== b.barraPago) c.barraPago = b.barraPago;
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
  /**
   * Tarifas web por tipo de domicilio (Figma 2686:57152): bajo «Domicilio propio» y «Domicilio de
   * tercero» se ve cuántas hay, desde cuánto y en cuánto tiempo. `null`/ausente: sin resumen.
   */
  tarifasDomicilio?: TarifasDomicilio | null;
  /** Transporte › Tarifas de envío (si la persona lo ve). */
  enlaceTarifas?: EnlaceVenta | null;
}

export function DialogoCheckout({ abierto, onAbiertoChange, ajustes, simboloMoneda, onGuardar, esRestaurante = false, tarifasDomicilio = null, enlaceTarifas = null }: DialogoCheckoutProps) {
  const t = useTextosVentas();
  const tBarra = useTranslations('barraPagoMovil');
  const tForm = useTranslations('formularioCheckout');
  const { toast } = useToast();
  const id = useId();
  const [form, setForm] = useState<AjustesCheckout>(ajustes);
  const [guardando, setGuardando] = useState(false);
  // Formulario del checkout (Parte F): las filas del configurador y las guardadas.
  const filasGuardadas = useMemo(() => filasIniciales(ajustes.formulario), [ajustes.formulario]);
  const [filas, setFilas] = useState<FilaFormulario[]>(filasGuardadas);

  useEffect(() => {
    if (abierto) {
      setForm(ajustes);
      setFilas(filasGuardadas);
    }
  }, [abierto, ajustes, filasGuardadas]);

  const cambiosFormulario = contarCambiosFormulario(filasGuardadas, filas);
  const cambios = useMemo(() => {
    const c = diferenciasCheckout(ajustes, form);
    // El formulario viaja entero (o `null` = el de siempre) solo si cambió.
    return cambiosFormulario > 0 ? { ...c, formulario: formularioParaGuardar(filas) } : c;
  }, [ajustes, form, cambiosFormulario, filas]);
  const totalCambios = Object.keys(cambios).filter((k) => k !== 'formulario').length + cambiosFormulario;
  const hayCambios = totalCambios > 0;
  const erroresFormulario = erroresConfigurador(filas);
  const sellosValidos = form.listaSellos.every((s) => s.texto.trim().length > 0);
  // Retiro o domicilio siempre: «Comer aquí» solo se suma (el checkout del sitio necesita uno de los dos).
  const entregaValida = form.tiposEntrega.some((x) => x !== 'dine_in');
  const valido = entregaValida && sellosValidos && erroresFormulario.length === 0;
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
      ancho={1024}
      textoCancelar={hayCambios ? tForm('pie.descartar') : undefined}
      pie={
        erroresFormulario.length > 0 ? (
          <span className="text-danger-text" data-pie-checkout="error">{tForm('pie.error', { seccion: tForm(`secciones.${erroresFormulario[0].seccion}`) })}</span>
        ) : hayCambios ? (
          <span className="inline-flex items-center gap-2 text-warning-text" data-pie-checkout="cambios">
            <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
            {tForm('pie.cambios', { n: totalCambios })}
          </span>
        ) : (
          <span data-pie-checkout="sin-cambios">{tForm('pie.sinCambios')}</span>
        )
      }
      primario={{
        etiqueta: t('ventas.checkout.guardar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: !hayCambios || !valido,
      }}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <FormSection titulo={t('ventas.checkout.seccionCompra')} icono={ICONO_SECCION_CHECKOUT.compra} colapsable abiertaPorDefecto={false}>
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
              <div role="group" aria-labelledby={campo.idEtiqueta} className="flex flex-col gap-2" data-tipos-entrega="">
                {opcionesEntrega.map((o) => {
                  const marcado = form.tiposEntrega.includes(o.valor);
                  const grupo: GrupoEnvio | null = o.valor === 'delivery_own' ? 'own' : o.valor === 'delivery_third_party' ? 'third_party' : null;
                  return (
                    <FilaTipoEntrega
                      key={o.valor}
                      id={`${id}-entrega-${o.valor}`}
                      etiqueta={o.etiqueta}
                      ayuda={t(`ventas.checkout.enTienda.${o.valor}`)}
                      marcado={marcado}
                      onMarcar={(v) => poner('tiposEntrega', v ? [...form.tiposEntrega, o.valor] : form.tiposEntrega.filter((x) => x !== o.valor))}
                      resumen={
                        grupo && marcado && tarifasDomicilio
                          ? resumenDelTipo(tarifasDomicilio, grupo, gruposMarcados(form.tiposEntrega))
                          : null
                      }
                      envioActivo={form.envioActivo}
                      tarifaPlana={form.tarifaPlana}
                      simboloMoneda={simboloMoneda}
                      enlaceTarifas={enlaceTarifas}
                    />
                  );
                })}
              </div>
            )}
          </FormField>
          {/* Barra fija del pago en celular (Figma 3059:80757): A · B · C, por defecto C. */}
          <FormField etiqueta={tBarra('etiqueta')} ayuda={tBarra('ayuda')}>
            {(campo) => <SelectorBarraPago idEtiqueta={campo.idEtiqueta} valor={form.barraPago} onValorChange={(v) => poner('barraPago', v)} />}
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

        {/* Formulario del checkout (Parte F): qué campos, orden, obligatorios y textos. */}
        <SeccionFormularioCheckout filas={filas} filasGuardadas={filasGuardadas} onFilas={setFilas} />

        <FormSection titulo={t('ventas.checkout.seccionConfianza')} icono={ICONO_SECCION_CHECKOUT.confianza} colapsable abiertaPorDefecto={false}>
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

        <FormSection titulo={t('ventas.checkout.seccionEnvio')} descripcion={t('ventas.checkout.seccionEnvioAyuda')} icono={ICONO_SECCION_CHECKOUT.envio} colapsable abiertaPorDefecto={false}>
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
      {/* Vista previa en vivo del formulario (computador; en el celular, «Ver vista previa»). */}
      <div className="hidden lg:sticky lg:top-0 lg:block">
        <VistaPreviaFormulario filas={filas} filasGuardadas={filasGuardadas} />
      </div>
      </div>
    </Dialogo>
  );
}
