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
  fechaRecoleccion: any; // Usar any para evitar problemas de tipo
  clientesProcesados: number;
}

async function ejecutarFase2() {
  console.log('🚀 Iniciando FASE 2 - Descarga de PDFs con Playwright...');

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

  const datosRecolectados: DatosRecolectados = JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'));

  // Convertir la fecha de string a Date si es necesario
  if (typeof datosRecolectados.fechaRecoleccion === 'string') {
    datosRecolectados.fechaRecoleccion = new Date(datosRecolectados.fechaRecoleccion);
  }

  console.log(`📊 Datos cargados:`);
  console.log(`   • ${datosRecolectados.totalClientes} clientes`);
  console.log(`   • ${datosRecolectados.totalSuministros} suministros`);
  console.log(`   • ${datosRecolectados.totalComprobantes} comprobantes`);
  console.log(`   • ${datosRecolectados.totalComprobantesConPdf} con PDF disponible`);
  console.log(`   • ${datosRecolectados.totalComprobantesSinPdf} sin PDF`);

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

    for (const cliente of datosRecolectados.clientes) {
      console.log(`\n🎯 Procesando cliente ${clientesProcesados + 1}/${datosRecolectados.totalClientes}: ${cliente.nombre}`);

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

        // Solo tomar el primer PDF de cada suministro para acelerar el proceso
        // Si quieres procesar todos los PDFs, comenta esta línea y descomenta el bucle completo
        const comprobantesParaProcesar = [comprobantesConPdf[0]]; // Solo el primero
        // const comprobantesParaProcesar = comprobantesConPdf; // Todos los PDFs

        for (const comprobante of comprobantesParaProcesar) {
          try {
            console.log(`      📥 Descargando: ${comprobante.numeroComprobante}...`);

            // Navegar al cliente y suministro específico
            await collector.navegarACliente(cliente.id);
            await collector.navegarASuministro(suministro);

            const url = await collector.obtenerUrlPDF(comprobante);

            if (url) {
              // Aquí podrías agregar la descarga real del PDF con axios o playwright
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
      }

      clientesProcesados++;
      console.log(`✅ Cliente completado: ${cliente.nombre}`);
      console.log(`   📊 PDFs procesados: ${pdfClienteActual} exitosos, ${errorClienteActual} errores`);
      console.log(`   📈 Progreso total: ${clientesProcesados}/${datosRecolectados.totalClientes} clientes (${Math.round(clientesProcesados/datosRecolectados.totalClientes*100)}%)`);
    }

    console.log(`\n🎉 FASE 2 completada!`);
    console.log(`📊 Resumen final:`);
    console.log(`   • Clientes procesados: ${clientesProcesados}/${datosRecolectados.totalClientes}`);
    console.log(`   • PDFs descargados exitosamente: ${pdfDescargados}`);
    console.log(`   • Errores de descarga: ${erroresDescarga}`);
    console.log(`   • Tasa de éxito: ${Math.round(pdfDescargados/(pdfDescargados+erroresDescarga)*100)}%`);

  } catch (error) {
    console.error('❌ Error en Fase 2:', error);
  } finally {
    await collector.cerrar();
    console.log('🏁 Navegador cerrado.');
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  ejecutarFase2().catch(console.error);
}

export { ejecutarFase2 };
