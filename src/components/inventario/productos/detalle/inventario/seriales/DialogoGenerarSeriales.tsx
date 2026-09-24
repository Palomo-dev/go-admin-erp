'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ListPlus, ShieldCheck, Sparkles, TriangleAlert, Wand2 } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { productoService, type ResultadoGenerarSeriales } from '@/lib/services/productoService';
import { useProductoDetalle } from '../../ContextoProducto';
import { parsearListaSeriales, previsualizarSerial, validarPatron } from '../../../logica/seriales';
import { claveStock, cupoEn, repetidosEnLista, serialesOcupando, siguienteSecuencia, type FilaSerial } from './listadoSeriales';

/**
 * Alta masiva de seriales (`fn_producto_generar_seriales`) en dos modos:
 * - «Por patrón»: N seriales con el patrón del producto; el consecutivo sigue
 *   al conteo del producto y el servidor salta los que ya existan.
 * - «Lista o escáner»: seriales pegados o leídos con el lector (uno por
 *   línea, coma, punto y coma o tabulador).
 * La sucursal es obligatoria y el cupo es el stock de la sucursal menos los
 * seriales en stock o reservados allí (el servidor lo vuelve a validar).
 */

export interface ProductoSerializable {
  id: number;
  sku: string;
  nombre: string;
  /** Variante (vs. el producto base). */
  esVariante: boolean;
}

export interface SucursalSerial {
  id: number;
  nombre: string;
}

type Modo = 'patron' | 'lista';

export interface DialogoGenerarSerialesProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Productos a los que se pueden dar seriales (el base o sus variantes). */
  productos: readonly ProductoSerializable[];
  sucursales: readonly SucursalSerial[];
  /** Todos los seriales del producto y sus variantes (cupo, consecutivo, repetidos). */
  filas: readonly FilaSerial[];
  stock: ReadonlyMap<string, number>;
  /** Tras crear: recargar la lista. */
  onHecho: () => void;
}

