'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Barcode, CheckCircle2, Info, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CodigoBarras, Dialogo, EmptyState, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { cargarProductosEtiquetables, type ProductoEtiquetable } from '@/lib/services/etiquetasProductoService';
import {
  claveErrorCodigos,
  generarCodigosFaltantes,
  guardarNumeracion,
  obtenerNumeracion,
  type CodigoAsignado,
} from '@/lib/services/codigosBarrasService';
import {
  CONFIG_NUMERACION_POR_DEFECTO,
  previsualizarCodigos,
  validarPrefijo,
  type ConfigNumeracion,
  type FormatoNumeracion,
} from '@/lib/utils/codigoBarras';
import { cn } from '@/utils/Utils';

/**
 * «Generar códigos de barras» (Figma `Diálogo · Generar códigos de barras`,
 * sección `518:273568`; estados listo · sin pendientes · generando · error).
 *
 * Solo rellena huecos: los productos y variantes seleccionados que no tienen
 * código reciben uno de la numeración de la organización (formato, prefijo,
 * «empezar en» y longitud, que se guardan). Los que ya tienen no se tocan:
 * reemplazar un código se decide producto a producto, porque rompe etiquetas
 * ya impresas. Todo en una transacción (`codigos_barras_generar_faltantes`).
 */
export interface GenerarCodigosDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  productIds: number[];
  onGenerados?: (asignados: CodigoAsignado[]) => void;
}

type Estado = 'cargando' | 'listo' | 'error';
const VISIBLES = 4;
const LONGITUDES = [8, 10, 12, 14, 16];

