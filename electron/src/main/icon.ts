import { app, nativeImage } from 'electron';
import * as fs from 'fs';
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
 * Carga el icono como NativeImage (bandeja). Retorna null si el icono no
 * existe o está vacío, para que el caller pueda decidir si omitir la opción.
 */
export function getIconImage(): Electron.NativeImage | null {
  const img = nativeImage.createFromPath(getIconPath());
  if (img.isEmpty()) return null;
  return img;
}

/**
 * Icono para `BrowserWindow.icon` en Windows: la RUTA al .ico, no un
 * NativeImage. `nativeImage.createFromPath` decodifica el .ico a un solo
 * bitmap (y en el paquete lo dejaba en blanco: la barra de tareas mostraba
 * una hoja vacía junto a «GO Admin ERP»); con la ruta, Windows toma del
 * .ico el tamaño que necesita para la ventana, Alt+Tab y la barra de tareas.
 * Fuera de Windows se conserva el NativeImage.
 */
export function getWindowIcon(): string | Electron.NativeImage | undefined {
  const iconPath = getIconPath();
  if (process.platform === 'win32') return fs.existsSync(iconPath) ? iconPath : undefined;
  return getIconImage() ?? undefined;
}