export function DialogoGenerarSeriales({ abierto, onAbiertoChange, productos, sucursales, filas, stock, onHecho }: DialogoGenerarSerialesProps) {
  const t = useTranslations('productoDetalle.seriales');
  const tc = useTranslations('productoDetalle.comun');
  const tErr = useTranslations('productoForm.errores');
  const { producto, organizacionId, resumen, moneda, fechas, sucursalActiva, mensajeError, recargar } = useProductoDetalle();
  const { toast } = useToast();
  const entero = useFormatoEntero();

  const [productId, setProductId] = useState<number | null>(null);
  const [modo, setModo] = useState<Modo>('patron');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState<number | null>(1);
  const [lista, setLista] = useState('');
  const [costo, setCosto] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoGenerarSeriales | null>(null);

  const patron = producto.serial_pattern ?? '';
  const errorPatron = validarPatron(patron);
  const ocupando = useMemo(() => serialesOcupando(filas), [filas]);
  const elegido = productos.find((p) => p.id === productId) ?? null;

  const cupoDe = (pid: number | null, bid: number | null): number => (pid === null || bid === null ? 0 : cupoEn(stock, ocupando, pid, bid));
  const stockDe = (pid: number | null, bid: number | null): number =>
    pid === null || bid === null ? 0 : Math.floor(stock.get(claveStock(pid, bid)) ?? 0);
  const ocupandoDe = (pid: number | null, bid: number | null): number =>
    pid === null || bid === null ? 0 : ocupando.get(claveStock(pid, bid)) ?? 0;

  // Al abrir: producto único preseleccionado, sucursal activa si tiene cupo.
  useEffect(() => {
    if (!abierto) return;
    const pid = productos.length === 1 ? productos[0].id : null;
    const bid = sucursalActiva !== null && sucursales.some((s) => s.id === sucursalActiva) ? sucursalActiva : null;
    setProductId(pid);
    setBranchId(bid);
    setModo(errorPatron ? 'lista' : 'patron');
    setCantidad(pid !== null && bid !== null ? Math.max(cupoDe(pid, bid), 1) : 1);
    setLista('');
    setCosto(pid === producto.id ? resumen?.costo ?? null : null);
    setNota('');
    setError(null);
    setResultado(null);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const elegirProducto = (pid: number) => {
    setProductId(pid);
    setCosto(pid === producto.id ? resumen?.costo ?? null : null);
    if (branchId !== null) setCantidad(Math.max(cupoDe(pid, branchId), 1));
  };

  const elegirSucursal = (bid: number) => {
    setBranchId(bid);
    // Como antes: al elegir sucursal, la cantidad pasa a los faltantes.
    setCantidad(Math.max(cupoDe(productId, bid), 1));
  };

  const cupo = cupoDe(productId, branchId);
  const seriales = useMemo(() => parsearListaSeriales(lista), [lista]);
  const repetidos = useMemo(() => repetidosEnLista(lista), [lista]);
  const existentes = useMemo(() => {
    const ya = new Set(filas.map((f) => f.serial.trim().toLowerCase()));
    return seriales.filter((s) => ya.has(s.toLowerCase()));
  }, [filas, seriales]);
  const aRegistrar = modo === 'patron' ? cantidad ?? 0 : seriales.length;

  const vistaPrevia = useMemo(() => {
    if (modo !== 'patron' || errorPatron || !elegido || !cantidad || cantidad < 1) return null;
    const desde = siguienteSecuencia(filas, elegido.id);
    const datos = { sku: elegido.sku, fecha: fechas.getToday() };
    return {
      primero: previsualizarSerial(patron, { ...datos, secuencia: desde }),
      ultimo: cantidad > 1 ? previsualizarSerial(patron, { ...datos, secuencia: desde + cantidad - 1 }) : null,
    };
  }, [modo, errorPatron, elegido, cantidad, filas, fechas, patron]);

  const motivo = ((): string | undefined => {
    if (!elegido) return t('generar.motivoVariante');
    if (branchId === null) return t('generar.sinSucursal');
    if (modo === 'patron') {
      if (errorPatron) return tErr(errorPatron);
      if (!cantidad || cantidad < 1) return tErr('cantidad_invalida');
    } else if (seriales.length === 0) {
      return t('generar.motivoLista');
    }
    if (cupo <= 0) return t('generar.sinCupo');
    if (aRegistrar > cupo) return tErr('excede_stock', { detalle: String(cupo) });
    return undefined;
  })();

  const enviar = async () => {
    if (motivo || !elegido || branchId === null) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await productoService.generarSeriales(organizacionId, elegido.id, branchId, {
        cantidad: modo === 'patron' ? cantidad ?? 0 : undefined,
        seriales: modo === 'lista' ? seriales : undefined,
        costo,
        nota: nota.trim() || null,
      });
      setResultado(r);
      toast({
        title: t('generar.toastOk', { count: r.creados.length }),
        description: r.omitidos.length > 0 ? t('generar.toastOmitidos', { count: r.omitidos.length }) : undefined,
      });
      onHecho();
      void recargar();
    } catch (e) {
      const m = mensajeError(e);
      setError(m);
      toast({ variant: 'destructive', title: t('generar.toastError'), description: m });
    } finally {
      setEnviando(false);
    }
  };

  const garantiaMeses = producto.warranty_months ?? 0;
  const hrefEditar = `/app/inventario/productos/${producto.uuid || producto.id}/editar#inventario`;

  if (resultado) {
    return (
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={t('generar.resultadoTitulo')}
        icono={CheckCircle2}
        ancho={560}
        primario={{ etiqueta: tc('cerrar'), onClick: () => onAbiertoChange(false) }}
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-line-success bg-success-subtle px-3 py-2 text-sm text-success-text">
            {t('generar.resultadoCreados', { count: resultado.creados.length })}
          </p>
          {resultado.creados.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-fg-secondary">{t('generar.resultadoRango')}</p>
              <p className="font-mono text-sm text-fg">
                {resultado.creados[0].serial}
                {resultado.creados.length > 1 && ` → ${resultado.creados[resultado.creados.length - 1].serial}`}
              </p>
            </div>
          )}
          {resultado.omitidos.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-warning-text">{t('generar.resultadoOmitidos', { count: resultado.omitidos.length })}</p>
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {resultado.omitidos.map((o) => (
                  <li key={o.serial} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                    <span className="font-mono text-fg">{o.serial}</span>
                    <span className="text-xs text-fg-secondary">
                      {o.motivo === 'duplicado' ? t('generar.motivoDuplicado') : o.motivo}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('generar.titulo')}
      descripcion={
        modo === 'patron' && patron ? (
          <>
            {t('generar.descripcionPatron')} <code className="font-mono text-link">{patron}</code>
          </>
        ) : (
          t('generar.descripcionLista')
        )
      }
      icono={Sparkles}
      ancho={560}
      primario={{
        etiqueta: enviando
          ? t('generar.generando')
          : modo === 'patron'
            ? t('generar.generarN', { count: aRegistrar })
            : t('generar.registrarN', { count: aRegistrar }),
        onClick: () => void enviar(),
        cargando: enviando,
        deshabilitada: !!motivo,
        motivo,
      }}
    >
      <div className="space-y-4">
        {productos.length > 1 && (
          <FormField etiqueta={t('generar.variante')} obligatorio ayuda={t('generar.varianteAyuda')}>
            {(c) => (
              <Select value={productId !== null ? String(productId) : ''} onValueChange={(v) => elegirProducto(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta}>
                  <SelectValue placeholder={t('generar.variantePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.esVariante ? p.nombre : t('tabla.productoBase')} · {p.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}

        <SegmentedControl<Modo>
          etiqueta={t('generar.modo')}
          anchoCompleto
          valor={modo}
          onValorChange={setModo}
          opciones={[
            { valor: 'patron', etiqueta: t('generar.modoPatron'), icono: Wand2 },
            { valor: 'lista', etiqueta: t('generar.modoLista'), icono: ListPlus },
          ]}
        />

        <FormField
          etiqueta={t('generar.sucursal')}
          obligatorio
          ayuda={branchId === null ? undefined : t('generar.sucursalAyuda')}
          error={branchId === null ? t('generar.sinSucursal') : undefined}
        >
          {(c) => (
            <Select value={branchId !== null ? String(branchId) : ''} onValueChange={(v) => elegirSucursal(Number(v))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta}>
                <SelectValue placeholder={t('generar.sucursalPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {t('generar.opcionSucursal', {
                      sucursal: s.nombre,
                      stock: entero(stockDe(productId, s.id)),
                      faltan: entero(cupoDe(productId, s.id)),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {branchId !== null && elegido && (
          <p className="text-xs text-fg-secondary">
            {t('generar.stockSucursal', {
              stock: entero(stockDe(elegido.id, branchId)),
              existentes: entero(ocupandoDe(elegido.id, branchId)),
            })}
            {cupo > 0 && <> · {t.rich('generar.faltan', { count: cupo, b: (x) => <strong className="text-fg">{x}</strong> })}</>}
          </p>
        )}

        {modo === 'patron' ? (
          errorPatron ? (
            <div role="alert" className="flex gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p>{tErr(errorPatron)}</p>
                <p>
                  {t('generar.patronAyuda')}{' '}
                  <Link href={hrefEditar} className="font-medium text-link underline-offset-2 hover:underline">
                    {t('sinSeriales.editar')}
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <FormField etiqueta={t('generar.cantidad')} obligatorio>
                <CampoNumero valor={cantidad} onValorChange={setCantidad} decimales={0} minimo={1} maximo={cupo > 0 ? cupo : undefined} />
              </FormField>
              {cupo > 0 && cantidad !== cupo && (
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setCantidad(cupo)}>
                  {t('generar.generarFaltantes', { count: cupo })}
                </Button>
              )}
              {vistaPrevia && (
                <p className="text-xs text-fg-secondary">
                  {t('generar.vistaPrevia')}{' '}
                  <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-fg">{vistaPrevia.primero}</code>
                  {vistaPrevia.ultimo && (
                    <>
                      {' … '}
                      <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-fg">{vistaPrevia.ultimo}</code>
                    </>
                  )}
                  <span className="mt-1 block text-fg-muted">{t('generar.vistaPreviaNota')}</span>
                </p>
              )}
            </div>
          )
        ) : (
          <FormField
            etiqueta={t('generar.lista')}
            obligatorio
            ayuda={t('generar.listaAyuda')}
            extra={<span className="text-xs tabular-nums text-fg-secondary">{t('generar.listaContador', { count: seriales.length })}</span>}
          >
            <Textarea
              value={lista}
              onChange={(e) => setLista(e.target.value)}
              rows={6}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-sm"
              placeholder={t('generar.listaPlaceholder')}
            />
          </FormField>
        )}

        {modo === 'lista' && (repetidos > 0 || existentes.length > 0) && (
          <ul className="space-y-1 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-warning-text">
            {repetidos > 0 && <li>{t('generar.repetidos', { count: repetidos })}</li>}
            {existentes.length > 0 && (
              <li>
                {t('generar.existentes', { count: existentes.length })}{' '}
                <span className="font-mono">{existentes.slice(0, 5).join(', ')}{existentes.length > 5 ? '…' : ''}</span>
              </li>
            )}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={`${t('generar.costo')} (${tc('opcional')})`} ayuda={t('generar.costoAyuda')}>
            <CampoNumero valor={costo} onValorChange={setCosto} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
          </FormField>
          <FormField etiqueta={`${t('generar.nota')} (${tc('opcional')})`}>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={300} placeholder={t('generar.notaPlaceholder')} />
          </FormField>
        </div>

        {garantiaMeses > 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-line-success bg-success-subtle px-3 py-2 text-sm text-success-text">
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
            {t('generar.avisoGarantia', { count: garantiaMeses })}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
