import { SameepDataCollector } from './sameep-class';

async function testDescargaPDF() {
  console.log('🧪 TEST: Analizando qué devuelve el servidor...');

  const collector = new SameepDataCollector();

  try {
    await collector.inicializarBrowser();
    await collector.login();

    // Usar una URL de ejemplo del JSON
    const urlEjemplo = "https://apps8.chaco.gob.ar/sameepweb/servlet/com.sameep.afacturamedida?NvG4DmzI1RKfXq_nioIPdTAUIk2O10xj43Td4NG29PIiDiWsyAPESVOkFw6KSVNqbic7Rc9H1_z0ASWYjjO2SBzkHN09NaYzbUPxsj+f1LU=,gxPopupLevel%3D0%3B";

    console.log('🔍 Testando descarga de un PDF...');
    await collector.descargarPDF(urlEjemplo);

  } catch (error) {
    console.error('❌ Error en test:', error);
  } finally {
    await collector.cerrar();
  }
}

testDescargaPDF();
