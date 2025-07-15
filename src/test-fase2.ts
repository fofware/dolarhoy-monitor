import { SameepDataCollectorCorregido } from './sameep-corregido';
import * as fs from 'fs';
import * as path from 'path';

interface DatosRecolectados {
  clientes: any[];
  totalClientes: number;
  totalSuministros: number;
  totalComprobantes: number;
  totalComprobantesConPdf: number;
  totalComprobantesSinPdf: number;
  fechaRecoleccion: string;
  clientesProcesados: number;
}

async function probarFase2ConDosClientes() {
  console.log('🧪 PRUEBA - Fase 2 con solo 2 clientes para validar...');

  // Buscar el archivo de datos más reciente
  const datosDir = path.join(__dirname, '..', 'datos');
  const archivos = fs.readdirSync(datosDir)
    .filter(file => file.startsWith('sameep-datos-corregidos-') && file.endsWith('.json'))
    .sort()
    .reverse();

  if (archivos.length === 0) {
    console.error('❌ No se encontraron archivos de datos. Ejecuta primero la Fase 1.');
    return;
  }

  const archivoMasReciente = archivos[0];
  const rutaArchivo = path.join(datosDir, archivoMasReciente);

  console.log(`📂 Cargando datos desde: ${archivoMasReciente}`);

  const datosRecolectados: any = JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));

  // Convertir la fecha de string a Date
  datosRecolectados.fechaRecoleccion = new Date(datosRecolectados.fechaRecoleccion);

  // Solo tomar los primeros 2 clientes para la prueba
  const clientesPrueba = datosRecolectados.clientes.slice(0, 2);

  console.log(`📊 Datos para prueba:`);
  console.log(`   • ${clientesPrueba.length} clientes (de ${datosRecolectados.totalClientes} totales)`);

  const collector = new SameepDataCollectorCorregido();

  // Cargar los datos recolectados en el collector
  collector.cargarDatosRecolectados(datosRecolectados);

  try {
    await collector.inicializarBrowser();
    console.log('✅ Navegador inicializado.');

    await collector.login();
    console.log('✅ Login exitoso.');

    // Contadores
    let clientesProcesados = 0;
    let pdfDescargados = 0;
    let erroresDescarga = 0;

    for (const cliente of clientesPrueba) {
      console.log(`\n🎯 Procesando cliente ${clientesProcesados + 1}/${clientesPrueba.length}: ${cliente.nombre}`);

      let pdfClienteActual = 0;
      let errorClienteActual = 0;

      for (const suministro of cliente.suministros) {
        console.log(`   📋 Suministro: ${suministro.calle} ${suministro.altura}`);

        const comprobantesConPdf = suministro.comprobantes.filter((comp: any) => comp.tienePdf);

        if (comprobantesConPdf.length === 0) {
          console.log(`   ⏭️  Sin PDFs para descargar en este suministro`);
          continue;
        }

        console.log(`   📄 ${comprobantesConPdf.length} PDF(s) para descargar`);

        // Solo procesar el primer PDF para acelerar la prueba
        const comprobante = comprobantesConPdf[0];

        try {
          console.log(`      📥 Descargando: ${comprobante.numeroComprobante}...`);

          // Navegar al cliente y suministro específico
          await collector.navegarACliente(cliente.id);
          await collector.navegarASuministro(suministro);

          const url = await collector.obtenerUrlPDF(comprobante);

          if (url) {
            console.log(`      ✅ URL capturada: ${url.substring(0, 80)}...`);
            pdfDescargados++;
            pdfClienteActual++;
          } else {
            console.log(`      ❌ No se pudo capturar URL`);
            erroresDescarga++;
            errorClienteActual++;
          }

        } catch (error) {
          console.log(`      ❌ Error: ${error}`);
          erroresDescarga++;
          errorClienteActual++;
        }
      }

      clientesProcesados++;
      console.log(`✅ Cliente completado: ${cliente.nombre}`);
      console.log(`   📊 PDFs procesados: ${pdfClienteActual} exitosos, ${errorClienteActual} errores`);
      console.log(`   📈 Progreso: ${clientesProcesados}/${clientesPrueba.length} clientes (${Math.round(clientesProcesados/clientesPrueba.length*100)}%)`);
    }

    console.log(`\n🎉 PRUEBA completada!`);
    console.log(`📊 Resumen de prueba:`);
    console.log(`   • Clientes procesados: ${clientesProcesados}/${clientesPrueba.length}`);
    console.log(`   • PDFs descargados exitosamente: ${pdfDescargados}`);
    console.log(`   • Errores de descarga: ${erroresDescarga}`);
    console.log(`   • Tasa de éxito: ${pdfDescargados > 0 ? Math.round(pdfDescargados/(pdfDescargados+erroresDescarga)*100) : 0}%`);

  } catch (error) {
    console.error('❌ Error en prueba Fase 2:', error);
  } finally {
    await collector.cerrar();
    console.log('🏁 Navegador cerrado.');
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  probarFase2ConDosClientes().catch(console.error);
}

export { probarFase2ConDosClientes };
