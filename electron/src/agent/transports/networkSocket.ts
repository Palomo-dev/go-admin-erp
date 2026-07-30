/* AUTO-GENERADO por sync-agent.js — NO EDITAR */
/**
 * Transporte ESC/POS por socket TCP (impresoras de red, puerto 9100 RAW).
 *
 * Sustituye a `escpos-network`, que producía falsos positivos: su `close()`
 * llamaba a `socket.destroy()`, cerrando el socket de golpe y descartando los
 * bytes que aún estaban en el buffer de salida. Además pasaba el listener de
 * 'connect' como si recibiera un error (`function(err)`), y ese parámetro es
 * siempre `undefined`, de modo que el guardia `if (err)` nunca detectaba un
 * fallo de conexión. El resultado era un job marcado como "impreso" sin que
 * saliera papel.
 *
 * Aquí se usa `socket.end(buffer)`, que encola los datos y cierra con FIN solo
 * después de haberlos entregado, y se espera el evento 'close' antes de
 * resolver. Con eso, si la promesa resuelve, los bytes salieron de la máquina.
 */

import * as net from 'net';

/** Tiempo máximo para establecer la conexión TCP. */
const CONNECT_TIMEOUT_MS = 5000;

/** Tiempo máximo total de la operación, incluido el envío y el cierre. */
const OPERATION_TIMEOUT_MS = 15000;

/**
 * Envía un buffer ESC/POS a una impresora de red y espera el cierre limpio.
 *
 * @param host   IP o hostname de la impresora
 * @param port   Puerto RAW (normalmente 9100)
 * @param buffer Bytes ESC/POS a enviar
 */
export function sendToNetworkPrinter(host: string, port: number, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    // Una vez resuelta o rechazada la promesa no se debe volver a llamar:
    // el socket emite varios eventos ('error', 'close', timeout) y sin este
    // guardia una impresora que corta la conexión provocaría un reject
    // después de un resolve.
    let settled = false;
    let operationTimer: NodeJS.Timeout;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(operationTimer);
      socket.removeAllListeners();
      socket.destroy();
      if (err) reject(err); else resolve();
    };

    operationTimer = setTimeout(() => {
      finish(new Error(`Timeout enviando a ${host}:${port} — la impresora no completó la operación en ${OPERATION_TIMEOUT_MS}ms`));
    }, OPERATION_TIMEOUT_MS);

    // setTimeout del socket solo cubre la fase de conexión: se desactiva en
    // cuanto conecta, porque una impresora térmica puede tardar en drenar el
    // buffer mientras imprime sin que eso sea un fallo.
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('timeout', () => {
      finish(new Error(`No se pudo conectar a ${host}:${port} — sin respuesta en ${CONNECT_TIMEOUT_MS}ms (¿IP correcta? ¿impresora encendida?)`));
    });

    socket.once('error', (err: NodeJS.ErrnoException) => {
      finish(new Error(`Error de red con ${host}:${port} — ${err.code || ''} ${err.message}`.trim()));
    });

    // 'close' es la única señal fiable de que el socket termino de escribir y
    // se cerró. Resolver en el callback de write() sería prematuro: ese
    // callback solo confirma que el kernel acepto los bytes.
    socket.once('close', (hadError: boolean) => {
      if (hadError) {
        finish(new Error(`La conexión con ${host}:${port} se cerró con error`));
        return;
      }
      finish();
    });

    socket.connect(port, host, () => {
      socket.setTimeout(0);
      // end() escribe el buffer y envía FIN cuando termina de drenarlo.
      socket.end(buffer);
    });
  });
}
