'use client';

/**
 * Textos de «SEO y redes» y «Analítica» (`sitioWeb.seoanalitica.*`, Figma
 * B/08, B/09 y E-analitica). `TEXTOS_SEOANALITICA` es el español canónico y la
 * fuente de seoanalitica.es.json. Mientras el integrador fusiona las claves en
 * messages/*.json, `useTextosSeoAnalitica` muestra este español en vez de la
 * clave cruda (el patrón de `useTextosComun`).
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { interpolar } from '../ui/textos';

export const TEXTOS_SEOANALITICA = {
  seo: {
    subtitulo: 'Cómo aparece tu negocio en buscadores y al compartir enlaces',
    nombreContenido: 'la configuración SEO',
    acciones: {
      actualizar: 'Actualizar',
      verSitemap: 'Ver sitemap',
      guardar: 'Guardar',
      guardarCambios: 'Guardar cambios',
      ocultar: 'Ocultar de los buscadores',
      mostrar: 'Mostrar en los buscadores',
      verRobots: 'Ver robots.txt',
      abrirSearchConsole: 'Abrir en Google Search Console',
      masAcciones: 'Más acciones de SEO',
    },
    estados: {
      vacioTitulo: 'Tu sitio aún no tiene título ni imagen para compartir',
      vacioTexto: 'Te proponemos unos a partir del nombre, el giro y el logo de tu negocio. Revísalos y guarda.',
      usarSugerencias: 'Usar sugerencias',
      escribirLosMios: 'Escribir los míos',
      errorTitulo: 'No pudimos cargar la configuración SEO',
      errorTexto: 'Tu sitio sigue publicado con la última configuración guardada.',
      sinPermisoTitulo: 'No tienes permiso para editar el SEO',
      sinPermisoTexto: 'Pide el permiso «Editar sitio web» a un administrador.',
      reintentar: 'Reintentar',
      conflictoTitulo: 'Otra persona guardó cambios en el sitio',
      conflictoTexto: 'Recarga para ver su versión antes de guardar la tuya. Tus cambios de esta pantalla se conservan.',
      recargar: 'Recargar',
      guardado: 'Cambios guardados en el borrador. Publícalos desde el Resumen o el editor.',
      errorGuardar: 'No pudimos guardar: {mensaje}',
      soloLectura: 'Puedes ver el SEO, pero no editarlo.',
    },
    titulo: {
      seccion: 'Título y descripción por defecto',
      descripcionSeccion: 'Se usan en la página de inicio y en cualquier página que no tenga los suyos.',
      sugerirIa: 'Sugerir con IA',
      campoTitulo: 'Título del sitio',
      campoDescripcion: 'Descripción',
      contador: '{n} / {max} caracteres · {estado}',
      bien: 'bien',
      largo: 'largo',
      falta: 'falta',
      placeholderTitulo: 'Tu marca · Lo que vendes y dónde',
      placeholderDescripcion: 'Qué ofreces, cómo se compra y por qué elegirte. Entre 50 y 160 caracteres.',
    },
    ia: {
      titulo: 'Sugerencia con IA',
      descripcion: 'La propuesta usa el nombre, el giro y las páginas de tu sitio. Solo se cobra {n} crédito de IA si la aplicas.',
      generando: 'Generando la propuesta…',
      aplicar: 'Aplicar sugerencia',
      otra: 'Proponer otra',
      cancelar: 'Cancelar',
      sinCreditos: 'No tienes créditos de IA. Recarga créditos para usar esta opción.',
      noDisponible: 'La IA no está disponible en este momento. Intenta más tarde.',
      error: 'No pudimos generar la propuesta. Intenta de nuevo.',
      aplicada: 'Sugerencia aplicada. Revisa y guarda.',
    },
    imagen: {
      seccion: 'Imagen para compartir',
      descripcionSeccion: 'La que aparece al pegar tu enlace en WhatsApp, Facebook o LinkedIn. 1200 × 630 px.',
      principal: 'Principal',
      agregar: 'Agregar imagen',
      cambiar: 'Cambiar imagen',
      quitar: 'Quitar imagen',
      pie: '{n} de {max} · La principal es la que ven al compartir tu enlace',
      sinImagen: 'Aún no hay imagen. Usa una foto de tu producto o de tu local.',
      elegir: 'Elige la imagen para compartir',
    },
    redes: {
      seccion: 'Redes sociales',
      descripcionSeccion: 'Aparecen en el pie de tu sitio y en los datos que lee Google.',
      instagram: 'Instagram',
      facebook: 'Facebook',
      tiktok: 'TikTok',
      whatsapp: 'WhatsApp',
      invalido: 'Escribe un usuario, un enlace o un número válido.',
      catalogos: 'Catálogos de Meta y TikTok',
      catalogosValor: 'Se conectan desde Inventario',
      catalogosAccion: 'Ir a Inventario',
    },
    google: {
      seccion: 'Google',
      searchConsole: 'Google Search Console',
      verificado: 'Código de verificación guardado. Ve qué buscan para llegar a ti.',
      sinVerificar: 'Pega el código de la etiqueta meta que te da Search Console.',
      codigoGuardado: 'Código guardado',
      codigo: 'Código de verificación',
      codigoAyuda: 'Puedes pegar la etiqueta completa: tomamos solo el código.',
      codigoInvalido: 'Ese código no parece de Search Console.',
      abrir: 'Abrir',
      perfil: 'Perfil de Empresa en Google',
      perfilTexto: 'Conecta tu ficha de Google Maps para mostrar reseñas y horario actualizados.',
      conectar: 'Conectar',
      sitemap: 'sitemap.xml',
      robots: 'robots.txt',
      canonica: 'Dirección canónica',
      sitemapOk: 'Publicado · {n} direcciones',
      sitemapFalta: 'El sitio aún no publica el sitemap',
      robotsOk: 'Permite indexar el sitio',
      robotsBloquea: 'Bloquea a los buscadores',
      robotsDisallow: 'Permite indexar todo menos {rutas}',
      robotsFalta: 'El sitio aún no publica robots.txt',
      canonicaValor: 'https://{host} (dominio principal)',
      canonicaFalta: 'Tu sitio aún no tiene dirección',
      revisando: 'Revisando…',
      falta: 'Falta',
      ocultar: 'Ocultar de los buscadores',
      ocultarTexto: 'Úsalo solo mientras el sitio está en construcción (añade noindex).',
      ocultarPendiente: 'Disponible cuando se active la opción en la base de datos.',
      ocultoAviso: 'Tu sitio está oculto de los buscadores.',
    },
    vista: {
      titulo: 'Vista previa',
      descripcion: 'Así se verá con {host}, tu dominio principal.',
      descripcionSinHost: 'Así se verá cuando tu sitio tenga dirección.',
      google: 'Google',
      whatsapp: 'WhatsApp',
      facebook: 'Facebook',
      pestanas: 'Vista previa por red',
      tituloVacio: 'Título de tu sitio',
      descripcionVacia: 'Aquí va la descripción de tu sitio.',
    },
    calidad: {
      titulo: 'Calidad SEO por página',
      descripcion: 'Revisamos título, descripción e imagen de cada página publicada. Corregir abre el editor en el panel SEO de esa página.',
      pagina: 'Página',
      columnaTitulo: 'Título',
      columnaDescripcion: 'Descripción',
      columnaImagen: 'Imagen',
      columnaCalidad: 'Calidad',
      corregir: 'Corregir',
      bien: 'Bien',
      mejorable: 'Mejorable',
      falta: 'Falta',
      faltaTitulo: 'Falta título',
      faltaDescripcion: 'Falta descripción',
      faltaImagen: 'Falta imagen',
      vacio: 'Aún no tienes páginas publicadas. Publica la primera desde Páginas.',
      herencia: 'Las páginas de producto y categoría heredan título y descripción del inventario; {con} de {total} productos tienen descripción.',
      herenciaSinProductos: 'Las páginas de producto y categoría heredan título y descripción del inventario.',
    },
    movil: {
      tituloDescripcion: 'Título y descripción',
      imagen: 'Imagen para compartir',
      imagenLista: '1200 × 630 · lista',
      imagenFalta: 'Falta la imagen',
      redes: 'Redes sociales',
      redesNinguna: 'Sin redes',
      google: 'Google',
      googleCodigoGuardado: 'Código de Search Console guardado',
      googleSinVerificar: 'Search Console sin verificar',
      calidad: 'Calidad por página',
      calidadBien: 'Todas las páginas están bien',
      calidadUna: '1 página sin descripción',
      calidadVarias: '{n} páginas sin descripción',
      calidadMejorables: '{n} páginas para mejorar',
      listo: 'Listo',
    },
  },
  analitica: {
    subtitulo: 'Sitio web · {host}',
    subtituloSinHost: 'Sitio web',
    nombreContenido: 'la analítica',
    acciones: {
      actualizar: 'Actualizar',
      exportar: 'Exportar CSV',
      copiarEnlace: 'Copiar enlace',
      enlaceCopiado: 'Enlace copiado',
    },
    estados: {
      vacioTitulo: 'Aún no hay visitas',
      vacioTexto: 'Comparte tu enlace {host} en WhatsApp e Instagram; las visitas aparecen aquí en minutos.',
      vacioTextoSinHost: 'Comparte el enlace de tu sitio en WhatsApp e Instagram; las visitas aparecen aquí en minutos.',
      errorTitulo: 'No pudimos cargar la analítica',
      errorTexto: 'Las visitas se siguen registrando; solo falló la consulta.',
      sinPermisoTitulo: 'No tienes permiso para ver la analítica',
      sinPermisoTexto: 'Pide el permiso «Ver reportes de ventas» a un administrador.',
    },
    periodo: 'Periodo',
    sucursales: 'Todas las sucursales ({n})',
    sucursalesCorto: 'Todas ({n})',
    notaSucursal: 'las visitas son de la tienda, no de una sucursal; la venta media sí respeta la sucursal',
    kpi: {
      vsAnterior: '{v} vs periodo anterior',
      ppVsAnterior: '{v} pp vs periodo anterior',
      nuevos: '{v} · {pct} nuevos',
      pendientes: '{v} · {n} pendientes',
      ventaMediaSucursal: '{v} · {sucursal}',
    },
    grafico: {
      visitantes: 'Visitantes',
      pedidos: 'Pedidos',
      conversion: 'Conversión',
      serie: 'Serie del gráfico',
      actual: 'Periodo actual',
      anterior: 'Periodo anterior',
      rango: '{desde} — {hasta}',
    },
    fuentes: {
      titulo: 'De dónde llegan',
      descripcion: 'Sesiones del periodo · utm_source y referrer agrupados',
      valor: '{n} · {pct}',
      google: 'Google (búsqueda)',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      directo: 'Directo',
      facebook: 'Facebook',
      tiktok: 'TikTok',
      otros: 'Otros',
      vacio: 'Aún no hay sesiones en el periodo.',
    },
    paginas: {
      titulo: 'Páginas más vistas',
      descripcion: 'Visitas y cuántas sesiones terminan en pedido o reserva',
      pagina: 'Página',
      visitas: 'Visitas',
      conversion: 'Conversión',
      inicio: '/ (inicio)',
      vacio: 'Aún no hay visitas en el periodo.',
    },
    pedido: {
      titulo: 'Conversión a pedido',
      productos: 'Visitas a producto',
      carrito: 'Agregaron al carrito',
      pago: 'Iniciaron pago',
      pagados: 'Pedido pagado',
      fuente: 'Fuente: visitas del sitio y pedidos web pagados.',
      verPedidos: 'Ver pedidos en POS › Pedidos online',
    },
    reserva: {
      titulo: 'Conversión a reserva',
      visitas: 'Visitas a /reservas',
      creadas: 'Dejaron su solicitud',
      confirmadas: 'Reserva confirmada',
      fuente: 'Fuente: visitas del sitio y reservas hechas desde la web.',
    },
    noDisponible: 'Este bloque estará disponible cuando se active la nueva consulta de tráfico.',
    pixeles: {
      titulo: 'Píxeles y medición',
      nuevo: 'Nuevo',
      nota: 'Los ID se guardan como campos tipados (no como un script pegado). Los scripts libres siguen en Configuración › Código y píxeles, con advertencia.',
      conectado: 'Conectado',
      noConectado: 'No conectado',
      conectar: 'Conectar',
      cambiar: 'Cambiar',
      desconectar: 'Desconectar',
      probar: 'Probar eventos',
      abrirGoogle: 'Abrir en Google',
      id: 'ID {id}',
      pendiente: 'Disponible cuando se active la opción en la base de datos.',
      sinPermiso: 'Necesitas el permiso «Editar sitio web» para conectar píxeles.',
      metaEnCodigo: 'Tu código propio (Configuración › Código y píxeles) ya carga un Meta Pixel. Para no contar cada visita dos veces, el sitio usa ese código y no este ID. Quita el Meta Pixel del código para usar este.',
      meta: { nombre: 'Meta Pixel', texto: 'Mide visitas, carritos y compras de tus anuncios en Facebook e Instagram' },
      ga4: { nombre: 'Google Analytics 4', texto: 'Mide el tráfico de tu sitio en tu cuenta de Google' },
      tiktok: { nombre: 'TikTok Pixel', texto: 'Mide ventas de tus anuncios en TikTok' },
      gtm: { nombre: 'Google Tag Manager', texto: 'Para agencias: carga tus etiquetas sin tocar código' },
      ads: { nombre: 'Google Ads', texto: 'Mide las conversiones de tus campañas de Google' },
    },
    dialogoPixel: {
      titulo: 'Conectar {nombre}',
      tituloCambiar: 'Cambiar {nombre}',
      campo: 'ID de {nombre}',
      ayuda: {
        meta: 'Solo números, por ejemplo 123456789012345. Está en el Administrador de eventos de Meta.',
        ga4: 'Empieza por G-, por ejemplo G-ABC123XYZ. Está en Administrar › Flujos de datos.',
        tiktok: 'Letras mayúsculas y números, por ejemplo C4ABCDEF1234567890AB.',
        gtm: 'Empieza por GTM-, por ejemplo GTM-ABC1234.',
        ads: 'Empieza por AW-, por ejemplo AW-123456789.',
      },
      invalido: 'Ese ID no tiene el formato de {nombre}.',
      guardar: 'Guardar',
      cancelar: 'Cancelar',
      guardado: '{nombre} quedó conectado. El sitio lo carga desde la próxima visita.',
      quitado: '{nombre} quedó desconectado.',
      error: 'No pudimos guardar el píxel.',
    },
    prueba: {
      titulo: 'Probar {nombre}',
      descripcion: 'Revisamos la página de inicio de {host} para ver si carga tu píxel.',
      revisando: 'Revisando tu sitio…',
      encontrado: 'Encontramos el ID {id} en tu página de inicio. Los eventos se ven en la consola del proveedor.',
      noEncontrado: 'Tu página de inicio aún no carga el ID {id}. Si acabas de conectarlo, espera unos minutos y vuelve a probar.',
      sinHost: 'Tu sitio aún no tiene dirección pública.',
      error: 'No pudimos abrir tu sitio para revisarlo.',
      cerrar: 'Cerrar',
      otraVez: 'Probar otra vez',
    },
    geo: {
      titulo: 'De dónde entran',
      nuevo: 'Nuevo',
      privacidad: 'La ubicación se resuelve en el borde a partir de la IP; nunca se guarda la IP en claro.',
      mundo: 'Mundo',
      colombia: 'Colombia',
      verColombia: 'Ver Colombia por ciudad',
      filaPais: '{sesiones} sesiones',
    },
  },
} as const;

type Hoja = string | { readonly [k: string]: Hoja };

function canonico(clave: string): string | undefined {
  let nodo: Hoja | undefined = TEXTOS_SEOANALITICA as unknown as Hoja;
  for (const parte of clave.split('.')) {
    if (!nodo || typeof nodo === 'string') return undefined;
    nodo = (nodo as { readonly [k: string]: Hoja })[parte];
  }
  return typeof nodo === 'string' ? nodo : undefined;
}

/** Texto canónico en español (para pruebas y para el servidor). */
export function textoSeoAnalitica(clave: string, valores?: Record<string, string | number>): string {
  const canon = canonico(clave);
  return canon === undefined ? clave : interpolar(canon, valores);
}

export type TraductorSeoAnalitica = (clave: string, valores?: Record<string, string | number>) => string;

export function useTextosSeoAnalitica(): TraductorSeoAnalitica {
  const t = useTranslations('sitioWeb');
  return useCallback(
    (clave: string, valores?: Record<string, string | number>) => {
      const completa = `seoanalitica.${clave}`;
      if (t.has(completa)) return t(completa, valores);
      return textoSeoAnalitica(clave, valores);
    },
    [t],
  );
}
