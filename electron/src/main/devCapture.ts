import { app, BrowserWindow, desktopCapturer, nativeTheme, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getWebContents } from './windows/mainWindow';
import { isOnline, onConnectivityChange } from './connectivity';

/**
 * Capturas automáticas de la UI, SOLO en desarrollo.
 *
 * Se activa con la variable de entorno GOADMIN_UI_CAPTURE=<carpeta>. Sirve
 * para verificar la barra de aplicación sin intervención manual:
 *
 *  - Redimensiona la ventana a 1366x768 y 1920x1080 y guarda una captura de
 *    la ventana completa (barra + web + controles nativos) en modo claro y
 *    oscuro (`nativeTheme.themeSource`).
 *  - Si además hay GOADMIN_HEALTHCHECK_URL (health-check roto a propósito),
 *    espera a que connectivity declare OFFLINE, anota cuántos ms tardó desde
 *    el arranque y captura la barra en ese estado.
 *  - Con GOADMIN_UI_CAPTURE_QUIT=1 cierra la app al terminar.
 *
 * En la app empaquetada esta función no hace nada.
 */

const SIZES: Array<[number, number]> = [
  [1366, 768],
  [1920, 1080],
];

const startedAt = Date.now();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function captureWindow(win: BrowserWindow, file: string): Promise<void> {
  // La ventana debe estar en primer plano para que el recorte de pantalla la
  // muestre entera (otras ventanas del escritorio podrían taparla).
  if (!win.isVisible()) win.show();
  win.moveTop();
  win.focus();
  await sleep(300);
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const scale = display.scaleFactor || 1;

  // 1) Ventana completa (barra + web + controles nativos). En Windows el id
  //    que devuelve getMediaSourceId() ("window:<hwnd>:1") no siempre coincide
  //    con el de desktopCapturer ("window:<hwnd>:0"): se compara solo el hwnd.
  const hwnd = win.getMediaSourceId().split(':')[1];
  const windowSources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale) },
  });
  const mine =
    windowSources.find((s) => s.id.split(':')[1] === hwnd) ??
    windowSources.find((s) => s.name.includes('Go Admin'));
  if (mine && !mine.thumbnail.isEmpty()) {
    fs.writeFileSync(file, mine.thumbnail.toPNG());
    console.log(`[devCapture] ${path.basename(file)} (${mine.thumbnail.getSize().width}x${mine.thumbnail.getSize().height}, ventana)`);
    return;
  }

  // 2) Pantalla completa recortada a los límites de la ventana. Sigue siendo
  //    la ventana real compuesta (incluye el overlay de controles nativos).
  const screenSources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * scale),
      height: Math.round(display.size.height * scale),
    },
  });
  const disp =
    screenSources.find((s) => s.display_id === String(display.id)) ?? screenSources[0];
  if (disp && !disp.thumbnail.isEmpty()) {
    const crop = disp.thumbnail.crop({
      x: Math.max(0, Math.round((bounds.x - display.bounds.x) * scale)),
      y: Math.max(0, Math.round((bounds.y - display.bounds.y) * scale)),
      width: Math.round(bounds.width * scale),
      height: Math.round(bounds.height * scale),
    });
    fs.writeFileSync(file, crop.toPNG());
    console.log(`[devCapture] ${path.basename(file)} (${crop.getSize().width}x${crop.getSize().height}, recorte de pantalla)`);
    return;
  }

  console.log(`[devCapture] fuentes de ventana: ${windowSources.map((s) => `${s.id}:${s.name}`).join(' | ') || '(ninguna)'}; buscada ${win.getMediaSourceId()}`);
  // 3) Respaldo: barra y web por separado.
  const bar = await win.webContents.capturePage();
  fs.writeFileSync(file.replace(/\.png$/, '-barra.png'), bar.toPNG());
  const web = await getWebContents()?.capturePage();
  if (web) fs.writeFileSync(file.replace(/\.png$/, '-web.png'), web.toPNG());
  console.log(`[devCapture] ${path.basename(file)}: sin fuente de ventana, guardadas barra y web por separado`);
}

async function waitForWeb(timeoutMs: number): Promise<void> {
  const wc = getWebContents();
  if (!wc || !wc.isLoading()) return;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    wc.once('did-finish-load', done);
    wc.once('did-fail-load', done);
    setTimeout(done, timeoutMs);
  });
}

export function initDevCapture(win: BrowserWindow): void {
  const dir = process.env.GOADMIN_UI_CAPTURE;
  if (app.isPackaged || !dir) return;

  fs.mkdirSync(dir, { recursive: true });
  const report: string[] = [];
  const log = (line: string) => {
    console.log(`[devCapture] ${line}`);
    report.push(line);
  };

  void (async () => {
    try {
      await waitForWeb(30_000);
      await sleep(2500);
      const display = screen.getPrimaryDisplay();
      log(`Pantalla: ${display.size.width}x${display.size.height} @${display.scaleFactor}x, área útil ${display.workAreaSize.width}x${display.workAreaSize.height}`);

      if (process.env.GOADMIN_HEALTHCHECK_URL) {
        log(`Health-check forzado a ${process.env.GOADMIN_HEALTHCHECK_URL}; esperando OFFLINE…`);
        const offlineAt = await new Promise<number | null>((resolve) => {
          if (!isOnline()) return resolve(Date.now());
          const off = onConnectivityChange((online) => {
            if (!online) {
              off();
              resolve(Date.now());
            }
          });
          setTimeout(() => resolve(null), 60_000);
        });
        if (offlineAt) {
          log(`OFFLINE detectado a los ${offlineAt - startedAt} ms del arranque`);
          await sleep(800);
          win.unmaximize();
          win.setSize(1366, 768);
          win.center();
          await sleep(1200);
          await captureWindow(win, path.join(dir, 'offline-1366x768.png'));
        } else {
          log('No se detectó OFFLINE en 60 s');
        }
      } else {
        for (const [w, h] of SIZES) {
          win.unmaximize();
          win.setSize(w, h);
          win.center();
          await sleep(1200);
          const [rw, rh] = win.getSize();
          log(`Ventana pedida ${w}x${h}, real ${rw}x${rh}`);
          for (const theme of ['light', 'dark'] as const) {
            nativeTheme.themeSource = theme;
            await sleep(900);
            await captureWindow(win, path.join(dir, `${theme}-${w}x${h}.png`));
          }
          nativeTheme.themeSource = 'system';
        }
      }
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      fs.writeFileSync(path.join(dir, 'reporte.txt'), report.join('\n') + '\n');
      if (process.env.GOADMIN_UI_CAPTURE_QUIT === '1') app.quit();
    }
  })();
}
