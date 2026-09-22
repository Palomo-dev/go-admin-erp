/**
 * F5/F15-B — guardas sobre manifests, configuración de empaquetado y
 * cableado de las llamadas en Electron y Capacitor. Son comprobaciones de
 * archivo (como las de platformCapabilities.test) porque nada de esto se
 * puede ejecutar en jest: sirven para que una edición «inocente» no deje al
 * softphone sin micrófono en macOS, sin audio en segundo plano en iOS o con
 * el error de micrófono tragado.
 */
import * as fs from 'fs';

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('Capacitor (mobile/)', () => {
  it('Info.plist: UIBackgroundModes lleva remote-notification y audio; NSMicrophoneUsageDescription en español', () => {
    const plist = read('mobile/templates/Info.plist');
    const modes = /<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? '';
    expect(modes).toMatch(/<string>remote-notification<\/string>/);
    expect(modes).toMatch(/<string>audio<\/string>/);
    expect(plist).toMatch(/<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]*micrófono[^<]*<\/string>/);
  });

  it('capacitor.config.ts: allowNavigation sigue acotado a goadmin.io y supabase.co (Twilio no es navegación)', () => {
    const cfg = read('mobile/capacitor.config.ts');
    const list = /allowNavigation:\s*\[([^\]]*)\]/.exec(cfg)?.[1] ?? '';
    expect(list).toMatch(/'\*\.goadmin\.io'/);
    expect(list).toMatch(/'\*\.supabase\.co'/);
    expect(list).not.toMatch(/twilio/);
  });

  it('README documenta cómo llega el permiso al WebView y el límite real (sin foreground service ni CallKit)', () => {
    const readme = read('mobile/README.md');
    expect(readme).toMatch(/onPermissionRequest/);
    expect(readme).toMatch(/NSMicrophoneUsageDescription/);
    expect(readme).toMatch(/CallKit/);
    expect(readme).toMatch(/resolveDefaultCallMode/);
  });
});

describe('Electron (electron/)', () => {
  it('index.ts instala los handlers de permisos sobre defaultSession con los orígenes del servidor embebido y pide el micrófono en macOS', () => {
    const src = read('electron/src/main/index.ts');
    expect(src).toMatch(/installPermissionHandlers\(\s*session\.defaultSession/);
    expect(src).toMatch(/resolveAllowedOrigins\(getLoadUrl\(\), WEB_APP_URL, webServer\.getHosts\(\)\)/);
    expect(src).toMatch(/askForMicrophone: \(\) => systemPreferences\.askForMediaAccess\('microphone'\)/);
  });

  it('electron-builder.yml: mac.extendInfo.NSMicrophoneUsageDescription (español) + entitlements con audio-input', () => {
    const yml = read('electron/electron-builder.yml');
    expect(yml).toMatch(/^mac:\s*$/m);
    expect(yml).toMatch(/NSMicrophoneUsageDescription: .*micrófono/);
    expect(yml).toMatch(/entitlements: build\/entitlements\.mac\.plist/);
    expect(yml).toMatch(/entitlementsInherit: build\/entitlements\.mac\.plist/);
    const ent = read('electron/build/entitlements.mac.plist');
    expect(ent).toMatch(/<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/);
    expect(ent).toMatch(/<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/);
  });

  it('permissions.ts solo importa tipos de electron (jest lo carga sin binario)', () => {
    const src = read('electron/src/main/permissions.ts');
    const runtimeImports = src.split('\n').filter((l) => /^import (?!type ).*from 'electron'/.test(l));
    expect(runtimeImports).toEqual([]);
  });
});

describe('App: el error de micrófono no se traga', () => {
  it('SoftphoneProvider.makeCall devuelve mic_denied con la ruta de Ajustes; QuickActionsBar y CallButton ofrecen el bridge', () => {
    const provider = read('src/components/voice/SoftphoneProvider.tsx');
    expect(provider).toMatch(/reason: denied \? 'mic_denied' : 'unavailable'/);
    expect(provider).toMatch(/reason: settingsHint \? 'mic_denied' : 'error'/);
    expect(provider).toMatch(/microphoneDeniedReason\(\)/);

    const bar = read('src/components/crm/shared/QuickActionsBar.tsx');
    expect(bar).toMatch(/result\.reason === 'mic_denied'/);
    expect(bar).toMatch(/setOpenDialog\('mobile'\)/);
    expect(bar).toMatch(/useCallModePolicy\(\)/);

    const button = read('src/components/voice/CallButton.tsx');
    expect(button).toMatch(/result\.reason === 'mic_denied'/);
    expect(button).toMatch(/setMobileOpen\(true\)/);
    expect(button).toMatch(/decision\?\.mode === 'mobile'/);
  });

  it('useTwilioDevice usa la ruta de Ajustes de la plataforma en TODOS los caminos de no_permission', () => {
    const hook = read('src/components/voice/hooks/useTwilioDevice.ts');
    expect((hook.match(/microphoneDeniedReason\(\)/g) ?? []).length).toBe(3);
    expect(hook).not.toMatch(/setDeviceReason\('Permite el micrófono en el navegador/);
  });
});
