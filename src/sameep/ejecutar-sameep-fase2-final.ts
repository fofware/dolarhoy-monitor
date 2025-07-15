import * as fs from 'fs';
import * as path from 'path';
import {
    DatosRecolectados,
    SameepDataCollector
} from './sameep-class';

async function ejecutarFase2Final() {
  console.log('🚀 Iniciando FASE 2 FINAL - Solución híbrida optimizada...');

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

  console.log(`📊 Datos cargados:`);
  console.log(`   • ${datosRecolectados.totalClientes} clientes`);
  console.log(`   • ${datosRecolectados.totalSuministros} suministros`);
  console.log(`   • ${datosRecolectados.totalComprobantes} comprobantes`);
  console.log(`   • ${datosRecolectados.totalComprobantesConPdf} con PDF disponible`);

  console.log(`\n🎯 ESTRATEGIA HÍBRIDA:`);
  console.log(`   ✅ Usar datos de Fase 1 para saber qué buscar`);
  console.log(`   ✅ Navegación dinámica para URLs frescas`);
  console.log(`   ✅ Descarga y validación de PDFs reales`);

  const collector = new SameepDataCollector();

  try {
    await collector.inicializarBrowser();
    console.log('✅ Navegador inicializado.');

    await collector.login();
    console.log('✅ Login completado.');

    // Contadores
    let clientesProcesados = 0;
    let pdfDescargados = 0;
    let erroresDescarga = 0;

    for (const cliente of datosRecolectados.clientes) {
      console.log(`\n🎯 [${clientesProcesados + 1}/${datosRecolectados.totalClientes}] Cliente: ${cliente.nombre}`);

      // Navegar al cliente usando el índice de la lista (0001, 0002, etc.)
      const indiceCliente = clientesProcesados; // 0, 1, 2...
      const idLista = String(indiceCliente + 1).padStart(4, '0'); // 0001, 0002, 0003...

      console.log(`   🔍 Navegando usando ID de lista: ${idLista} (cliente real: ${cliente.id})`);
      await collector.navegarAClientePorIndice(idLista);

      for (const suministro of cliente.suministros) {
        const comprobantesConPdf = suministro.comprobantes.filter((comp: any) => comp.tienePdf);

        if (comprobantesConPdf.length === 0) {
          continue;
        }

        console.log(`   📋 Suministro: ${suministro.calle} ${suministro.altura} (${comprobantesConPdf.length} PDFs)`);

        try {
          // Navegar al suministro específico
          await collector.navegarASuministro(suministro);

          // Procesar solo el primer PDF de cada suministro (para acelerar)
          const comprobante = comprobantesConPdf[0];

          try {
          console.log(`      📥 Descargando: ${comprobante.numeroComprobante}...`);

          // ✅ ESTRATEGIA EXITOSA: Hacer clic en botón PDF y esperar iframe
          console.log(`      🎯 Haciendo clic en botón PDF y esperando iframe...`);

          // 1. Hacer clic en el botón PDF (SIN cerrar popup)
          const clicExitoso = await collector.hacerClicEnBotonPDF(comprobante);

          if (clicExitoso) {
            // 2. Descargar el PDF usando estrategia de iframe (sin URL)
            const pdfBuffer = await collector.descargarPDF();

            if (pdfBuffer && pdfBuffer.length > 1000 && pdfBuffer.subarray(0, 4).toString('ascii') === '%PDF') {
              // ✅ GUARDAR PDF válido
              const nombreClienteLimpio = cliente.nombre.replace(/[^a-zA-Z0-9\s]/g, '_').replace(/\s+/g, '_');
              const pdfDir = path.join(__dirname, '..', 'datos', 'pdfs', nombreClienteLimpio);
              if (!fs.existsSync(pdfDir)) {
                fs.mkdirSync(pdfDir, { recursive: true });
              }

              const nombreArchivo = comprobante.nombreArchivoPdf || `${comprobante.numeroComprobante.replace(/[^a-zA-Z0-9\-_\.]/g, '_')}.pdf`;
              const nombreArchivoLimpio = nombreArchivo.replace(/[^a-zA-Z0-9\-_\.]/g, '_');
              const rutaArchivo = path.join(pdfDir, nombreArchivoLimpio);

              fs.writeFileSync(rutaArchivo, pdfBuffer);

              console.log(`      ✅ ÉXITO: ${nombreArchivoLimpio} (${pdfBuffer.length} bytes)`);
              pdfDescargados++;
            } else {
              console.log(`      ❌ ERROR: PDF inválido o muy pequeño (${pdfBuffer?.length || 0} bytes)`);
              erroresDescarga++;
            }
          } else {
            console.log(`      ❌ No se pudo hacer clic en botón PDF`);
            erroresDescarga++;
          }

        } catch (error) {
          console.log(`      ❌ Error procesando comprobante: ${error}`);
          erroresDescarga++;
        }

        } catch (error) {
          console.log(`   ❌ Error navegando al suministro ${suministro.calle} ${suministro.altura}: ${error}`);
          console.log(`   ⏭️  Continuando con siguiente suministro...`);
          erroresDescarga++;
        }
      }

      clientesProcesados++;

      // Mostrar progreso cada 3 clientes
      if (clientesProcesados % 3 === 0) {
        const porcentaje = Math.round((clientesProcesados / datosRecolectados.totalClientes) * 100);
        const tasa = pdfDescargados > 0 ? Math.round((pdfDescargados / (pdfDescargados + erroresDescarga)) * 100) : 0;
        console.log(`📊 Progreso: ${clientesProcesados}/${datosRecolectados.totalClientes} clientes (${porcentaje}%) | Tasa éxito: ${tasa}%`);
      }
    }

    console.log(`\n🎉 FASE 2 FINAL COMPLETADA!`);
    console.log(`📊 RESUMEN FINAL:`);
    console.log(`   • Clientes procesados: ${clientesProcesados}/${datosRecolectados.totalClientes}`);
    console.log(`   • PDFs descargados exitosamente: ${pdfDescargados}`);
    console.log(`   • Errores de descarga: ${erroresDescarga}`);

    const totalIntentos = pdfDescargados + erroresDescarga;
    if (totalIntentos > 0) {
      const tasaExito = Math.round((pdfDescargados / totalIntentos) * 100);
      console.log(`   • Tasa de éxito: ${tasaExito}%`);

      if (tasaExito >= 80) {
        console.log(`   🏆 EXCELENTE RESULTADO!`);
      } else if (tasaExito >= 50) {
        console.log(`   👍 RESULTADO ACEPTABLE`);
      } else {
        console.log(`   ⚠️  RESULTADO BAJO - revisar implementación`);
      }
    }

    // Mostrar ubicación de archivos descargados
    if (pdfDescargados > 0) {
      const pdfDir = path.join(__dirname, '..', 'datos', 'pdfs');
      console.log(`\n📁 PDFs descargados en: ${pdfDir}`);
    }

    // Mostrar problemas encontrados
    console.log(`\n🔍 ANÁLISIS:`);
    console.log(`   • URLs de Fase 1 contienen tokens de sesión que expiran`);
    console.log(`   • Servidor devuelve HTML con Content-Type: application/pdf (engañoso)`);
    console.log(`   • Solución: Navegación dinámica + validación %PDF`);

  } catch (error) {
    console.error('❌ Error en Fase 2 Final:', error);
  } finally {
    await collector.cerrar();
    console.log('🏁 Navegador cerrado.');
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  ejecutarFase2Final().catch(console.error);
}

export { ejecutarFase2Final };
