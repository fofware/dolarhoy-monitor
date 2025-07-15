import * as dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

async function main() {
  console.log('🧪 Probando CLIENTE 5 - Comprobantes complejos (sin PDF y no-facturas)...');

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

    // 2. Ingresar al QUINTO cliente (0005)
    console.log('🏠 Ingresando al QUINTO cliente (0005)...');
    await page.locator('#span_vINGRESAR_0005').getByRole('link', { name: 'Ingresar' }).click();
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle');

    // 3. Encontrar enlaces de Saldo (puede haber múltiples suministros)
    console.log('💰 Analizando estructura del cliente 5...');
    await page.waitForTimeout(3000);

    const enlacesSaldo = await page.locator('[id^="span_vSALDO_"]').all();
    console.log(`📊 Cliente 5 tiene ${enlacesSaldo.length} suministros con Saldo`);

    if (enlacesSaldo.length === 0) {
      console.log('⚠️ No se encontraron suministros con Saldo en cliente 5');
      await page.screenshot({ path: 'facturas/no_saldo_cliente5.png', fullPage: true });
      return;
    }

    // 4. Procesar cada suministro del cliente 5
    for (let suministroIndex = 0; suministroIndex < enlacesSaldo.length; suministroIndex++) {
      const enlaceSaldo = enlacesSaldo[suministroIndex];
      const suministroId = await enlaceSaldo.getAttribute('id');

      console.log(`\n🎯 Cliente 5 - Procesando suministro ${suministroIndex + 1}/${enlacesSaldo.length}: ${suministroId}`);

      try {
        // Hacer clic en el enlace Saldo del suministro específico
        await enlaceSaldo.getByRole('link', { name: 'Saldo' }).click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // 5. ANÁLISIS DETALLADO DE LA TABLA DE COMPROBANTES
        console.log('   📋 Analizando tabla de comprobantes...');

        const tabla4 = page.locator('table').nth(3); // Tabla de comprobantes
        const filasComprobantes = await tabla4.locator('tr').all();
        console.log(`   📄 Encontradas ${filasComprobantes.length - 1} filas de comprobantes (incluyendo header)`);

        // Analizar cada fila de comprobante
        for (let i = 1; i < filasComprobantes.length; i++) { // Empezar en 1 para saltar header
          try {
            const fila = filasComprobantes[i];
            const celdas = await fila.locator('td').allTextContents();

            if (celdas.length >= 15) {
              const numeroFactura = celdas[1]?.trim() || '';
              const tipoComprobante = celdas[5]?.trim() || '';
              const numeroComprobante = `${celdas[6]?.trim()} ${celdas[7]?.trim()} ${celdas[8]?.trim()}`.trim();

              console.log(`      📄 Fila ${i}: ${numeroFactura}`);
              console.log(`         💼 Tipo: "${tipoComprobante}"`);
              console.log(`         🔢 Número: "${numeroComprobante}"`);

              // Verificar si hay botón PDF en la columna 15 y si está visible
              const celdaPdf = fila.locator('td').nth(14); // Columna 15 (índice 14)
              const botonPdf = celdaPdf.locator('img[id^="vIMPRIMIRSALDO_"]');
              const tieneBotonPdf = await botonPdf.count() > 0;

              if (tieneBotonPdf) {
                // Verificar el estilo de la IMAGEN (no de la celda)
                const estiloImagen = await botonPdf.getAttribute('style') || '';
                const imagenOculta = estiloImagen.includes('display:none') || estiloImagen.includes('display: none');

                if (imagenOculta) {
                  console.log(`         ❌ SIN PDF - Imagen oculta (style="${estiloImagen}")`);

                  // Analizar por qué no tiene PDF
                  if (tipoComprobante !== 'FACTURA') {
                    console.log(`         📝 MOTIVO: No es factura (es "${tipoComprobante}") + imagen oculta`);
                  } else {
                    console.log(`         📝 MOTIVO: Factura con imagen oculta - sin PDF disponible`);
                  }
                } else {
                  console.log(`         ✅ TIENE PDF - Imagen visible, intentando capturar URL...`);

                  try {
                    // Probar captura de URL usando la estrategia que funciona
                    await botonPdf.click();

                    const iframeSelector = 'iframe#gxp0_ifrm';
                    const iframeLocator = page.locator(iframeSelector);
                    await iframeLocator.waitFor({ state: 'visible', timeout: 10000 });

                    const pdfRelativeUrl = await iframeLocator.getAttribute('src');
                    if (pdfRelativeUrl) {
                      const fullPdfUrl = `https://apps8.chaco.gob.ar/sameepweb/servlet/${pdfRelativeUrl}`;
                      console.log(`         🎉 URL CAPTURADA: ${fullPdfUrl.substring(0, 100)}...`);
                    }

                    // Cerrar popup
                    await page.locator('#gxp0_cls').click();
                    await page.waitForTimeout(1000);

                  } catch (pdfError) {
                    console.log(`         ❌ Error capturando PDF (imagen visible pero con problemas): ${pdfError}`);
                    try { await page.locator('#gxp0_cls').click(); } catch {}
                  }
                }
              } else {
                console.log(`         ⚠️ Sin botón PDF en columna 15`);
              }

            } else {
              console.log(`      ⚠️ Fila ${i}: Formato inesperado (${celdas.length} columnas)`);
            }

          } catch (filaError) {
            console.log(`      ❌ Error procesando fila ${i}: ${filaError}`);
          }
        }

        // Buscar todos los botones PDF disponibles en este suministro
        const botonesPdf = await page.locator('img[id^="vIMPRIMIRSALDO_"]').all();
        console.log(`   🔍 RESUMEN: ${botonesPdf.length} botones PDF encontrados en total`);

        // Volver atrás para procesar el siguiente suministro
        if (suministroIndex < enlacesSaldo.length - 1) {
          console.log('   ⬅️ Volviendo para procesar siguiente suministro...');
          await page.goBack();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);
        }

      } catch (suministroError) {
        console.log(`   ❌ Error procesando suministro ${suministroId}: ${suministroError}`);
        await page.screenshot({ path: `facturas/error_cliente5_suministro${suministroIndex}.png`, fullPage: true });
      }
    }

  } catch (error) {
    console.error('💥 Error general:', error);
    await page.screenshot({ path: 'facturas/error_test_cliente5.png', fullPage: true });
  } finally {
    console.log('🏁 Cerrando navegador...');
    await browser.close();
  }
}

main();
