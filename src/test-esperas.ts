import * as dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

// Test con esperas más largas
async function testConEsperas() {
  console.log('🚀 Iniciando test con esperas largas...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500, // Más lento
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login
    console.log('🔐 Haciendo login...');
    await page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.gamexamplelogin');

    const user = process.env.SAMEEP_USER;
    const pass = process.env.SAMEEP_PASS;
    if (!user || !pass) throw new Error('Credenciales no encontradas');

    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.getByPlaceholder('Contraseña').fill(pass);
    await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
    await page.waitForURL('**/com.sameep.wpseleccionarcliente', { timeout: 15000 });
    console.log('✅ Login exitoso');

    // Esperar mucho más tiempo para que la página cargue completamente
    console.log('⏳ Esperando carga completa (15 segundos)...');
    await page.waitForTimeout(15000);

    console.log('⏳ Esperando networkidle...');
    try {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      console.log('✅ Network idle alcanzado');
    } catch (error) {
      console.log('⚠️  Timeout en networkidle, continuando...');
    }

    // Tomar screenshot antes de buscar elementos
    await page.screenshot({ path: 'facturas/antes_buscar_elementos.png', fullPage: true });
    console.log('📸 Screenshot tomado antes de buscar elementos');

    // Buscar elementos con varios métodos
    console.log('🔍 Método 1: Buscando por ID...');
    const countById = await page.locator('[id^="span_vINGRESAR_"]').count();
    console.log(`Resultado método 1: ${countById} elementos`);

    console.log('🔍 Método 2: Buscando por texto "Ingresar"...');
    const countByText = await page.locator('text=Ingresar').count();
    console.log(`Resultado método 2: ${countByText} elementos`);

    console.log('🔍 Método 3: Buscando enlaces con "Ingresar"...');
    const countByLink = await page.locator('a:has-text("Ingresar")').count();
    console.log(`Resultado método 3: ${countByLink} elementos`);

    console.log('🔍 Método 4: Buscando en toda la página...');
    const htmlContent = await page.content();
    const matches = htmlContent.match(/span_vINGRESAR_/g);
    console.log(`Resultado método 4: ${matches ? matches.length : 0} coincidencias en HTML`);

    if (matches && matches.length > 0) {
      console.log('🎯 ¡Elementos encontrados en HTML! Vamos a esperar más...');

      // Esperar hasta que los elementos sean visibles
      console.log('⏳ Esperando que los elementos sean visibles...');
      try {
        await page.waitForSelector('[id^="span_vINGRESAR_"]', { timeout: 30000 });
        console.log('✅ Elementos ahora visibles');

        const finalCount = await page.locator('[id^="span_vINGRESAR_"]').count();
        console.log(`🎉 Elementos finalmente encontrados: ${finalCount}`);

        if (finalCount > 0) {
          const primerElemento = page.locator('[id^="span_vINGRESAR_"]').first();
          const id = await primerElemento.getAttribute('id');
          console.log(`📋 Primer cliente ID: ${id}`);
        }

      } catch (error) {
        console.log('❌ Timeout esperando elementos visibles');
      }
    }

    // Información adicional de depuración
    console.log('📊 Información adicional:');
    const title = await page.title();
    console.log(`- Título: ${title}`);
    console.log(`- URL: ${page.url()}`);

    const tables = await page.locator('table').count();
    console.log(`- Tablas encontradas: ${tables}`);

  } catch (error) {
    console.error('❌ Error:', error);
    await page.screenshot({ path: 'facturas/error_test_esperas.png', fullPage: true });
  } finally {
    console.log('🔒 Cerrando en 5 segundos...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

testConEsperas();
