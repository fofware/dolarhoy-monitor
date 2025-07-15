import * as fs from 'fs';
import * as path from 'path';
import {
  DatosRecolectados,
  SameepDataCollector
} from './sameep-class';

async function ejecutarFase2Optimizado() {
  console.log('🚀 Iniciando FASE 2 OPTIMIZADA - Descarga directa de PDFs...');

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

  // Recopilar todos los PDFs que necesitamos descargar
  const pdfsPorDescargar: Array<{
    cliente: any;
    suministro: any;
    comprobante: any;
    indice: number;
    total: number;
  }> = [];

  let totalPdfs = 0;
  for (const cliente of datosRecolectados.clientes) {
    for (const suministro of cliente.suministros) {
      for (const comprobante of suministro.comprobantes) {
        if (comprobante.tienePdf && comprobante.urlPdf) {
          totalPdfs++;
          pdfsPorDescargar.push({
            cliente,
            suministro,
            comprobante,
            indice: totalPdfs,
            total: -1 // Se actualizará después
          });
        }
      }
    }
  }

  // Actualizar el total
  pdfsPorDescargar.forEach(item => item.total = totalPdfs);

  console.log(`🎯 PDFs encontrados para descarga: ${totalPdfs}`);
  console.log(`✨ VENTAJA: Usando URLs capturadas en Fase 1 (sin navegación redundante)`);

  const collector = new SameepDataCollector();

  try {
    await collector.inicializarBrowser();
    console.log('✅ Navegador inicializado.');

    // ⚠️ SÍ NECESITAMOS LOGIN para que las URLs funcionen (autenticación de sesión)
    await collector.login();
    console.log('✅ Login completado - URLs de PDFs ahora deberían funcionar');

    // Contadores
    let pdfDescargados = 0;
    let erroresDescarga = 0;

    // Procesar PDFs de forma optimizada
    for (const item of pdfsPorDescargar) {
      const { cliente, suministro, comprobante, indice, total } = item;

      try {
        console.log(`\n📥 [${indice}/${total}] Descargando: ${comprobante.numeroComprobante}`);
        console.log(`   👤 Cliente: ${cliente.nombre}`);
        console.log(`   🏠 Dirección: ${suministro.calle} ${suministro.altura}`);

        // ✅ DESCARGA DIRECTA USANDO URL CAPTURADA EN FASE 1
        const pdfBuffer = await collector.descargarPDF(comprobante.urlPdf);

        if (pdfBuffer && pdfBuffer.length > 1000) {
          // Crear directorio para PDFs si no existe
          const nombreClienteLimpio = cliente.nombre.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_');
          const pdfDir = path.join(__dirname, '..', 'datos', 'pdfs', nombreClienteLimpio);
          if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
          }

          // Guardar el PDF con nombre limpio
          const nombreArchivo = comprobante.nombreArchivoPdf || `${comprobante.numeroComprobante.replace(/[^a-zA-Z0-9\-_\.]/g, '_')}.pdf`;
          const nombreArchivoLimpio = nombreArchivo.replace(/[^a-zA-Z0-9\-_\.]/g, '_');
          const rutaArchivo = path.join(pdfDir, nombreArchivoLimpio);

          fs.writeFileSync(rutaArchivo, pdfBuffer);

          console.log(`   ✅ ÉXITO: ${nombreArchivoLimpio} (${pdfBuffer.length} bytes)`);
          pdfDescargados++;
        } else {
          console.log(`   ❌ ERROR: PDF inválido (${pdfBuffer?.length || 0} bytes)`);
          erroresDescarga++;
        }

        // Mostrar progreso cada 5 PDFs
        if (indice % 5 === 0) {
          const porcentaje = Math.round((indice / total) * 100);
          const tasa = pdfDescargados > 0 ? Math.round((pdfDescargados / (pdfDescargados + erroresDescarga)) * 100) : 0;
          console.log(`📊 Progreso: ${indice}/${total} (${porcentaje}%) | Tasa éxito: ${tasa}%`);
        }

      } catch (error) {
        console.log(`   ❌ ERROR: ${error}`);
        erroresDescarga++;
      }
    }

    console.log(`\n🎉 FASE 2 OPTIMIZADA COMPLETADA!`);
    console.log(`📊 RESUMEN FINAL:`);
    console.log(`   • PDFs procesados: ${pdfDescargados + erroresDescarga}/${totalPdfs}`);
    console.log(`   • PDFs descargados exitosamente: ${pdfDescargados}`);
    console.log(`   • Errores de descarga: ${erroresDescarga}`);

    if (totalPdfs > 0) {
      const tasaExito = Math.round((pdfDescargados / totalPdfs) * 100);
      console.log(`   • Tasa de éxito: ${tasaExito}%`);

      if (tasaExito >= 80) {
        console.log(`   🏆 EXCELENTE RESULTADO!`);
      } else if (tasaExito >= 50) {
        console.log(`   👍 RESULTADO ACEPTABLE`);
      } else {
        console.log(`   ⚠️  RESULTADO BAJO - revisar errores`);
      }
    }

    // Mostrar ubicación de archivos descargados
    if (pdfDescargados > 0) {
      const pdfDir = path.join(__dirname, '..', 'datos', 'pdfs');
      console.log(`\n📁 PDFs descargados en: ${pdfDir}`);
    }

  } catch (error) {
    console.error('❌ Error en Fase 2 Optimizada:', error);
  } finally {
    await collector.cerrar();
    console.log('🏁 Navegador cerrado.');
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  ejecutarFase2Optimizado().catch(console.error);
}

export { ejecutarFase2Optimizado };
