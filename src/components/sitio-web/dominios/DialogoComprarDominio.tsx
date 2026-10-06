'use client';

/**
 * Comprar un dominio (Figma B/07-13…07-20). Diálogo ÚNICO del flujo: lo abren
 * Dominios, el vacío, Sedes en la web y el asistente con `?accion=comprar`.
 * Reemplaza a `BuyDomainDialog`.
 *
 * Pasos: 1 buscar → 2 titular → 3 pago → comprando → listo, y los errores
 * (ya no disponible, pago rechazado, registrador con reembolso). La búsqueda,
 * la tarjeta y el cobro usan las rutas EXISTENTES (`/api/domains/check`,
 * `/setup-intent`, `/purchase`), que revalidan el precio en el servidor y
 * reembolsan si el registrador falla: aquí no se duplica nada de eso.
 *
 * Estado honesto: los precios se muestran en la moneda que cotiza el
 * registrador (hoy USD, sin IVA ni margen); no se anuncia «COP, IVA incluido»
 * mientras el servidor no cobre así.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import type { LucideIcon } from 'lucide-react';
import { AvisoTonal, BarraProgreso, EmptyState, FilaDato, FormField, FormSection, ListaDatos, PanelAdaptable, SearchInput, SettingRow, StatusBadge, clasesBoton } from '@/components/kit';
import { PhoneField } from '@/components/kit/PhoneField';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { cn } from '@/utils/Utils';
import { DomainStatusBadge } from '../ui/DomainStatusBadge';
import { PriceTag } from '../ui/PriceTag';
import { rutaDetalleDominio } from '../rutasSitioWeb';
import { comprarDominio, consultarDominio, ErrorApiDominios, prepararPago } from './apiDominios';
import {
  alternativas,
  candidatosBusqueda,
  contactoRegistrador,
  esOferta,
  falloDeCompra,
  recomendada,
  validarTitular,
  PAISES_TITULAR,
  type ErroresTitular,
  type FalloCompra,
  type OpcionDominio,
} from './busquedaDominio';
import { ICONO_ACCION_DOMINIO as ICONO, ICONO_RESULTADO_COMPRA as RESULTADO, IconoBoton, IconoDominio } from './iconosDominios';
import { CajaResumen, PasosEnCurso, type EstadoPasoFlujo } from './piezasFlujo';
import type { DominioSitio, RespuestaVerificacion, TitularDominio } from './tiposDominios';
import { useTextosDominios } from './textos';
import { useFormatoDominio } from './useFormatoDominio';
import { aE164, normalizarTelefono } from '@/lib/utils/telefono';

const stripePromise = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null;

export interface DialogoComprarDominioProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  titular: TitularDominio | null;
  /** ¿Hay ya un dominio propio principal? Si no, el comprado pasa a serlo (nota-código). */
  hayPrincipalPropio: boolean;
  verificar: (id: string) => Promise<RespuestaVerificacion>;
  hacerPrincipal: (id: string) => Promise<DominioSitio>;
  onComprado: () => void;
  /** «Conectar un dominio» desde el estado «no disponible por ahora». */
  onIrAConectar: () => void;
}

type Fase = 'buscar' | 'titular' | 'pago' | 'comprando' | 'listo' | 'fallo';

const TITULAR_VACIO: TitularDominio = { nombre: '', correo: '', telefono: '', direccion: '', ciudad: '', departamento: '', codigoPostal: '', pais: 'CO' };

/** Campos de texto y selects a 40 px, como el `PhoneField` y el resto de formularios del kit. */
const CLASE_CAMPO_TITULAR = 'h-10 rounded-lg border-line-strong bg-surface text-fg';
const CLASE_SELECT_TITULAR = 'h-10 rounded-lg border-line-strong bg-surface text-sm text-fg focus:ring-brand focus:ring-offset-0';

/**
 * Titular precargado con el teléfono ya en E.164: el de la organización puede
 * venir como «3001234567» o «+57 300 1234567», y el `PhoneField` lo muestra
 * bien pero la validación exige el indicativo.
 */
function titularInicialNormalizado(t: TitularDominio | null): TitularDominio {
  if (!t) return TITULAR_VACIO;
  const pais = /^[A-Z]{2}$/.test(t.pais) ? t.pais : 'CO';
  const telefono = t.telefono ? (aE164(t.telefono, pais) ?? normalizarTelefono(t.telefono, pais).replace(/\s+/g, '')) : '';
  return { ...t, telefono };
}

