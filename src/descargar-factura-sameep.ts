import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs-extra';
import * as path from 'path';
import { chromium } from 'playwright';

dotenv.config();


const donwnloadPdf = async (page, context) => {
  try {
    const iframeSelector = 'iframe#gxp0_ifrm'; // Usamos el ID para ser más precisos
    console.log('Esperando a que aparezca el iframe del PDF...');
    const iframeLocator = page.locator(iframeSelector);
    await iframeLocator.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Iframe del PDF encontrado.');
    // ¡LA CLAVE! Obtenemos la URL directamente del atributo 'src' del iframe.
    const pdfRelativeUrl = await iframeLocator.getAttribute('src');
    if (!pdfRelativeUrl) {
      throw new Error('No se pudo encontrar el atributo src del iframe del PDF.');
    }
    // La URL en 'src' es relativa, la completamos.
    const fullPdfUrl = `https://apps8.chaco.gob.ar/sameepweb/servlet/${pdfRelativeUrl}`;
    console.log(`URL del PDF encontrada: ${fullPdfUrl}`);
    // Descargar el PDF usando axios con las cookies de la sesión
    console.log('Descargando el archivo PDF directamente...');
    const response = await axios.get(fullPdfUrl, {
      responseType: 'arraybuffer',
      headers: {
        Cookie: (await context.cookies()).map(c => `${c.name}=${c.value}`).join('; '),
        Referer: page.url(),
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error al descargar el PDF:', error);
    await page.screenshot({ path: 'facturas/error_screenshot.png', fullPage: true });
    console.log('Se ha guardado una captura de pantalla del error en facturas/error_screenshot.png');
    throw error; // Re-lanzamos el error para manejarlo en la función principal
  }

}

async function saveData(page, data) {
  // Esperamos a que el iframe esté visible
  try {


    const downloadsPath = path.join(__dirname, '..', 'facturas');
    await fs.ensureDir(downloadsPath);
    // Limpiamos la URL para obtener un nombre de archivo válido
    const fileName = `factura-${Date.now()}.pdf`;

    const filePath = path.join(downloadsPath, fileName);
    await fs.writeFile(filePath, data);
    console.log(`¡ÉXITO! Factura guardada en: ${filePath}`);
    // --- 3. Cerrar el Popup ---
    console.log('Cerrando el popup del PDF...');
    await page.locator('#gxp0_cls').click();
    console.log('Popup cerrado.');
  } catch (error) {
    console.error('Error al descargar el PDF:', error);
    await page.screenshot({ path: 'facturas/error_screenshot.png', fullPage: true });
    console.log('Se ha guardado una captura de pantalla del error en facturas/error_screenshot.png');
  }
}
async function main() {
  console.log('Iniciando el script de descarga de facturas de SAMEEP...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // --- 1. Login y Navegación ---
    console.log('Navegando a la página de login...');
    await page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.gamexamplelogin');

    const user = process.env.SAMEEP_USER;
    const pass = process.env.SAMEEP_PASS;
    if (!user || !pass) throw new Error('Credenciales no encontradas en .env');

    console.log(`Iniciando sesión con el usuario: ${user}...`);
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.getByPlaceholder('Contraseña').fill(pass);
    await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
    await page.waitForURL('**/com.sameep.wpseleccionarcliente');
    console.log('Login exitoso.');

    console.log('Ingresando al primer cliente...');
    await page.locator('#span_vINGRESAR_0001').getByRole('link', { name: 'Ingresar' }).click();
    await page.getByRole('link', { name: 'Saldo' }).waitFor({ state: 'visible' });

    console.log('Ingresando a la sección de "Saldo"...');
    await page.getByRole('link', { name: 'Saldo' }).click();

    console.log('Esperando a que la página de saldos cargue...');
    await page.locator('#vIMPRIMIRSALDO_0001').waitFor({ state: 'visible' });
    console.log('Página de saldos cargada.');

    // --- 2. Lógica de Descarga Final (Método Universal) ---
    console.log('Haciendo clic en el botón para abrir el popup del PDF...');
    await page.locator('#vIMPRIMIRSALDO_0001').click();
    /*
    const data = await donwnloadPdf(page, context);
    await saveData(page, data);
    */
    await saveData(page, await donwnloadPdf(page, context));
  } catch (error) {
    console.error('Ocurrió un error durante la ejecución del script:', error);
    await page.screenshot({ path: 'facturas/error_screenshot.png', fullPage: true });
    console.log('Se ha guardado una captura de pantalla del error en facturas/error_screenshot.png');
  } finally {
    console.log('Cerrando el navegador.');
    await browser.close();
  }
}

main();
