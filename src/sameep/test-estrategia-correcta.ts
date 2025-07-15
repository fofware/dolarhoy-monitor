import { SameepDataCollector } from './sameep-class';

async function testDescargaConEstrategiaCorrecta() {
  console.log('🧪 TEST: Probando método corregido basado en descargar-factura-sameep.ts');

  const collector = new SameepDataCollector();

  try {
    await collector.inicializarBrowser();
    await collector.login();

    // Navegar al primer cliente
    await collector.navegarAClientePorIndice('0001');

    // Usar el método de testing para navegar al PDF
    await collector.testNavegacionPDF();

    // Usar URL dummy - el método ahora maneja el iframe automáticamente
    console.log('🚀 Testando descarga con estrategia iframe...');
    const pdfBuffer = await collector.descargarPDF('dummy-url');

    if (pdfBuffer && pdfBuffer.length > 1000) {
      console.log(`✅ ÉXITO: PDF descargado con ${pdfBuffer.length} bytes`);

      // Guardar el PDF de prueba
      const fs = require('fs');
      const path = require('path');
      const testDir = path.join(__dirname, '..', 'datos', 'test-pdfs');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testPath = path.join(testDir, `test-pdf-${Date.now()}.pdf`);
      fs.writeFileSync(testPath, pdfBuffer);
      console.log(`💾 PDF de prueba guardado en: ${testPath}`);
    } else {
      console.log(`❌ FALLO: PDF no válido o muy pequeño`);
    }

  } catch (error) {
    console.error('❌ Error en test:', error);
  } finally {
    await collector.cerrar();
  }
}

testDescargaConEstrategiaCorrecta();
