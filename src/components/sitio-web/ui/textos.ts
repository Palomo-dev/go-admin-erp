'use client';

/**
 * Textos de los componentes comunes del módulo Sitio web (`sitioWeb.comun.*`).
 *
 * `TEXTOS_COMUN` es el español canónico (Figma A/07, B/02, D/02) y la fuente
 * de `comun.es.json`. Mientras el integrador fusiona las claves en
 * messages/*.json, `useTextosComun` muestra este español en vez de la clave
 * cruda (el mismo patrón que `useNombresNav`). Marcadores: `{n}`, `{fecha}`…
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

export const TEXTOS_COMUN = {
  publicacion: {
    publicado: 'Publicado',
    cambiosUno: '1 cambio sin publicar',
    cambios: '{n} cambios sin publicar',
    borrador: 'Guardado en borrador',
    guardando: 'Guardando…',
    programado: 'Programado · {fecha}',
    sinPublicar: 'Sin publicar',
    error: 'No se pudo publicar',
  },
  checklist: {
    listo: 'Listo',
    configurar: 'Configurar',
    pasoActual: 'Paso actual',
    pendiente: 'Pendiente',
  },
  fila: {
    arrastrar: 'Arrastra para ordenar o usa Alt + flechas',
    ocultar: 'Ocultar «{nombre}»',
    mostrar: 'Mostrar «{nombre}»',
    oculta: 'Oculta',
    global: 'Global',
    globalAyuda: 'Se edita en el encabezado o el pie del sitio',
  },
  fuentes: {
    seleccionado: 'Seleccionado',
    delSitio: 'Del sitio',
    delTema: 'Fuentes del tema',
    catalogo: 'Otras del catálogo del tema',
    titulosSitio: 'Títulos del sitio',
    textoSitio: 'Texto del sitio',
    elegir: 'Elegir {etiqueta}',
  },
  dispositivos: {
    computador: 'Computador',
    tableta: 'Tableta',
    celular: 'Celular',
    mostrarEn: 'Mostrar en {dispositivo}',
    ocultaEn: {
      computador: 'Oculta en computador',
      tableta: 'Oculta en tableta',
      celular: 'Oculta en celular',
    },
    soloEn: {
      computador: 'Solo en computador',
      tableta: 'Solo en tableta',
      celular: 'Solo en celular',
    },
    ninguno: 'Oculta en todos los dispositivos',
  },
  colorMarca: {
    deLaMarca: 'de la marca',
    titulo: 'Colores de la marca',
    enlazados: 'Enlazados: si cambias la marca en «Estilo del sitio», este color cambia con ella.',
    personalizado: 'Personalizado',
    placeholder: '#RRGGBB — deja de seguir a la marca',
    enlazado: 'Enlazado a la marca',
    sinDefinir: 'Sin definir en el tema',
    abrir: 'Elegir {etiqueta}',
    rol: {
      primario: 'Primario',
      secundario: 'Secundario',
      acento: 'Acento',
      texto: 'Texto',
      fondo: 'Fondo',
    },
  },
  logoFavicon: {
    logo: 'Logo',
    logoAyuda: 'PNG o SVG, fondo transparente · se toma de Organización',
    favicon: 'Favicon',
    faviconAyuda: 'Ícono de la pestaña · 512 × 512',
    cambiar: 'Cambiar',
    subir: 'Subir',
    quitar: 'Quitar',
    cambiarAria: 'Cambiar {campo}',
    quitarAria: 'Quitar {campo}',
    vistaAlt: '{campo} actual',
  },
  dieta: {
    dieta: 'Etiqueta de dieta',
    alergeno: 'Alérgeno',
    picante: 'Picante',
  },
  color: {
    corregir: 'Corregir automáticamente',
    aviso: 'Contraste {razon} con el fondo. Mínimo {minimo} (AA). Sugerido: {sugerido}.',
    avisoSinSugerido: 'Contraste {razon} con el fondo. Mínimo {minimo} (AA).',
    coloresLogo: 'Colores de tu logo',
    contrasteBien: 'Contraste {razon} con el fondo · {nivel}',
    hexInvalido: 'Escribe el color como #RRGGBB, por ejemplo #C8A97E.',
    elegir: 'Usar {color}',
    selector: 'Elegir {nombre} en la paleta',
  },
  vistaPrevia: {
    titulo: 'Vista previa del sitio',
    cargando: 'Cargando la vista previa…',
    error: 'No pudimos cargar la vista previa.',
    reintentar: 'Reintentar',
    vacia: 'Aún no hay nada que mostrar. Elige una plantilla para empezar.',
  },
  dispositivo: {
    1440: 'Escritorio · 1440',
    1024: 'Portátil · 1024',
    390: 'Celular · 390',
    marco: 'Vista previa a {ancho} px',
  },
  preset: {
    ejemplo: 'Cocina de autor',
    boton: 'Reservar',
    seleccionado: 'Seleccionado',
  },
  plantilla: {
    seccionesUna: '1 sección',
    secciones: '{n} secciones',
    enUso: 'En uso',
    seleccionada: 'Seleccionada',
    pagina: 'Página',
    vistaPrevia: 'Miniatura de la plantilla {nombre}',
  },
  seccion: {
    portada: 'Portada',
    carta_destacada: 'Carta destacada',
    galeria: 'Galería',
    reservas: 'Reservas',
    opiniones: 'Opiniones',
    ubicacion_horario: 'Ubicación y horario',
    texto: 'Texto',
    productos: 'Productos',
    eventos: 'Eventos',
    llamado_accion: 'Llamado a la acción',
    anadir: 'Añadir sección',
  },
  dominio: {
    verificando: 'Verificando DNS',
    activo: 'Activo · SSL',
    malConfigurado: 'Mal configurado',
    vencePronto: 'Vence pronto',
    venceEnUno: 'Vence en 1 día',
    venceEn: 'Vence en {n} días',
    vencido: 'Vencido',
    pendiente: 'Pendiente',
  },
  dns: {
    tipo: 'Tipo',
    nombre: 'Nombre',
    valor: 'Valor',
    copiar: 'Copiar',
    copiarValor: 'Copiar valor',
    copiado: 'Copiado',
    noSePudoCopiar: 'No se pudo copiar',
    pendiente: 'Pendiente',
    correcto: 'Correcto',
    otroValor: 'Encontramos {valor}',
    otroValorSinDato: 'Encontramos otro valor',
    aunNoAparece: 'Aún no aparece',
    soloSiLoPide: 'Solo si lo pide',
  },
  precio: {
    porAnio: '/ año',
    renueva: 'Renueva a {precio} / año',
  },
  guia: {
    otro: 'Otro proveedor',
    verGuia: 'Ver guía con capturas en {proveedor}',
    proveedores: 'Proveedor de tu dominio',
    pasos: {
      godaddy: [
        'Entra a GoDaddy › Mis productos › Dominios › DNS.',
        'En «Registros», edita el registro A con nombre @ y pega el valor.',
        'Añade un CNAME con nombre www y el valor indicado.',
        'Guarda. GoDaddy suele propagar en menos de 1 hora.',
      ],
      hostinger: [
        'En hPanel ve a Dominios › tu dominio › DNS / Nameservers.',
        'Borra el registro A de @ que apunta a Hostinger.',
        'Crea A @ y CNAME www con los valores de arriba.',
        'Guarda y vuelve aquí: verificamos solos.',
      ],
      cloudflare: [
        'En Cloudflare › tu sitio › DNS › Records.',
        'Crea A @ y CNAME www con los valores de arriba.',
        'Importante: deja la nube en gris (Solo DNS, sin proxy).',
        'Si usas SSL «Full», no hace falta cambiarlo.',
      ],
      namecheap: [
        'Domain List › Manage › Advanced DNS.',
        'Borra el «URL Redirect Record» y el CNAME de parking.',
        'Añade A Record @ y CNAME Record www con los valores.',
        'TTL automático. Guarda con el ✓ verde.',
      ],
      otro: [
        'Busca la sección «DNS», «Zona DNS» o «Registros».',
        'Crea los registros de arriba tal cual.',
        'Si no encuentras dónde, comparte esta guía con quien maneja tu dominio.',
        'También puedes delegar los nameservers a ns1/ns2.vercel-dns.com.',
      ],
    },
  },
  qr: {
    escanea: 'Escanea para ver la carta y pedir',
    alt: 'Código QR de {nombre}',
  },
  herencia: {
    heredado: 'Heredado de la principal',
    personalizado: 'Personalizado',
    restablecer: 'Restablecer',
    restablecerAria: 'Restablecer desde el sitio principal',
    sucursal: 'De la sucursal · solo lectura',
  },
  sede: {
    editando: 'Editando:',
    principal: 'Sitio principal',
    cambiar: 'Cambiar el sitio o la sede que editas',
    sedes: 'Sedes',
  },
  cabecera: {
    clasico: 'Clásico',
    logo_centrado: 'Logo centrado',
    dividido: 'Dividido',
    minimo: 'Mínimo',
    megamenu: 'Megamenú',
  },
  sitio: {
    reservar: 'Reservar',
    verTodo: 'Ver todo',
    hechoCon: 'Hecho con GO Admin',
    terminos: 'Términos',
    privacidad: 'Privacidad',
    tuCorreo: 'Tu correo',
    suscribirme: 'Suscribirme',
    buscar: 'Buscar',
    carrito: 'Carrito',
    cuenta: 'Mi cuenta',
    menu: 'Abrir menú',
    contacto: 'Contacto',
    horario: 'Horario',
    enlaces: 'Enlaces',
    legales: 'Legales',
    nuevo: 'Nuevo',
  },
  marco: {
    verSitio: 'Ver sitio',
    abrirEditor: 'Abrir editor',
    masAcciones: 'Más acciones del sitio',
    sinDireccion: 'Tu sitio aún no tiene dirección',
    cargando: 'Cargando…',
    errorTitulo: 'No pudimos cargar {pagina}',
    errorDescripcion: 'Tu sitio sigue en línea. Revisa la conexión e inténtalo de nuevo; si continúa, escríbenos.',
    reintentar: 'Reintentar',
    sinPermisoTitulo: 'No tienes acceso al sitio web',
    sinPermisoDescripcion:
      'Pide a un administrador de tu organización el permiso «Ver sitio web» (website.view). Editar y publicar son permisos aparte.',
    volverInicio: 'Volver al inicio',
    primeraVezTitulo: 'Aún no tienes sitio web',
    primeraVezDescripcion: 'Crea tu sitio en pocos pasos: elige tu giro, una plantilla y tu estilo.',
    primeraVezAccion: 'Crear mi sitio',
  },
} as const;

type Hoja = string | readonly string[];
type Arbol = { readonly [k: string]: Hoja | Arbol };

/** Valor del español canónico por ruta con puntos (`dominio.venceEn`). */
export function textoCanonico(clave: string): Hoja | undefined {
  let nodo: Hoja | Arbol | undefined = TEXTOS_COMUN as unknown as Arbol;
  for (const parte of clave.split('.')) {
    if (!nodo || typeof nodo === 'string' || Array.isArray(nodo)) return undefined;
    nodo = (nodo as Arbol)[parte];
  }
  return nodo as Hoja | undefined;
}

