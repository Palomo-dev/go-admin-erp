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
import { recipeService, type RecetasFormularioServidor } from '@/lib/services/recipeService';
import { recetaFormDesdeServidor } from '@/components/kit/receta/recetaLogica';
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
 * de catálogos, del producto y de sus recetas, cambios, validación por campo,
 * «sucio», borrador en sessionStorage y clave de idempotencia del guardado.
 * No guarda: eso es `guardarProducto`.
 */

export type FaseFormulario = 'cargando' | 'elegirCopia' | 'listo' | 'noEncontrado' | 'error';

export interface OpcionesUseProductoForm {
  modo: ModoFormularioProducto;
  productUuid?: string;
  organizacionId: number | null;
  /** Sufijos traducidos de la copia («-COPY», « (Copia)»). */
  sufijos: { sku: string; nombre: string };
  /**
   * Borrador en sessionStorage. Solo la página: el diálogo (alta rápida desde
   * facturas o «Crear ingrediente») no debe leer el borrador del formulario de fondo.
   */
  conBorrador?: boolean;
}

const huella = (e: EstadoFormularioProducto | null): string => (e ? JSON.stringify(e) : '');

/**
 * Borrador local (decisión 5 del dueño): el estado completo del formulario se
 * guarda en sessionStorage para no perder una receta larga al recargar o al
 * renovar la sesión. Es solo comodidad del navegador: no toca la base. Las
 * imágenes subidas desde el equipo (File) no se pueden guardar y se omiten.
 */
export const claveBorrador = (org: number, modo: ModoFormularioProducto, uuid?: string): string =>
  `producto-borrador:${org}:${modo}:${uuid ?? 'nuevo'}`;

export function serializarBorrador(e: EstadoFormularioProducto): string {
  return JSON.stringify({ ...e, imagenes: e.imagenes.filter((i) => !i.file) });
}

export function leerBorrador(texto: string | null | undefined): EstadoFormularioProducto | null {
  if (!texto) return null;
  try {
    const e = JSON.parse(texto) as EstadoFormularioProducto;
    const valido =
      !!e && typeof e === 'object' && typeof e.sku === 'string' && !!e.receta && Array.isArray(e.variantes) && Array.isArray(e.imagenes);
    return valido ? e : null;
  } catch {
    return null;
  }
}

