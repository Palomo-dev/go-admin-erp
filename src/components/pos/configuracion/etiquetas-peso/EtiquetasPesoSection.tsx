'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2, Tag } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermission } from '@/hooks/usePermissionContext';
import { guardarArchivo } from '@/lib/documents/cliente';
import {
  csvExportarPlu,
  decodificarEtiquetaPeso,
  formatoEtiquetaValido,
  FORMATO_ETIQUETA_RECOMENDADO,
  lineaDesdeEtiqueta,
  PREFIJOS_PESO_PERMITIDOS,
  type FormatoEtiquetaPeso,
} from '@/lib/pos/etiquetaPeso';
import { recordarFormatoEtiqueta } from '@/lib/pos/useFormatoEtiquetaPeso';
import { formatoCantidad } from '@/lib/pos/peso/modoVenta';
import {
  claveErrorEtiqueta,
  contarCodigosConPrefijo,
  guardarFormatoEtiqueta,
  listarPluExportables,
  obtenerFormatoEtiqueta,
  obtenerNumeracion,
  productoPorPlu,
} from '@/lib/services/codigosBarrasService';

const selectClase =
  'h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-sm disabled:opacity-60';

/** «27, 28» → ['27', '28'] (sin repetir, en orden). */
function prefijosDesdeTexto(texto: string): string[] {
  return Array.from(new Set(texto.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean))).sort();
}

type Prueba =
  | { estado: 'vacio' }
  | { estado: 'no'; clave: string; valores?: Record<string, string | number> }
  | { estado: 'ok'; texto: string };

/**
 * Configuración › POS › «Etiquetas de peso variable» (Figma K5, PRODUCTOS-POR-PESO-BASCULA.md §2.7):
 * formato de la organización (prefijo 21–29, peso o precio, dígitos de PLU y de
 * valor, dígito de control del valor), prueba de un código y «Exportar PLU».
 * Guardar exige `pos.basculas.configurar` (lo vuelve a exigir la RPC).
 */
