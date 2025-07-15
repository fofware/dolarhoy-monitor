import * as dotenv from 'dotenv';
import { chromium } from 'playwright';
import * as fs from 'fs-extra';

dotenv.config();

// Script para analizar la estructura de datos y obtener tu feedback
async function analizarEstructura() {
  console.log('🔍 Iniciando análisis de estructura de datos...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000, // Muy lento para que puedas ver
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

    // Esperar carga completa
    await page.waitForTimeout(15000);
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await page.waitForSelector('[id^="span_vINGRESAR_"]', { timeout: 30000 });

    console.log('✅ Login exitoso y página cargada');

    // PASO 1: Analizar la página de lista de clientes
    console.log('\n📊 PASO 1: ANALIZANDO PÁGINA DE LISTA DE CLIENTES');
    await page.screenshot({ path: 'facturas/analisis_1_lista_clientes.png', fullPage: true });

    // Extraer información de cada tabla
    const tablas = await page.locator('table').all();
    console.log(`📋 Encontradas ${tablas.length} tablas en la página`);

    for (let i = 0; i < tablas.length; i++) {
      console.log(`\n--- TABLA ${i + 1} ---`);
      const filas = await tablas[i].locator('tr').all();
      console.log(`Filas en tabla ${i + 1}: ${filas.length}`);

      for (let j = 0; j < Math.min(filas.length, 3); j++) { // Solo primeras 3 filas
        const celdas = await filas[j].locator('td').allTextContents();
        console.log(`  Fila ${j + 1}: [${celdas.join(' | ')}]`);
      }
    }

    // Obtener información de los primeros 3 clientes
    const elementosClientes = await page.locator('[id^="span_vINGRESAR_"]').all();
    console.log(`\n🎯 Analizando primeros 3 de ${elementosClientes.length} clientes:`);

    for (let i = 0; i < Math.min(3, elementosClientes.length); i++) {
      const elemento = elementosClientes[i];
      const id = await elemento.getAttribute('id');
      console.log(`\nCliente ${i + 1}: ID = ${id}`);

      // Obtener texto de la fila padre
      try {
        const fila = elemento.locator('xpath=ancestor::tr');
        const textoCompleto = await fila.textContent();
        console.log(`  Texto completo de la fila: "${textoCompleto}"`);

        const celdas = await fila.locator('td').allTextContents();
        console.log(`  Celdas separadas:`);
        celdas.forEach((celda, index) => {
          console.log(`    Celda ${index}: "${celda}"`);
        });
      } catch (error) {
        console.log(`  Error obteniendo datos de fila: ${error}`);
      }
    }

    // PASO 2: Entrar al primer cliente para ver la estructura interna
    console.log('\n🚪 PASO 2: ENTRANDO AL PRIMER CLIENTE');
    await elementosClientes[0].getByRole('link', { name: 'Ingresar' }).click();
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    console.log(`📍 URL después de entrar al cliente: ${page.url()}`);
    await page.screenshot({ path: 'facturas/analisis_2_dentro_cliente.png', fullPage: true });

    // Analizar la página del cliente
    const tablasCliente = await page.locator('table').all();
    console.log(`📋 Encontradas ${tablasCliente.length} tablas en la página del cliente`);

    for (let i = 0; i < tablasCliente.length; i++) {
      console.log(`\n--- TABLA CLIENTE ${i + 1} ---`);
      const filasCliente = await tablasCliente[i].locator('tr').all();
      console.log(`Filas en tabla ${i + 1}: ${filasCliente.length}`);

      for (let j = 0; j < Math.min(filasCliente.length, 5); j++) { // Primeras 5 filas
        const celdasCliente = await filasCliente[j].locator('td').allTextContents();
        console.log(`  Fila ${j + 1}: [${celdasCliente.join(' | ')}]`);
      }
    }

    // PASO 3: Ir a la sección de Saldo
    console.log('\n💰 PASO 3: YENDO A LA SECCIÓN DE SALDO');

    try {
      await page.getByRole('link', { name: 'Saldo' }).click();
      await page.waitForTimeout(5000);
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      console.log(`📍 URL en la página de saldo: ${page.url()}`);
      await page.screenshot({ path: 'facturas/analisis_3_seccion_saldo.png', fullPage: true });

      // Analizar botones de PDF
      const botonesPdf = await page.locator('[id^="vIMPRIMIRSALDO_"]').all();
      console.log(`📄 Encontrados ${botonesPdf.length} botones de PDF`);

      for (let i = 0; i < botonesPdf.length; i++) {
        const boton = botonesPdf[i];
        const idBoton = await boton.getAttribute('id');
        console.log(`  Botón PDF ${i + 1}: ID = ${idBoton}`);
      }

      // Analizar tablas en la sección de saldo
      const tablasSaldo = await page.locator('table').all();
      console.log(`📋 Encontradas ${tablasSaldo.length} tablas en la sección de saldo`);

      for (let i = 0; i < tablasSaldo.length; i++) {
        console.log(`\n--- TABLA SALDO ${i + 1} ---`);
        const filasSaldo = await tablasSaldo[i].locator('tr').all();
        console.log(`Filas en tabla ${i + 1}: ${filasSaldo.length}`);

        for (let j = 0; j < Math.min(filasSaldo.length, 5); j++) {
          const celdasSaldo = await filasSaldo[j].locator('td').allTextContents();
          console.log(`  Fila ${j + 1}: [${celdasSaldo.join(' | ')}]`);
        }
      }

    } catch (error) {
      console.log(`❌ Error accediendo a la sección Saldo: ${error}`);
    }

    console.log('\n✅ Análisis completado. Revisa los screenshots y la información en consola.');
    console.log('📸 Screenshots guardados:');
    console.log('  - facturas/analisis_1_lista_clientes.png');
    console.log('  - facturas/analisis_2_dentro_cliente.png');
    console.log('  - facturas/analisis_3_seccion_saldo.png');

  } catch (error) {
    console.error('❌ Error durante análisis:', error);
    await page.screenshot({ path: 'facturas/analisis_error.png', fullPage: true });
  } finally {
    console.log('\n🔒 Manteniendo navegador abierto por 30 segundos para que puedas revisar...');
    await page.waitForTimeout(30000);
    await browser.close();
  }
}

analizarEstructura();
