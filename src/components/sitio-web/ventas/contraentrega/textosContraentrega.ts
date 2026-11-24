'use client';

/**
 * Textos de «Pago contra entrega» (namespace `contraentregaCondiciones`). `TEXTOS_CONTRAENTREGA`
 * es el español canónico y la fuente de es.json; mientras el integrador fusiona las claves en
 * messages/*.json, `useTextosContraentrega` muestra este español en vez de la clave cruda (el
 * patrón de `useTextosVentas`).
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { interpolar } from '../../ui/textos';
import type { PiezaTexto } from '@/lib/contraentrega/condicionesWeb';

export const NAMESPACE_CONTRAENTREGA = 'contraentregaCondiciones';

export const TEXTOS_CONTRAENTREGA = {
  fila: {
    titulo: 'Pago contra entrega',
    conCondiciones: 'Con condiciones',
    sinCondiciones: 'Sin condiciones',
    apagada: 'Apagada a domicilio',
    sinEfectivo: 'Sin el método Efectivo',
    condiciones: 'Condiciones',
    nuevo: 'Nuevo',
    sedeResumen: '{sede}: {resumen}',
    masSedes: 'y {n} sedes más con condiciones',
    cargando: 'Cargando condiciones…',
    errorCarga: 'No pudimos leer las condiciones de la contraentrega.',
  },
  dialogo: {
    titulo: 'Pago contra entrega',
    descripcion: 'Sitio web › Ventas en línea › Métodos de pago · el cliente paga cuando recibe el pedido',
    guardar: 'Guardar cambios',
    pie: 'Los cambios se ven en la tienda al guardar. Los pedidos ya hechos no cambian.',
    guardado: 'Condiciones guardadas',
    error: 'No se pudo guardar: {mensaje}',
    sede: 'Sede',
    sedeAyuda: 'Cada sede tiene sus condiciones: manda la sede que despacha el pedido.',
    sedeConCondiciones: '{sede} · con condiciones',
    quitarCondiciones: 'Quitar condiciones de esta sede',
    quitadas: 'Condiciones quitadas: la contraentrega funciona como antes en esta sede',
    sinEfectivoTitulo: 'Tu organización no tiene el método Efectivo',
    sinEfectivoDescripcion: 'La contraentrega es el método Efectivo con condiciones. Actívalo primero en Finanzas › Métodos de pago.',
    irFinanzas: 'Ir a Finanzas › Métodos de pago',
    efectivoOculto: 'El método Efectivo está oculto en la web: las condiciones se guardan, pero la tienda no lo ofrece hasta que lo muestres en Finanzas › Métodos de pago.',
    sinSedes: 'Tu organización no tiene sedes activas.',
  },
  ofrecer: {
    titulo: 'Ofrecer pago contra entrega en la tienda',
    ayuda: 'El cliente paga cuando recibe el pedido. Solo aplica a «Domicilio»: con «Recoger en la tienda» paga al recoger.',
  },
  monto: {
    titulo: 'Monto del pedido',
    ayuda: 'Se cuenta el valor de los productos con descuentos, sin el envío. Vacío = sin límite.',
    minimo: 'Pedido mínimo',
    maximo: 'Pedido máximo',
    errorRango: 'El mínimo no puede ser mayor que el máximo.',
  },
  zonas: {
    titulo: 'Dónde se ofrece',
    ayuda: 'Zonas de Logística › Zonas.',
    todas: 'En todas las zonas de domicilio',
    algunas: 'Solo en estas zonas',
    sinZonas: 'Esta sede no tiene zonas de domicilio activas. Créalas en Logística › Zonas para limitar dónde se ofrece.',
    errorVacias: 'Elige al menos una zona.',
    transportadora: 'También con transportadora (envío nacional)',
    transportadoraAyuda: 'La transportadora cobra al entregar y te lo gira. Apágalo si solo quieres contraentrega con tus domiciliarios.',
  },
  productos: {
    titulo: 'A qué productos aplica',
    ayuda: 'Si el carrito tiene un producto que no aplica, la tienda le dice al cliente cuál es y le deja quitarlo o pagar todo en línea.',
    todos: 'Todos',
    solo: 'Solo algunos',
    excepto: 'Todos menos algunos',
    agregar: 'Agregar categoría o producto',
    buscar: 'Buscar categoría o producto',
    buscarAyuda: 'Escribe al menos 2 letras',
    categoria: 'Categoría',
    producto: 'Producto',
    quitar: 'Quitar {nombre}',
    sinResultados: 'Sin resultados',
    errorVacios: 'Agrega al menos una categoría o un producto.',
  },
  medios: {
    titulo: 'Con qué puede pagar al recibir',
    ayuda: 'El domiciliario registra el medio al entregar y le llega a su cuadre.',
    cash: 'Efectivo',
    card: 'Datáfono',
    transfer: 'Transferencia',
    qr: 'Nequi o transferencia (QR)',
    errorVacios: 'Elige al menos un medio.',
  },
  anticipo: {
    titulo: 'Anticipo para confirmar el pedido',
    ayuda: 'Confirma que el pedido va en serio. El resto se paga al recibir.',
    pedir: 'Pedir un anticipo en línea',
    envio: 'El valor del envío',
    envioAyuda: 'El cliente paga hoy el domicilio y el resto al recibir. Ej.: hoy {anticipo} y al recibir {resto}.',
    porcentaje: 'Un porcentaje del pedido',
    porcentajeAyuda: 'Del total con envío.',
    fijo: 'Un valor fijo',
    fijoAyuda: 'Igual para todos los pedidos.',
    errorPorcentaje: 'Escribe un porcentaje entre 1 y 100.',
    errorFijo: 'Escribe un valor mayor que cero.',
    envioGratisAviso: 'Tu tienda tiene envío gratis desde {monto}. En esos pedidos el anticipo «el valor del envío» sería {cero}. ¿Qué hacemos?',
    envioGratisAvisoSinMonto: 'Si un pedido sale con envío gratis, el anticipo «el valor del envío» sería {cero}. ¿Qué hacemos?',
    envioGratisNoPedir: 'No pedir anticipo en esos pedidos',
    envioGratisFijo: 'Pedir un valor fijo de',
    errorEnvioGratis: 'Escribe el valor fijo para los pedidos con envío gratis.',
    seCobraCon: 'Se cobra con',
    cualquiera: 'Cualquiera de las activas (el cliente elige)',
    conectada: '{nombre} · conectada',
    sinPasarela: 'No tienes una pasarela conectada: sin ella el anticipo no se puede cobrar y la contraentrega no se ofrece. Conéctala en Integraciones.',
    plazo: 'Plazo para pagarlo',
    plazoMinutos: '{n} minutos',
    siNoRecibe: 'Si el cliente no recibe el pedido',
    devolver: 'Devolver el anticipo',
    retener: 'La tienda se lo queda para cubrir el envío',
    siNoRecibeAyuda: 'Se muestra en el checkout en una línea: «{linea}».',
    lineaDevolver: 'Si no recibes el pedido, te devolvemos el anticipo.',
    lineaRetener: 'Si no recibes el pedido, el anticipo cubre el envío y no se devuelve.',
    avisoPlazo: 'Si no lo paga en {n} minutos, el pedido se cancela solo y los productos vuelven al inventario, igual que un pago en línea que no se completó.',
  },
  quien: {
    titulo: 'Quién puede usarla',
    soloEntregados: 'Solo clientes con pedidos entregados',
    soloEntregadosAyuda: 'Mínimo 1 pedido entregado. Los demás ven «Disponible desde tu segunda compra» y pagan en línea.',
    sinRechazos: 'No ofrecerla a quien rechazó un pedido en la puerta',
    sinRechazosAyuda: 'Si un cliente no recibió un pedido contra entrega, la próxima vez paga en línea.',
  },
  texto: {
    titulo: 'Texto que ve el cliente',
    ayuda: 'Va debajo de la opción en el checkout.',
    porDefecto: 'Paga en efectivo, con datáfono o Nequi cuando recibas tu pedido.',
    porDefectoAnticipo: 'Paga en efectivo, con datáfono o Nequi cuando recibas tu pedido. Para confirmarlo, hoy pagas solo el envío.',
    contador: '{n} / {max}',
  },
  cliente: {
    titulo: 'Así lo ve tu cliente',
    opcion: 'Pago contra entrega',
    hoyEnLinea: 'Hoy, en línea ({base})',
    alRecibir: 'Al recibir',
    baseEnvio: 'envío',
    basePorcentaje: 'anticipo',
    baseFijo: 'anticipo',
    sinAnticipo: 'Pagas {total} al recibir.',
    noDisponibleEjemplo: 'Con un pedido de {total} no se ofrece: revisa las condiciones.',
    motivosTitulo: 'Si no cumple una condición, la opción se ve apagada con el motivo:',
    motivoMinimo: 'Disponible desde {minimo} — te faltan {faltan}',
    motivoMaximo: 'Solo para pedidos hasta {maximo}',
    motivoProductos: 'No disponible para {n} productos de tu carrito · Ver cuáles',
    motivoZona: 'No llega a tu dirección: solo {zonas}',
    motivoTransportadora: 'No disponible con transportadora',
    motivoPrimeraCompra: 'Disponible desde tu segunda compra',
    motivoRechazo: 'Para esta compra el pago es en línea',
    apagada: 'La tienda no ofrece pago contra entrega a domicilio en esta sede.',
    resumenTitulo: 'Resumen de las reglas',
  },
  resumen: {
    sinCondiciones: 'Sin condiciones: se cobra todo al recibir',
    apagada: 'Apagada a domicilio',
    montoEntre: 'Desde {minimo} hasta {maximo}',
    montoDesde: 'Desde {minimo}',
    montoHasta: 'Hasta {maximo}',
    nZonas: '{n} zonas',
    sinTransportadora: 'sin transportadora',
    soloProductos: 'solo {lista}',
    todoMenos: 'todo menos {lista}',
    uno: '{primero}',
    primeroYMas: '{primero} y {n} más',
    nElementos: '{n} elementos',
    anticipoEnvio: 'anticipo: el envío',
    anticipoPorcentaje: 'anticipo: {porcentaje} %',
    anticipoFijo: 'anticipo: {valor}',
    soloConEntregas: 'solo clientes con entregas',
    sinRechazos: 'no a quien rechazó',
  },
  reglas: {
    apagada: 'No se ofrece a domicilio',
    cualquierMonto: 'Cualquier monto',
    montoEntre: 'Pedidos de {minimo} a {maximo}',
    montoDesde: 'Pedidos desde {minimo}',
    montoHasta: 'Pedidos hasta {maximo}',
    zonas: '{zonas}',
    nZonas: '{n} zonas',
    todasLasZonas: 'Todas las zonas de domicilio',
    conTransportadora: 'También con transportadora',
    sinTransportadora: 'Sin transportadora',
    todosLosProductos: 'Todos los productos',
    anticipoCon: 'Anticipo: {anticipo}, con {pasarela}, {minutos} min',
    anticipoCualquiera: 'Anticipo: {anticipo}, con la pasarela que elija el cliente, {minutos} min',
    sinAnticipo: 'Sin anticipo: todo se cobra al recibir',
    baseEnvio: 'el envío',
    basePorcentaje: '{porcentaje} %',
    baseFijo: '{valor}',
    soloConEntregas: 'Solo clientes con pedidos entregados',
    sinRechazos: 'No a quien rechazó un pedido en la puerta',
  },
} as const;

type Arbol = { [k: string]: string | Arbol };

export function textoContraentregaCanonico(clave: string): string | undefined {
  let nodo: string | Arbol | undefined = TEXTOS_CONTRAENTREGA as unknown as Arbol;
  for (const parte of clave.split('.')) {
    if (typeof nodo !== 'object' || nodo === null) return undefined;
    nodo = (nodo as Arbol)[parte];
  }
  return typeof nodo === 'string' ? nodo : undefined;
}

export type TraductorContraentrega = (clave: string, valores?: Record<string, string | number>) => string;

/**
 * Resuelve las piezas de `condicionesWeb.ts`: un valor que empieza por «@» es otra clave que se
 * traduce con los mismos valores («todo menos {lista}» con lista = «@resumen.primeroYMas»).
 */
export function textoPieza(t: TraductorContraentrega, pieza: PiezaTexto): string {
  const valores: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(pieza.valores ?? {})) {
    valores[k] = typeof v === 'string' && v.startsWith('@') ? t(v.slice(1), pieza.valores) : v;
  }
  return t(pieza.clave, valores);
}

/** Español canónico, sin next-intl (tests y respaldo). */
export const traductorCanonico: TraductorContraentrega = (clave, valores) => {
  const canon = textoContraentregaCanonico(clave);
  return canon === undefined ? clave : interpolar(canon, valores);
};

export function useTextosContraentrega(): TraductorContraentrega {
  const t = useTranslations(NAMESPACE_CONTRAENTREGA);
  return useCallback(
    (clave: string, valores?: Record<string, string | number>) => {
      if (t.has(clave)) return t(clave, valores);
      return traductorCanonico(clave, valores);
    },
    [t],
  );
}
