import * as dotenv from 'dotenv';
import { SameepDataCollector } from './sameep-completo';

dotenv.config();

// Prueba simple para verificar un solo cliente
async function pruebaUnCliente() {
  console.log('🧪 Iniciando prueba con un solo cliente...');

  const collector = new SameepDataCollector();

  try {
    await collector.conectarMongoDB();
    console.log('✅ Conexión MongoDB exitosa');

    await collector.inicializarBrowser();
    console.log('✅ Browser inicializado');

    await collector.login();
    console.log('✅ Login exitoso');

    // Recolectar clientes
    const clientes = await collector.recolectarClientes();
    console.log(`✅ Clientes encontrados: ${clientes.length}`);

    if (clientes.length > 0) {
      console.log('🎯 Procesando solo el primer cliente...');
      await collector.procesarCliente(clientes[0]);
      console.log('✅ Cliente procesado exitosamente');
    }

    await collector.guardarDatosEnJSON();
    console.log('✅ Datos guardados en JSON');

  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  } finally {
    await collector.cerrar();
  }
}

pruebaUnCliente();
