'use client';

/**
 * Diálogo «Pago contra entrega» (Figma «05 POS y ventas» 02 y 03, aprobado 2026-11-24): las
 * condiciones POR SEDE con que la tienda ofrece el método Efectivo a domicilio. A la izquierda el
 * formulario; a la derecha «Así lo ve tu cliente» y «Resumen de las reglas», que cambian con cada
 * ajuste (misma regla que la tienda: `evaluarContraentrega`).
 *
 * Guarda con `PUT /api/sitio-web/ventas/contraentrega` (servidor, lista blanca, organización de
 * la sesión). Sin condiciones guardadas la sede funciona como hoy.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Banknote, Clock, Eye, Layers, Package, Plus, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { AvisoTonal, CampoNumero, ChipsOpcion, Dialogo, FormField, FormSection, SearchInput, SegmentedControl, SettingRow, clasesBoton } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { formatMoneda } from '@/lib/utils/moneda';
import { cn } from '@/utils/Utils';
import {
  CONDICIONES_POR_DEFECTO,
  MAX_TEXTO_CLIENTE,
  MEDIOS_AL_RECIBIR,
  type CondicionesContraentrega,
  type MedioAlRecibir,
} from '@/lib/contraentrega/reglaContraentrega';
import {
  condicionesIniciales,
  erroresCondiciones,
  resumenReglas,
  vistaPrevia,
  type NombresCatalogo,
} from '@/lib/contraentrega/condicionesWeb';
import type { RespuestaContraentrega } from '@/lib/website/contraentregaSitio.server';
import { simboloMoneda } from '../formatoVentas';
import { textoPieza, useTextosContraentrega } from './textosContraentrega';

const PLAZOS = [15, 30, 45, 60] as const;
const RUTA_METODOS_PAGO = '/app/finanzas/metodos-pago';
const RUTA_CONEXIONES = '/app/integraciones/conexiones';

type Producto = RespuestaContraentrega['productos'][number];

/** Nombres para el resumen: los del catálogo leído más los productos encontrados en el buscador. */
export function nombresDe(datos: RespuestaContraentrega, extra: readonly Producto[] = []): NombresCatalogo {
  return {
    zonas: Object.fromEntries(datos.zonas.map((z) => [z.id, z.nombre])),
    categorias: Object.fromEntries(datos.categorias.map((c) => [c.id, c.nombre])),
    productos: Object.fromEntries([...datos.productos, ...extra].map((p) => [p.id, p.nombre])),
    pasarelas: Object.fromEntries(datos.pasarelas.map((p) => [p.codigo, p.nombre])),
  };
}

/** «Envío gratis desde»: el del checkout o el menor de las zonas de la sede. `null` = no se sabe. */
export function envioGratisDeSede(datos: RespuestaContraentrega, branchId: number | null): number | null {
  const valores = [
    datos.envioGratisDesde,
    ...datos.zonas.filter((z) => z.branchId === null || z.branchId === branchId).map((z) => z.envioGratisDesde),
  ].filter((v): v is number => typeof v === 'number' && v > 0);
  return valores.length > 0 ? Math.min(...valores) : null;
}

/**
 * Valores reales del domicilio de la sede (sus zonas activas y las de toda la organización) para
 * la ayuda de «El valor del envío». `null` si la sede no tiene zonas con valor.
 */
export function domicilioDeSede(datos: RespuestaContraentrega, branchId: number | null): { min: number; max: number } | null {
  const valores = datos.zonas
    .filter((z) => z.branchId === null || z.branchId === branchId)
    .map((z) => z.domicilio)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  if (valores.length === 0) return null;
  return { min: Math.min(...valores), max: Math.max(...valores) };
}

export interface DialogoContraentregaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  datos: RespuestaContraentrega;
  /** Sede con que abre (la primera con condiciones o la principal). */
  sedeInicial: number | null;
  onGuardar: (branchId: number, condiciones: CondicionesContraentrega | null) => Promise<void>;
  buscarProductos: (texto: string) => Promise<Producto[]>;
}

