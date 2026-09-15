/**
 * Configuración de electron-builder = electron-builder.yml + firma condicional.
 *
 * electron-builder firma solo cuando existen CSC_LINK / CSC_KEY_PASSWORD
 * (certificado .pfx). Azure Trusted Signing no tiene soporte nativo en la
 * versión 25, así que aquí se añade `win.sign` (script propio con signtool)
 * únicamente cuando están las variables AZURE_*. Sin ninguna credencial el
 * build sale sin firmar, igual que antes: nunca se lee nada del repositorio.
 *
 * Variables para Azure Trusted Signing (secrets del workflow):
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET   → autenticación
 *   AZURE_TRUSTED_SIGNING_ENDPOINT   ej. https://eus.codesigning.azure.net
 *   AZURE_TRUSTED_SIGNING_ACCOUNT    nombre de la cuenta de Trusted Signing
 *   AZURE_TRUSTED_SIGNING_PROFILE    nombre del certificate profile
 *   AZURE_CODESIGNING_DLIB           ruta a Azure.CodeSigning.Dlib.dll
 *                                    (paquete NuGet Microsoft.Trusted.Signing.Client)
 */
const path = require('path');

const usaAzure = !!(
  process.env.AZURE_TRUSTED_SIGNING_ENDPOINT &&
  process.env.AZURE_TRUSTED_SIGNING_ACCOUNT &&
  process.env.AZURE_TRUSTED_SIGNING_PROFILE &&
  process.env.AZURE_CODESIGNING_DLIB
);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  extends: path.join(__dirname, 'electron-builder.yml'),
  ...(usaAzure
    ? {
        win: {
          signtoolOptions: {
            sign: path.join(__dirname, 'build', 'sign-azure.js'),
          },
        },
      }
    : {}),
};
