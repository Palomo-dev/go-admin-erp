/**
 * Memoria corta para lecturas que el POS repite en cada toque.
 *
 * Al agregar un producto o cambiar una cantidad, el carrito volvía a pedir los
 * impuestos de la organización y los de cada producto, uno por uno y en serie:
 * con diez líneas eran doce viajes a la base por toque (cerca de 2 s en un
 * celular). Los datos casi nunca cambian en mitad de un turno.
 *
 * Reglas, pensadas para que no se pueda cobrar mal por culpa de la memoria:
 *
 * - **Solo guarda aciertos.** Si `cargar` falla, no queda nada guardado y el
 *   siguiente toque vuelve a intentar. Nunca se recuerda un «sin impuestos»
 *   que en realidad fue un error de red.
 * - **Vence sola** (`vigenciaMs`). Lo que el administrador cambie en otro
 *   equipo llega, como mucho, con ese retraso.
 * - **Comparte la lectura en curso.** Dos pedidos iguales al mismo tiempo
 *   hacen un solo viaje (el carrito y el resumen de impuestos piden lo mismo).
 * - **Se puede olvidar** una clave o todo (`olvidar`), y pedir un dato fresco
 *   saltándose lo guardado (`fresco`): lo usa el recálculo periódico y el cobro.
 *
 * Vive en memoria del navegador: recargar la página la vacía.
 */
export interface MemoriaCorta<T> {
  /** Devuelve lo guardado si sigue vigente; si no, lo carga (una sola vez por clave a la vez). */
  obtener(clave: string, cargar: () => Promise<T>, opciones?: { fresco?: boolean }): Promise<T>;
  /** Borra una clave, o todo si no se indica. */
  olvidar(clave?: string): void;
}

export function crearMemoriaCorta<T>(vigenciaMs: number, ahora: () => number = () => Date.now()): MemoriaCorta<T> {
  const guardado = new Map<string, { valor: T; vence: number }>();
  const enCurso = new Map<string, Promise<T>>();
  // Cambia con cada `olvidar`: una lectura que venía en camino desde antes no
  // puede volver a guardar el dato viejo después de que se pidió olvidarlo.
  let generacion = 0;

  return {
    obtener(clave, cargar, opciones) {
      if (!opciones?.fresco) {
        const hallado = guardado.get(clave);
        if (hallado && hallado.vence > ahora()) return Promise.resolve(hallado.valor);
        const pendiente = enCurso.get(clave);
        if (pendiente) return pendiente;
      }
      const nacida = generacion;
      const lectura = cargar().then(
        (valor) => {
          if (nacida === generacion) guardado.set(clave, { valor, vence: ahora() + vigenciaMs });
          if (enCurso.get(clave) === lectura) enCurso.delete(clave);
          return valor;
        },
        (error) => {
          if (enCurso.get(clave) === lectura) enCurso.delete(clave);
          throw error;
        },
      );
      enCurso.set(clave, lectura);
      return lectura;
    },
    olvidar(clave) {
      generacion += 1;
      if (clave === undefined) {
        guardado.clear();
        enCurso.clear();
      } else {
        guardado.delete(clave);
        enCurso.delete(clave);
      }
    },
  };
}