export function EtiquetasPesoSection() {
  const t = useTranslations('posEtiquetasPeso');
  const { toast } = useToast();
  const { organization } = useOrganization();
  const orgId = organization?.id as number | undefined;
  const moneda = useMonedaOrganizacion();
  const { hasPermission: puedeConfigurar, loading: cargandoPermiso } = usePermission('pos.basculas.configurar', orgId);

  const [guardado, setGuardado] = useState<FormatoEtiquetaPeso | null>(null);
  const [formato, setFormato] = useState<FormatoEtiquetaPeso>({ ...FORMATO_ETIQUETA_RECOMENDADO, activo: false });
  const [prefijosTexto, setPrefijosTexto] = useState('27');
  const [prefijoGenerador, setPrefijoGenerador] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [conPrefijo, setConPrefijo] = useState(0);
  const [codigoPrueba, setCodigoPrueba] = useState('');
  const [prueba, setPrueba] = useState<Prueba>({ estado: 'vacio' });

  const cargar = useCallback(async () => {
    if (!orgId) return;
    setCargando(true);
    setErrorCarga(false);
    try {
      const [f, numeracion] = await Promise.all([obtenerFormatoEtiqueta(orgId), obtenerNumeracion(orgId)]);
      const inicial = f.prefijos.length ? f : { ...f, prefijos: FORMATO_ETIQUETA_RECOMENDADO.prefijos };
      setGuardado(f);
      setFormato(inicial);
      setPrefijosTexto(inicial.prefijos.join(', '));
      setPrefijoGenerador(numeracion.prefijo || null);
    } catch {
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  }, [orgId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const prefijos = useMemo(() => prefijosDesdeTexto(prefijosTexto), [prefijosTexto]);
  const candidato: FormatoEtiquetaPeso = useMemo(() => ({ ...formato, prefijos }), [formato, prefijos]);

  // Validación local (la misma que la RPC): 21–29, nunca el del generador, suma 12.
  const errorPrefijo = useMemo(() => {
    if (prefijos.length === 0) return formato.activo ? t('errores.prefijos_requeridos') : null;
    if (prefijos.some((p) => !(PREFIJOS_PESO_PERMITIDOS as readonly string[]).includes(p))) return t('errores.prefijo_peso_invalido');
    const gen = (prefijoGenerador ?? '').trim();
    if (gen && prefijos.some((p) => (gen.length >= 2 ? gen.slice(0, 2) === p : p.startsWith(gen)))) {
      return t('errores.prefijo_del_generador', { prefijo: gen });
    }
    return null;
  }, [prefijos, prefijoGenerador, formato.activo, t]);
  const errorDigitos = formatoEtiquetaValido({ ...candidato, prefijos: [] }) ? null : t('errores.formato_invalido');

  // Aviso en vivo: productos con un código propio que empieza por el prefijo.
  useEffect(() => {
    if (!orgId || errorPrefijo || prefijos.length === 0) {
      setConPrefijo(0);
      return;
    }
    let vivo = true;
    const id = setTimeout(() => {
      contarCodigosConPrefijo(orgId, prefijos)
        .then((n) => vivo && setConPrefijo(n))
        .catch(() => vivo && setConPrefijo(0));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [orgId, prefijos, errorPrefijo]);

  // «Probar un código»: decodifica con el formato del formulario y busca el PLU.
  useEffect(() => {
    const codigo = codigoPrueba.trim();
    if (!codigo || !orgId) {
      setPrueba({ estado: 'vacio' });
      return;
    }
    const leida = decodificarEtiquetaPeso(codigo, { ...candidato, activo: true });
    if (leida.tipo === 'no_es_etiqueta') {
      setPrueba({ estado: 'no', clave: 'prueba.noEsEtiqueta' });
      return;
    }
    if (leida.tipo === 'invalida') {
      setPrueba({ estado: 'no', clave: leida.motivo === 'digito_valor' ? 'prueba.digitoValor' : 'prueba.digitoControl' });
      return;
    }
    const { etiqueta } = leida;
    const partes = [
      etiqueta.prefijo,
      t('prueba.plu', { plu: String(etiqueta.plu).padStart(candidato.digitosPlu, '0') }),
      etiqueta.contenido === 'weight' ? t('prueba.gramos', { valor: etiqueta.valor }) : moneda.formatear(etiqueta.valor / 10 ** moneda.decimals),
    ].join(' · ');
    let vivo = true;
    productoPorPlu(orgId, etiqueta.plu)
      .then((producto) => {
        if (!vivo) return;
        const linea = lineaDesdeEtiqueta({ etiqueta, producto, precioPorUnidad: null, decimalesMoneda: moneda.decimals });
        if (!linea.ok && linea.error === 'plu_inexistente') {
          setPrueba({ estado: 'no', clave: 'prueba.pluInexistente', valores: { detalle: partes, plu: etiqueta.plu } });
        } else if (!linea.ok && linea.error === 'producto_por_unidad') {
          setPrueba({ estado: 'no', clave: 'prueba.productoPorUnidad', valores: { detalle: partes, producto: producto?.name ?? '' } });
        } else if (linea.ok) {
          setPrueba({ estado: 'ok', texto: `${partes} → ${producto?.name ?? ''} · ${formatoCantidad(linea.cantidad, producto)}` });
        } else {
          // Precio embebido: la cantidad depende del precio vigente (se calcula en el POS).
          setPrueba({ estado: 'ok', texto: `${partes} → ${producto?.name ?? ''}` });
        }
      })
      .catch(() => vivo && setPrueba({ estado: 'ok', texto: partes }));
    return () => {
      vivo = false;
    };
  }, [codigoPrueba, candidato, orgId, moneda, t]);

  const soloLectura = !puedeConfigurar;
  const puedeGuardar = !soloLectura && !guardando && !errorDigitos && !errorPrefijo;

  const cambiar = <K extends keyof FormatoEtiquetaPeso>(clave: K, valor: FormatoEtiquetaPeso[K]) =>
    setFormato((f) => ({ ...f, [clave]: valor }));

  // Dígitos del valor según el PLU y el dígito de control: 2 + PLU + [1] + valor = 12.
  const cambiarDigitosPlu = (plu: number) =>
    setFormato((f) => ({ ...f, digitosPlu: plu, digitosValor: Math.min(6, Math.max(4, 10 - plu - (f.digitoControlValor ? 1 : 0))) }));
  const cambiarDigitoControl = (con: boolean) =>
    setFormato((f) => {
      const valor = 10 - f.digitosPlu - (con ? 1 : 0);
      if (valor >= 4 && valor <= 6) return { ...f, digitoControlValor: con, digitosValor: valor };
      const plu = 10 - f.digitosValor - (con ? 1 : 0);
      return { ...f, digitoControlValor: con, digitosPlu: Math.min(6, Math.max(4, plu)) };
    });

  const guardar = async () => {
    if (!orgId || !puedeGuardar) return;
    setGuardando(true);
    try {
      const r = await guardarFormatoEtiqueta(orgId, candidato);
      setGuardado(r.formato);
      setFormato(r.formato.prefijos.length ? r.formato : { ...r.formato, prefijos });
      recordarFormatoEtiqueta(orgId, r.formato);
      toast({
        title: t('guardado'),
        description: [
          r.productosConPrefijo > 0 ? t('avisoPrefijo', { n: r.productosConPrefijo, prefijo: prefijos.join(', ') }) : null,
          r.productosPluFueraDeRango > 0 ? t('avisoPluFuera', { n: r.productosPluFueraDeRango, digitos: r.formato.digitosPlu }) : null,
        ]
          .filter(Boolean)
          .join(' '),
      });
    } catch (error) {
      const clave = claveErrorEtiqueta(error);
      toast({ title: t(`errores.${clave}`, { prefijo: prefijoGenerador ?? '' }), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = () => {
    if (!guardado) return;
    const base = guardado.prefijos.length ? guardado : { ...guardado, prefijos: FORMATO_ETIQUETA_RECOMENDADO.prefijos };
    setFormato(base);
    setPrefijosTexto(base.prefijos.join(', '));
  };

  const exportar = async () => {
    if (!orgId) return;
    setExportando(true);
    try {
      const filas = await listarPluExportables(orgId);
      if (filas.length === 0) {
        toast({ title: t('exportarVacio') });
        return;
      }
      const csv = csvExportarPlu(
        filas,
        [t('csv.plu'), t('csv.nombre'), t('csv.precio'), t('csv.tara'), t('csv.diasVida')],
        moneda.decimals,
      );
      guardarArchivo(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'plu-balanza.csv');
      toast({ title: t('exportado', { n: filas.length }) });
    } catch (error) {
      toast({ title: t(`errores.${claveErrorEtiqueta(error)}`, { prefijo: '' }), variant: 'destructive' });
    } finally {
      setExportando(false);
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Tag className="h-5 w-5 text-blue-600" />
          {t('titulo')}
        </CardTitle>
        <CardDescription className="text-gray-500 dark:text-gray-400">{t('descripcion')}</CardDescription>
      </CardHeader>

      {cargando || cargandoPermiso ? (
        <CardContent>
          <div className="flex justify-center py-4" role="status" aria-label={t('cargando')}>
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        </CardContent>
      ) : errorCarga ? (
        <CardContent className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{t('errorCargar')}</p>
          <Button variant="outline" size="sm" onClick={() => void cargar()}>
            {t('reintentar')}
          </Button>
        </CardContent>
      ) : (
        <>
          <CardContent className="space-y-5">
            {soloLectura && <p className="text-sm text-gray-500 dark:text-gray-400">{t('sinPermiso')}</p>}

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor="etiquetas-peso-activo" className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('activo')}
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('activoAyuda')}</p>
              </div>
              <Switch
                id="etiquetas-peso-activo"
                checked={formato.activo}
                disabled={soloLectura}
                onCheckedChange={(v) => cambiar('activo', v)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="etiquetas-peso-prefijo">
                  {t('prefijo')} <span className="text-red-600" aria-hidden>*</span>
                </Label>
                <Input
                  id="etiquetas-peso-prefijo"
                  value={prefijosTexto}
                  inputMode="numeric"
                  disabled={soloLectura}
                  aria-invalid={!!errorPrefijo}
                  aria-describedby="etiquetas-peso-prefijo-ayuda"
                  onChange={(e) => setPrefijosTexto(e.target.value)}
                />
                <p id="etiquetas-peso-prefijo-ayuda" className={errorPrefijo ? 'text-xs text-red-600 dark:text-red-400' : 'text-xs text-gray-500 dark:text-gray-400'}>
                  {errorPrefijo ?? t('prefijoAyuda', { prefijo: prefijoGenerador ?? '20' })}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="etiquetas-peso-contenido">
                  {t('contenido')} <span className="text-red-600" aria-hidden>*</span>
                </Label>
                <select
                  id="etiquetas-peso-contenido"
                  className={selectClase}
                  value={formato.contenido}
                  disabled={soloLectura}
                  onChange={(e) => cambiar('contenido', e.target.value === 'price' ? 'price' : 'weight')}
                >
                  <option value="weight">{t('contenidoPeso')}</option>
                  <option value="price">{t('contenidoPrecio')}</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('contenidoAyuda')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="etiquetas-peso-plu">{t('digitosPlu')}</Label>
                <select
                  id="etiquetas-peso-plu"
                  className={selectClase}
                  value={formato.digitosPlu}
                  disabled={soloLectura}
                  onChange={(e) => cambiarDigitosPlu(Number(e.target.value))}
                >
                  {[4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="etiquetas-peso-valor">{t('digitosValor')}</Label>
                <select
                  id="etiquetas-peso-valor"
                  className={selectClase}
                  value={formato.digitosValor}
                  disabled
                  aria-describedby="etiquetas-peso-valor-ayuda"
                >
                  <option value={formato.digitosValor}>{formato.digitosValor}</option>
                </select>
                <p id="etiquetas-peso-valor-ayuda" className={errorDigitos ? 'text-xs text-red-600 dark:text-red-400' : 'text-xs text-gray-500 dark:text-gray-400'}>
                  {errorDigitos ?? t('digitosValorAyuda')}
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor="etiquetas-peso-control" className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('digitoControl')}
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('digitoControlAyuda')}</p>
              </div>
              <Switch
                id="etiquetas-peso-control"
                checked={formato.digitoControlValor}
                disabled={soloLectura}
                onCheckedChange={cambiarDigitoControl}
              />
            </div>

            <div className="space-y-1.5 md:max-w-sm">
              <Label htmlFor="etiquetas-peso-prueba">{t('probar')}</Label>
              <Input
                id="etiquetas-peso-prueba"
                value={codigoPrueba}
                inputMode="numeric"
                autoComplete="off"
                placeholder="2700104007353"
                onChange={(e) => setCodigoPrueba(e.target.value)}
              />
            </div>
            <div aria-live="polite">
              {prueba.estado === 'ok' && (
                <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">{prueba.texto}</p>
              )}
              {prueba.estado === 'no' && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {t(prueba.clave, prueba.valores ?? {})}
                </p>
              )}
            </div>

            {conPrefijo > 0 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {t('avisoPrefijo', { n: conPrefijo, prefijo: prefijos.join(', ') })}
              </p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => void exportar()} disabled={soloLectura || exportando}>
              {exportando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              {t('exportar')}
            </Button>
            {!soloLectura && (
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="ghost" onClick={cancelar} disabled={guardando}>
                  {t('cancelar')}
                </Button>
                <Button onClick={() => void guardar()} disabled={!puedeGuardar}>
                  {guardando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {t('guardar')}
                </Button>
              </div>
            )}
          </CardFooter>
        </>
      )}
    </Card>
  );
}
