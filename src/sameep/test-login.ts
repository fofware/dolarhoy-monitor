import { SameepDataCollector } from './sameep-class';

async function testLogin() {
  console.log('🧪 Test de login SAMEEP...');

  const collector = new SameepDataCollector();

  try {
    console.log('🚀 Inicializando navegador...');
    await collector.inicializarBrowser();

    console.log('🔐 Intentando login...');
    await collector.login();

    console.log('✅ Login exitoso!');

    // Test básico: obtener lista de clientes
    console.log('👥 Obteniendo lista de clientes...');
    const clientes = await collector.recolectarClientes();
    console.log(`📊 Se encontraron ${clientes.length} clientes`);

    if (clientes.length > 0) {
      console.log(`👤 Primer cliente: ${clientes[0].id} - ${clientes[0].nombre}`);
    }

  } catch (error) {
    console.error('❌ Error en el test:', error);
  } finally {
    await collector.cerrar();
    console.log('🏁 Test completado.');
  }
}

if (require.main === module) {
  testLogin().catch(console.error);
}

export { testLogin };
