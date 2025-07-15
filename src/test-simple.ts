import * as dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

// Versión ultra simple para identificar el problema
async function testSimple() {
  console.log('🚀 Iniciando test ultra simple...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // PASO 1: Login
    console.log('PASO 1: 🔐 Navegando al login...');
    await page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.gamexamplelogin');
    console.log('✅ Página de login cargada');

    const user = process.env.SAMEEP_USER;
    const pass = process.env.SAMEEP_PASS;

    if (!user || !pass) {
      throw new Error('Credenciales no encontradas en .env');
    }

    console.log('PASO 2: 🔑 Llenando credenciales...');
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.getByPlaceholder('Contraseña').fill(pass);
    console.log('✅ Credenciales ingresadas');

    console.log('PASO 3: 🚀 Haciendo clic en login...');
    await page.getByRole('button', { name: 'Iniciar Sesion' }).click();
    console.log('✅ Clic en login realizado');

    console.log('PASO 4: ⏳ Esperando redirección...');
    await page.waitForURL('**/com.sameep.wpseleccionarcliente', { timeout: 15000 });
    console.log('✅ Redirección exitosa');

    // PASO 2: Verificar elementos con timeout corto
    console.log('PASO 5: 🔍 Buscando elementos (timeout 5s)...');

    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      console.log('✅ DOM cargado');
    } catch (error) {
      console.log('⚠️  Timeout esperando DOM, continuando...');
    }

    console.log('PASO 6: 📊 Contando elementos por ID...');
    const count = await page.locator('[id^="span_vINGRESAR_"]').count();
    console.log(`✅ Encontrados ${count} elementos con ID span_vINGRESAR_`);

    if (count > 0) {
      console.log('PASO 7: 📋 Obteniendo datos del primer cliente...');
      const primerElemento = page.locator('[id^="span_vINGRESAR_"]').first();
      const id = await primerElemento.getAttribute('id');
      console.log(`✅ ID del primer cliente: ${id}`);

      // Intentar obtener el texto de la fila padre
      console.log('PASO 8: 📝 Obteniendo texto de la fila...');
      try {
        const fila = primerElemento.locator('xpath=ancestor::tr');
        const textoCompleto = await fila.textContent();
        console.log(`✅ Texto de la fila: ${textoCompleto}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`⚠️  Error obteniendo texto de fila: ${errorMessage}`);
      }

    } else {
      console.log('❌ No se encontraron elementos de clientes');

      // Tomar screenshot para depuración
      await page.screenshot({ path: 'facturas/debug_no_elementos.png', fullPage: true });
      console.log('📸 Screenshot guardado para depuración');

      // Mostrar URL actual
      console.log(`📍 URL actual: ${page.url()}`);

      // Mostrar título de la página
      const titulo = await page.title();
      console.log(`📄 Título de la página: ${titulo}`);
    }

    console.log('🎉 Test completado exitosamente');

  } catch (error) {
    console.error('❌ Error durante el test:', error);
    console.log(`📍 URL al momento del error: ${page.url()}`);
    await page.screenshot({ path: 'facturas/debug_error_test.png', fullPage: true });
  } finally {
    console.log('🔒 Cerrando navegador en 3 segundos...');
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

testSimple();
