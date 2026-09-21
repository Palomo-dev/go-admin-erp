/**
 * DesktopThemeSync: el Desktop sigue al tema del header de la web.
 *
 * El proyecto no tiene jsdom ni testing-library, así que aquí se simula el
 * runtime de hooks mínimo que usa el componente (`useEffect` con deps y
 * `useRef`) y se llama a la función del componente como haría React. Con eso
 * se comprueba lo que importa: qué manda por el bridge y cuándo.
 */

type EffectFn = () => void | (() => void);

interface HookSlot {
  deps?: unknown[];
  cleanup?: () => void;
  ref?: { current: unknown };
}

let slots: HookSlot[] = [];
let hookIndex = 0;

function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  return prev.some((v, i) => !Object.is(v, next[i]));
}

jest.mock('react', () => ({
  useEffect: (fn: EffectFn, deps?: unknown[]) => {
    const slot = (slots[hookIndex] ??= {});
    hookIndex += 1;
    if (!depsChanged(slot.deps, deps)) return;
    slot.cleanup?.();
    slot.deps = deps;
    const cleanup = fn();
    slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  },
  useRef: <T,>(initial: T) => {
    const slot = (slots[hookIndex] ??= {});
    hookIndex += 1;
    slot.ref ??= { current: initial };
    return slot.ref as { current: T };
  },
}));

let currentTheme: unknown = 'system';
jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: currentTheme, setTheme: jest.fn() }),
}));

import { DesktopThemeSync, sendThemeToDesktop, toDesktopThemePreference } from '../DesktopThemeSync';

/** Un render: React llama al componente con el índice de hooks a cero. */
function render(theme: unknown): void {
  currentTheme = theme;
  hookIndex = 0;
  DesktopThemeSync();
}

function unmount(): void {
  for (const slot of slots) slot.cleanup?.();
  slots = [];
}

type Listener = (event: { key: string | null; newValue: string | null }) => void;

interface FakeWindow {
  goAdminDesktop?: Record<string, unknown>;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  listeners: Map<string, Set<Listener>>;
}

function installWindow(bridge?: Record<string, unknown>): FakeWindow {
  const listeners = new Map<string, Set<Listener>>();
  const fake: FakeWindow = {
    listeners,
    addEventListener: jest.fn((type: string, fn: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    }),
    removeEventListener: jest.fn((type: string, fn: Listener) => {
      listeners.get(type)?.delete(fn);
    }),
  };
  if (bridge) fake.goAdminDesktop = bridge;
  (globalThis as { window?: unknown }).window = fake;
  return fake;
}

function fireStorage(win: FakeWindow, key: string | null, newValue: string | null): void {
  for (const fn of win.listeners.get('storage') ?? []) fn({ key, newValue });
}

afterEach(() => {
  unmount();
  delete (globalThis as { window?: unknown }).window;
  jest.restoreAllMocks();
});

describe('toDesktopThemePreference', () => {
  it('acepta solo light | dark | system', () => {
    expect(toDesktopThemePreference('light')).toBe('light');
    expect(toDesktopThemePreference('dark')).toBe('dark');
    expect(toDesktopThemePreference('system')).toBe('system');
    expect(toDesktopThemePreference('sepia')).toBeNull();
    expect(toDesktopThemePreference(undefined)).toBeNull();
    expect(toDesktopThemePreference(null)).toBeNull();
    expect(toDesktopThemePreference(1)).toBeNull();
  });
});

describe('DesktopThemeSync en el navegador', () => {
  it('no hace nada sin bridge (SSR: sin window)', () => {
    expect(sendThemeToDesktop('dark')).toBe(false);
    expect(() => render('dark')).not.toThrow();
  });

  it('no hace nada sin window.goAdminDesktop ni registra listeners', () => {
    const win = installWindow();
    render('dark');
    expect(win.addEventListener).not.toHaveBeenCalled();
    expect(sendThemeToDesktop('dark')).toBe(false);
  });

  it('no hace nada con un Desktop antiguo sin setTheme', () => {
    const win = installWindow({ version: jest.fn() });
    render('dark');
    expect(win.addEventListener).not.toHaveBeenCalled();
    expect(sendThemeToDesktop('dark')).toBe(false);
  });
});

describe('DesktopThemeSync en Go Admin Desktop', () => {
  function bridgeWithSetTheme() {
    const setTheme = jest.fn().mockResolvedValue({ dark: true, source: 'dark' });
    const win = installWindow({ setTheme });
    return { setTheme, win };
  }

  it('manda el tema al montar y en cada cambio, sin repetir el mismo valor', () => {
    const { setTheme } = bridgeWithSetTheme();

    render('dark');
    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenLastCalledWith('dark');

    render('dark'); // re-render sin cambio: no vuelve a mandar
    expect(setTheme).toHaveBeenCalledTimes(1);

    render('light');
    expect(setTheme).toHaveBeenCalledTimes(2);
    expect(setTheme).toHaveBeenLastCalledWith('light');

    render('system');
    expect(setTheme).toHaveBeenCalledTimes(3);
    expect(setTheme).toHaveBeenLastCalledWith('system');
  });

  it('ignora valores que no son light | dark | system', () => {
    const { setTheme } = bridgeWithSetTheme();
    render(undefined);
    render('sepia');
    expect(setTheme).not.toHaveBeenCalled();
  });

  it('sigue el cambio hecho en otra ventana (storage de la clave theme)', () => {
    const { setTheme, win } = bridgeWithSetTheme();
    render('dark');
    expect(win.addEventListener).toHaveBeenCalledWith('storage', expect.any(Function));

    fireStorage(win, 'otra-clave', 'light');
    expect(setTheme).toHaveBeenCalledTimes(1);

    fireStorage(win, 'theme', 'light');
    expect(setTheme).toHaveBeenCalledTimes(2);
    expect(setTheme).toHaveBeenLastCalledWith('light');

    fireStorage(win, 'theme', 'light'); // mismo valor: no repite
    expect(setTheme).toHaveBeenCalledTimes(2);

    fireStorage(win, 'theme', null); // clave borrada = system
    expect(setTheme).toHaveBeenCalledTimes(3);
    expect(setTheme).toHaveBeenLastCalledWith('system');
  });

  it('se da de baja del storage al desmontar', () => {
    const { win } = bridgeWithSetTheme();
    render('dark');
    unmount();
    expect(win.removeEventListener).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(win.listeners.get('storage')?.size ?? 0).toBe(0);
  });

  it('un rechazo del IPC no rompe la web', async () => {
    const setTheme = jest.fn().mockRejectedValue(new Error('Tema inválido'));
    installWindow({ setTheme });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => render('dark')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
  });
});
