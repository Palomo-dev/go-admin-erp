/**
 * Ejecuta una carga y, si falla, registra el error, anota la etiqueta en
 * `fallos` y devuelve `respaldo`. Sirve para que en un Promise.all una
 * consulta rota (p. ej. espacios) no tumbe toda la pantalla.
 */
export async function cargaAislada<T>(
  promesa: Promise<T>,
  respaldo: T,
  etiqueta: string,
  fallos: string[],
): Promise<T> {
  try {
    return await promesa;
  } catch (error) {
    console.error(`Error cargando ${etiqueta}:`, error);
    fallos.push(etiqueta);
    return respaldo;
  }
}
