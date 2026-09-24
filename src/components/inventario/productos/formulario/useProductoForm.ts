'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import {
  aErrorProducto,
  productoService,
  type CodigoErrorProducto,
  type DatosFormularioProducto,
  type ModoFormularioProducto,
} from '@/lib/services/productoService';
import {
  campoDeErrorRpc,
  estadoDesdeDatos,
  estadoInicial,
  validarFormulario,
  type CampoFormulario,
  type CodigoValidacion,
  type ErroresFormulario,
  type EstadoFormularioProducto,
  type OpcionesDuplicar,
} from '../logica/formularioProducto';
import { cargarCatalogos, generarSkuSugerido, idProductoPorUuid, leerPermisos } from './cargarCatalogos';
import { CATALOGOS_VACIOS, type CatalogosFormulario } from './tipos';

/**
 * Estado del formulario único de producto (nuevo · editar · duplicar): carga
 * de catálogos y del producto, cambios, validación por campo y «sucio».
 * No guarda: eso es `guardarProducto`.
 */

export type FaseFormulario = 'cargando' | 'elegirCopia' | 'listo' | 'noEncontrado' | 'error';

export interface OpcionesUseProductoForm {
  modo: ModoFormularioProducto;
  productUuid?: string;
  organizacionId: number | null;
  /** Sufijos traducidos de la copia («-COPY», « (Copia)»). */
  sufijos: { sku: string; nombre: string };
}

const huella = (e: EstadoFormularioProducto | null): string => (e ? JSON.stringify(e) : '');

