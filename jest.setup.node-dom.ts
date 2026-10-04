// Las pruebas de POS montan un DOM propio dentro del entorno Node. React y
// offlineCache necesitan navigator allí; Node 20 aún no lo proporciona.
// No instala window/document ni cambia el navegador de jsdom o de Node nuevo.
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { userAgent: 'Node.js', onLine: true },
  });
}

export {};
