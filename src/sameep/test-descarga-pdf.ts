import { SameepDataCollector } from './sameep-class';
import * as fs from 'fs';
import * as path from 'path';

async function testDescargaPDF() {
  console.log('🧪 Test de descarga de PDF...');

  const collector = new SameepDataCollector();

  try {
    await collector.inicializarBrowser();
    console.log('✅ Navegador inicializado.');

    await collector.login();
    console.log('✅ Login exitoso.');

    // URL de ejemplo del JSON que ya tenemos
    const urlTest = "https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.afacturamedida?NvG4DmzI1RKfXq_nioIPdTAUIk2O10xj43Td4NG29PIiDiWsyAPESVOkFw6KSVNqbic7Rc9H1_z0ASWYjjO2SBzkHN09NaYzbUPxsj+f1LU=,gxPopupLevel%3D0%3B";

    console.log('📥 Descargando PDF de prueba...');
    const pdfBuffer = await collector.descargarPDF(urlTest);

    if (pdfBuffer) {
      // Crear directorio de prueba
      const testDir = path.join(__dirname, '..', 'datos', 'test-pdfs');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      // Guardar PDF de prueba
      const rutaTest = path.join(testDir, 'test-factura.pdf');
      fs.writeFileSync(rutaTest, pdfBuffer);

      console.log(`✅ PDF descargado exitosamente: ${rutaTest}`);
      console.log(`📊 Tamaño: ${pdfBuffer.length} bytes`);
    } else {
      console.log('❌ No se pudo descargar el PDF');
    }

  } catch (error) {
    console.error('❌ Error en el test:', error);
  } finally {
    await collector.cerrar();
    console.log('🏁 Test completado.');
  }
}

if (require.main === module) {
  testDescargaPDF().catch(console.error);
}