export function DialogoContraentrega({ abierto, onAbiertoChange, datos, sedeInicial, onGuardar, buscarProductos }: DialogoContraentregaProps) {
  const t = useTextosContraentrega();
  const { toast } = useToast();
  const id = useId();
  const [sede, setSede] = useState<number | null>(sedeInicial);
  const [form, setForm] = useState<CondicionesContraentrega>(() => condicionesIniciales(null));
  const [guardando, setGuardando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [encontrados, setEncontrados] = useState<Producto[]>([]);
  const [elegidos, setElegidos] = useState<Producto[]>([]);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);

  const guardadas = sede !== null ? datos.condiciones[String(sede)] ?? null : null;

  useEffect(() => {
    if (!abierto) return;
    setSede(sedeInicial);
  }, [abierto, sedeInicial]);

  useEffect(() => {
    if (!abierto) return;
    setForm(condicionesIniciales(sede !== null ? datos.condiciones[String(sede)] ?? null : null));
    setBusqueda('');
    setEncontrados([]);
    setBuscadorAbierto(false);
  }, [abierto, sede, datos.condiciones]);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setEncontrados([]);
      return;
    }
    let vigente = true;
    setBuscando(true);
    buscarProductos(q)
      .then((r) => vigente && setEncontrados(r))
      .catch(() => vigente && setEncontrados([]))
      .finally(() => vigente && setBuscando(false));
    return () => {
      vigente = false;
    };
  }, [busqueda, buscarProductos]);

  const fmt = (n: number) => formatMoneda(n, datos.moneda);
  const simbolo = simboloMoneda(datos.moneda);
  const nombres = useMemo(() => nombresDe(datos, elegidos), [datos, elegidos]);
  const zonasSede = datos.zonas.filter((z) => z.branchId === null || z.branchId === sede);
  const envioGratis = envioGratisDeSede(datos, sede);
  const domicilio = domicilioDeSede(datos, sede);
  const errores = erroresCondiciones(form);
  const tieneEfectivo = datos.efectivo.existe;
  const hayCambios = JSON.stringify(form) !== JSON.stringify(condicionesIniciales(guardadas)) || !guardadas;
  const pasarelasActivas = datos.pasarelas.map((p) => p.codigo);
  const previa = vistaPrevia(form, pasarelasActivas, nombres, fmt);
  const reglas = resumenReglas(form, nombres, fmt);
  const conAnticipo = form.anticipo.tipo !== 'ninguno';
  const textoPorDefecto = form.anticipo.tipo === 'envio' ? t('texto.porDefectoAnticipo') : t('texto.porDefecto');

  const poner = <K extends keyof CondicionesContraentrega>(k: K, v: CondicionesContraentrega[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ponerAnticipo = <K extends keyof CondicionesContraentrega['anticipo']>(k: K, v: CondicionesContraentrega['anticipo'][K]) =>
    setForm((f) => ({ ...f, anticipo: { ...f.anticipo, [k]: v } }));

  const guardar = async (quitar = false) => {
    if (sede === null) return;
    setGuardando(true);
    try {
      await onGuardar(sede, quitar ? null : form);
      toast({ title: quitar ? t('dialogo.quitadas') : t('dialogo.guardado') });
      onAbiertoChange(false);
    } catch (error) {
      toast({ title: t('dialogo.error', { mensaje: (error as Error).message }), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const agregarCategoria = (idCat: number) =>
    setForm((f) => ({ ...f, productos: { ...f.productos, categorias: Array.from(new Set([...f.productos.categorias, idCat])) } }));
  const agregarProducto = (p: Producto) => {
    setElegidos((e) => (e.some((x) => x.id === p.id) ? e : [...e, p]));
    setForm((f) => ({ ...f, productos: { ...f.productos, productos: Array.from(new Set([...f.productos.productos, p.id])) } }));
  };
  const quitarCategoria = (idCat: number) =>
    setForm((f) => ({ ...f, productos: { ...f.productos, categorias: f.productos.categorias.filter((x) => x !== idCat) } }));
  const quitarProducto = (idProd: number) =>
    setForm((f) => ({ ...f, productos: { ...f.productos, productos: f.productos.productos.filter((x) => x !== idProd) } }));

  const q = busqueda.trim().toLowerCase();
  const categoriasEncontradas = q.length >= 2 ? datos.categorias.filter((c) => c.nombre.toLowerCase().includes(q) && !form.productos.categorias.includes(c.id)).slice(0, 8) : [];
  const productosEncontrados = encontrados.filter((p) => !form.productos.productos.includes(p.id));

  const formulario = (
    <div className="flex min-w-0 flex-col gap-5">
      {!tieneEfectivo && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('dialogo.sinEfectivoTitulo')}
          descripcion={t('dialogo.sinEfectivoDescripcion')}
          accion={{ etiqueta: t('dialogo.irFinanzas'), href: RUTA_METODOS_PAGO }}
        />
      )}
      {tieneEfectivo && !datos.efectivo.visibleWeb && <AvisoTonal tono="informacion" titulo={t('dialogo.efectivoOculto')} compacto />}

      <FormField etiqueta={t('dialogo.sede')} ayuda={t('dialogo.sedeAyuda')}>
        {(campo) => (
          <Select value={sede === null ? '' : String(sede)} onValueChange={(v) => setSede(Number(v))} disabled={datos.sedes.length === 0}>
            <SelectTrigger className="h-10 rounded-lg" aria-labelledby={campo.idEtiqueta}>
              <SelectValue placeholder={t('dialogo.sinSedes')} />
            </SelectTrigger>
            <SelectContent>
              {datos.sedes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {datos.condiciones[String(s.id)] ? t('dialogo.sedeConCondiciones', { sede: s.nombre }) : s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <div className="rounded-xl border border-line bg-subtle px-4 py-3">
        <SettingRow titulo={t('ofrecer.titulo')} descripcion={t('ofrecer.ayuda')} htmlFor={`${id}-ofrecer`}>
          <Switch id={`${id}-ofrecer`} checked={form.ofrecer} onCheckedChange={(v) => poner('ofrecer', v)} />
        </SettingRow>
      </div>

      <fieldset disabled={!form.ofrecer} className={cn('flex flex-col gap-5', !form.ofrecer && 'opacity-60')}>
        <FormSection titulo={t('monto.titulo')} descripcion={t('monto.ayuda')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('monto.minimo')} error={errores.includes('monto_rango') ? t('monto.errorRango') : null}>
              <CampoNumero valor={form.montoMinimo} onValorChange={(v) => poner('montoMinimo', v)} prefijo={simbolo} minimo={0} decimales={0} />
            </FormField>
            <FormField etiqueta={t('monto.maximo')}>
              <CampoNumero valor={form.montoMaximo} onValorChange={(v) => poner('montoMaximo', v)} prefijo={simbolo} minimo={0} decimales={0} />
            </FormField>
          </div>
        </FormSection>

        <FormSection titulo={t('zonas.titulo')} descripcion={t('zonas.ayuda')}>
          <RadioGroup
            value={form.zonas.modo}
            onValueChange={(v) => poner('zonas', v === 'algunas' ? { modo: 'algunas', ids: form.zonas.modo === 'algunas' ? form.zonas.ids : [] } : { modo: 'todas' })}
            className="flex flex-col gap-2"
          >
            <label className="flex items-center gap-2.5 text-sm text-fg">
              <RadioGroupItem value="todas" id={`${id}-zonas-todas`} />
              {t('zonas.todas')}
            </label>
            <label className="flex items-center gap-2.5 text-sm text-fg">
              <RadioGroupItem value="algunas" id={`${id}-zonas-algunas`} />
              {t('zonas.algunas')}
            </label>
          </RadioGroup>
          {form.zonas.modo === 'algunas' &&
            (zonasSede.length === 0 ? (
              <AvisoTonal tono="advertencia" titulo={t('zonas.sinZonas')} compacto />
            ) : (
              <div className="pl-7">
                <ChipsOpcion
                  multiple
                  etiqueta={t('zonas.algunas')}
                  opciones={zonasSede.map((z) => ({ valor: z.id, etiqueta: z.nombre }))}
                  valor={form.zonas.ids}
                  onValorChange={(ids) => poner('zonas', { modo: 'algunas', ids })}
                />
                {errores.includes('zonas_vacias') && <p role="alert" className="mt-1 text-xs text-danger-text">{t('zonas.errorVacias')}</p>}
              </div>
            ))}
          <SettingRow titulo={t('zonas.transportadora')} descripcion={t('zonas.transportadoraAyuda')} htmlFor={`${id}-transportadora`}>
            <Switch id={`${id}-transportadora`} checked={form.transportadora} onCheckedChange={(v) => poner('transportadora', v)} />
          </SettingRow>
        </FormSection>

        <FormSection titulo={t('productos.titulo')} descripcion={t('productos.ayuda')}>
          <SegmentedControl
            etiqueta={t('productos.titulo')}
            opciones={[
              { valor: 'todos', etiqueta: t('productos.todos') },
              { valor: 'solo', etiqueta: t('productos.solo') },
              { valor: 'excepto', etiqueta: t('productos.excepto') },
            ]}
            valor={form.productos.modo}
            onValorChange={(modo) => poner('productos', { ...form.productos, modo })}
          />
          {form.productos.modo !== 'todos' && (
            <div className="flex flex-col gap-2">
              {(form.productos.categorias.length > 0 || form.productos.productos.length > 0) && (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {form.productos.categorias.map((idCat) => {
                    const c = datos.categorias.find((x) => x.id === idCat);
                    const nombre = c?.nombre ?? `#${idCat}`;
                    return (
                      <li key={`c-${idCat}`} className="flex items-center gap-3 px-3 py-2.5">
                        <Layers aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{nombre}</p>
                          <p className="truncate text-xs text-fg-secondary">{c?.descripcion || t('productos.categoria')}</p>
                        </div>
                        <button type="button" onClick={() => quitarCategoria(idCat)} aria-label={t('productos.quitar', { nombre })} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}>
                          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </button>
                      </li>
                    );
                  })}
                  {form.productos.productos.map((idProd) => {
                    const nombre = nombres.productos[idProd] ?? `#${idProd}`;
                    const sku = [...datos.productos, ...elegidos].find((p) => p.id === idProd)?.sku;
                    return (
                      <li key={`p-${idProd}`} className="flex items-center gap-3 px-3 py-2.5">
                        <Package aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{nombre}</p>
                          <p className="truncate text-xs text-fg-secondary">{sku || t('productos.producto')}</p>
                        </div>
                        <button type="button" onClick={() => quitarProducto(idProd)} aria-label={t('productos.quitar', { nombre })} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}>
                          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {buscadorAbierto ? (
                <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
                  <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('productos.buscar')} etiqueta={t('productos.buscar')} atajo={false} pistaAtajo={false} cargando={buscando} tamano="sm" autoFocus />
                  {q.length < 2 ? (
                    <p className="text-xs text-fg-secondary">{t('productos.buscarAyuda')}</p>
                  ) : categoriasEncontradas.length + productosEncontrados.length === 0 && !buscando ? (
                    <p className="text-xs text-fg-secondary">{t('productos.sinResultados')}</p>
                  ) : (
                    <ul className="flex max-h-56 flex-col overflow-y-auto">
                      {categoriasEncontradas.map((c) => (
                        <li key={`bc-${c.id}`}>
                          <button type="button" onClick={() => agregarCategoria(c.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg hover:bg-hover">
                            <Layers aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                            <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                            <span className="text-xs text-fg-secondary">{t('productos.categoria')}</span>
                          </button>
                        </li>
                      ))}
                      {productosEncontrados.map((p) => (
                        <li key={`bp-${p.id}`}>
                          <button type="button" onClick={() => agregarProducto(p)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg hover:bg-hover">
                            <Package aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                            <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                            <span className="text-xs text-fg-secondary">{p.sku || t('productos.producto')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => setBuscadorAbierto(true)} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}>
                  <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('productos.agregar')}
                </button>
              )}
              {errores.includes('productos_vacios') && <p role="alert" className="text-xs text-danger-text">{t('productos.errorVacios')}</p>}
            </div>
          )}
        </FormSection>

        <FormSection titulo={t('medios.titulo')} descripcion={t('medios.ayuda')}>
          <ChipsOpcion
            multiple
            etiqueta={t('medios.titulo')}
            opciones={MEDIOS_AL_RECIBIR.map((m) => ({ valor: m, etiqueta: t(`medios.${m}`) }))}
            valor={form.medios}
            onValorChange={(medios) => poner('medios', medios as MedioAlRecibir[])}
          />
          {errores.includes('medios_vacios') && <p role="alert" className="text-xs text-danger-text">{t('medios.errorVacios')}</p>}
        </FormSection>

        <FormSection titulo={t('anticipo.titulo')} descripcion={t('anticipo.ayuda')}>
          <div className="rounded-xl border border-line px-4 py-3">
            <SettingRow titulo={t('anticipo.pedir')} htmlFor={`${id}-anticipo`}>
              <Switch
                id={`${id}-anticipo`}
                checked={conAnticipo}
                onCheckedChange={(v) => ponerAnticipo('tipo', v ? 'envio' : 'ninguno')}
              />
            </SettingRow>
          </div>
          {conAnticipo && (
            <>
              <RadioGroup value={form.anticipo.tipo} onValueChange={(v) => ponerAnticipo('tipo', v as CondicionesContraentrega['anticipo']['tipo'])} className="flex flex-col gap-2">
                <OpcionAnticipo valor="envio" elegida={form.anticipo.tipo === 'envio'} titulo={t('anticipo.envio')} ayuda={
                    domicilio === null
                      ? t('anticipo.envioAyuda')
                      : domicilio.min === domicilio.max
                        ? t('anticipo.envioAyudaUno', { valor: fmt(domicilio.min) })
                        : t('anticipo.envioAyudaRango', { min: fmt(domicilio.min), max: fmt(domicilio.max) })
                  } />
                <OpcionAnticipo
                  valor="porcentaje"
                  elegida={form.anticipo.tipo === 'porcentaje'}
                  titulo={t('anticipo.porcentaje')}
                  ayuda={t('anticipo.porcentajeAyuda')}
                  control={
                    <CampoNumero
                      valor={form.anticipo.porcentaje}
                      onValorChange={(v) => ponerAnticipo('porcentaje', v)}
                      sufijo="%"
                      minimo={1}
                      maximo={100}
                      decimales={0}
                      tamano="sm"
                      className="w-24"
                      disabled={form.anticipo.tipo !== 'porcentaje'}
                      aria-label={t('anticipo.porcentaje')}
                      placeholder="20"
                    />
                  }
                />
                <OpcionAnticipo
                  valor="fijo"
                  elegida={form.anticipo.tipo === 'fijo'}
                  titulo={t('anticipo.fijo')}
                  ayuda={t('anticipo.fijoAyuda')}
                  control={
                    <CampoNumero
                      valor={form.anticipo.valorFijo}
                      onValorChange={(v) => ponerAnticipo('valorFijo', v)}
                      prefijo={simbolo}
                      minimo={0}
                      decimales={0}
                      tamano="sm"
                      className="w-32"
                      disabled={form.anticipo.tipo !== 'fijo'}
                      aria-label={t('anticipo.fijo')}
                      placeholder="10.000"
                    />
                  }
                />
              </RadioGroup>
              {errores.includes('porcentaje_invalido') && <p role="alert" className="text-xs text-danger-text">{t('anticipo.errorPorcentaje')}</p>}
              {errores.includes('valor_fijo_invalido') && <p role="alert" className="text-xs text-danger-text">{t('anticipo.errorFijo')}</p>}

              {form.anticipo.tipo === 'envio' && (
                <div className="flex flex-col gap-2 rounded-xl border border-line-warning bg-warning-subtle px-4 py-3" data-aviso-envio-gratis="">
                  <p className="flex items-start gap-2 text-sm text-warning-text">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                    {envioGratis !== null
                      ? t('anticipo.envioGratisAviso', { monto: fmt(envioGratis), cero: fmt(0) })
                      : t('anticipo.envioGratisAvisoSinMonto', { cero: fmt(0) })}
                  </p>
                  <RadioGroup
                    value={form.anticipo.siEnvioGratis}
                    onValueChange={(v) => ponerAnticipo('siEnvioGratis', v === 'valor_fijo' ? 'valor_fijo' : 'sin_anticipo')}
                    className="flex flex-col gap-2 pl-6"
                  >
                    <label className="flex items-center gap-2.5 text-sm text-fg">
                      <RadioGroupItem value="sin_anticipo" />
                      {t('anticipo.envioGratisNoPedir')}
                    </label>
                    <div className="flex flex-wrap items-center gap-2.5 text-sm text-fg">
                      <label className="flex items-center gap-2.5">
                        <RadioGroupItem value="valor_fijo" />
                        {t('anticipo.envioGratisFijo')}
                      </label>
                      <CampoNumero
                        valor={form.anticipo.valorEnvioGratis}
                        onValorChange={(v) => ponerAnticipo('valorEnvioGratis', v)}
                        prefijo={simbolo}
                        minimo={0}
                        decimales={0}
                        tamano="sm"
                        className="w-32"
                        disabled={form.anticipo.siEnvioGratis !== 'valor_fijo'}
                        aria-label={t('anticipo.envioGratisFijo')}
                      />
                    </div>
                  </RadioGroup>
                  {errores.includes('valor_envio_gratis_invalido') && <p role="alert" className="text-xs text-danger-text">{t('anticipo.errorEnvioGratis')}</p>}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField etiqueta={t('anticipo.seCobraCon')}>
                  {(campo) => (
                    <Select value={form.anticipo.pasarela ?? '__todas'} onValueChange={(v) => ponerAnticipo('pasarela', v === '__todas' ? null : v)}>
                      <SelectTrigger className="h-10 rounded-lg" aria-labelledby={campo.idEtiqueta}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__todas">{t('anticipo.cualquiera')}</SelectItem>
                        {datos.pasarelas.map((p) => (
                          <SelectItem key={p.codigo} value={p.codigo}>
                            {t('anticipo.conectada', { nombre: p.nombre })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField etiqueta={t('anticipo.plazo')}>
                  {(campo) => (
                    <Select value={String(form.anticipo.plazoMinutos)} onValueChange={(v) => ponerAnticipo('plazoMinutos', Number(v))}>
                      <SelectTrigger className="h-10 rounded-lg" aria-labelledby={campo.idEtiqueta}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set<number>([...PLAZOS, form.anticipo.plazoMinutos])).sort((a, b) => a - b).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {t('anticipo.plazoMinutos', { n })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              </div>
              {datos.pasarelas.length === 0 && (
                <AvisoTonal tono="peligro" titulo={t('anticipo.sinPasarela')} compacto accion={{ etiqueta: t('dialogo.irFinanzas'), href: RUTA_CONEXIONES }} />
              )}

              <div className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium text-fg">
                  <ShieldCheck aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                  {t('anticipo.siNoRecibe')}
                </p>
                {/*
                  Criterio del Contador (2026-11-25): si el cliente no recibe el pedido, el anticipo
                  SOLO se devuelve. «La tienda se lo queda» queda apagado: no hay concepto DIAN para
                  llevarlo a 4255 sin IVA y hay riesgo de consumidor (retracto, art. 47 Ley 1480 de
                  2011; queja ante la SIC). Si algún día una tienda lo necesita: primero Legal y
                  después el Contador. `condicionesIniciales` y el servidor fuerzan «devolver».
                */}
                <p className="pl-6 text-sm text-fg">{t('anticipo.devolver')}</p>
                <p className="text-xs text-fg-secondary">
                  {t('anticipo.siNoRecibeAyuda', { linea: t('anticipo.lineaDevolver') })}
                </p>
              </div>

              <p className="flex items-start gap-2 rounded-xl bg-warning-subtle px-4 py-3 text-sm text-warning-text">
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                {t('anticipo.avisoPlazo', { n: form.anticipo.plazoMinutos })}
              </p>
            </>
          )}
        </FormSection>

        <FormSection titulo={t('quien.titulo')}>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={form.soloClientesConEntregas} onCheckedChange={(v) => poner('soloClientesConEntregas', v === true)} className="mt-0.5" />
            <span>
              <span className="block text-sm text-fg">{t('quien.soloEntregados')}</span>
              <span className="block text-xs text-fg-secondary">{t('quien.soloEntregadosAyuda')}</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={form.noOfrecerARechazados} onCheckedChange={(v) => poner('noOfrecerARechazados', v === true)} className="mt-0.5" />
            <span>
              <span className="block text-sm text-fg">{t('quien.sinRechazos')}</span>
              <span className="block text-xs text-fg-secondary">{t('quien.sinRechazosAyuda')}</span>
            </span>
          </label>
        </FormSection>

        <FormSection titulo={t('texto.titulo')} descripcion={t('texto.ayuda')}>
          <div className="flex flex-col gap-1">
            <Textarea
              value={form.texto ?? ''}
              onChange={(e) => poner('texto', e.target.value.slice(0, MAX_TEXTO_CLIENTE) || null)}
              placeholder={textoPorDefecto}
              maxLength={MAX_TEXTO_CLIENTE}
              rows={3}
              aria-label={t('texto.titulo')}
              className="rounded-lg"
            />
            <p className="self-end text-xs tabular-nums text-fg-secondary">{t('texto.contador', { n: (form.texto ?? '').length, max: MAX_TEXTO_CLIENTE })}</p>
          </div>
        </FormSection>
      </fieldset>
    </div>
  );

  const ej = previa.ejemplo;
  const vista = (
    <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0" aria-label={t('cliente.titulo')}>
      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('cliente.titulo')}
      </p>
      {!form.ofrecer ? (
        <p className="rounded-xl border border-line bg-subtle px-4 py-3 text-sm text-fg-secondary">{t('cliente.apagada')}</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-brand bg-surface p-4" data-vista-cliente="">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-brand">
              <span className="size-2 rounded-full bg-brand" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{t('cliente.opcion')}</p>
              <p className="text-xs text-fg-secondary">{form.texto || textoPorDefecto}</p>
            </div>
          </div>
          {ej.disponible && ej.anticipo ? (
            <dl className="flex flex-col gap-1.5 rounded-lg bg-warning-subtle px-3 py-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg">{t('cliente.hoyEnLinea', { base: t(ej.anticipo.base === 'envio' ? 'cliente.baseEnvio' : 'cliente.basePorcentaje') })}</dt>
                <dd className="font-semibold tabular-nums text-fg">{fmt(ej.anticipo.monto)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg">{t('cliente.alRecibir')}</dt>
                <dd className="font-semibold tabular-nums text-fg">{fmt(ej.alRecibir)}</dd>
              </div>
            </dl>
          ) : ej.disponible ? (
            <p className="text-sm text-fg">{t('cliente.sinAnticipo', { total: fmt(ej.total) })}</p>
          ) : (
            <p className="text-sm text-warning-text">{t('cliente.noDisponibleEjemplo', { total: fmt(ej.total) })}</p>
          )}
        </div>
      )}
      {form.ofrecer && previa.motivos.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-fg-secondary">{t('cliente.motivosTitulo')}</p>
          <ul className="flex flex-col gap-2">
            {previa.motivos.map((m) => (
              <li key={m.clave} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-xs text-fg-secondary">
                <Banknote aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
                {textoPieza(t, m)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-1 rounded-xl bg-brand-tint px-4 py-3" data-resumen-reglas="">
        <p className="text-sm font-semibold text-brand-deep">{t('cliente.resumenTitulo')}</p>
        <ul className="flex flex-col gap-0.5 text-xs text-brand-deep">
          {reglas.map((r, i) => (
            <li key={`${r.clave}-${i}`}>· {textoPieza(t, r)}</li>
          ))}
        </ul>
      </div>
    </aside>
  );

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={t('dialogo.titulo')}
      descripcion={t('dialogo.descripcion')}
      icono={Banknote}
      ancho={1024}
      pie={t('dialogo.pie')}
      secundarios={
        guardadas
          ? [{ etiqueta: t('dialogo.quitarCondiciones'), onClick: () => void guardar(true), deshabilitada: guardando }]
          : undefined
      }
      primario={{
        etiqueta: t('dialogo.guardar'),
        onClick: () => void guardar(false),
        cargando: guardando,
        deshabilitada: !tieneEfectivo || sede === null || errores.length > 0 || !hayCambios,
      }}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {formulario}
        {vista}
      </div>
      {datos.sedes.length === 0 && <p className="text-sm text-fg-secondary">{t('dialogo.sinSedes')}</p>}
    </Dialogo>
  );
}

function OpcionAnticipo({ valor, elegida, titulo, ayuda, control }: { valor: string; elegida: boolean; titulo: string; ayuda: string; control?: ReactNode }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3',
        elegida ? 'border-brand bg-brand-tint' : 'border-line bg-surface',
      )}
    >
      <RadioGroupItem value={valor} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{titulo}</span>
        <span className="block text-xs text-fg-secondary">{ayuda}</span>
      </span>
      {control}
    </label>
  );
}

/** Para pruebas: el formulario arranca con el defecto (= como hoy). */
export const FORMULARIO_POR_DEFECTO = CONDICIONES_POR_DEFECTO;
