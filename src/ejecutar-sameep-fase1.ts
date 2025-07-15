import { SameepDataCollectorCorregido } from './sameep-corregido';

async function main() {
  console.log('🚀 Iniciando sistema SAMEEP - SOLO FASE 1 (Recolección de Datos)...');

  const collector = new SameepDataCollectorCorregido();

  try {
    await collector.inicializarBrowser();
    await collector.login();

    const clientes = await collector.recolectarClientes();
    console.log(`📊 Total de clientes encontrados: ${clientes.length}`);

    // SOLO FASE 1: Recolectar TODOS los datos (sin descargar PDFs)
    console.log(`\n📋 FASE 1: Recolectando datos de TODOS los ${clientes.length} clientes...`);
    for (let i = 0; i < clientes.length; i++) {
      console.log(`\n🎯 Procesando cliente ${i + 1}/${clientes.length}: ${clientes[i].id}`);
      await collector.procesarClienteConReintentos(clientes[i]);
    }

    // Guardar datos después de la recolección
    await collector.guardarDatosEnJSON();

    console.log('🎉 FASE 1 completada exitosamente!');
    console.log(`📈 Estadísticas finales:`);
    console.log(`   - Total clientes encontrados: ${collector['datosRecolectados'].totalClientes}`);
    console.log(`   - Clientes procesados exitosamente: ${collector['datosRecolectados'].clientesProcesados}/${collector['datosRecolectados'].totalClientes}`);
    console.log(`   - Total suministros procesados: ${collector['datosRecolectados'].totalSuministros}`);
    console.log(`   - Total comprobantes encontrados: ${collector['datosRecolectados'].totalComprobantes}`);
    console.log(`   - Comprobantes con PDF: ${collector['datosRecolectados'].totalComprobantesConPdf}`);
    console.log(`   - Comprobantes sin PDF: ${collector['datosRecolectados'].totalComprobantesSinPdf}`);

    if (collector['datosRecolectados'].clientesProcesados === collector['datosRecolectados'].totalClientes) {
      console.log(`✅ Todos los clientes fueron procesados exitosamente!`);
    } else {
      const fallos = collector['datosRecolectados'].totalClientes - collector['datosRecolectados'].clientesProcesados;
      console.log(`⚠️ ${fallos} cliente(s) tuvieron errores durante el procesamiento`);
    }

    console.log(`\n📝 Los datos están guardados y listos. La FASE 2 (descarga de PDFs) se puede ejecutar por separado si es necesario.`);

  } catch (error) {
    console.error('❌ Error en el proceso:', error);
    process.exit(1);
  } finally {
    await collector.cerrar();
  }
}

// Ejecutar solo si este archivo es el principal
if (require.main === module) {
  main().catch(console.error);
}