export function GenerarCodigosDialog({ abierto, onAbiertoChange, productIds, onGenerados }: GenerarCodigosDialogProps) {
  const t = useTranslations('inventarioEtiquetas.codigos');
  const td = useTranslations('inventarioEtiquetas.doc');
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const [estado, setEstado] = useState<Estado>('cargando');
  const [filas, setFilas] = useState<ProductoEtiquetable[]>([]);
  const [original, setOriginal] = useState<ConfigNumeracion>(CONFIG_NUMERACION_POR_DEFECTO);
  const [cfg, setCfg] = useState<ConfigNumeracion>(CONFIG_NUMERACION_POR_DEFECTO);
  const [siguienteTexto, setSiguienteTexto] = useState('1');
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    setEstado('cargando');
    setError(null);
    try {
      const [datos, numeracion] = await Promise.all([
        cargarProductosEtiquetables(orgId, productIds, null),
        obtenerNumeracion(orgId),
      ]);
      setFilas(datos);
      setOriginal(numeracion);
      setCfg(numeracion);
      setSiguienteTexto(String(numeracion.siguiente));
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [orgId, productIds]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const pendientes = useMemo(() => filas.filter((f) => !f.codigo), [filas]);
  const siguiente = Math.max(1, Math.floor(Number(siguienteTexto)) || 1);
  const cfgEfectiva: ConfigNumeracion = { ...cfg, prefijo: cfg.prefijo.trim().toUpperCase(), siguiente };
  const errorPrefijo = validarPrefijo(cfgEfectiva);
  const muestra = errorPrefijo ? [] : previsualizarCodigos(cfgEfectiva, Math.min(3, Math.max(1, pendientes.length)));
  const nombreFormato = cfg.formato === 'ean13' ? 'EAN-13' : 'Code128';
  const n = pendientes.length;

  const cambioConfig =
    cfgEfectiva.formato !== original.formato ||
    cfgEfectiva.prefijo !== original.prefijo ||
    cfgEfectiva.siguiente !== original.siguiente ||
    (cfgEfectiva.formato === 'code128' && cfgEfectiva.longitud !== original.longitud);

  const generar = async () => {
    if (!orgId || n === 0 || errorPrefijo) return;
    setGenerando(true);
    setError(null);
    try {
      if (cambioConfig) {
        const guardada = await guardarNumeracion(orgId, cfgEfectiva);
        setOriginal(guardada);
      }
      const asignados = await generarCodigosFaltantes(
        orgId,
        pendientes.map((f) => f.productId),
        false,
      );
      toast({ title: t('generados', { n: asignados.length }) });
      onGenerados?.(asignados);
      onAbiertoChange(false);
    } catch (e) {
      setError(t(claveErrorCodigos(e)));
    } finally {
      setGenerando(false);
    }
  };

  const motivo =
    estado !== 'listo'
      ? t('motivoCargando')
      : n === 0
        ? t('motivoSinPendientes')
        : errorPrefijo
          ? t(`prefijoErrores.${errorPrefijo}`)
          : undefined;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !generando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={estado === 'listo' ? t('descripcion', { total: (filas.length), n: (n) }) : t('seleccionados', { n: (productIds.length) })}
      icono={Barcode}
      ancho={880}
      pie={estado === 'listo' ? (n > 0 ? t('pie', { n: (n), formato: nombreFormato }) : t('pieNada')) : undefined}
      primario={{
        etiqueta: generando ? t('generandoBoton') : t('generarN', { n }),
        onClick: () => void generar(),
        cargando: generando,
        deshabilitada: !!motivo,
        motivo,
      }}
    >
      {estado === 'cargando' && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-fg-secondary" role="status">
          <Loader2 aria-hidden="true" className="size-6 animate-spin text-brand" />
          {t('cargando')}
        </div>
      )}

      {estado === 'error' && (
        <EmptyState variante="error" titulo={t('errorCargaTitulo')} descripcion={t('errorCarga')} onReintentar={() => void cargar()} compacto />
      )}

      {estado === 'listo' && n === 0 && (
        <EmptyState
          variante="empty"
          icono={CheckCircle2}
          titulo={t('sinPendientesTitulo')}
          descripcion={t('sinPendientes', { n: (filas.length) })}
          compacto
        />
      )}

      {estado === 'listo' && n > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="flex min-w-0 flex-col gap-5">
            <p className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2.5 text-sm text-info-text">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {t('aviso', { n: (n), total: (filas.length) })}
            </p>

            {error && (
              <div role="alert" className="flex flex-col gap-2 rounded-lg bg-danger-subtle px-3 py-2.5 text-sm text-danger-text sm:flex-row sm:items-center">
                <span className="flex flex-1 items-start gap-2">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                  {error}
                </span>
                <button
                  type="button"
                  onClick={() => void generar()}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover"
                >
                  <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('reintentar')}
                </button>
              </div>
            )}

            <section className="flex flex-col gap-2" aria-labelledby="cod-pendientes">
              <h3 id="cod-pendientes" className="text-sm font-semibold text-fg">
                {t('pendientesTitulo', { n: (n) })}
              </h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {pendientes.slice(0, VISIBLES).map((f) => (
                  <li key={f.productId} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{f.nombre}</p>
                      {f.variante && <p className="truncate text-xs text-fg-secondary">{f.variante}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-warning-text">{td('sinCodigo')}</span>
                  </li>
                ))}
              </ul>
              {n > VISIBLES && <p className="text-xs text-fg-muted">{t('yMas', { n: (n - VISIBLES) })}</p>}
            </section>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm font-semibold text-fg">{t('formato')}</legend>
              {(['ean13', 'code128'] as FormatoNumeracion[]).map((f) => (
                <label key={f} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="formato-codigo"
                    value={f}
                    checked={cfg.formato === f}
                    onChange={() =>
                      setCfg((c) => ({
                        ...c,
                        formato: f,
                        prefijo: f === original.formato ? original.prefijo : f === 'ean13' ? CONFIG_NUMERACION_POR_DEFECTO.prefijo : 'GO',
                      }))
                    }
                    className="mt-0.5 size-[18px] accent-brand"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-fg">{t(`formatos.${f}.titulo`)}</span>
                    <span className="text-xs text-fg-secondary">{t(`formatos.${f}.ayuda`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <section className="flex flex-col gap-3" aria-labelledby="cod-numeracion">
              <h3 id="cod-numeracion" className="text-sm font-semibold text-fg">
                {t('numeracion')}
              </h3>
              <div className={cn('grid grid-cols-1 gap-3', cfg.formato === 'code128' ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                <FormField etiqueta={t('prefijo')} error={errorPrefijo && errorPrefijo !== 'noCabe' ? t(`prefijoErrores.${errorPrefijo}`) : null}>
                  <Input
                    value={cfg.prefijo}
                    onChange={(e) => setCfg((c) => ({ ...c, prefijo: e.target.value.toUpperCase() }))}
                    maxLength={10}
                    className="h-10 font-mono"
                  />
                </FormField>
                <FormField etiqueta={t('empezarEn')} error={errorPrefijo === 'noCabe' ? t('prefijoErrores.noCabe') : null}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={siguienteTexto}
                    onChange={(e) => setSiguienteTexto(e.target.value)}
                    className="h-10 text-right tabular-nums"
                  />
                </FormField>
                {cfg.formato === 'code128' && (
                  <FormField etiqueta={t('longitud')}>
                    {(c) => (
                      <Select value={String(cfg.longitud)} onValueChange={(v) => setCfg((x) => ({ ...x, longitud: Number(v) }))}>
                        <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LONGITUDES.map((l) => (
                            <SelectItem key={l} value={String(l)}>
                              {t('caracteres', { n: l })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                )}
              </div>
              <p className="text-xs text-fg-muted">{t('notaNumeracion')}</p>
            </section>
          </div>

          <aside className="flex flex-col gap-2" aria-labelledby="cod-muestra">
            <h3 id="cod-muestra" className="text-sm font-semibold text-fg">
              {t('muestra')}
            </h3>
            {muestra.length === 0 ? (
              <p className="text-xs text-fg-muted">{t('muestraVacia')}</p>
            ) : (
              muestra.map((c) => (
                <div key={c} className="flex h-[70px] items-stretch rounded-lg border border-line bg-white px-3 py-2">
                  <CodigoBarras valor={c} textoSinCodigo={td('sinCodigo')} textoInvalido={td('codigoInvalido')} tamanoTexto="10px" />
                </div>
              ))
            )}
            {generando && (
              <p className="flex items-center gap-2 text-xs text-fg-secondary" role="status">
                <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                {t('generandoNota')}
              </p>
            )}
          </aside>
        </div>
      )}
    </Dialogo>
  );
}
