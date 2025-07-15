import * as dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

async function main() {
  console.log('🕵️ Investigando estructura HTML del cliente 5...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login e ir al cliente 5
    await page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.gamexamplelogin');

    const user = process.env.SAMEEP_USER;
    const pass = process.env.SAMEEP_PASS;
    if (!user || !pass) throw new Error('Credenciales no encontradas');

    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.getByPlaceholder('Contraseña').fill(pass);
    await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
    await page.waitForURL('**/com.sameep.wpseleccionarcliente');

    await page.locator('#span_vINGRESAR_0005').getByRole('link', { name: 'Ingresar' }).click();
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle');

    // Ir al primer suministro
    const enlacesSaldo = await page.locator('[id^="span_vSALDO_"]').all();
    await enlacesSaldo[0].getByRole('link', { name: 'Saldo' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('\n🔍 INVESTIGACIÓN DETALLADA DEL HTML:');

    const tabla4 = page.locator('table').nth(3);
    const filasComprobantes = await tabla4.locator('tr').all();

    for (let i = 1; i < filasComprobantes.length; i++) {
      const fila = filasComprobantes[i];
      const celdas = await fila.locator('td').allTextContents();

      if (celdas.length >= 15) {
        const numeroFactura = celdas[1]?.trim() || '';
        const tipoComprobante = celdas[5]?.trim() || '';

        console.log(`\n📄 FILA ${i}: ${numeroFactura}`);
        console.log(`   Tipo: "${tipoComprobante}"`);

        // Investigar la columna 15 (índice 14)
        const celdaPdf = fila.locator('td').nth(14);

        // Obtener toda la información HTML de la celda
        const htmlCompleto = await celdaPdf.innerHTML();
        const estiloColumna = await celdaPdf.getAttribute('style') || '';
        const claseColumna = await celdaPdf.getAttribute('class') || '';

        console.log(`   📋 Columna 15 - Style: "${estiloColumna}"`);
        console.log(`   📋 Columna 15 - Class: "${claseColumna}"`);
        console.log(`   📋 Columna 15 - HTML: ${htmlCompleto.substring(0, 200)}...`);

        // Verificar si la celda está oculta
        const estaOculta = estiloColumna.includes('display:none') || estiloColumna.includes('display: none');
        console.log(`   📋 Columna 15 - ¿Oculta?: ${estaOculta}`);

        // Verificar si hay botón PDF
        const botonPdf = celdaPdf.locator('img[id^="vIMPRIMIRSALDO_"]');
        const tieneBotonPdf = await botonPdf.count() > 0;
        console.log(`   📋 Columna 15 - ¿Tiene botón PDF?: ${tieneBotonPdf}`);

        if (tieneBotonPdf) {
          const botonId = await botonPdf.getAttribute('id');
          const botonEstilo = await botonPdf.getAttribute('style') || '';
          const botonClase = await botonPdf.getAttribute('class') || '';
          const botonVisible = await botonPdf.isVisible();
          const botonEnabled = await botonPdf.isEnabled();

          console.log(`   🔘 Botón ID: ${botonId}`);
          console.log(`   🔘 Botón Style: "${botonEstilo}"`);
          console.log(`   🔘 Botón Class: "${botonClase}"`);
          console.log(`   🔘 Botón Visible: ${botonVisible}`);
          console.log(`   🔘 Botón Enabled: ${botonEnabled}`);
        }

        // Verificar si hay máscara GX
        const mascara = page.locator('.gx-mask');
        const tieneMascara = await mascara.count() > 0;
        console.log(`   🎭 ¿Hay máscara GX activa?: ${tieneMascara}`);
      }
    }

  } catch (error) {
    console.error('💥 Error:', error);
  } finally {
    console.log('\n🏁 Cerrando navegador...');
    await browser.close();
  }
}

main();
