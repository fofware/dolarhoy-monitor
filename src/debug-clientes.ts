import * as dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

// Script de depuración simple para ver qué está pasando
async function depurarLogin() {
  console.log('🔍 Iniciando depuración del login y lista de clientes...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // --- 1. Login ---
    console.log('🔐 Navegando a la página de login...');
    await page.goto('https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.gamexamplelogin');

    const user = process.env.SAMEEP_USER;
    const pass = process.env.SAMEEP_PASS;
    if (!user || !pass) throw new Error('Credenciales no encontradas en .env');

    console.log(`🔑 Iniciando sesión con el usuario: ${user}...`);
    await page.getByPlaceholder('Nombre de usuario').fill(user);
    await page.getByPlaceholder('Contraseña').fill(pass);
    await page.getByRole('button', { name: 'Iniciar Sesion' }).click();

    await page.waitForURL('**/com.sameep.wpseleccionarcliente', { timeout: 30000 });
    console.log('✅ Login exitoso - Llegamos a la página de selección de clientes');

    // --- 2. Analizar la página de clientes ---
    console.log('🔍 Analizando la estructura de la página...');

    // Tomar screenshot para ver el estado actual
    await page.screenshot({ path: 'facturas/debug_clientes.png', fullPage: true });
    console.log('📸 Screenshot guardado en facturas/debug_clientes.png');

    // Esperar a que la página cargue completamente
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    console.log('⏳ Página cargada completamente');

    // Buscar elementos que contengan "INGRESAR"
    console.log('🔍 Buscando elementos con "INGRESAR"...');
    const elementosIngresar = await page.locator('text=Ingresar').all();
    console.log(`📋 Encontrados ${elementosIngresar.length} elementos con texto "Ingresar"`);

    // Buscar por ID que empiecen con "span_vINGRESAR_"
    console.log('🔍 Buscando elementos por ID...');
    const elementosPorId = await page.locator('[id^="span_vINGRESAR_"]').all();
    console.log(`📋 Encontrados ${elementosPorId.length} elementos con ID que empieza con "span_vINGRESAR_"`);

    // Buscar todas las tablas
    console.log('🔍 Analizando tablas...');
    const tablas = await page.locator('table').all();
    console.log(`📊 Encontradas ${tablas.length} tablas`);

    for (let i = 0; i < tablas.length; i++) {
      const filas = await tablas[i].locator('tr').count();
      console.log(`📊 Tabla ${i + 1}: ${filas} filas`);
    }

    // Obtener todo el HTML para analizarlo
    console.log('🔍 Obteniendo contenido HTML...');
    const htmlContent = await page.content();

    // Buscar patrones relacionados con clientes
    const ingresarMatches = htmlContent.match(/span_vINGRESAR_\d+/g) || [];
    console.log(`🔍 Patrones "span_vINGRESAR_" encontrados: ${ingresarMatches.length}`);
    ingresarMatches.forEach((match, index) => {
      console.log(`  ${index + 1}. ${match}`);
    });

    // Intentar hacer clic en el primer elemento si existe
    if (elementosPorId.length > 0) {
      console.log('🎯 Intentando hacer clic en el primer cliente...');
      const primerElemento = elementosPorId[0];
      const elementoId = await primerElemento.getAttribute('id');
      console.log(`📋 ID del primer elemento: ${elementoId}`);

      // Hacer clic en el enlace "Ingresar" dentro del primer elemento
      await primerElemento.getByRole('link', { name: 'Ingresar' }).click();
      console.log('✅ Clic realizado exitosamente');

      // Esperar a que cambie la página
      await page.waitForTimeout(3000);
      console.log(`📍 URL actual después del clic: ${page.url()}`);

      // Tomar otro screenshot
      await page.screenshot({ path: 'facturas/debug_despues_clic.png', fullPage: true });
      console.log('📸 Screenshot después del clic guardado');
    }

    console.log('🎉 Depuración completada');

  } catch (error) {
    console.error('❌ Error durante la depuración:', error);
    await page.screenshot({ path: 'facturas/debug_error.png', fullPage: true });
    console.log('📸 Screenshot de error guardado');
  } finally {
    console.log('🔒 Cerrando navegador...');
    await browser.close();
  }
}

depurarLogin();
