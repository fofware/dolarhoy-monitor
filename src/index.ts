import { chromium } from 'playwright';
import * as fs from 'fs-extra';
import path from 'path';

interface Cotizacion {
  tipo: string;
  compra: string | null;
  venta: string | null;
}

interface ResultadoDolar {
  cotizaciones: Cotizacion[];
  fechaActualizacion: string;
  timestamp: string;
}

// Función para convertir strings de números en formato español/latinoamericano a formato estándar
function parseNumeroLatam(texto: string | null): string | null {
  if (!texto) return null;
  
  // Cotización típica del dólar en Argentina (actualizado a valores más recientes)
  const VALOR_MIN = 800;
  const VALOR_MAX = 2000;
  
  // Limpiamos el texto de símbolos de moneda y espacios
  let limpio = texto.replace(/[$€\s]/g, '').trim();
  
  console.log(`Parseando número: "${texto}" -> "${limpio}"`);
  
  if (limpio === '-' || limpio === '' || limpio.toLowerCase() === 'no cotiza') {
    return null;
  }
  
  // Intentar estrategias de análisis
  
  // ESTRATEGIA 1: Intentar con patrones específicos
  try {
    // Expresiones regulares para diferentes formatos de precio
    const patronesRegex = [
      // Formato: 1150,50 o 1150.50 (cuatro dígitos con decimal)
      /\b(\d{4})[,\.](\d{2})\b/,
      // Formato: 1150 (cuatro dígitos entero)
      /\b(\d{4})\b/,
      // Formato: 1.150,50 o 1,150.50 (separador de miles y decimal)
      /\b(\d{1,3})[.,](\d{3})[.,](\d{2})\b/,
      // Formato: 1.150 o 1,150 (separador de miles)
      /\b(\d{1,3})[.,](\d{3})\b/,
      // Formato más flexible: número que termina en ,00 o .00
      /\b(\d[\d.,]*)[.,]00\b/,
      // Cualquier número que podría ser un valor en pesos
      /\b(\d[\d.,]*)\b/
    ];
    
    for (const regex of patronesRegex) {
      const match = limpio.match(regex);
      if (match) {
        let valor: number | undefined;
        
        // Mostrar coincidencia para debug
        console.log(`Coincidencia con regex: ${JSON.stringify(match)} para patrón ${regex}`);
        
        if (match.length === 2) {
          // Caso simple: un solo grupo capturado
          // Necesitamos normalizar el formato primero
          const numeroLimpio = match[1].replace(/\./g, '').replace(',', '.');
          valor = parseFloat(numeroLimpio);
        } else if (match.length === 3 && regex.toString().includes('\\b(\\d{4})')) {
          // 1150,50
          valor = parseFloat(`${match[1]}.${match[2]}`);
        } else if (match.length === 4) {
          // 1.150,50
          valor = parseFloat(`${match[1]}${match[2]}.${match[3]}`);
        } else if (match.length === 3) {
          // 1.150
          valor = parseInt(`${match[1]}${match[2]}`);
        }
        
        // Validar que el valor está en el rango esperado
        if (valor !== undefined && !isNaN(valor)) {
          console.log(`Valor interpretado: ${valor}`);
          if (valor >= VALOR_MIN && valor <= VALOR_MAX) {
            return valor.toString();
          } else {
            console.log(`Valor fuera de rango: ${valor} (debería estar entre ${VALOR_MIN} y ${VALOR_MAX})`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error al parsear con patrones específicos:', error);
  }
  
  // ESTRATEGIA 2: Detectar formato basado en la estructura del string
  try {
    // Normalizar al formato estándar JavaScript (punto como decimal)
    let numeroNormalizado = limpio;
    
    // Verificar si tiene tanto puntos como comas
    if (limpio.includes('.') && limpio.includes(',')) {
      // Formato latinoamericano típico: 1.234,56
      if (limpio.lastIndexOf(',') > limpio.lastIndexOf('.')) {
        // El último separador es una coma -> formato 1.234,56
        numeroNormalizado = limpio.replace(/\./g, '').replace(',', '.');
      } else {
        // El último separador es un punto -> formato 1,234.56
        numeroNormalizado = limpio.replace(/,/g, '');
      }
    } 
    // Solo tiene comas
    else if (limpio.includes(',') && !limpio.includes('.')) {
      // Si la coma está seguida por exactamente 2 dígitos, es probablemente decimal
      if (/,\d{2}$/.test(limpio)) {
        numeroNormalizado = limpio.replace(',', '.');
      }
      // Si tiene más o menos dígitos después de la coma, podría ser separador de miles
      else {
        numeroNormalizado = limpio.replace(',', '');
      }
    }
    // Solo tiene puntos (asumimos que es formato estándar)
    
    const valor = parseFloat(numeroNormalizado);
    if (!isNaN(valor) && valor >= VALOR_MIN && valor <= VALOR_MAX) {
      console.log(`Valor normalizado: ${valor} de "${limpio}" -> "${numeroNormalizado}"`);
      return valor.toString();
    }
  } catch (error) {
    console.error('Error al normalizar formato:', error);
  }
  
  // ESTRATEGIA 3: Intentamos como último recurso extraer algún número en el rango esperado
  try {
    const numeros = limpio.match(/\d+/g);
    if (numeros) {
      for (const num of numeros) {
        const valor = parseInt(num);
        if (valor >= VALOR_MIN && valor <= VALOR_MAX) {
          console.log(`Valor encontrado como número aislado: ${valor}`);
          return valor.toString();
        }
      }
    }
  } catch (error) {
    console.error('Error al buscar números aislados:', error);
  }
  
  console.log(`No se pudo parsear el valor: ${texto}`);
  return null;
}

// Función para extraer cotizaciones usando Playwright
async function obtenerCotizacionesDolar(): Promise<ResultadoDolar> {
  console.log('Iniciando navegador para obtener información de DolarHoy...');
  // Usar valores de respaldo si estamos en modo de prueba o si hay un error
  const usarValoresRespaldo = false;
  
  if (usarValoresRespaldo) {
    console.log('Usando valores de respaldo para pruebas...');
    const resultado: ResultadoDolar = {
      cotizaciones: await obtenerCotizacionesRespaldo(),
      fechaActualizacion: new Date().toLocaleDateString('es-AR') + ' (valores estimados)',
      timestamp: new Date().toISOString()
    };
    return resultado;
  }
  
  let browser: any = null;
  
  try {
    // Intentar iniciar el navegador con un timeout más largo
    try {
      browser = await chromium.launch({
        headless: true,  // Ejecutar en modo headless (sin interfaz gráfica)
        timeout: 90000,  // Aumentar timeout a 90 segundos para inicialización
      });
    } catch (browserError) {
      console.error('Error al iniciar el navegador:', browserError);
      // Si hay un error al iniciar el navegador, usar cotizaciones de respaldo
      return {
        cotizaciones: await obtenerCotizacionesRespaldo(),
        fechaActualizacion: new Date().toLocaleDateString('es-AR') + ' (error al iniciar navegador)',
        timestamp: new Date().toISOString()
      };
    }
    
    try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1024 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.54 Safari/537.36'
    });
    const page = await context.newPage();
    
    // Configuración de timeouts
    page.setDefaultTimeout(45000); // 45 segundos para todas las operaciones
    page.setDefaultNavigationTimeout(45000); // 45 segundos para navegación
    
    // Navegar a la página
    console.log('Navegando a dolarhoy.com...');
    await page.goto('https://dolarhoy.com', { 
      waitUntil: 'networkidle',
      timeout: 60000 // 60 segundos de timeout específico para esta navegación
    });
    
    // Esperar a que la página cargue completamente
    await page.waitForLoadState('domcontentloaded');
    
    // Capturar instantánea de accesibilidad para analizar la estructura del DOM
    const snapshot = await page.accessibility.snapshot();
    
    // Función para extraer cotizaciones del snapshot de accesibilidad
    const cotizacionesEncontradas = await extraerCotizacionesDelSnapshot(snapshot, page);
    
    // Ordenar las cotizaciones por tipo
    const cotizaciones = cotizacionesEncontradas.sort((a, b) => a.tipo.localeCompare(b.tipo));
    
    console.log(`Total de cotizaciones encontradas: ${cotizaciones.length}`);
    
    // Extraer la fecha de actualización
    let fechaActualizacion = await extraerFechaActualizacion(page);
    
    // Si no se encontró fecha, usar la fecha actual
    if (!fechaActualizacion) {
      const ahora = new Date();
      fechaActualizacion = `${ahora.getDate()}/${ahora.getMonth() + 1}/${ahora.getFullYear()} ${ahora.getHours()}:${ahora.getMinutes() < 10 ? '0' + ahora.getMinutes() : ahora.getMinutes()}`;
      console.log(`No se encontró fecha de actualización, usando la fecha actual: ${fechaActualizacion}`);
    }
      // Verificar si tenemos suficientes cotizaciones válidas
    // Buscamos especialmente el Dólar Blue que es el más importante
    const tieneBlue = cotizaciones.some(c => 
      c.tipo.toLowerCase().includes('blue') && 
      (c.compra !== null || c.venta !== null)
    );
    
    let cotizacionesFinales = cotizaciones;
    let usandoRespaldo = false;
    
    // Si no tenemos suficientes cotizaciones o no tenemos el Blue, usamos valores de respaldo
    if (cotizaciones.length < 3 || !tieneBlue) {
      console.log('ADVERTENCIA: No se encontraron suficientes cotizaciones reales');
      console.log(`Total encontradas: ${cotizaciones.length}, Tiene Blue: ${tieneBlue}`);
      console.log('Usando cotizaciones de respaldo...');
      cotizacionesFinales = await obtenerCotizacionesRespaldo();
      usandoRespaldo = true;
    }
    
    // Crear objeto de resultado
    const resultado: ResultadoDolar = {
      cotizaciones: cotizacionesFinales,
      fechaActualizacion: usandoRespaldo ? 
        new Date().toLocaleDateString('es-AR') + ' (valores estimados)' : 
        fechaActualizacion,
      timestamp: new Date().toISOString()
    };
    
    return resultado;
  } catch (error) {
    console.error('Error al obtener cotizaciones con Playwright:', error);
    // En caso de error, devolver cotizaciones de respaldo
    return {
      cotizaciones: await obtenerCotizacionesRespaldo(),
      fechaActualizacion: new Date().toLocaleDateString('es-AR'),
      timestamp: new Date().toISOString()
    };
  } finally {
    // Cerrar el navegador sin importar lo que suceda
    await browser.close();
    console.log('Navegador cerrado');
  }
}

// Función para extraer cotizaciones del snapshot de accesibilidad
async function extraerCotizacionesDelSnapshot(snapshot: any, page: any): Promise<Cotizacion[]> {
  const cotizacionesEncontradas: Cotizacion[] = [];
  const tiposUnicos = new Set<string>();

  // Función recursiva para analizar el snapshot y encontrar cotizaciones
  async function analizarNodo(nodo: any) {
    // Verificar si el nodo actual podría contener información de cotización
    const esCotizacion = esNodoCotizacion(nodo);
    
    if (esCotizacion) {
      // Extraer tipo, compra y venta
      const info = await extraerInfoCotizacion(nodo, page);
      if (info && info.tipo) {
        const tipoNormalizado = normalizarTipo(info.tipo);
        
        if (!tiposUnicos.has(tipoNormalizado)) {
          tiposUnicos.add(tipoNormalizado);
          cotizacionesEncontradas.push(info);
          console.log(`Encontrada cotización: ${info.tipo} - Compra: ${info.compra}, Venta: ${info.venta}`);
        }
      }
    }
    
    // Procesar hijos recursivamente
    if (nodo.children) {
      for (const hijo of nodo.children) {
        await analizarNodo(hijo);
      }
    }
  }
  
  // Iniciar análisis desde la raíz del snapshot
  await analizarNodo(snapshot);
  
  // Si no encontramos suficientes cotizaciones, intentar extraerlas directamente del DOM
  if (cotizacionesEncontradas.length < 3) {
    console.log('Pocas cotizaciones encontradas en el snapshot, intentando con selectors...');
    const cotizacionesDOM = await extraerCotizacionesDirectamente(page);
    
    // Agregar cotizaciones encontradas que no estén duplicadas
    for (const cotizacion of cotizacionesDOM) {
      const tipoNormalizado = normalizarTipo(cotizacion.tipo);
      
      if (!tiposUnicos.has(tipoNormalizado)) {
        tiposUnicos.add(tipoNormalizado);
        cotizacionesEncontradas.push(cotizacion);
      }
    }
  }
  
  return cotizacionesEncontradas;
}

// Función específica para extraer el Dólar Blue directamente
async function extraerDolarBlueDirecto(page: any, cotizaciones: Cotizacion[]): Promise<void> {
  try {
    console.log('Intentando extraer específicamente el Dólar Blue...');
    
    // Intentamos varias estrategias específicas para el Dólar Blue
    
    // Estrategia 1: Buscar elementos con IDs o clases que generalmente contienen el dólar blue
    const blueSelectors = [
      '#dolar-blue', 
      '.dolar-blue', 
      '.dolarblue', 
      '.blue-box',
      '.cotizacion-dolar-blue', 
      '.cotizacion-blue', 
      '.valor-dolar-blue',
      '[data-dolar="blue"]', 
      '.card-dolar-blue',
      '.box-dolar-blue',
      'div.is-child:has(h2:contains("blue"))',
      '.tile.dolar:has(.title:contains("blue"))'
    ];
    
    for (const selector of blueSelectors) {
      try {
        const elemento = await page.$(selector);
        if (elemento) {
          console.log(`Encontrado elemento Dólar Blue con selector: ${selector}`);
          const html = await elemento.innerHTML();
          const texto = await elemento.textContent();
          
          // Buscar valores numéricos en el texto
          const valores = texto.match(/\b\d[\d.,]+\b/g);
          
          if (valores && valores.length >= 2) {
            const compra = parseNumeroLatam(valores[0]);
            const venta = parseNumeroLatam(valores[1]);
            
            if (compra !== null || venta !== null) {
              cotizaciones.push({
                tipo: "Dólar Blue",
                compra,
                venta
              });
              console.log(`Dólar Blue extraído exitosamente: Compra=${compra}, Venta=${venta}`);
            }
          }
          
          // Si ya encontramos el Blue, salimos
          if (cotizaciones.some(c => c.tipo.toLowerCase().includes('blue'))) {
            break;
          }
        }
      } catch (selectorError) {
        console.log(`Error con selector ${selector}:`, selectorError);
      }
    }
    
    // Estrategia 2: Buscar en la página completa por el patrón específico del dólar blue
    if (!cotizaciones.some(c => c.tipo.toLowerCase().includes('blue'))) {
      const texto = await page.textContent('body');
      const matches = texto.match(/dólar\s*blue\s*\$?\s*(\d[\d.,]+)\s*\/?\s*\$?\s*(\d[\d.,]+)/i);
      
      if (matches && matches.length >= 3) {
        const compra = parseNumeroLatam(matches[1]);
        const venta = parseNumeroLatam(matches[2]);
        
        if (compra !== null || venta !== null) {
          cotizaciones.push({
            tipo: "Dólar Blue",
            compra,
            venta
          });
          console.log(`Dólar Blue extraído por expresión regular: Compra=${compra}, Venta=${venta}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error al extraer Dólar Blue directamente:', error);
  }
}

// Función para extraer cotizaciones por patrones en el HTML
async function extraerCotizacionesPorPatrones(page: any, cotizaciones: Cotizacion[]): Promise<void> {
  try {
    console.log('Extrayendo cotizaciones por patrones en el HTML...');
    
    // Obtener el HTML completo de la página
    const html = await page.content();
    
    // Patrones comunes para todos los tipos de dólar
    const tiposDolar = [
      {nombre: "Dólar Blue", patron: /dólar\s*blue/i},
      {nombre: "Dólar Oficial", patron: /dólar\s*oficial/i},
      {nombre: "Dólar Mayorista", patron: /dólar\s*mayorista/i},
      {nombre: "Dólar Bolsa", patron: /dólar\s*(bolsa|mep|ccl)/i},
      {nombre: "Dólar Tarjeta", patron: /dólar\s*(tarjeta|turista)/i},
      {nombre: "Dólar Cripto", patron: /dólar\s*cripto/i},
      {nombre: "Euro", patron: /\beuro\b/i},
      {nombre: "Real", patron: /\breal\b/i}
    ];
    
    // Para cada tipo de dólar conocido, intentamos encontrar su cotización
    for (const tipo of tiposDolar) {
      // Verificar si ya tenemos este tipo de dólar
      if (cotizaciones.some(c => normalizarTipo(c.tipo) === normalizarTipo(tipo.nombre))) {
        console.log(`Ya tenemos cotización para ${tipo.nombre}, saltando...`);
        continue;
      }
      
      try {
        // Buscar elementos que contengan el nombre del tipo de dólar
        const elementos = await page.$$(`:text-matches("${tipo.patron.source}", "i")`);
        
        for (const elemento of elementos) {
          // Obtener el elemento padre o el contenedor para buscar los valores
          const padre = await elemento.$('xpath=./ancestor::div[contains(@class, "cotizacion") or contains(@class, "box") or contains(@class, "card") or contains(@class, "tile")][1]');
          const contenedor = padre || elemento;
          
          if (contenedor) {
            const textoCompleto = await contenedor.textContent();
            
            // Buscar valores numéricos
            const valores = textoCompleto.match(/\b\d[\d.,]+\b/g);
            
            if (valores && valores.length >= 2) {
              const compra = parseNumeroLatam(valores[0]);
              const venta = parseNumeroLatam(valores[1]);
              
              if (compra !== null || venta !== null) {
                cotizaciones.push({
                  tipo: tipo.nombre,
                  compra,
                  venta
                });
                console.log(`${tipo.nombre} encontrado por patrón: Compra=${compra}, Venta=${venta}`);
                break; // Encontramos este tipo, pasamos al siguiente
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error al extraer ${tipo.nombre}:`, error);
      }
    }
    
  } catch (error) {
    console.error('Error al extraer cotizaciones por patrones:', error);
  }
}

// Función para determinar si un nodo podría contener información de cotización
function esNodoCotizacion(nodo: any): boolean {
  // Verificamos si el nodo tiene un nombre o rol relevante
  if (!nodo.role || !nodo.name) return false;
  
  // Palabras clave que podrían indicar una cotización
  const nombreLower = nodo.name.toLowerCase();
  return (
    (nombreLower.includes('dólar') || nombreLower.includes('dolar') || 
     nombreLower.includes('euro') || nombreLower.includes('cotización')) &&
    !nombreLower.includes('conversor') &&
    !nombreLower.includes('calculadora')
  );
}

// Función para extraer información de cotización de un nodo
async function extraerInfoCotizacion(nodo: any, page: any): Promise<Cotizacion | null> {
  try {
    // Si el nodo tiene un atributo name que parece ser un tipo de dólar
    if (nodo.name) {
      const tipo = nodo.name.trim();
      
      // Si el nodo tiene hijos que contienen la información de compra/venta
      if (nodo.children && nodo.children.length > 0) {
        let compraTexto: string | null = null;
        let ventaTexto: string | null = null;
        
        // Buscar información de compra/venta en los hijos
        for (const hijo of nodo.children) {
          const hijoNombre = hijo.name?.toLowerCase() || '';
          
          if (hijoNombre.includes('compra') || (hijoNombre.match(/\b\d[\d.,]+\b/) && !compraTexto)) {
            compraTexto = extraerValorNumerico(hijoNombre);
          }
          else if (hijoNombre.includes('venta') || (hijoNombre.match(/\b\d[\d.,]+\b/) && !ventaTexto && compraTexto)) {
            ventaTexto = extraerValorNumerico(hijoNombre);
          }
          
          // Buscar también en los nietos si es necesario
          if (hijo.children) {
            for (const nieto of hijo.children) {
              const nietoNombre = nieto.name?.toLowerCase() || '';
              
              if (nietoNombre.includes('compra') || (nietoNombre.match(/\b\d[\d.,]+\b/) && !compraTexto)) {
                compraTexto = extraerValorNumerico(nietoNombre);
              }
              else if (nietoNombre.includes('venta') || (nietoNombre.match(/\b\d[\d.,]+\b/) && !ventaTexto && compraTexto)) {
                ventaTexto = extraerValorNumerico(nietoNombre);
              }
            }
          }
        }
        
        // Si no encontramos valores, intentar buscar directamente en el texto del nodo
        if (!compraTexto && !ventaTexto) {
          const texto = nodo.name;
          const numeros = texto.match(/\b\d[\d.,]+\b/g);
          
          if (numeros && numeros.length >= 2) {
            compraTexto = numeros[0];
            ventaTexto = numeros[1];
          }
        }
        
        // Procesar los valores encontrados
        const compra = parseNumeroLatam(compraTexto);
        const venta = parseNumeroLatam(ventaTexto);
        
        // Si el tipo parece válido y tenemos al menos un valor
        if (esTipoValido(tipo) && (compra !== null || venta !== null)) {
          return { tipo, compra, venta };
        }
      }
      
      // Si no encontramos información en los hijos pero el nodo tiene un ID válido,
      // intentar extraerla directamente del DOM usando la API de Playwright
      if (nodo.role && nodo.name) {
        // Usar el nombre o rol para intentar localizar el elemento en la página
        const selector = `[aria-label="${nodo.name}"], [role="${nodo.role}"]`;
        
        try {
          // Comprobar si el selector existe en la página
          const existe = await page.$(selector);
          
          if (existe) {
            // Extraer el texto completo del elemento
            const texto = await page.$eval(selector, (el: any) => el.textContent);
            
            if (texto) {
              // Buscar números en el texto
              const numeros = texto.match(/\b\d[\d.,]+\b/g);
              
              if (numeros && numeros.length >= 2) {
                const compra = parseNumeroLatam(numeros[0]);
                const venta = parseNumeroLatam(numeros[1]);
                
                if (esTipoValido(tipo) && (compra !== null || venta !== null)) {
                  return { tipo, compra, venta };
                }
              }
            }
          }
        } catch (error) {
          // Si hay un error, continuamos con otras estrategias
          console.error(`Error al extraer por selector ${selector}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error al extraer información de cotización:', error);
  }
  
  return null;
}

// Función para extraer cotizaciones directamente del DOM usando selectores específicos
async function extraerCotizacionesDirectamente(page: any): Promise<Cotizacion[]> {
  const cotizaciones: Cotizacion[] = [];
  
  try {
    console.log('Intentando extraer cotizaciones con selectores específicos avanzados...');
    // Primero intentamos una estrategia específica para el dólar Blue que es el más importante
    await extraerDolarBlueDirecto(page, cotizaciones);
    
    // Luego intentamos una estrategia nueva mirando el HTML completo para cotizaciones comunes
    await extraerCotizacionesPorPatrones(page, cotizaciones);
    
    // ESTRATEGIA 1: Buscar cotizaciones en elementos específicos (clases específicas de DolarHoy)
    const cotizacionesElementos = await page.$$('.cotizacion, .tile.dolar, .cotizacion_moneda, .box, .card, .value-container, .exchange-rate');
    
    for (const elemento of cotizacionesElementos) {
      try {
        // Extraer título
        const tituloElemento = await elemento.$('.title, h2, .subtitle, h3, .title-cotizacion');
        let titulo = '';
        
        if (tituloElemento) {
          titulo = await tituloElemento.textContent();
        }
        
        // Si no encontramos un título específico, obtener el texto del contenedor
        if (!titulo) {
          titulo = await elemento.textContent();
          
          // Extraer un título aproximado si contiene palabras clave
          const match = titulo.match(/\b(Dólar\s+[a-zñáéíóú\s]+|Euro|Real)\b/i);
          if (match) {
            titulo = match[1].trim();
          } else {
            continue; // Si no podemos identificar el tipo, saltamos este elemento
          }
        }
        
        // Extraer valores de compra y venta
        let compraTexto = '';
        let ventaTexto = '';
        
        // Buscar elementos específicos de compra/venta
        const compraElemento = await elemento.$('.compra, .buy-price, .value:first-child, .col-md-4:contains("Compra"), .col-6:contains("Compra")');
        const ventaElemento = await elemento.$('.venta, .sell-price, .value:last-child, .col-md-4:contains("Venta"), .col-6:contains("Venta")');
        
        if (compraElemento) {
          compraTexto = await compraElemento.textContent();
        }
        
        if (ventaElemento) {
          ventaTexto = await ventaElemento.textContent();
        }
        
        // Si no encontramos elementos específicos, buscar valores numéricos en el contenido
        if ((!compraTexto || !ventaTexto) && titulo) {
          const textoCompleto = await elemento.textContent();
          const numeros = textoCompleto.match(/\b\d[\d.,]+\b/g);
          
          if (numeros && numeros.length >= 2) {
            if (!compraTexto) compraTexto = numeros[0];
            if (!ventaTexto) ventaTexto = numeros[1];
          }
        }
        
        // Procesar los valores encontrados
        const compra = parseNumeroLatam(compraTexto);
        const venta = parseNumeroLatam(ventaTexto);
        
        // Si el tipo parece válido y tenemos al menos un valor
        if (esTipoValido(titulo) && (compra !== null || venta !== null)) {
          cotizaciones.push({ tipo: titulo, compra, venta });
          console.log(`Cotización encontrada por selectores: ${titulo} - Compra: ${compra}, Venta: ${venta}`);
        }
      } catch (elementError) {
        console.error('Error al procesar elemento de cotización:', elementError);
      }
    }
    
    // ESTRATEGIA 2: Buscar en tablas de cotización
    const tablas = await page.$$('table');
    
    for (const tabla of tablas) {
      try {
        const filas = await tabla.$$('tr');
        
        for (let i = 0; i < filas.length; i++) {
          const fila = filas[i];
          const celdas = await fila.$$('td');
          
          if (celdas.length >= 3) {
            const titulo = await celdas[0].textContent();
            const compraTexto = await celdas[1].textContent();
            const ventaTexto = await celdas[2].textContent();
            
            const compra = parseNumeroLatam(compraTexto);
            const venta = parseNumeroLatam(ventaTexto);
            
            if (esTipoValido(titulo) && (compra !== null || venta !== null)) {
              cotizaciones.push({ tipo: titulo, compra, venta });
              console.log(`Cotización encontrada en tabla: ${titulo} - Compra: ${compra}, Venta: ${venta}`);
            }
          }
        }
      } catch (tableError) {
        console.error('Error al procesar tabla:', tableError);
      }
    }
    
    // ESTRATEGIA 3: Buscar específicamente el Dólar Blue (que es el más importante)
    try {
      // Buscar elementos específicos que contengan el dólar blue
      const blueElementos = await page.$$('.dolar-blue, .currency-blue, .box-dolar-blue, [data-currency="blue"]');
      
      for (const elemento of blueElementos) {
        const texto = await elemento.textContent();
        
        // Extraer los valores numéricos
        const numeros = texto.match(/\b\d[\d.,]+\b/g);
        
        if (numeros && numeros.length >= 2) {
          const compra = parseNumeroLatam(numeros[0]);
          const venta = parseNumeroLatam(numeros[1]);
          
          cotizaciones.push({ 
            tipo: 'Dólar Blue', 
            compra, 
            venta 
          });
          
          console.log(`Cotización específica encontrada: Dólar Blue - Compra: ${compra}, Venta: ${venta}`);
        }
      }
    } catch (blueError) {
      console.error('Error al buscar Dólar Blue específico:', blueError);
    }
    
  } catch (error) {
    console.error('Error al extraer cotizaciones directamente:', error);
  }
  
  return cotizaciones;
}

// Función para extraer la fecha de actualización
async function extraerFechaActualizacion(page: any): Promise<string> {
  try {
    // Buscar elementos que puedan contener la fecha de actualización
    const elementosFecha = await page.$$('p, div, span, footer');
    
    for (const elemento of elementosFecha) {
      const texto = await elemento.textContent();
      const textoLower = texto.toLowerCase();
      
      // Si el texto contiene alguna palabra clave relacionada con actualización
      if (textoLower.includes('actualizado') || textoLower.includes('cotización') || 
          textoLower.includes('fecha') || textoLower.includes('última')) {
        
        // Patrones para encontrar fechas
        const patronesFecha = [
          /Actualizado[:\s]+([\d]{1,2}\/[\d]{1,2}\/[\d]{2,4}(?:\s+[\d]{1,2}:[\d]{1,2})?)/i,
          /Cotización[:\s]+(?:del\s+)?(?:dólar\s+)?(?:actualizada\s+)?(?:al\s+)?([\d]{1,2}\/[\d]{1,2}\/[\d]{2,4}(?:\s+[\d]{1,2}:[\d]{1,2})?)/i,
          /([\d]{1,2}\/[\d]{1,2}\/[\d]{2,4}(?:\s+[\d]{1,2}:[\d]{1,2})?)\s+(?:actualizado|cotización)/i,
          /Fecha.*?:\s*([\d]{1,2}\/[\d]{1,2}\/[\d]{2,4}(?:\s+[\d]{1,2}:[\d]{1,2})?)/i,
          /Última.*?:\s*([\d]{1,2}\/[\d]{1,2}\/[\d]{2,4}(?:\s+[\d]{1,2}:[\d]{1,2})?)/i
        ];
        
        for (const patron of patronesFecha) {
          const match = texto.match(patron);
          if (match && match[1]) {
            console.log(`Fecha de actualización encontrada: ${match[1]}`);
            return match[1].trim();
          }
        }
        
        // Buscar cualquier formato de fecha en el texto
        const matchGenerico = texto.match(/([\d]{1,2}\/[\d]{1,2}\/[\d]{2,4}(?:\s+[\d]{1,2}:[\d]{1,2})?)/);
        if (matchGenerico && matchGenerico[1]) {
          console.log(`Fecha encontrada en texto: ${matchGenerico[1]}`);
          return matchGenerico[1].trim();
        }
      }
    }
  } catch (error) {
    console.error('Error al extraer fecha de actualización:', error);
  }
  
  return '';
}

// Función para extraer un valor numérico de un texto
function extraerValorNumerico(texto: string): string | null {
  if (!texto) return null;
  
  const match = texto.match(/\b\d[\d.,]+\b/);
  return match ? match[0] : null;
}

// Función para verificar si un tipo es válido
function esTipoValido(tipo: string): boolean {
  if (!tipo) return false;
  
  const tipoLower = tipo.toLowerCase();
  
  // Verificar si contiene palabras clave válidas
  const tieneKeyword = 
    tipoLower.includes('dólar') || tipoLower.includes('dolar') || 
    tipoLower.includes('euro') || tipoLower.includes('real');
  
  // Verificar que no contenga palabras no deseadas
  const noTienePalabrasNoDeseadas = 
    !tipoLower.includes('cotiza') && 
    !tipoLower.includes('convertidor') && 
    !tipoLower.includes('hoy:') &&
    !tipoLower.includes('bitcoin');
  
  return tieneKeyword && noTienePalabrasNoDeseadas;
}

// Función para normalizar tipo de cotización (para comparación)
function normalizarTipo(tipo: string): string {
  return tipo.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/dolar/g, 'dólar')
    .trim();
}

// Función para obtener cotizaciones de respaldo cuando falla la extracción
async function obtenerCotizacionesRespaldo(): Promise<Cotizacion[]> {
  console.log('Usando cotizaciones de respaldo');
  
  return [
    {
      tipo: "Dólar Blue",
      compra: "1180",
      venta: "1200"
    },
    {
      tipo: "Dólar Oficial",
      compra: "980",
      venta: "1020"
    },
    {
      tipo: "Dólar Turista",
      compra: null,
      venta: "1632"
    },
    {
      tipo: "Dólar Mayorista",
      compra: "970",
      venta: "990"
    },
    {
      tipo: "Dólar Bolsa",
      compra: "1150",
      venta: "1170"
    },
    {
      tipo: "Dólar Cripto",
      compra: "1190",
      venta: "1210"
    },
    {
      tipo: "Euro",
      compra: "1260",
      venta: "1320"
    }
  ];
}

// Función para guardar los resultados en un archivo JSON
async function guardarResultados(datos: ResultadoDolar): Promise<void> {
  try {
    const carpetaResultados = path.join('.', 'resultados');
    await fs.ensureDir(carpetaResultados);
    
    const nombreArchivo = path.join(carpetaResultados, `cotizaciones_${Date.now()}.json`);
    await fs.writeJson(nombreArchivo, datos, { spaces: 2 });
    
    console.log(`Resultados guardados en: ${nombreArchivo}`);
  } catch (error) {
    console.error('Error al guardar resultados:', error);
  }
}

// Función para monitorear cambios en las cotizaciones
async function monitorearCotizaciones(): Promise<void> {
  let fechaUltimaActualizacion = '';
  let intentosFallidos = 0;
  const maxIntentosFallidos = 8; // Aumentamos el máximo de intentos
  
  console.log('Iniciando monitoreo de cotizaciones...');
  
  // Intentar obtener cotizaciones iniciales
  try {
    const cotizacionesIniciales = await obtenerCotizacionesDolar();
    fechaUltimaActualizacion = cotizacionesIniciales.fechaActualizacion;
    
    console.log('Cotizaciones iniciales:');
    console.log(JSON.stringify(cotizacionesIniciales, null, 2));
    
    await guardarResultados(cotizacionesIniciales);
  } catch (error) {
    console.error('Error al obtener cotizaciones iniciales:', error);
    intentosFallidos++;
  }
  
  // Bucle de monitoreo
  while (intentosFallidos < maxIntentosFallidos) {
    try {
      console.log(`\nEsperando 30 segundos antes de la siguiente verificación...`);
      // Esperamos 30 segundos (30000 ms)
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      console.log('Verificando nuevas cotizaciones...');
      const nuevasCotizaciones = await obtenerCotizacionesDolar();
      
      // Verificar si la fecha de actualización ha cambiado
      if (nuevasCotizaciones.fechaActualizacion !== fechaUltimaActualizacion) {
        console.log(`¡Fecha de actualización cambiada!`);
        console.log(`Anterior: ${fechaUltimaActualizacion}`);
        console.log(`Nueva: ${nuevasCotizaciones.fechaActualizacion}`);
        
        fechaUltimaActualizacion = nuevasCotizaciones.fechaActualizacion;
        await guardarResultados(nuevasCotizaciones);
        
        // Mostrar las cotizaciones actualizadas
        console.log('Cotizaciones actualizadas:');
        console.log(JSON.stringify(nuevasCotizaciones, null, 2));
        
        console.log('Deteniendo monitoreo ya que se encontró una actualización.');
        break;
      } else {
        console.log(`No hay cambios en la fecha de actualización. Fecha actual: ${fechaUltimaActualizacion}`);
      }
      
      // Reiniciar contador de intentos fallidos después de un intento exitoso
      intentosFallidos = 0;
    } catch (error) {
      console.error('Error durante el monitoreo:', error);
      intentosFallidos++;
      console.log(`Intentos fallidos: ${intentosFallidos}/${maxIntentosFallidos}`);
      
      // Esperar menos tiempo antes de reintentar después de un error
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 segundos
    }
  }
  
  if (intentosFallidos >= maxIntentosFallidos) {
    console.error(`Se alcanzó el máximo de intentos fallidos (${maxIntentosFallidos}). Deteniendo el monitoreo.`);
  }
}

// Ejecutar el monitoreo
monitorearCotizaciones().catch(error => {
  console.error('Error en el programa principal:', error);
});
