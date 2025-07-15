import * as fs from 'fs';
import * as path from 'path';
import { SameepDataCollector } from './sameep-class';

async function probarFase2Integrada(): Promise<void> {
  console.log('🧪 PRUEBA DE INTEGRACIÓN FASE 2 - ESTRATEGIA DE IFRAME');

  const sameep = new SameepDataCollector();

  try {
    // 1. Inicializar browser y hacer login
    console.log('🔑 Inicializando browser y realizando login...');
    await sameep.inicializarBrowser();
    await sameep.login();

    // 3. Navegar a un cliente específico (usando el primero del JSON)
    const datosPath = path.join(__dirname, '..', 'datos', 'sameep-datos-corregidos-2025-07-15T03-55-56-216Z.json');
    const datosRecolectados = JSON.parse(fs.readFileSync(datosPath, 'utf8'));

    const primerCliente = datosRecolectados.clientes[0];
    const primerSuministro = primerCliente.suministros[0];
    const comprobantesConPdf = primerSuministro.comprobantes.filter((comp: any) => comp.tienePdf);

    if (comprobantesConPdf.length === 0) {
      console.log('❌ No hay comprobantes con PDF en el primer cliente');
      return;
    }

    const comprobante = comprobantesConPdf[0];

    console.log(`🎯 Cliente: ${primerCliente.nombre}`);
    console.log(`🏠 Suministro: ${primerSuministro.calle} ${primerSuministro.altura}`);
    console.log(`📄 Comprobante: ${comprobante.numeroComprobante}`);

    // 4. Navegar al cliente y suministro
    const idLista = '0001'; // Primer cliente
    await sameep.navegarAClientePorIndice(idLista);
    await sameep.navegarASuministro(primerSuministro);

    // 5. PRUEBA DE NUEVA ESTRATEGIA
    console.log('\n🚀 Iniciando prueba de nueva estrategia...');

    // Hacer clic en botón PDF (SIN cerrar popup)
    const clicExitoso = await sameep.hacerClicEnBotonPDF(comprobante);

    if (!clicExitoso) {
      console.log('❌ No se pudo hacer clic en botón PDF');
      return;
    }

    console.log('✅ Clic en botón PDF exitoso');

    // Descargar PDF usando estrategia de iframe
    const pdfBuffer = await sameep.descargarPDF();

    if (!pdfBuffer) {
      console.log('❌ No se pudo descargar el PDF');
      return;
    }

    console.log(`✅ PDF descargado: ${pdfBuffer.length} bytes`);

    // Validar que es un PDF real
    if (pdfBuffer.subarray(0, 4).toString('ascii') === '%PDF') {
      console.log('🎉 ¡PDF válido confirmado!');

      // Guardar PDF de prueba
      const testDir = path.join(__dirname, '..', 'datos', 'test-fase2-integrada');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const nombreArchivo = `prueba-integracion-${comprobante.numeroComprobante.replace(/[^a-zA-Z0-9\-_\.]/g, '_')}.pdf`;
      const rutaArchivo = path.join(testDir, nombreArchivo);
      fs.writeFileSync(rutaArchivo, pdfBuffer);

      console.log(`💾 PDF guardado en: ${rutaArchivo}`);
      console.log('🎉 ¡PRUEBA DE INTEGRACIÓN EXITOSA!');

    } else {
      console.log('❌ El archivo descargado no es un PDF válido');
    }

  } catch (error) {
    console.error('❌ Error en prueba:', error);
  } finally {
    await sameep.cerrar();
  }
}

// Ejecutar prueba
probarFase2Integrada().catch(console.error);
