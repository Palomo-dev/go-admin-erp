/**
 * El Chrome de puppeteer no se descarga (`.npmrc`). En local el PDF usa la
 * ruta explícita o el primer Chrome/Chromium ejecutable del PATH.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ejecutableChromeLocal } from '@/lib/documents/server/pdf';

describe('ejecutableChromeLocal', () => {
  const pathPrevio = process.env.PATH;
  const exePrevio = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'chrome-pdf-'));
    process.env.PATH = dir;
    delete process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
  });

  afterEach(() => {
    process.env.PATH = pathPrevio;
    if (exePrevio === undefined) delete process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
    else process.env.PDF_CHROMIUM_EXECUTABLE_PATH = exePrevio;
    rmSync(dir, { recursive: true, force: true });
  });

  it('la variable manda, aunque no haya Chrome en PATH', () => {
    process.env.PDF_CHROMIUM_EXECUTABLE_PATH = '/opt/chrome-configurado';
    expect(ejecutableChromeLocal()).toBe('/opt/chrome-configurado');
  });

  it('encuentra google-chrome ejecutable en PATH', () => {
    const bin = join(dir, 'google-chrome');
    writeFileSync(bin, '#!/bin/sh\n');
    chmodSync(bin, 0o755);
    expect(ejecutableChromeLocal()).toBe(bin);
  });

  it('sin binario deja que puppeteer use su propio caché', () => {
    expect(ejecutableChromeLocal()).toBeUndefined();
  });
});
