import * as dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

async function main() {
  console.log('🧪 Probando captura de URLs con cliente 2...');

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

    // 2. Ingresar al SEGUNDO cliente (0002)
    console.log('🏠 Ingresando al SEGUNDO cliente (0002)...');
    await page.locator('#span_vINGRESAR_0002').getByRole('link', { name: 'Ingresar' }).click();
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle');
    
    // 3. Encontrar enlaces de Saldo (puede haber múltiples)
    console.log('💰 Buscando suministros con Saldo...');
    await page.waitForTimeout(3000);
    
    const enlacesSaldo = await page.locator('[id^="span_vSALDO_"]').all();
    console.log(`📊 Cliente 2 tiene ${enlacesSaldo.length} suministros con Saldo`);

    if (enlacesSaldo.length === 0) {
      console.log('⚠️ No se encontraron suministros con Saldo en cliente 2');
      await page.screenshot({ path: 'facturas/no_saldo_cliente2.png', fullPage: true });
      return;
    }

    // 4. Procesar cada suministro
    for (let suministroIndex = 0; suministroIndex < enlacesSaldo.length; suministroIndex++) {
      const enlaceSaldo = enlacesSaldo[suministroIndex];
      const suministroId = await enlaceSaldo.getAttribute('id');
      
      console.log(`\n🎯 Cliente 2 - Procesando suministro ${suministroIndex + 1}/${enlacesSaldo.length}: ${suministroId}`);
      
      try {
        // Hacer clic en el enlace Saldo del suministro específico
        await enlaceSaldo.getByRole('link', { name: 'Saldo' }).click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        
        // Buscar botones PDF para este suministro
        console.log('   🔍 Buscando botones PDF...');
        const botonesPdf = await page.locator('img[id^="vIMPRIMIRSALDO_"]').all();
        console.log(`   📄 Encontrados ${botonesPdf.length} botones de PDF`);

        // Probar captura de URL para cada botón de este suministro
        for (let i = 0; i < Math.min(botonesPdf.length, 2); i++) {
          const boton = botonesPdf[i];
          const botonId = await boton.getAttribute('id');
          
          try {
            console.log(`      🎯 Suministro ${suministroIndex + 1} - Botón ${botonId}...`);
            
            // Hacer clic en el botón PDF
            await boton.click();
            
            // Esperar el iframe del PDF
            const iframeSelector = 'iframe#gxp0_ifrm';
            const iframeLocator = page.locator(iframeSelector);
            await iframeLocator.waitFor({ state: 'visible', timeout: 15000 });
            
            // Obtener la URL del src del iframe
            const pdfRelativeUrl = await iframeLocator.getAttribute('src');
            if (!pdfRelativeUrl) {
              throw new Error('No se encontró el atributo src del iframe');
            }
            
            // Construir URL completa
            const fullPdfUrl = `https://apps8.chaco.gob.ar/sameepweb/servlet/${pdfRelativeUrl}`;
            console.log(`      🎉 CLIENTE 2 - URL CAPTURADA: ${fullPdfUrl}`);
            
            // Cerrar el popup
            await page.locator('#gxp0_cls').click();
            await page.waitForTimeout(1000);
            
          } catch (error) {
            console.log(`      ❌ Error en cliente 2 - ${botonId}: ${error}`);
            try {
              await page.locator('#gxp0_cls').click();
            } catch {}
          }
        }
        
        // Volver atrás para procesar el siguiente suministro
        if (suministroIndex < enlacesSaldo.length - 1) {
          console.log('   ⬅️ Volviendo para procesar siguiente suministro...');
          await page.goBack();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);
        }
        
      } catch (suministroError) {
        console.log(`   ❌ Error procesando suministro ${suministroId}: ${suministroError}`);
      }
    }
    
  } catch (error) {
    console.error('💥 Error general:', error);
    await page.screenshot({ path: 'facturas/error_test_cliente2.png', fullPage: true });
  } finally {
    console.log('🏁 Cerrando navegador...');
    await browser.close();
  }
}

main();
