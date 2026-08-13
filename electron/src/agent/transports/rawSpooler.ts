/* AUTO-GENERADO por sync-agent.js — NO EDITAR */
/**
 * Transporte RAW por spooler de Windows.
 *
 * Usa PowerShell con una clase C# embebida (Add-Type) que llama directamente a
 * winspool.drv: OpenPrinter → StartDocPrinter (datatype = "RAW") → WritePrinter
 * → EndDocPrinter → ClosePrinter.
 *
 * Esto envía bytes ESC/POS crudos a la impresora sin que el driver de Windows
 * interprete el contenido como texto o HTML. Es lo que permite usar una
 * impresora térmica USB (POS-80C) instalada en Windows sin necesidad de Zadig
 * ni libusb: el spooler ya tiene el handle del dispositivo.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';

/**
 * Consulta información de la impresora en Windows: driver, puerto y si soporta RAW.
 * Retorna null si no se puede consultar (no Windows o impresora no encontrada).
 */
export async function getPrinterInfo(printerName: string): Promise<{ driverName: string; portName: string; printProcessor: string } | null> {
  if (process.platform !== 'win32') return null;

  const script = `
Get-CimInstance Win32_Printer |
  Where-Object { $_.Name -eq '${printerName.replace(/'/g, "''")}' } |
  Select-Object DriverName, PortName, PrintProcessor |
  ConvertTo-Json -Compress
`.trim();

  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `go-admin-ps-info-${Date.now()}.ps1`);
    try {
      fs.writeFileSync(tmpFile, script, 'utf8');
    } catch {
      resolve(null);
      return;
    }

    child_process.exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { timeout: 10000, windowsHide: true, maxBuffer: 256 * 1024 },
      (err, stdout) => {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        if (err || !stdout || !stdout.trim()) {
          resolve(null);
          return;
        }
        try {
          const info = JSON.parse(stdout.trim());
          resolve({
            driverName: info?.DriverName || 'desconocido',
            portName: info?.PortName || 'desconocido',
            printProcessor: info?.PrintProcessor || 'desconocido',
          });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

const CSHARP_SOURCE = `
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DOC_INFO_1 {
    public string pDocName;
    public string pOutputFile;
    public string pDatatype;
  }

  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern IntPtr OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 pDocInfo);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern int StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern int WritePrinter(IntPtr hPrinter, byte[] pBuf, int cbBuf, out int pcWritten);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern int EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern int EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  public static extern int ClosePrinter(IntPtr hPrinter);

  public static int Send(string printerName, byte[] data) {
    IntPtr hPrinter;
    if ((int)OpenPrinter(printerName, out hPrinter, IntPtr.Zero) == 0) {
      throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    }
    try {
      DOC_INFO_1 docInfo = new DOC_INFO_1 {
        pDocName = "GO Admin ESC/POS",
        pOutputFile = null,
        pDatatype = "RAW"
      };
      if (StartDocPrinter(hPrinter, 1, ref docInfo) == 0) {
        throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
      }
      try {
        StartPagePrinter(hPrinter);
        int written;
        if (WritePrinter(hPrinter, data, data.Length, out written) == 0) {
          throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error());
        }
        EndPagePrinter(hPrinter);
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
    return 0;
  }
}
`;

const POWERSHELL_SCRIPT = (printerName: string, tempFile: string) => `
Add-Type -TypeDefinition '${CSHARP_SOURCE.replace(/'/g, "''")}'
$bytes = [System.IO.File]::ReadAllBytes('${tempFile.replace(/'/g, "''")}')
[RawPrinter]::Send('${printerName.replace(/'/g, "''")}', $bytes)
`;

/**
 * Envía un buffer ESC/POS a una impresora de Windows usando el spooler en modo RAW.
 *
 * @param printerName Nombre exacto de la impresora en Windows (ej. "POS-80C")
 * @param buffer       Bytes ESC/POS a enviar
 */
export function sendRawToPrinter(printerName: string, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpDir = path.join(os.tmpdir(), 'go-admin-raw');
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch { /* ignore */ }

    const tempFile = path.join(tmpDir, `raw-${Date.now()}.bin`);
    fs.writeFileSync(tempFile, buffer);

    // Log de diagnóstico: tamaño y primeros bytes del buffer
    const hexPreview = buffer.slice(0, 16).toString('hex').match(/.{1,2}/g)?.join(' ') || '';
    console.log(`[rawSpooler] Enviando ${buffer.length} bytes a "${printerName}" | preview: ${hexPreview}`);

    const script = POWERSHELL_SCRIPT(printerName, tempFile);

    const child = child_process.exec(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
      { windowsHide: true, timeout: 30000 },
      (err, stdout, stderr) => {
        // Limpiar el temporal
        try { fs.unlinkSync(tempFile); } catch { /* ignore */ }

        if (stdout && stdout.trim()) {
          console.log(`[rawSpooler] stdout de PowerShell para "${printerName}": ${stdout.trim()}`);
        }

        if (err) {
          reject(new Error(`RAW spooler error enviando a "${printerName}": ${err.message || err}`));
          return;
        }
        if (stderr && stderr.trim()) {
          // PowerShell a veces envía warnings a stderr aunque la operación exita.
          // Si el mensaje contiene "WritePrinter" o "OpenPrinter" es un error real.
          const isRealError = /OpenPrinter|StartDocPrinter|WritePrinter|EndDocPrinter|ClosePrinter|failed|error/i.test(stderr);
          if (isRealError) {
            reject(new Error(`RAW spooler stderr para "${printerName}": ${stderr.trim()}`));
            return;
          }
          // Es solo un warning, loguear pero continuar
          console.warn(`[rawSpooler] warning (no fatal) de PowerShell: ${stderr.trim()}`);
        }
        console.log(`[rawSpooler] Bytes enviados correctamente a "${printerName}" (${buffer.length} bytes)`);
        resolve();
      }
    );
  });
}
