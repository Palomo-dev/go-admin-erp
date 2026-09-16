/**
 * Firma con Azure Trusted Signing para electron-builder (`win.sign`).
 *
 * electron-builder llama a este módulo por cada ejecutable que produce (la
 * app, el desinstalador y el instalador NSIS). Invoca `signtool` con la
 * librería de Trusted Signing (Azure.CodeSigning.Dlib.dll) y un archivo de
 * metadatos temporal. La autenticación la resuelve la propia librería con
 * AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET (DefaultAzureCredential).
 *
 * Solo se activa desde electron-builder.config.js cuando existen las
 * variables AZURE_*; ver ahí la lista. Nunca hay credenciales en el repo.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function buscarSigntool() {
  if (process.env.SIGNTOOL_PATH && fs.existsSync(process.env.SIGNTOOL_PATH)) {
    return process.env.SIGNTOOL_PATH;
  }
  const raices = [
    process.env['ProgramFiles(x86)'],
    process.env.ProgramFiles,
  ].filter(Boolean);
  const candidatos = [];
  for (const raiz of raices) {
    const bin = path.join(raiz, 'Windows Kits', '10', 'bin');
    if (!fs.existsSync(bin)) continue;
    for (const version of fs.readdirSync(bin).sort().reverse()) {
      const exe = path.join(bin, version, 'x64', 'signtool.exe');
      if (fs.existsSync(exe)) candidatos.push(exe);
    }
  }
  if (candidatos.length === 0) {
    throw new Error('signtool.exe no encontrado: instala el Windows SDK o define SIGNTOOL_PATH');
  }
  return candidatos[0];
}

function requerido(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} para Azure Trusted Signing`);
  return valor;
}

module.exports = async function firmarConAzure(configuration) {
  const endpoint = requerido('AZURE_TRUSTED_SIGNING_ENDPOINT');
  const cuenta = requerido('AZURE_TRUSTED_SIGNING_ACCOUNT');
  const perfil = requerido('AZURE_TRUSTED_SIGNING_PROFILE');
  const dlib = requerido('AZURE_CODESIGNING_DLIB');
  if (!fs.existsSync(dlib)) throw new Error(`No existe la librería de Trusted Signing: ${dlib}`);

  const metadata = path.join(os.tmpdir(), `go-admin-trusted-signing-${process.pid}.json`);
  fs.writeFileSync(
    metadata,
    JSON.stringify({ Endpoint: endpoint, CodeSigningAccountName: cuenta, CertificateProfileName: perfil }),
    'utf8',
  );

  const args = [
    'sign',
    '/v',
    '/fd', 'SHA256',
    '/tr', 'http://timestamp.acs.microsoft.com',
    '/td', 'SHA256',
    '/dlib', dlib,
    '/dmdf', metadata,
    configuration.path,
  ];

  try {
    console.log(`[sign-azure] firmando ${path.basename(configuration.path)}`);
    execFileSync(buscarSigntool(), args, { stdio: 'inherit' });
  } finally {
    try { fs.unlinkSync(metadata); } catch { /* ignorar */ }
  }
};
