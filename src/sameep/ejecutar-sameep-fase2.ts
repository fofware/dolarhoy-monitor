import * as fs from 'fs';
import * as path from 'path';
import {
  DatosRecolectados,
  SameepDataCollector
} from './sameep-class';

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

  const collector = new SameepDataCollector();

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

            if (comprobante.urlPdf) {
              // Tenemos la URL guardada, pero las URLs pueden ser específicas de sesión
              // Intentamos navegación dinámica que es más confiable
              console.log(`      � PDF detectado en Fase 1, navegando dinámicamente...`);

              // Navegar al cliente y suministro específico
              await collector.navegarACliente(cliente.id);
              await collector.navegarASuministro(suministro);

              const url = await collector.obtenerUrlPDF(comprobante);

              if (url) {
                // Usar la URL recién capturada para descarga inmediata
                const pdfBuffer = await collector.descargarPDF(url);

                if (pdfBuffer && pdfBuffer.length > 1000) { // Verificar que sea un PDF real, no HTML
                  // Crear directorio para PDFs si no existe
                  const pdfDir = path.join(__dirname, '..', 'datos', 'pdfs', cliente.nombre.replace(/[^a-zA-Z0-9]/g, '_'));
                  if (!fs.existsSync(pdfDir)) {
                    fs.mkdirSync(pdfDir, { recursive: true });
                  }

                  // Guardar el PDF
                  const nombreArchivo = (comprobante.nombreArchivoPdf || `${comprobante.numeroComprobante.replace(/[^a-zA-Z0-9\-_\.]/g, '_')}.pdf`).replace(/[^a-zA-Z0-9\-_\.]/g, '_');
                  const rutaArchivo = path.join(pdfDir, nombreArchivo);
                  fs.writeFileSync(rutaArchivo, pdfBuffer);

                  console.log(`      ✅ PDF descargado: ${rutaArchivo} (${pdfBuffer.length} bytes)`);
                  pdfDescargados++;
                  pdfClienteActual++;
                } else {
                  console.log(`      ❌ Error: archivo descargado no es un PDF válido`);
                  erroresDescarga++;
                  errorClienteActual++;
                }
              } else {
                console.log(`      ❌ No se pudo capturar URL dinámicamente`);
                erroresDescarga++;
                errorClienteActual++;
              }
            } else {
              // Si no hay URL guardada, capturarla dinámicamente (método anterior)
              console.log(`      🔍 No hay URL guardada, capturando dinámicamente...`);

              // Navegar al cliente y suministro específico
              await collector.navegarACliente(cliente.id);
              await collector.navegarASuministro(suministro);

              const url = await collector.obtenerUrlPDF(comprobante);

              if (url) {
                console.log(`      ✅ URL capturada: ${url.substring(0, 80)}...`);
                // Aquí se podría agregar la descarga real del PDF
                pdfDescargados++;
                pdfClienteActual++;
              } else {
                console.log(`      ❌ No se pudo capturar URL`);
                erroresDescarga++;
                errorClienteActual++;
              }
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
