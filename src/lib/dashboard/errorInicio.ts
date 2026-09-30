/**
 * Error con estado HTTP de las lecturas del inicio (`inicio.server.ts`): 403
 * sin permiso en la base (42501), 400 pedido inválido (22023), 500 el resto.
 * Módulo hoja: lo importan las rutas y las pruebas sin arrastrar clientes.
 */
export class ErrorInicio extends Error {
  constructor(readonly status: number, readonly codigo: string, mensaje: string) {
    super(mensaje);
  }
}
