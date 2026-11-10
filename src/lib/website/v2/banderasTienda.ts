/**
 * Banderas del editor que dependen de lo que el sitio público ya acepta (solo ERP; no es copia).
 *
 * `tema.tarjetaProducto`: la bandera NEXT_PUBLIC_WEBSITE_TARJETA_PRODUCTO existía para que el editor
 * no la escribiera antes de que el sitio la aceptara. El sitio la acepta y la pinta desde la tarjeta
 * configurable (14 sitios V2 publicados la tienen, SQL 2026-11-07), así que queda ENCENDIDA salvo que
 * la variable valga '0' (apagado explícito). La función del contrato (`tarjetaProductoTemaDisponible`
 * en tarjetaProducto.ts, copia del sitio) no se toca para no desalinear las copias.
 */
export function tarjetaSitioDisponible(): boolean {
  return process.env.NEXT_PUBLIC_WEBSITE_TARJETA_PRODUCTO !== '0';
}