export function useProductoForm({ modo, productUuid, organizacionId, sufijos }: OpcionesUseProductoForm) {
  const [fase, setFase] = useState<FaseFormulario>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [catalogos, setCatalogos] = useState<CatalogosFormulario>(CATALOGOS_VACIOS);
  const [estado, setEstado] = useState<EstadoFormularioProducto | null>(null);
  const [base, setBase] = useState('');
  const [datos, setDatos] = useState<DatosFormularioProducto | null>(null);
  const [productId, setProductId] = useState<number | undefined>(undefined);
  const [permisos, setPermisos] = useState<{ crear: boolean; editar: boolean } | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorServidor, setErrorServidor] = useState<{ campo: CampoFormulario; codigo: CodigoErrorProducto } | null>(null);
  const [intentoCarga, setIntentoCarga] = useState(0);
  const sufijosRef = useRef(sufijos);
  sufijosRef.current = sufijos;

  /** Estado vacío de «crear» con impuesto por defecto y SKU sugerido. */
  const estadoNuevo = useCallback(async (cat: CatalogosFormulario, org: number): Promise<EstadoFormularioProducto> => {
    const e = estadoInicial(cat.sucursales);
    e.impuestos = cat.impuestos.filter((i) => i.is_default).map((i) => i.id);
    try {
      e.sku = await generarSkuSugerido(org);
    } catch {
      e.sku = `PROD-${Date.now().toString(36).toUpperCase()}`;
    }
    return e;
  }, []);

  const desdeDatos = useCallback(
    (d: DatosFormularioProducto, copiar?: OpcionesDuplicar): EstadoFormularioProducto => {
      // Las de la biblioteca compartida conservan su ruta; las propias se copian.
      return estadoDesdeDatos(d, modo, { urlPublica: getPublicUrl, copiar, sufijos: sufijosRef.current });
    },
    [modo],
  );

  useEffect(() => {
    if (!organizacionId) return;
    let cancelado = false;
    setFase('cargando');
    setErrorCarga(null);
    (async () => {
      try {
        const [cat, perm] = await Promise.all([cargarCatalogos(organizacionId), leerPermisos(organizacionId)]);
        if (cancelado) return;
        setCatalogos(cat);
        setPermisos(perm);
        if (modo === 'crear') {
          const e = await estadoNuevo(cat, organizacionId);
          if (cancelado) return;
          setEstado(e);
          setBase(huella(e));
          setFase('listo');
          return;
        }
        if (!productUuid) {
          setFase('noEncontrado');
          return;
        }
        const id = await idProductoPorUuid(organizacionId, productUuid);
        if (cancelado) return;
        if (!id) {
          setFase('noEncontrado');
          return;
        }
        const d = await productoService.paraFormulario(organizacionId, id);
        if (cancelado) return;
        setDatos(d);
        if (modo === 'editar') {
          setProductId(id);
          const e = desdeDatos(d);
          setEstado(e);
          setBase(huella(e));
          setFase('listo');
        } else {
          setFase('elegirCopia');
        }
      } catch (e) {
        if (cancelado) return;
        const err = aErrorProducto(e as { message?: string });
        if (err.codigo === 'producto_no_encontrado') {
          setFase('noEncontrado');
        } else {
          setErrorCarga(e);
          setFase('error');
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [organizacionId, modo, productUuid, intentoCarga, estadoNuevo, desdeDatos]);

  /** Duplicar: aplica lo elegido en «Qué copiar» y abre el formulario prellenado. */
  const aplicarDuplicar = useCallback(
    (copiar: OpcionesDuplicar) => {
      if (!datos) return;
      const e = desdeDatos(datos, copiar);
      setEstado(e);
      // La copia sin tocar ya es un cambio respecto a no crear nada.
      setBase('');
      setFase('listo');
    },
    [datos, desdeDatos],
  );

  const cambiar = useCallback(<K extends keyof EstadoFormularioProducto>(campo: K, valor: EstadoFormularioProducto[K]) => {
    setEstado((prev) => (prev ? { ...prev, [campo]: valor } : prev));
    setErrorServidor(null);
  }, []);

  const actualizar = useCallback((parcial: Partial<EstadoFormularioProducto>) => {
    setEstado((prev) => (prev ? { ...prev, ...parcial } : prev));
    setErrorServidor(null);
  }, []);

  const agregarACatalogo = useCallback(
    <K extends keyof CatalogosFormulario>(clave: K, item: CatalogosFormulario[K][number]) => {
      setCatalogos((prev) => ({ ...prev, [clave]: [...(prev[clave] as CatalogosFormulario[K][number][]), item] }));
    },
    [],
  );

  const contextoValidacion = useMemo(() => ({ imagenesOriginales: datos?.imagenes.length ?? 0 }), [datos]);

  /** Valida todo, marca el intento y devuelve los errores. */
  const validar = useCallback((): ErroresFormulario => {
    if (!estado) return {};
    const err = validarFormulario(estado, modo, contextoValidacion);
    setIntentado(true);
    setErrores(err);
    return err;
  }, [estado, modo, contextoValidacion]);

  /** Tras el primer intento, se revalida al salir de cada campo. */
  const revalidarSiIntentado = useCallback(() => {
    if (!intentado || !estado) return;
    setErrores(validarFormulario(estado, modo, contextoValidacion));
  }, [intentado, estado, modo, contextoValidacion]);

  const marcarErrorServidor = useCallback((codigo: CodigoErrorProducto): CampoFormulario | null => {
    const campo = campoDeErrorRpc(codigo);
    setErrorServidor(campo ? { campo, codigo } : null);
    return campo;
  }, []);

  /** Errores visibles: los de validación y el del servidor (sus códigos también son claves de `productoForm.errores`). */
  const erroresVisibles = useMemo<ErroresFormulario>(() => {
    const r: ErroresFormulario = { ...errores };
    if (errorServidor) r[errorServidor.campo] = errorServidor.codigo as CodigoValidacion;
    return r;
  }, [errores, errorServidor]);

  /** «Guardar y crear otro»: formulario limpio, mismos catálogos. */
  const reiniciar = useCallback(async () => {
    if (!organizacionId) return;
    const e = await estadoNuevo(catalogos, organizacionId);
    setEstado(e);
    setBase(huella(e));
    setIntentado(false);
    setErrores({});
    setErrorServidor(null);
  }, [catalogos, organizacionId, estadoNuevo]);

  /** Tras guardar en editar: lo guardado pasa a ser la base (sin aviso de cambios). */
  const marcarGuardado = useCallback(() => {
    setBase(huella(estado));
  }, [estado]);

  const sucio = useMemo(() => fase === 'listo' && huella(estado) !== base, [fase, estado, base]);

  return {
    fase,
    errorCarga,
    reintentar: () => setIntentoCarga((n) => n + 1),
    catalogos,
    estado,
    datos,
    productId,
    permisos,
    cambiar,
    actualizar,
    agregarACatalogo,
    errores: erroresVisibles,
    intentado,
    validar,
    revalidarSiIntentado,
    marcarErrorServidor,
    aplicarDuplicar,
    reiniciar,
    marcarGuardado,
    sucio,
  };
}
