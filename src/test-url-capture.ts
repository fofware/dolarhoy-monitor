import * as dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

async function main() {
  console.log('🧪 Probando captura de URLs con estrategia del iframe...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Login
    console.log('🔐 Iniciando sesión...');
    await page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.gamexamplelogin');

    const user = process.env.SAMEEP_USER;
    const pass = process.env.SAMEEP_PASS;
    if (!user || !pass) throw new Error('Credenciales no encontradas en .env');

    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.getByPlaceholder('Contraseña').fill(pass);
    await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
    await page.waitForURL('**/com.sameep.wpseleccionarcliente');
    console.log('✅ Login exitoso');

    // 2. Ingresar al primer cliente
    console.log('🏠 Ingresando al primer cliente...');
    await page.locator('#span_vINGRESAR_0001').getByRole('link', { name: 'Ingresar' }).click();
    await page.waitForLoadState('networkidle');

    // 3. Ir a Saldo
    console.log('💰 Navegando a sección Saldo...');
    await page.getByRole('link', { name: 'Saldo' }).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByRole('link', { name: 'Saldo' }).click();
    await page.waitForLoadState('networkidle');

    // 4. Encontrar botones PDF
    console.log('🔍 Buscando botones PDF...');
    await page.locator('#vIMPRIMIRSALDO_0001').waitFor({ state: 'visible', timeout: 15000 });

    const botonesPdf = await page.locator('img[id^="vIMPRIMIRSALDO_"]').all();
    console.log(`📄 Encontrados ${botonesPdf.length} botones de PDF`);

    // 5. Probar captura de URL usando la estrategia exacta del archivo que funciona
    for (let i = 0; i < Math.min(botonesPdf.length, 2); i++) {
      const boton = botonesPdf[i];
      const botonId = await boton.getAttribute('id');

      try {
        console.log(`\n🎯 Probando botón ${botonId}...`);

        // Hacer clic en el botón PDF
        console.log('   📤 Haciendo clic en el botón PDF...');
        await boton.click();

        // Esperar el iframe del PDF con más tiempo
        const iframeSelector = 'iframe#gxp0_ifrm';
        console.log('   ⏳ Esperando iframe del PDF...');
        const iframeLocator = page.locator(iframeSelector);
        await iframeLocator.waitFor({ state: 'visible', timeout: 15000 });
        console.log('   ✅ Iframe encontrado');

        // Obtener la URL del src del iframe
        const pdfRelativeUrl = await iframeLocator.getAttribute('src');
        if (!pdfRelativeUrl) {
          throw new Error('No se encontró el atributo src del iframe');
        }

        // Construir URL completa
        const fullPdfUrl = `https://apps8.chaco.gob.ar/sameepweb/servlet/${pdfRelativeUrl}`;
        console.log(`   🎉 URL CAPTURADA: ${fullPdfUrl}`);

        // Cerrar el popup
        console.log('   🚪 Cerrando popup...');
        await page.locator('#gxp0_cls').click();
        await page.waitForTimeout(1000);
        console.log('   ✅ Popup cerrado');

      } catch (error) {
        console.log(`   ❌ Error en ${botonId}: ${error}`);
        // Intentar cerrar popup por si acaso
        try {
          await page.locator('#gxp0_cls').click();
        } catch {}
      }
    }

  } catch (error) {
    console.error('💥 Error general:', error);
    await page.screenshot({ path: 'facturas/error_test_urls.png', fullPage: true });
  } finally {
    console.log('🏁 Cerrando navegador...');
    await browser.close();
  }
}

main();
