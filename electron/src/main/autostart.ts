import { app } from 'electron';

export function setAutoStart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ['--hidden'],
  });
}

export function isAutoStartEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

export function wasOpenedHidden(): boolean {
  return process.argv.includes('--hidden');
}