function almacen(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function leerAlmacen(clave: string): string | null {
  try {
    return almacen()?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

export function nuevaClaveIdempotencia(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Respaldo con forma de uuid v4 (navegadores sin randomUUID).
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}

/** Recetas del servidor dentro del estado del formulario (editar con ids; duplicar sin ellos). */
export function conRecetas(
  e: EstadoFormularioProducto,
  d: DatosFormularioProducto,
  recetas: RecetasFormularioServidor,
  conId: boolean,
): EstadoFormularioProducto {
  // estadoDesdeDatos conserva el orden: la i-ésima variante del servidor es la i-ésima del estado.
  const claveDeVariante = new Map<number, string>();
  d.variantes.forEach((v, i) => {
    const clave = e.variantes[i]?.clave;
    if (clave) claveDeVariante.set(Number(v.id), clave);
  });
  const p = d.producto as Record<string, unknown>;
  return {
    ...e,
    receta: recetaFormDesdeServidor(recetas, {
      productId: Number(d.producto.id),
      esCompuesto: Boolean(p.is_composite),
      alProducir: p.production_type === 'preparation',
      claveDeVariante,
      conId,
    }),
  };
}

export function useProductoForm({ modo, productUuid, organizacionId, sufijos, conBorrador = true }: OpcionesUseProductoForm) {
  const [fase, setFase] = useState<FaseFormulario>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [catalogos, setCatalogos] = useState<CatalogosFormulario>(CATALOGOS_VACIOS);
  const [estado, setEstado] = useState<EstadoFormularioProducto | null>(null);
  const [base, setBase] = useState('');
  const [estadoBase, setEstadoBase] = useState<EstadoFormularioProducto | null>(null);
  const [datos, setDatos] = useState<DatosFormularioProducto | null>(null);
  const [recetasDatos, setRecetasDatos] = useState<RecetasFormularioServidor | null>(null);
  const [productId, setProductId] = useState<number | undefined>(undefined);
  const [permisos, setPermisos] = useState<{ crear: boolean; editar: boolean } | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorServidor, setErrorServidor] = useState<{ campo: CampoFormulario; codigo: CodigoErrorProducto } | null>(null);
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [borradorRecuperado, setBorradorRecuperado] = useState(false);
  const ultimoIntento = useRef<{ clave: string; huella: string } | null>(null);
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

  /** Fija la base (lo guardado o vacío) y, si hay, recupera el borrador local. */
  const abrirCon = useCallback(
    (e: EstadoFormularioProducto, llave: string | null) => {
      setBase(huella(e));
      setEstadoBase(e);
      const borrador = llave ? leerBorrador(leerAlmacen(llave)) : null;
      const recuperar = !!borrador && huella(borrador) !== huella(e);
      setEstado(recuperar && borrador ? borrador : e);
      setBorradorRecuperado(recuperar);
    },
    [],
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
          abrirCon(e, conBorrador ? claveBorrador(organizacionId, modo) : null);
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
        // Si las recetas no cargan, el formulario no abre: guardar sin ellas las desactivaría.
        const [d, rd] = await Promise.all([
          productoService.paraFormulario(organizacionId, id),
          recipeService.paraFormulario(organizacionId, id),
        ]);
        if (cancelado) return;
        setDatos(d);
        setRecetasDatos(rd);
        if (modo === 'editar') {
          setProductId(id);
          abrirCon(conRecetas(desdeDatos(d), d, rd, true), conBorrador ? claveBorrador(organizacionId, modo, productUuid) : null);
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
  }, [organizacionId, modo, productUuid, intentoCarga, estadoNuevo, desdeDatos, abrirCon, conBorrador]);

  /** Duplicar: aplica lo elegido en «Qué copiar» y abre el formulario prellenado (con sus recetas, sin ids). */
  const aplicarDuplicar = useCallback(
    (copiar: OpcionesDuplicar) => {
      if (!datos) return;
      const base0 = desdeDatos(datos, copiar);
      const e = recetasDatos ? conRecetas(base0, datos, recetasDatos, false) : base0;
      setEstado(e);
      setEstadoBase(e);
      // La copia sin tocar ya es un cambio respecto a no crear nada.
      setBase('');
      setFase('listo');
    },
    [datos, recetasDatos, desdeDatos],
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

  const contextoValidacion = useMemo(
    () => ({ imagenesOriginales: datos?.imagenes.length ?? 0, productId }),
    [datos, productId],
  );

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

  const llaveBorrador =
    conBorrador && organizacionId && modo !== 'duplicar' ? claveBorrador(organizacionId, modo, productUuid) : null;

  const borrarBorrador = useCallback(() => {
    if (!llaveBorrador) return;
    try {
      almacen()?.removeItem(llaveBorrador);
    } catch {
      // Almacenamiento bloqueado: no hay borrador que borrar.
    }
  }, [llaveBorrador]);

  /** «Guardar y crear otro»: formulario limpio, mismos catálogos. */
  const reiniciar = useCallback(async () => {
    if (!organizacionId) return;
    const e = await estadoNuevo(catalogos, organizacionId);
    borrarBorrador();
    ultimoIntento.current = null;
    setEstado(e);
    setEstadoBase(e);
    setBase(huella(e));
    setBorradorRecuperado(false);
    setIntentado(false);
    setErrores({});
    setErrorServidor(null);
  }, [catalogos, organizacionId, estadoNuevo, borrarBorrador]);

  /** Tras guardar: lo guardado pasa a ser la base (sin aviso de cambios) y el borrador se borra. */
  const marcarGuardado = useCallback(() => {
    borrarBorrador();
    ultimoIntento.current = null;
    setBase(huella(estado));
  }, [estado, borrarBorrador]);

  /** Quita el borrador recuperado y vuelve a lo guardado (o al formulario vacío). */
  const descartarBorrador = useCallback(() => {
    borrarBorrador();
    setBorradorRecuperado(false);
    if (estadoBase) setEstado(estadoBase);
  }, [borrarBorrador, estadoBase]);

  const sucio = useMemo(() => fase === 'listo' && huella(estado) !== base, [fase, estado, base]);

  // Borrador local: se escribe tras una pausa en cada cambio y se borra al volver a la base.
  useEffect(() => {
    if (!llaveBorrador || fase !== 'listo' || !estado) return;
    const id = window.setTimeout(() => {
      try {
        if (sucio) almacen()?.setItem(llaveBorrador, serializarBorrador(estado));
        else almacen()?.removeItem(llaveBorrador);
      } catch {
        // Cuota llena o almacenamiento bloqueado: el borrador es solo comodidad.
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [llaveBorrador, fase, estado, sucio]);

  /**
   * Clave de idempotencia del guardado: la misma mientras el formulario no
   * cambie (doble clic, reintento tras un corte de red); nueva si cambió.
   */
  const claveGuardado = useCallback((): string => {
    const h = huella(estado);
    if (ultimoIntento.current && ultimoIntento.current.huella === h) return ultimoIntento.current.clave;
    const clave = nuevaClaveIdempotencia();
    ultimoIntento.current = { clave, huella: h };
    return clave;
  }, [estado]);

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
    claveGuardado,
    borradorRecuperado,
    descartarBorrador,
    ordenesAbiertasReceta: recetasDatos?.ordenes_abiertas ?? 0,
  };
}