/** Colores del campo de tarjeta: el iframe de Stripe no lee clases, así que se toman de los tokens. */
function estiloTarjeta() {
  const leer = (v: string, respaldo: string) => {
    if (typeof window === 'undefined') return respaldo;
    const crudo = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    return crudo ? `rgb(${crudo.split(/\s+/).join(',')})` : respaldo;
  };
  return {
    style: {
      base: { fontSize: '16px', fontFamily: 'Inter, system-ui, sans-serif', color: leer('--text-primary', 'black'), '::placeholder': { color: leer('--text-muted', 'gray') } },
      invalid: { color: leer('--state-danger-text', 'red') },
    },
    hidePostalCode: true,
  };
}

export function DialogoComprarDominio(props: DialogoComprarDominioProps) {
  // Sin clave pública, `Elements` recibe `null` y `useStripe()` devuelve `null`: el pago queda deshabilitado.
  return (
    <Elements stripe={stripePromise}>
      <FlujoCompra {...props} sinStripe={!stripePromise} />
    </Elements>
  );
}

function FlujoCompra({ abierto, onAbiertoChange, titular: titularInicial, hayPrincipalPropio, verificar, hacerPrincipal, onComprado, onIrAConectar, sinStripe }: DialogoComprarDominioProps & { sinStripe?: boolean }) {
  const t = useTextosDominios();
  const f = useFormatoDominio();
  const locale = useLocaleIntl();
  const stripe = useStripe();
  const elements = useElements();

  const [fase, setFase] = useState<Fase>('buscar');
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [opciones, setOpciones] = useState<OpcionDominio[]>([]);
  const [consultadoEn, setConsultadoEn] = useState<string | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [sinServicio, setSinServicio] = useState(false);
  const [elegida, setElegida] = useState<OpcionDominio | null>(null);
  const [titular, setTitular] = useState<TitularDominio>(() => titularInicialNormalizado(titularInicial));
  const [erroresTitular, setErroresTitular] = useState<ErroresTitular>({});
  const [setup, setSetup] = useState<{ clientSecret: string; setupIntentId: string } | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [tarjetaCompleta, setTarjetaCompleta] = useState(false);
  const [terminos, setTerminos] = useState(false);
  const [pasos, setPasos] = useState<EstadoPasoFlujo[]>(['pendiente', 'pendiente', 'pendiente', 'pendiente']);
  const [fallo, setFallo] = useState<FalloCompra | null>(null);
  const [intentoEn, setIntentoEn] = useState<Date | null>(null);
  const [resultado, setResultado] = useState<{ dominio: DominioSitio | null; venceEn: string | null; principal: boolean; id: string | null } | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setFase('buscar');
    setOpciones([]);
    setElegida(null);
    setFallo(null);
    setResultado(null);
    setErrorBusqueda(null);
    setSinServicio(false);
    setTerminos(false);
    setSetup(null);
    setTitular(titularInicialNormalizado(titularInicial));
    setErroresTitular({});
    // Se reinicia solo al abrir; el titular precargado no cambia con el diálogo abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const nombresPais = useMemo(() => {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'region' });
      return (c: string) => dn.of(c) ?? c;
    } catch {
      return (c: string) => c;
    }
  }, [locale]);

  const buscar = async (texto = busqueda) => {
    const candidatos = candidatosBusqueda(texto);
    if (candidatos.length === 0) return;
    setBuscando(true);
    setErrorBusqueda(null);
    const r = await Promise.allSettled(candidatos.map((c) => consultarDominio(c)));
    const ok = r.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []));
    if (ok.length === 0) {
      const sinToken = r.some((x) => x.status === 'rejected' && x.reason instanceof ErrorApiDominios && (x.reason.estado === 500 || x.reason.estado === 503));
      if (sinToken) setSinServicio(true);
      else setErrorBusqueda(t('comprar.errorBuscar'));
    } else {
      setOpciones(ok.map((o) => ({ dominio: o.domain, disponible: o.available, precio: o.price, renovacion: o.renewalPrice, moneda: o.currency })));
      setConsultadoEn(new Date().toISOString());
    }
    setBuscando(false);
  };

  const elegir = (o: OpcionDominio) => {
    setElegida(o);
    setFase('titular');
  };

  const continuarAPago = async () => {
    const errores = validarTitular(titular);
    setErroresTitular(errores);
    if (Object.keys(errores).length > 0) return;
    setFase('pago');
    setErrorPago(null);
    if (setup) return;
    setPreparando(true);
    try {
      const s = await prepararPago(titular.correo.trim(), titular.nombre.trim());
      setSetup({ clientSecret: s.clientSecret, setupIntentId: s.setupIntentId });
    } catch (e) {
      if (e instanceof ErrorApiDominios && e.estado === 503) setSinServicio(true);
      setErrorPago(t('comprar.errorPago'));
    } finally {
      setPreparando(false);
    }
  };

  const pagar = async () => {
    if (!elegida || !setup || !stripe || !elements) return;
    const tarjeta = elements.getElement(CardElement);
    if (!tarjeta) return;
    setFase('comprando');
    setIntentoEn(new Date());
    setPasos(['en_curso', 'pendiente', 'pendiente', 'pendiente']);
    const confirmacion = await stripe.confirmCardSetup(setup.clientSecret, {
      payment_method: { card: tarjeta, billing_details: { name: titular.nombre.trim(), email: titular.correo.trim() } },
    });
    if (confirmacion.error) {
      setFallo({ tipo: 'rechazado', codigo: confirmacion.error.decline_code ?? confirmacion.error.code ?? null, mensaje: confirmacion.error.message ?? null });
      setSetup(null);
      setFase('fallo');
      return;
    }
    let compra;
    try {
      compra = await comprarDominio(elegida.dominio, setup.setupIntentId, contactoRegistrador(titular));
    } catch (e) {
      const err = e instanceof ErrorApiDominios ? e : null;
      const fc = falloDeCompra(err?.estado ?? 500, err?.codigo ?? null, err?.message ?? null);
      setSetup(null);
      if (fc.tipo === 'telefono') {
        setErroresTitular({ telefono: 'telefonoInvalido' });
        setFase('titular');
        return;
      }
      setFallo(fc);
      setFase('fallo');
      return;
    }
    // El servidor cobró y registró: pago y registro hechos. Ahora conectarlo y, si es el primero, hacerlo principal.
    setPasos(['hecho', 'hecho', 'en_curso', 'pendiente']);
    let dominio: DominioSitio | null = null;
    let principal = false;
    if (compra.domainId) {
      try {
        const v = await verificar(compra.domainId);
        dominio = v.dominio;
        if (!hayPrincipalPropio) {
          dominio = await hacerPrincipal(compra.domainId);
          principal = true;
        }
      } catch (e) {
        console.warn('[dominios] comprado pero no se pudo conectar todavía', e instanceof Error ? e.message : e);
      }
    }
    const sslListo = dominio?.ssl === 'emitido' && dominio.estado === 'activo';
    setPasos(['hecho', 'hecho', dominio ? 'hecho' : 'pendiente', sslListo ? 'hecho' : 'pendiente']);
    setResultado({ dominio, venceEn: compra.expiresAt ?? null, principal, id: compra.domainId ?? null });
    setFase('listo');
    onComprado();
  };

  const precioTexto = elegida?.precio !== null && elegida?.precio !== undefined ? f.precio(elegida.precio, elegida.moneda) : '';
  const recomendado = recomendada(opciones);
  const cambiarTitular = (c: keyof TitularDominio, v: string) => {
    setTitular((p) => ({ ...p, [c]: v }));
    if (erroresTitular[c]) setErroresTitular((p) => ({ ...p, [c]: undefined }));
  };
  const campo = (c: keyof TitularDominio, etiqueta: string, extra?: { tipo?: string; autoComplete?: string }) => {
    const e = erroresTitular[c];
    return (
      <FormField etiqueta={etiqueta} obligatorio error={e ? t(`comprar.${e}`) : null}>
        <Input
          type={extra?.tipo ?? 'text'}
          autoComplete={extra?.autoComplete}
          value={titular[c]}
          onChange={(ev) => cambiarTitular(c, ev.target.value)}
          className={CLASE_CAMPO_TITULAR}
        />
      </FormField>
    );
  };

  // ── Contenido por fase ──────────────────────────────────────────────────────
  let titulo = t('comprar.titulo1');
  let descripcion: string | undefined = t('comprar.sub1');
  let antetitulo: string | undefined = t('comprar.paso', { n: 1 });
  let icono: LucideIcon | undefined;
  let tonoIcono: 'exito' | 'peligro' | 'advertencia' | 'marca' | undefined;
  let cuerpo: React.ReactNode = null;
  let pie: React.ReactNode = null;
  const cerrar = (texto = t('comprar.cerrar'), primario = true) => (
    <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: primario ? 'primario' : 'secundario', tamano: 'md' })}>
      {texto}
    </button>
  );

  if (sinServicio) {
    cuerpo = (
      <EmptyState
        variante="error"
        compacto
        icono={ICONO.comprar}
        titulo={t('comprar.noDisponibleTitulo')}
        descripcion={t('comprar.noDisponibleTexto')}
        accion={{ etiqueta: t('comprar.irConectar'), onClick: onIrAConectar }}
      />
    );
    pie = cerrar(t('comprar.cancelar'), false);
  } else if (fase === 'buscar') {
    cuerpo = (
      <>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void buscar();
          }}
        >
          <FormField etiqueta={t('comprar.campo')} className="min-w-0 flex-1">
            {(c) => (
              <SearchInput
                id={c.id}
                value={busqueda}
                onChange={() => undefined}
                onValueChange={setBusqueda}
                onEnter={(texto) => {
                  void buscar(texto);
                  return true;
                }}
                etiqueta={t('comprar.campo')}
                placeholder="tumarca"
                atajo={false}
                cargando={buscando}
                autoFocus
              />
            )}
          </FormField>
          <button type="submit" disabled={buscando || candidatosBusqueda(busqueda).length === 0} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            <IconoBoton icono={ICONO.buscar} ocupado={buscando} />
            {buscando ? t('comprar.buscando') : t('comprar.buscar')}
          </button>
        </form>
        {errorBusqueda && <AvisoTonal tono="peligro" rol="alert" titulo={errorBusqueda} />}
        {opciones.length > 0 && (
          <ul className="overflow-hidden rounded-xl border border-line" aria-live="polite">
            {opciones.map((o) => {
              const esRec = o.dominio === recomendado;
              return (
                <li key={o.dominio} className={cn('flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0', esRec && 'bg-brand-tint')}>
                  <span className={cn('min-w-0 flex-1 truncate text-sm', o.disponible ? 'font-medium text-fg' : 'text-fg-muted')}>
                    {o.dominio}
                    {/* Chips del kit con poco color (B/07-13): «No disponible» gris suave; «Recomendado» y «Oferta primer año» solo con contorno. */}
                    {!o.disponible && <StatusBadge estado="no disponible" etiqueta={t('comprar.noDisponible')} tono="neutro" apariencia="suave" className="ml-2" />}
                    {esRec && <StatusBadge estado="recomendado" etiqueta={t('comprar.recomendado')} tono="marca" apariencia="contorno" className="ml-2" />}
                    {esOferta(o) && <StatusBadge estado="oferta" etiqueta={t('comprar.oferta')} tono="advertencia" apariencia="contorno" className="ml-2" />}
                  </span>
                  {o.disponible && o.precio !== null ? (
                    <>
                      <PriceTag valor={o.precio} renovacion={o.renovacion} moneda={o.moneda} mostrarRenovacionSiempre className="items-end text-right" />
                      <button type="button" onClick={() => elegir(o)} className={clasesBoton({ variante: esRec ? 'primario' : 'secundario', tamano: 'sm' })}>
                        {t('comprar.elegir')}
                      </button>
                    </>
                  ) : (
                    <span className="text-[13px] text-fg-muted">{t('comprar.yaTieneDueno')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {opciones.length > 0 && !recomendado && <p className="text-[13px] text-fg-secondary">{t('comprar.ningunoDisponible')}</p>}
        {opciones.length === 0 && !buscando && !errorBusqueda && <p className="text-[13px] text-fg-secondary">{t('comprar.sinResultados')}</p>}
      </>
    );
    pie = (
      <>
        {consultadoEn && opciones[0] && (
          <span className="mr-auto text-[13px] text-fg-muted">{t('comprar.piePrecios', { moneda: opciones[0].moneda, hace: f.hace(consultadoEn) })}</span>
        )}
        {cerrar(t('comprar.cancelar'), false)}
      </>
    );
  } else if (fase === 'titular' && elegida) {
    antetitulo = t('comprar.paso', { n: 2 });
    titulo = elegida.dominio;
    descripcion = t('comprar.sub2');
    cuerpo = (
      <>
        <div className="flex flex-wrap items-end gap-4">
          <FormField etiqueta={t('comprar.tiempo')} className="w-40">
            {(c) => (
              // Un solo plazo: `/api/domains/purchase` registra a 1 año.
              <Select value="1" disabled>
                <SelectTrigger id={c.id} aria-describedby={c['aria-describedby']} className={CLASE_SELECT_TITULAR}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t('comprar.unAnio')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          {elegida.precio !== null && (
            <span className="inline-flex items-baseline gap-1">
              <span className="text-[28px] font-semibold leading-8 tabular-nums text-fg">{precioTexto}</span>
              <span className="text-sm text-fg-secondary">
                {elegida.moneda} {t('comprar.porUnAnio')}
              </span>
            </span>
          )}
        </div>
        <div className="rounded-xl border border-line">
          <SettingRow titulo={t('comprar.renovarAuto')} descripcion={t('comprar.renovarAutoTexto')} htmlFor="renovar-auto">
            <Switch id="renovar-auto" checked disabled className="data-[state=checked]:bg-brand-action focus-visible:ring-brand" />
          </SettingRow>
        </div>
        <FormSection titulo={t('comprar.titular')} columnas={2}>
          <div className="sm:col-span-2">{campo('nombre', t('comprar.nombre'), { autoComplete: 'organization' })}</div>
          {campo('correo', t('comprar.correo'), { tipo: 'email', autoComplete: 'email' })}
          <PhoneField
            etiqueta={t('comprar.telefono')}
            obligatorio
            valor={titular.telefono}
            onValor={(v) => cambiarTitular('telefono', v)}
            defaultIso={titular.pais || 'CO'}
            formato="e164"
            error={erroresTitular.telefono ? t(`comprar.${erroresTitular.telefono}`) : null}
          />
          <div className="sm:col-span-2">{campo('direccion', t('comprar.direccion'), { autoComplete: 'street-address' })}</div>
          {campo('ciudad', t('comprar.ciudad'), { autoComplete: 'address-level2' })}
          {campo('departamento', t('comprar.departamento'), { autoComplete: 'address-level1' })}
          {campo('codigoPostal', t('comprar.codigoPostal'), { autoComplete: 'postal-code' })}
          <FormField etiqueta={t('comprar.pais')} obligatorio error={erroresTitular.pais ? t('comprar.obligatorio') : null}>
            {(c) => (
              <Select value={titular.pais} onValueChange={(v) => cambiarTitular('pais', v)}>
                <SelectTrigger
                  id={c.id}
                  aria-describedby={c['aria-describedby']}
                  aria-invalid={c['aria-invalid']}
                  aria-required={c['aria-required']}
                  className={CLASE_SELECT_TITULAR}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(PAISES_TITULAR.includes(titular.pais) ? PAISES_TITULAR : [titular.pais, ...PAISES_TITULAR]).filter(Boolean).map((p) => (
                    <SelectItem key={p} value={p}>
                      {nombresPais(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </FormSection>
        <AvisoTonal tono="informacion" titulo={t('comprar.datosRealesTitulo')} descripcion={t('comprar.datosRealesTexto')} />
      </>
    );
    pie = (
      <>
        <button type="button" onClick={() => setFase('buscar')} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          {t('comprar.atras')}
        </button>
        <button type="button" onClick={() => void continuarAPago()} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
          <IconoDominio icono={ICONO.continuar} />
          {t('comprar.continuarPago')}
        </button>
      </>
    );
  } else if (fase === 'pago' && elegida) {
    antetitulo = t('comprar.paso', { n: 3 });
    titulo = t('comprar.titulo3');
    descripcion = t('comprar.sub3');
    cuerpo = (
      <>
        <CajaResumen>
          <ListaDatos>
            <FilaDato etiqueta={t('comprar.lineaDominio', { host: elegida.dominio })} valor={<span className="tabular-nums">{precioTexto}</span>} />
            <FilaDato etiqueta={t('comprar.https')} valor={t('comprar.incluido')} />
            <FilaDato etiqueta={t('comprar.total')} valor={<span className="tabular-nums">{precioTexto}</span>} tamano="lg" separadorAntes />
          </ListaDatos>
        </CajaResumen>
        <FormSection titulo={t('comprar.metodo')}>
          {preparando ? (
            <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
              <IconoDominio icono={ICONO.enCurso} girando />
              {t('comprar.preparandoPago')}
            </p>
          ) : (
            <div className="rounded-lg border border-line-strong bg-surface px-3 py-3">
              <label className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg">
                <IconoDominio icono={ICONO.tarjeta} className="text-fg-secondary" />
                {t('comprar.tarjeta')}
              </label>
              {!sinStripe && <CardElement options={estiloTarjeta()} onChange={(e) => setTarjetaCompleta(e.complete)} />}
            </div>
          )}
          {errorPago && <AvisoTonal tono="peligro" rol="alert" titulo={errorPago} />}
        </FormSection>
        <label className="flex items-start gap-2 text-sm text-fg">
          <Checkbox checked={terminos} onCheckedChange={(v) => setTerminos(v === true)} className="mt-0.5" />
          <span>{t('comprar.terminos')}</span>
        </label>
      </>
    );
    pie = (
      <>
        <span className="mr-auto inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
          <IconoDominio icono={ICONO.pagar} tamano="meta" />
          {t('comprar.pagoSeguro')}
        </span>
        <button type="button" onClick={() => setFase('titular')} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          {t('comprar.atras')}
        </button>
        <button
          type="button"
          onClick={() => void pagar()}
          disabled={!terminos || !tarjetaCompleta || !setup || !stripe || preparando}
          className={clasesBoton({ variante: 'primario', tamano: 'md' })}
        >
          <IconoDominio icono={ICONO.pagar} />
          {t('comprar.pagar', { precio: precioTexto })}
        </button>
      </>
    );
  } else if (fase === 'comprando' && elegida) {
    antetitulo = undefined;
    ({ icono, tono: tonoIcono } = RESULTADO.comprando);
    titulo = t('comprar.compraTitulo', { host: elegida.dominio });
    descripcion = t('comprar.compraSub');
    const hechos = pasos.filter((p) => p === 'hecho').length;
    cuerpo = (
      <>
        <PasosEnCurso
          pasos={[
            { texto: t('comprar.pasoPago'), estado: pasos[0] },
            { texto: t('comprar.pasoRegistro'), estado: pasos[1] },
            { texto: t('comprar.pasoConexion'), estado: pasos[2] },
            { texto: t('comprar.pasoHttps'), estado: pasos[3] },
          ]}
        />
        <BarraProgreso valor={hechos} max={4} etiqueta={t('comprar.progreso')} tamano="sm" />
      </>
    );
    pie = null;
  } else if (fase === 'listo' && elegida && resultado) {
    antetitulo = undefined;
    ({ icono, tono: tonoIcono } = RESULTADO.listo);
    titulo = t('comprar.listoTitulo', { host: elegida.dominio });
    descripcion = resultado.principal ? t('comprar.listoSubPrincipal') : t('comprar.listoSub');
    const d = resultado.dominio;
    cuerpo = (
      <CajaResumen>
        <ListaDatos>
          <FilaDato
            etiqueta={t('comprar.estado')}
            valor={
              d && d.estado === 'activo' && d.ssl === 'emitido' ? (
                <DomainStatusBadge estado="activo" />
              ) : (
                <StatusBadge estado="verificando dns" etiqueta={t('comprar.emitiendo')} icono={ICONO.verificar} />
              )
            }
          />
          {resultado.venceEn && <FilaDato etiqueta={t('comprar.vence')} valor={f.fecha(resultado.venceEn)} />}
          <FilaDato etiqueta={t('comprar.renovacion')} valor={<span className="text-success-text">{t('comprar.encendida')}</span>} />
          <FilaDato etiqueta={t('comprar.cobrado')} valor={<span className="tabular-nums">{precioTexto}</span>} />
          <FilaDato etiqueta={t('comprar.titularFila')} valor={titular.nombre} />
        </ListaDatos>
      </CajaResumen>
    );
    pie = (
      <>
        {resultado.id && (
          <Link href={rutaDetalleDominio(resultado.id)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            {t('comprar.verDominio')}
          </Link>
        )}
        {cerrar(t('comprar.listo'))}
      </>
    );
  } else if (fase === 'fallo' && fallo && elegida) {
    antetitulo = undefined;
    if (fallo.tipo === 'no_disponible') {
      ({ icono, tono: tonoIcono } = RESULTADO.noDisponible);
      titulo = t('comprar.yaNoTitulo', { host: elegida.dominio });
      descripcion = t('comprar.yaNoSub');
      const alts = alternativas(opciones, elegida.dominio);
      cuerpo =
        alts.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-line">
            {alts.map((o) => (
              <li key={o.dominio} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{o.dominio}</span>
                <PriceTag valor={o.precio!} moneda={o.moneda} />
                <button type="button" onClick={() => elegir(o)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                  {t('comprar.elegir')}
                </button>
              </li>
            ))}
          </ul>
        ) : null;
      pie = (
        <>
          <button type="button" onClick={() => setFase('buscar')} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            <IconoDominio icono={ICONO.buscar} />
            {t('comprar.buscarOtro')}
          </button>
          {cerrar()}
        </>
      );
    } else if (fallo.tipo === 'rechazado') {
      ({ icono, tono: tonoIcono } = RESULTADO.pagoRechazado);
      titulo = t('comprar.rechazoTitulo');
      descripcion = t('comprar.rechazoSub');
      cuerpo = (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={fallo.mensaje ?? t('comprar.rechazoSinDetalle')}
          descripcion={fallo.codigo ? t('comprar.rechazoDetalle', { mensaje: fallo.mensaje ?? '', codigo: fallo.codigo }) : undefined}
        />
      );
      pie = (
        <>
          {cerrar(t('comprar.cancelar'), false)}
          <button type="button" onClick={() => void continuarAPago()} className={clasesBoton({ variante: 'tinte', tamano: 'md' })}>
            <IconoDominio icono={ICONO.tarjeta} />
            {t('comprar.usarOtra')}
          </button>
          <button type="button" onClick={() => void continuarAPago()} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            <IconoDominio icono={ICONO.actualizar} />
            {t('comprar.reintentar')}
          </button>
        </>
      );
    } else if (fallo.tipo === 'registrador') {
      ({ icono, tono: tonoIcono } = RESULTADO.registrador);
      titulo = t('comprar.registradorTitulo', { host: elegida.dominio });
      descripcion = fallo.reembolsado ? t('comprar.registradorSub', { precio: precioTexto }) : t('comprar.reembolsoPendienteSub', { precio: precioTexto });
      cuerpo = (
        <CajaResumen>
          <ListaDatos>
            <FilaDato etiqueta={t('comprar.cobro')} valor={<span className="tabular-nums">{`${precioTexto} · ${f.fechaYHora(intentoEn)}`}</span>} />
            <FilaDato
              etiqueta={t('comprar.reembolso')}
              valor={
                fallo.reembolsado ? (
                  <span className="tabular-nums text-success-text">{`${precioTexto} · ${f.fechaYHora(intentoEn)}`}</span>
                ) : (
                  <span className="text-warning-text">{t('comprar.reembolsoRevision')}</span>
                )
              }
            />
          </ListaDatos>
        </CajaResumen>
      );
      pie = (
        <>
          <span className="mr-auto text-[13px] text-fg-muted">{t('comprar.equipoAvisado')}</span>
          {cerrar(t('comprar.cerrar'), false)}
          <button type="button" onClick={() => void continuarAPago()} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            <IconoDominio icono={ICONO.actualizar} />
            {t('comprar.intentarDeNuevo')}
          </button>
        </>
      );
    } else {
      ({ icono, tono: tonoIcono } = RESULTADO.errorGeneral);
      titulo = t('comprar.errorGeneral');
      descripcion = fallo.tipo === 'general' && fallo.mensaje ? fallo.mensaje : undefined;
      pie = (
        <>
          {cerrar(t('comprar.cerrar'), false)}
          <button type="button" onClick={() => setFase('buscar')} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            {t('comprar.buscarOtro')}
          </button>
        </>
      );
    }
  }

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={descripcion}
      antetitulo={antetitulo}
      icono={icono}
      tonoIcono={tonoIcono}
      iconoGirando={fase === 'comprando'}
      ocupado={fase === 'comprando'}
      bloquearClicFuera={fase === 'comprando' || fase === 'pago'}
      pantallaCompletaMovil={fase === 'titular' || fase === 'pago'}
      ancho={560}
      pie={pie ?? undefined}
    >
      {cuerpo}
    </PanelAdaptable>
  );
}