/** Sustituye `{marcador}` por su valor; deja el marcador si no hay valor. */
export function interpolar(texto: string, valores?: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => (valores && k in valores ? String(valores[k]) : m));
}

export type TraductorComun = (clave: string, valores?: Record<string, string | number>) => string;

/** Textos de `sitioWeb.comun.*` en el idioma activo, con el español canónico de respaldo. */
export function useTextosComun(): TraductorComun {
  const t = useTranslations('sitioWeb');
  return useCallback(
    (clave: string, valores?: Record<string, string | number>) => {
      const completa = `comun.${clave}`;
      if (t.has(completa)) return t(completa, valores);
      const canon = textoCanonico(clave);
      return typeof canon === 'string' ? interpolar(canon, valores) : clave;
    },
    [t],
  );
}

/** Listas (pasos de una guía): next-intl no devuelve arreglos con `t`; se leen con `t.raw`. */
export function useListaComun(): (clave: string) => readonly string[] {
  const t = useTranslations('sitioWeb');
  return useCallback(
    (clave: string) => {
      const completa = `comun.${clave}`;
      if (t.has(completa)) {
        const crudo = t.raw(completa) as unknown;
        if (Array.isArray(crudo)) return crudo.map(String);
      }
      const canon = textoCanonico(clave);
      return Array.isArray(canon) ? canon : [];
    },
    [t],
  );
}
