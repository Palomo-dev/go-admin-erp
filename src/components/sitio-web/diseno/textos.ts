'use client';

/**
 * Textos de Diseño y Plantillas (`sitioWeb.diseno.*`, Figma A/06a-06i).
 * `TEXTOS_DISENO` es el español canónico y la fuente de diseno.es.json. Mientras
 * el integrador fusiona las claves en messages/*.json, `useTextosDiseno` muestra
 * este español en vez de la clave cruda (el patrón de `useTextosComun`).
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { interpolar } from '../ui/textos';

export const TEXTOS_DISENO = {
  subtitulo: {
    estilo: 'Estilo del sitio',
    encabezadoPie: 'Encabezado y pie',
    logo: 'Logo y favicon',
    conEstado: '{seccion} · {estado}',
  },
  acciones: {
    vistaPrevia: 'Vista previa',
    publicar: 'Publicar',
    restablecer: 'Restablecer el preset',
    verSitio: 'Ver sitio',
    abrirEditor: 'Abrir editor',
    cancelar: 'Cancelar',
  },
  pestanas: {
    etiqueta: 'Secciones de Diseño',
    estilo: 'Estilo',
    encabezadoPie: 'Encabezado y pie',
    logo: 'Logo y favicon',
  },
  panel: {
    titulo: 'Estilo del sitio',
    descripcion: 'Afecta a todas las páginas, al encabezado y al pie',
    presets: 'Presets',
    verTodos: 'Ver los {n} presets de {giro}',
    verMenos: 'Ver menos presets',
    ajustes: 'Ajustes',
    fondo: 'Fondo',
    texto: 'Texto',
    acento: 'Acento',
    tipografia: 'Tipografía',
    verMasPares: 'Ver más pares ({n})',
    verMenosPares: 'Ver menos pares',
    redondeo: 'Redondeo',
    botones: 'Botones',
    movimiento: 'Movimiento',
    pendiente: 'Redondeo, botones y movimiento se aplican cuando el sitio publicado los admita. Por ahora se ven en las muestras de los presets.',
    motivoPendiente: 'El sitio publicado aún no aplica este ajuste',
    sinPresets: 'Aún no hay presets para tu giro. Mira las plantillas.',
  },
  giroEnFrase: {
    restaurante: 'restaurante',
    tienda: 'tienda',
    hotel: 'hotel',
    servicios: 'servicios',
    gimnasio: 'gimnasio',
    transporte: 'transporte',
    parqueadero: 'parqueadero',
  },
  boton: {
    solido: 'Sólido',
    contorno: 'Contorno',
    pastilla: 'Pastilla',
    sombra_dura: 'Sombra dura',
  },
  movimiento: {
    ninguno: 'Ninguno',
    bajo: 'Bajo',
    medio: 'Medio',
    alto: 'Alto',
  },
  clase: {
    editorial: 'Editorial · serifa clásica',
    elegante: 'Elegante · títulos con serifa',
    clasica: 'Clásica · títulos con serifa',
    calida: 'Cálida · serifa de titular',
    artesanal: 'Artesanal · serifa expresiva',
    divertida: 'Divertida · sin serifa con carácter',
    neutra: 'Neutra · fácil de leer',
    moderna: 'Moderna · sin serifa',
  },
  muestra: {
    restaurante: { texto: 'Cocina de autor', boton: 'Reservar' },
    tienda: { texto: 'Nueva colección', boton: 'Comprar' },
    hotel: { texto: 'Tu próxima estadía', boton: 'Reservar' },
    servicios: { texto: 'Asesoría a tu medida', boton: 'Agendar' },
    gimnasio: { texto: 'Entrena hoy', boton: 'Inscribirme' },
    transporte: { texto: 'Viaja con nosotros', boton: 'Cotizar' },
    parqueadero: { texto: 'Parquea sin vueltas', boton: 'Reservar' },
  },
  vista: {
    titulo: 'Vista previa en vivo · Inicio',
    anchos: 'Ancho de la vista previa',
    iframe: 'Vista previa en vivo de tu sitio',
    sinDireccion: 'Tu sitio aún no tiene dirección. Configúrala en Dominios para ver la vista previa.',
    celular: 'Vista previa en celular',
    publicado: 'Mostramos el sitio publicado: no pudimos abrir el borrador.',
    errorAbrir: 'No pudimos abrir la vista previa: {mensaje}',
  },
  estados: {
    nombreContenido: 'el diseño',
    errorTitulo: 'No pudimos cargar el diseño',
    errorDescripcion: 'Tu sitio no cambió. Inténtalo de nuevo en unos segundos.',
    reintentar: 'Reintentar',
    sinPermisoTitulo: 'No puedes cambiar el diseño del sitio',
    sinPermisoDescripcion: 'Necesitas el permiso «Editar sitio web» (website.sites.edit). Puedes ver el sitio publicado.',
  },
  guardado: {
    error: 'No pudimos guardar el estilo: {mensaje}',
  },
  publicar: {
    listo: 'Publicaste los cambios.',
    error: 'No pudimos publicar: {mensaje}',
    sinPermiso: 'Necesitas el permiso «Publicar sitio web» (website.sites.publish).',
    sinCambios: 'No hay cambios por publicar.',
    conflicto: 'Otra persona guardó o publicó una versión más nueva. Recargamos el diseño para que veas lo último.',
  },
  adopcion: {
    titulo: 'Tu sitio en línea aún muestra la versión anterior',
    descripcion: 'Lo que publiques aquí se guarda como versión del sitio nuevo. Tus clientes lo verán cuando actives el sitio nuevo desde el editor.',
  },
  restablecer: {
    titulo: 'Restablecer el preset',
    descripcion: 'Vuelves a los colores, la tipografía y los ajustes de «{nombre}». Tus ajustes de estilo se pierden; el contenido no cambia.',
    confirmar: 'Restablecer',
    sinPreset: 'Elige un preset para poder restablecerlo',
  },
  encabezadoPie: {
    titulo: 'El encabezado y el pie se editan en el editor',
    descripcion:
      'Toca el encabezado o el pie en el lienzo y ajústalo en el panel derecho, viendo el resultado. Aquí, en Diseño, quedan la paleta, la tipografía, los botones, el logo y el favicon, que también usan el encabezado y el pie.',
    abrirEncabezado: 'Abrir el editor con el encabezado seleccionado',
    abrirPie: 'Abrir con el pie de página seleccionado',
    sinInicio: 'Aún no tienes página de inicio. Créala en Páginas para editar el encabezado y el pie.',
    irPaginas: 'Ir a Páginas',
  },
  logo: {
    titulo: 'Logo y favicon',
    descripcion: 'Se usan en el encabezado, el pie y la pestaña del navegador. Es el mismo dato que Configuración › Datos del negocio.',
    guardado: 'Guardamos el cambio en el borrador.',
    error: 'No pudimos guardar el cambio: {mensaje}',
  },
  movil: {
    vistaPrevia: 'Vista previa',
    publicar: 'Publicar',
  },
  plantillas: {
    subtitulo: 'Usar una plantilla crea un borrador: tu contenido se conserva',
    pestanas: 'Plantillas por giro',
    giro: {
      restaurante: 'Restaurante',
      tienda: 'Tienda',
      hotel: 'Hotel',
      servicios: 'Servicios',
      gimnasio: 'Gimnasio',
      transporte: 'Transporte',
      parqueadero: 'Parqueadero',
      todas: 'Todas',
    },
    nombreContenido: 'las plantillas',
    errorTitulo: 'No pudimos cargar las plantillas',
    errorDescripcion: 'Tu sitio no cambió. Inténtalo de nuevo en unos segundos.',
    vacio: 'Aún no hay plantillas para este giro. Mira las de Todas.',
    verTodas: 'Ver todas',
    abrir: 'Ver la plantilla «{nombre}»',
  },
  dialogo: {
    vistaPrevia: 'Vista previa con tu contenido',
    incluye: 'Incluye',
    estilo: 'Estilo',
    descripcion: '{descripcion} Usa tu carta, tus fotos y tus textos: así se vería tu sitio.',
    esquema: 'Muestra el orden de las secciones con tu nombre y tu menú. Tus textos y fotos de cada sección se conservan al aplicarla.',
    avisoTitulo: 'Reemplaza el diseño, conserva tu contenido',
    avisoDescripcion:
      'Cambian el estilo, el orden y las variantes de las secciones. Tus textos, fotos, carta y páginas se conservan. Se crea un borrador: nada cambia en línea hasta que publiques.',
    usar: 'Usar esta plantilla',
    sinPermiso: 'Necesitas el permiso «Editar sitio web» (website.sites.edit) para usar una plantilla.',
    listo: 'Aplicamos «{nombre}» a tu borrador.',
    faltanUna: '1 sección de la plantilla aún no está en tu Inicio: añádela desde el editor.',
    faltan: '{n} secciones de la plantilla aún no están en tu Inicio: añádelas desde el editor.',
    verDiseno: 'Ver en Diseño',
    error: 'No pudimos aplicar la plantilla: {mensaje}',
    conflicto: 'Otra persona guardó una versión más nueva. Recargamos tu borrador: vuelve a intentarlo.',
    seccionDesconocida: 'Sección',
    tuMarca: 'Tu marca',
    inicio: 'Inicio',
  },
} as const;

type Arbol = { readonly [k: string]: string | Arbol };

function canonico(clave: string): string | undefined {
  let nodo: string | Arbol | undefined = TEXTOS_DISENO as Arbol;
  for (const parte of clave.split('.')) {
    if (!nodo || typeof nodo === 'string') return undefined;
    nodo = nodo[parte];
  }
  return typeof nodo === 'string' ? nodo : undefined;
}

export type TraductorDiseno = (clave: string, valores?: Record<string, string | number>) => string;

/** Textos de `sitioWeb.diseno.*` en el idioma activo, con el español canónico de respaldo. */
export function useTextosDiseno(): TraductorDiseno {
  const t = useTranslations('sitioWeb');
  return useCallback(
    (clave: string, valores?: Record<string, string | number>) => {
      const completa = `diseno.${clave}`;
      if (t.has(completa)) return t(completa, valores);
      const canon = canonico(clave);
      return canon === undefined ? clave : interpolar(canon, valores);
    },
    [t],
  );
}
