import { app, nativeImage } from 'electron';
import * as path from 'path';

/**
 * Resuelve la ruta absoluta al icono de la aplicación teniendo en cuenta
 * si la app está empaquetada o no.
 *
 * En desarrollo: el icono está en `<electron>/build/icon.ico` (3 niveles
 * arriba de `dist/main/windows`).
 *
 * En producción (empaquetado): el icono se desempaqueta del asar mediante
 * `asarUnpack` en electron-builder.yml, por lo que vive en
 * `resources/app.asar.unpacked/build/icon.ico`. Windows no puede leer
 * archivos .ico desde dentro de un .asar para usarlos como icono de
 * ventana/taskbar, por eso es obligatorio desempaquetarlo.
 */
export function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icon.ico');
  }
  return path.join(__dirname, '..', '..', '..', 'build', 'icon.ico');
}

/**
 * Carga el icono como NativeImage. Retorna null si el icono no existe o
 * está vacío, para que el caller pueda decidir si omitir la opción `icon`.
 */
export function getIconImage(): Electron.NativeImage | null {
  const img = nativeImage.createFromPath(getIconPath());
  if (img.isEmpty()) return null;
  return img;
}
