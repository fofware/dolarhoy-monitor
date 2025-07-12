import * as dotenv from "dotenv"; // Importar dotenv
import * as fs from "fs-extra";
import { Collection, Db, MongoClient } from "mongodb"; // Importaciones de MongoDB
import * as path from "path";
import { chromium, devices } from "playwright";

dotenv.config(); // Cargar variables de entorno desde .env

// Configuración de MongoDB
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const DB_NAME = "dolarhoy";
const COLLECTION_NAME = "cotizaciones";
const RUTA_ARCHIVO_DEBUG = path.join(
  __dirname,
  "..",
  "resultados",
  "cotizaciones_debug.json"
);
const CREAR_ARCHIVO_DEBUG = false; // Cambiar a true para guardar también en archivo JSON
const RUTA_ARCHIVO_PICTURE = path.join(
  __dirname,
  "..",
  "pictures",
  "page_debug.png"
); // Ruta para guardar la captura de pantalla

interface Cotizacion {
  name: string;
  compra: string | null;
  venta: string | null;
  TimeStamp?: string;
}

interface ResultadoDolar {
  cotizaciones: Cotizacion[];
  fechaActualizacion: string;
  timestamp: string;
}

let intervaloMonitoreo = 120000; // 120 segundos
let monitorErrorCount = 0; // Contador de errores de monitoreo

let navegadorAbierto = false;
let mongoClient: MongoClient | null = null;
let db: Db | null = null;
let cotizacionesCollection: Collection<any> | null = null;
let lastData = {};
let newData = {};

async function leerUltimasCotizaciones(): Promise<any> {
  if (!cotizacionesCollection) return;
  const pipeline = [
    { $sort: { TimeStamp: -1 } },
    {
      $group: {
        _id: "$name",
        compra: { $first: "$compra" },
        venta: { $first: "$venta" },
        TimeStamp: { $first: "$TimeStamp" },
      },
    },
    { $sort: { _id: 1 } },
  ];

  try {
    const Data = {};
    const result = await cotizacionesCollection.aggregate(pipeline).toArray();
    if (result.length > 0) {
      result.map((c) => {
        Data[c._id] = {
          name: c._id,
          compra: c.compra,
          venta: c.venta,
          TimeStamp: c.TimeStamp,
        };
      });
    }
    return Data;
  } catch (error) {
    console.error("Error al obtener las últimas cotizaciones de la DB:", error);
    return {};
  }
}

const dataToArray = (data: any = {}): any[] => {
  const result: any[] = [];

  for (const key in data) {
    if (lastData.hasOwnProperty(key)) {
      const c = lastData[key];
      result.push({
        name: c.name,
        compra: c.compra,
        venta: c.venta,
        TimeStamp: new Date(c.TimeStamp.toISOString("es-AR")),
      });
    }
  }
  return result;
};

const mostrarData = (result: any[]): void => {
  //console.table(lastData, ["compra", "venta", "TimeStamp"]);
  if (result.length > 0) {
    console.table(
      result.map((c) => ({
        Moneda: c.name,
        Compra: c.compra,
        Venta: c.venta,
        //Compra: c.compra ? c.compra.toFixed(2) : "Sin datos",
        //Venta: c.venta ? c.venta.toFixed(2) : "Sin datos",
        "Fecha Registro DB": c.TimeStamp,
      }))
    );
  }
};

function mostrarUltimasCotizaciones(data: any = {}) {
  const result = dataToArray(data);
  if (result.length === 0) {
    console.log("No hay cotizaciones registradas en la base de datos.");
    return;
  }
  console.log(`Se encontraron ${result.length} tipos de cotizaciones.`);
  mostrarData(result);
  const masReciente = result.reduce((a, b) =>
    new Date(a.TimeStamp) > new Date(b.TimeStamp) ? a : b
  );
  console.log(
    `\nÚltima cotización registrada: ${masReciente.name} - Compra: ${masReciente.compra}, Venta: ${masReciente.venta} Fecha: ${masReciente.TimeStamp}`
  );
}

async function conectarMongoDB() {
  if (mongoClient) {
    // Simplificar la comprobación de conexión
    console.log(
      "Cliente MongoDB ya inicializado. Verificando estado de conexión..."
    );
    // La API de MongoDB v4+ no tiene un método isConnected() síncrono sencillo.
    // La conexión se maneja internamente y los comandos fallarán si no está conectado.
    // Se puede intentar un ping para verificar la conexión activa si es necesario.
    try {
      await mongoClient.db(DB_NAME).command({ ping: 1 });
      console.log("Ya conectado a MongoDB (ping exitoso).");
      return;
    } catch (pingError) {
      console.log("Ping a MongoDB falló, intentando reconectar...", pingError);
      // Proceder a reconectar
    }
  }
  try {
    console.log(`Intentando conectar a MongoDB con URL: ${MONGO_URL}`);
    mongoClient = new MongoClient(MONGO_URL); // Opciones useNewUrlParser y useUnifiedTopology son obsoletas
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    cotizacionesCollection = db.collection(COLLECTION_NAME);
    console.log("🔌 Conectado a MongoDB exitosamente.");
    // Crear índice para búsqueda eficiente si no existe
    await cotizacionesCollection.createIndex(
      { TimeStamp: 1, name: 1 },
      { unique: false }
    ); // Cambiado tipo por name
    await cotizacionesCollection.createIndex({ timestamp: 1 });
    lastData = await leerUltimasCotizaciones();
    mostrarUltimasCotizaciones(lastData);
    /*
    const agg1 = [
      {
        $sort: {
          TimeStamp: -1,
        },
      },
      {
        $group: {
          _id: "$name",
          compra: {
            $first: "$compra",
          },
          venta: {
            $first: "$venta",
          },
          TimeStamp: {
            $first: "$TimeStamp",
          }
        },
      },
    ];

    const cursor = cotizacionesCollection.aggregate(agg1);
    const result = await cursor.toArray();
    console.log(result);
    for (const doc of result) {
      if (doc._id) {
        lastData[doc._id] = {
          name: doc._id,
          compra: doc.compra,
          venta: doc.venta,
          TimeStamp: doc.TimeStamp
        };
      } else {
        console.warn(
          `Documento incompleto en la colección: ${JSON.stringify(doc)}`
        );
      }
    }
    console.log(
      `Datos iniciales cargados desde MongoDB: ${
        Object.keys(lastData).length
      } tipos de cotizaciones.`
    );
    console.log(lastData);
    */
  } catch (error) {
    console.error("Error al conectar con MongoDB:", error);
    // Considerar reintentar o manejar el error de forma más robusta
    throw error; // Propagar el error para que el monitoreo no inicie si la BD no está disponible
  }
}

async function desconectarMongoDB() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
    cotizacionesCollection = null;
    console.log("🔌 Desconectado de MongoDB.");
  }
}

function normalizarNombreDolar(nombreExtraido: string | null): string | null {
  if (!nombreExtraido || nombreExtraido.trim() === "") return null;

  let nombre = nombreExtraido.trim();

  // Tomar solo la primera línea si hay saltos de línea (para eliminar \nCompra, etc.)
  nombre = nombre.split("\n")[0].trim();
  // Quitar " COMPRA" o " VENTA" si están al final, después del split por \n
  nombre = nombre.replace(/(\s+COMPRA|\s+VENTA)$/i, "").trim();

  const lowerNombre = nombre.toLowerCase();

  if (
    lowerNombre.includes("blue") ||
    lowerNombre.includes("libre") ||
    lowerNombre === "dolar hoy" ||
    lowerNombre === "dólar hoy"
  ) {
    return "Dólar Blue";
  }
  if (lowerNombre.includes("oficial")) {
    return "Dólar Oficial";
  }
  if (lowerNombre.includes("tarjeta") || lowerNombre.includes("turista")) {
    return "Dólar Tarjeta";
  }
  if (lowerNombre.includes("bolsa") || lowerNombre.includes("mep")) {
    return "Dólar MEP";
  }
  if (
    lowerNombre.includes("ccl") ||
    lowerNombre.includes("contado con liqui") ||
    lowerNombre.includes("contado c/ liqui.")
  ) {
    return "Dólar CCL";
  }
  if (lowerNombre.includes("cripto")) {
    // Añadido por si aparece
    return "Dólar Cripto";
  }
  if (lowerNombre.includes("mayorista")) {
    return "Dólar Mayorista";
  }
  if (lowerNombre.includes("euro")) {
    // Añadido por si aparece
    return "Euro";
  }
  if (lowerNombre.includes("real")) {
    // Añadido por si aparece
    return "Real Brasileño";
  }
  if (lowerNombre.includes("uruguayo")) {
    // Añadido por si aparece
    return "Peso Uruguayo";
  }
  if (lowerNombre.includes("chileno")) {
    // Añadido por si aparece
    return "Peso Chileno";
  }

  // Si es un tipo desconocido pero empieza con "Dólar", lo aceptamos con formato capitalizado.
  if (lowerNombre.startsWith("dolar ") || lowerNombre.startsWith("dólar ")) {
    const partes = nombre.split(/\s+/); // Usar el 'nombre' original (antes de toLowerCase) para mantener capitalización
    if (partes.length >= 2) {
      // Capitalizar "Dólar" y la siguiente palabra/s. Ej: "Dólar Otro Tipo"
      const tipoEspecifico = partes
        .slice(1)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(" ");
      return `Dólar ${tipoEspecifico}`;
    }
  }

  //console.log(`Tipo no reconocido o no normalizable: "${nombreExtraido}" -> procesado a "${nombre}"`);
  return null;
}

const creaReg = (data: string, campo: string = ""): any => {
  if (!data || data.trim() === "") {
    console.error(
      `❌ Error: Datos vacíos o nulos en creaReg procesando "${campo}"`
    );
    return null; // Retornar null si los datos están vacíos
  }
  //console.log(`Procesando datos en creaReg: "${data}"`);
  // Normalizar el texto y dividir por líneas
  const adata = data.toLowerCase().split("\n"); // Normalizar el texto
  const ret: any = {
    name: normalizarNombreDolar(adata[0].trim()),
    compra: parseFloat(adata[1].trim().replace(",", ".").trim()),
    venta: parseFloat(adata[2].trim().replace(",", ".").trim()),
  };
  return ret;
};

/**
 * Esta función es para los datos que vienen de la tabla de valores grande de arriba.
 * Normaliza el nombre del tipo de dólar y extrae los valores de compra y venta.
 * @param data Es
 * @returns
 */
const creaReg1 = (data: string): any => {
  if (!data || data.trim() === "") {
    console.error("❌ Error: Datos vacíos o nulos en creaReg1");
    return null; // Retornar null si los datos están vacíos
  }
  //console.log(`Procesando datos en creaReg1: "${data}"`);
  const adata = data.toLowerCase().split("\n"); // Normalizar el texto
  const ret: any = {};
  ret["name"] = normalizarNombreDolar(adata[0].trim());
  for (let i = 1; i < adata.length - 1; i += 2) {
    const value = parseFloat(
      adata[i + 1].replace("$", "").replace(",", ".").trim()
    );
    if (isNaN(value)) {
      console.error(
        `Valor no numérico encontrado en la línea ${i + 1}: "${adata[i + 1]}"`
      );
      continue; // Saltar este valor si no es numérico
    }
    ret[adata[i]] = value; // Normalizar el valor
  }
  return ret;
};

const addToData = (data: any, contData: any): void => {
  if (!data || typeof data !== "object") {
    console.error("❌ Error: Datos vacíos o no son un objeto en addNewData");
    return; // Retornar si los datos no son válidos
  }
  contData[data.name] = data;
};

/*
const creaFecha = (fecha: string): string => {
  console.log(`Creando fecha a partir de: "${fecha}"`);
  const dh = fecha.split(" ");
  const t = dh[1].split(":");
  const d = dh[0].split("/");
  console.log(dh, t, d);
  let hora = parseInt(t[0], 10) + 3; // Ajustar a GMT-3
  console.log(`Hora ajustada a GMT-3: ${hora}`);
  if (dh[2].toUpperCase() === "PM" || dh[2].toUpperCase() === "P.M.") {
    if (hora < 12) {
      hora += 12; // Convertir a formato 24 horas si es PM
      console.log(
        `Hora convertida a 24 horas: ${hora} (AM/PM detectado como PM)`
      );
    }
  }
  if (hora >= 24) {
    hora -= 24; // Ajustar si la hora es mayor o igual a 24
    d[0] = (parseInt(d[0], 10) + 1).toString().padStart(2, "0"); // Incrementar el día
    console.log(
      `Hora mayor o igual a 24, ajustada a: ${hora}, día incrementado a: ${d[0]}`
    );
  }

  t[0] = hora.toString().padStart(2, "0"); // Asegurar que la hora tenga dos dígitos
  console.log(`Hora final ajustada: ${t[0]}:${t[1]}`);
  const ret = `${parseInt(d[2], 10) + 2000}-${d[1]}-${d[0]}T${t[0]}:${
    t[1]
  }:00.000Z`; // Formato DD/MM/YYYY HH:mm:ss
  //newData["fechaActualizacion"] = ret; // Guardar en newData
  return ret; // Retornar la fecha en formato ISO 8601
};
*/
// Función principal para extraer cotizaciones
async function extraerCotizaciones(page: any): Promise<void> {
  // Extraer datos de la página
  newData = {}; // Reiniciar newData si el navegador no está conectado
  try {
    await page.waitForSelector("div.tile.dolar", { timeout: 240000 });
    const d1 = await page
      .locator("div.tile.dolar")
      .locator("div.tile.is-parent.is-7.is-vertical")
      .locator("div.tile.is-child");
    for (const d of await d1.allInnerTexts()) {
      addToData(creaReg1(d), newData); // Usar locator para seleccionar los elementos de valor
    }
    await page.waitForSelector("div.tile.is-parent.is-6.is-vertical.entidad", {
      timeout: 240000,
    });
    const dolar = await page.locator(
      "div.tile.is-parent.is-6.is-vertical.entidad"
    );
    addToData(
      creaReg(
        await dolar.locator("a", { hasText: "Libre" }).innerText(),
        "Libre"
      ),
      newData
    ); // Usar locator para seleccionar los elementos de valor
    addToData(
      creaReg(
        await dolar.locator("a", { hasText: "Mayo" }).innerText(),
        "Mayo"
      ),
      newData
    ); // Usar locator para seleccionar los elementos de valor
    addToData(
      creaReg(
        await dolar.locator("a", { hasText: "liqui" }).innerText(),
        "liqui"
      ),
      newData
    ); // Usar locator para seleccionar los elementos de valor
    addToData(
      creaReg(await dolar.locator("a", { hasText: "MEP" }).innerText(), "mep"),
      newData
    ); // Usar locator para seleccionar los elementos de valor

    await page.waitForSelector("div.tile.is-parent.is-6.is-vertical.moneda", {
      timeout: 240000,
    });
    const monedas = await page.locator(
      "div.tile.is-parent.is-6.is-vertical.moneda"
    );
    addToData(
      creaReg(
        await monedas.locator("a", { hasText: "Euro" }).innerText(),
        "Euro"
      ),
      newData
    ); // Usar locator para seleccionar los elementos de valor
    addToData(
      creaReg(
        await monedas.locator("a", { hasText: "Real" }).innerText(),
        "Real"
      ),
      newData
    ); // Usar locator para seleccionar los elementos de valor
    addToData(
      creaReg(
        await monedas.locator("a", { hasText: "uruguayo" }).innerText(),
        "Uruguayo"
      ),
      newData
    ); // Usar locator para seleccionar los elementos de valor
    addToData(
      creaReg(
        await monedas.locator("a", { hasText: "chileno" }).innerText(),
        "chileno"
      ),
      newData
    ); // Usar locator para seleccionar los elementos de valor
  } catch (error) {
    console.error("❌ Error general al extraer datos:", error);
    monitorErrorCount++;
    if (monitorErrorCount >= 3) {
      console.error(
        "Se han producido demasiados errores de monitoreo consecutivos. Deteniendo el monitoreo."
      );
    }
  } finally {
    if (monitorErrorCount === 0)
      intervaloMonitoreo = 30000; // Reiniciar el intervalo si no hubo errores
    else if (monitorErrorCount >= 3) {
      intervaloMonitoreo = 600000; // Aumentar el intervalo a 10 minutos si hubo errores
      console.warn(
        `Intervalo de monitoreo aumentado a ${
          intervaloMonitoreo / 1000
        } segundos debido a errores consecutivos.`
      );
    } else {
      intervaloMonitoreo = 10000; // Mantener reintentar mas rápido si hubo errores, pero no demasiados
      console.warn(
        `Intervalo de monitoreo reducido a ${
          intervaloMonitoreo / 1000
        } segundos debido a errores.`
      );
    }
  }
}
const comparaDatos = async (): Promise<any[]> => {
  const cambiosDetectados: any[] = [];
  const fechaActualizacion = new Date();
  const changesDetected:any[] = [];
  const changedValues = {};
  for (const key in newData) {
    if (Object.prototype.hasOwnProperty.call(newData, key)) {
      if (typeof newData[key] === "object") {
        let changed = false;
        // Si el objeto ya existe en lastData, lo actualizamos
        if (Object.prototype.hasOwnProperty.call(lastData, key)) {
          for (const subKey in newData[key]) {
            if (subKey === "indice") continue; // No comparar el nombre, ya que es el identificador
            if (Object.prototype.hasOwnProperty.call(newData[key], subKey)) {
              // Si el subKey ya existe en lastData[key], lo actualizamos
              if (Object.prototype.hasOwnProperty.call(lastData[key], subKey)) {
                if (lastData[key][subKey] !== newData[key][subKey]) {
                  //lastData[key][subKey] = newData[key][subKey];
                  changed = true;
                  changedValues[`${key}.${subKey}`] = {
                    Antes: lastData[key][subKey],
                    Ahora: newData[key][subKey],
                    Fecha: fechaActualizacion
                  };
                  changesDetected.push(
                    {
                      Nombre: `${key}.${subKey}`,
                      Antes: lastData[key][subKey],
                      Ahora: newData[key][subKey],
                      Fecha: fechaActualizacion
                    }
                  );
                  //console.log(`(1) Cambiando ${key}.${subKey} de ${lastData[key][subKey]} a ${newData[key][subKey]}`);
                }
              } else {
                // Si es un nuevo subKey, lo inicializamos
                changed = true;
                  changesDetected.push(
                    {
                      Nombre: `${key}.${subKey}`,
                      Antes: lastData[key] ? lastData[key][subKey] : null,
                      Ahora: newData[key][subKey],
                      Fecha: fechaActualizacion
                    }
                  );

                //lastData[key][subKey] = newData[key][subKey];
                //console.log(`(2) Agregando nuevo subKey ${key}.${subKey} en lastData con valor ${newData[key][subKey]}`);
              }
            }
          }
        } else {
          changed = true;
          //lastData[key] = { ...newData[key] };
          for (const subKey in newData[key]) {
            changesDetected.push(
              {
                Nombre: `${key}.${subKey}`,
                Antes: lastData[key][subKey],
                Ahora: newData[key][subKey],
                Fecha: fechaActualizacion
              }
            );
          }
          //console.log(`(3) Agregando cotización ${key} en lastData con valor ${JSON.stringify(newData[key])}`);
        }
        if (changed) {
          newData[key]["TimeStamp"] = fechaActualizacion; // Timestamp de cuándo se guardó en nuestra BD
          cambiosDetectados.push(newData[key]);
          //lastData[key] = { ...newData[key] };
        }
      } else {
        console.log("saniObject object-NoCall", key);
      }
    }
  }
  if (Object.keys(changedValues).length > 0) {
    console.log("Cambios detectados:", changedValues);
    //console.table(changesDetected);
    //console.table(changedValues);
  }

  /*
  if (cambiosDetectados.length === 0) {
    console.log(
      "No se detectaron cambios en las cotizaciones. No se guardaron datos."
    );
  } else {
    console.table(
      cambiosDetectados.map((c) => ({
        Nombre: c.name,
        Compra: c.compra,
        Venta: c.venta,
        Fecha: new Date(c.TimeStamp.toISOString("es-AR")),
      }))
    );
    console.log(cambiosDetectados.length, "Cambio(s) Guardados(s)");
  }
  */
  return cambiosDetectados
};

const cargaPagina = async (browser: any): Promise<void> => {
  if (!browser || !browser.isConnected()) {
    console.error(
      "Error CRÍTICO: El navegador proporcionado no está conectado o no existe."
    );
    return;
  }

  let page: any = null;
  try {
    const context = await browser.newContext(devices["iPhone 11"]);
    page = await context.newPage();
    page.setDefaultTimeout(240000);
    page.setDefaultNavigationTimeout(240000);
    /*
    page.on("domcontentloaded", async() =>{
            //console.log("Evento: DOM content loaded (domcontentloaded)");
    } );
    page.on("load", async () => {
      //console.log("Evento: page loaded (load)");
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        //console.error(`Error de Red: ${response.status()} ${response.url().substring(0,100)}`);
      }
      //console.log(`Respuesta de red: ${response.status()} ${response.url().substring(0,100)}`);
    });
    page.on("pageerror", (error) => {
      //console.error(`Error en la página (pageerror): ${error.message.substring(0,200)}`);
    });
    page.on("requestfailed", (request) => {
      //if  ((request.failure()?.errorText) && request.failure()?.errorText.includes('net::ERR_ABORTED')) return
      //console.error(`Fallo de Petición (requestfailed): ${request.failure()?.errorText} ${request.url().substring(0,100)}`);
    });
    */
    /*
    page.on("console", (msg) => {
      console.log(
        `PÁGINA: ${msg.type()} - ${msg.text().substring(0, 100)}${
          msg.text().length > 100 ? "..." : ""
        }`
      );
    });
    */
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      const blockedTypes = ["image", "stylesheet", "font", "media", "other"]; // 'other' puede bloquear XHR/fetch si no se tiene cuidado
      // No bloquear 'script' ni 'document' ni 'xhr' ni 'fetch' inicialmente
      if (blockedTypes.includes(resourceType)) {
        // console.log(`Bloqueando recurso: ${resourceType} - ${route.request().url().substring(0,60)}`);
        route.abort();
      } else {
        // console.log(`Permitiendo recurso: ${resourceType} - ${route.request().url().substring(0,60)}`);
        route.continue();
      }
    });

    //page.on('console', msg => console.log(`PÁGINA: ${msg.type()} - ${msg.text().substring(0, 100)}${msg.text().length > 100 ? '...' : ''}`));

    // Navegar a la página
    //console.log("Cargando dolarhoy.com");
    await page.goto("https://dolarhoy.com", {
      waitUntil: "commit",
      timeout: 240000,
    });
    await extraerCotizaciones(page);
  } catch (error) {
    console.error("❌ Error al cargar la página:", error);
  } finally {
    //if (page && !page.isClosed()) {
    try {
      await page.close();
      //console.log("Página cerrada en finally de cargaPagina");
    } catch (e) {
      console.error("❌ Error al cerrar la página en finally de cargaPagina:", e);
    }
    //}
  }
};

//// Función anterior para guardar en JSON, la dejamos por si se necesita para debug o fallback manual
//async function guardarResultadosJSON(
//  resultados: ResultadoDolar
//): Promise<string> {
//  const carpetaResultados = path.join(__dirname, "..", "resultados");
//  await fs.ensureDir(carpetaResultados);
//  const nombreArchivo = `cotizaciones_json_${Date.now()}.json`;
//  const rutaArchivo = path.join(carpetaResultados, nombreArchivo);
//  await fs.writeJson(rutaArchivo, resultados, { spaces: 2 });
//  console.log(`Resultados guardados en JSON: ${rutaArchivo}`);
//  return rutaArchivo;
//}

async function monitorearCotizaciones(browser: any): Promise<void> {
  // <--- Cambiado a Promise<void>
  console.log("Iniciando monitoreo de cotizaciones...");

  const ejecutarCiclo = async () => {
    if (!browser || !browser.isConnected()) {
      console.error(
        "Error CRÍTICO: El navegador no está conectado o no existe al inicio del ciclo. El monitoreo se detendrá."
      );
      if (browser && typeof browser.close === "function") {
        try {
          await browser.close();
          console.log("Se intentó cerrar el navegador desconectado.");
        } catch (closeError) {
          console.error(
            "Error al intentar cerrar el navegador desconectado:",
            closeError
          );
        }
      }
      navegadorAbierto = false; // Actualizar el estado global
      await desconectarMongoDB();
      console.log("Desconexión de MongoDB debido a navegador no funcional.");
      return; // Detiene la recursión de ejecutarCiclo y, por lo tanto, el monitoreo
    }
    //console.log(`Nuevo ciclo de monitoreo. Browser conectado: ${browser.isConnected()}`);
    try {
      await cargaPagina(browser); // Llamar a la función de carga de página
      //await extraerCotizaciones( browser );
      //console.log(
      //  "Datos extraídos:",
      //  Object.keys(newData).length,
      //  "tipos de cotizaciones."
      //);
      //console.log("Datos previos:", Object.keys(lastData).length);

      const changedData = await comparaDatos(); // Llamar a la función para comparar datos
      if (changedData.length > 0) {
        // Actualizar lastData con los nuevos datos
        // Si hay cambios, guardarlos en la base de datos
        if (cotizacionesCollection) {
          const result = await cotizacionesCollection.insertMany(changedData);
          console.log(
            `Datos guardados en la base de datos. ${result.insertedCount} documentos insertados.`
          );
          for (const key in newData) {
            if (Object.prototype.hasOwnProperty.call(newData, key)) {
              // Asegurar que lastData tenga la estructura correcta
              if (!lastData[key]) {
                lastData[key] = {};
              }
              if(newData[key].TimeStamp) {
                delete(newData[key]._id)
                lastData[key] =  { ...lastData[key], ...newData[key] }; // Actualizar lastData con los nuevos datos
              }
            }
          }

          //lastData = { ...lastData, ...newData }; // Actualizar lastData con los nuevos datos
          //console.log(lastData);
          mostrarUltimasCotizaciones(lastData); // Mostrar las últimas cotizaciones
        } else {
          console.error(
            "❌ cotizacionesCollection is null. Cannot insert data."
          );
        }
      } else {
        //console.log("No se detectaron cambios en las cotizaciones.");
      }
    } catch (error) {
      console.error("❌ Error en el ciclo de monitoreo:", error);
    } finally {
      // Solo programar el siguiente ciclo si el navegador sigue (o se espera que siga) activo.
      // La verificación de browser.isConnected() al inicio del ciclo se encargará de detenerlo si es necesario.
      //console.log(
      //  `Proxima verificación a las ${new Date(
      //    Date.now() + intervaloMonitoreo
      //  ).toLocaleTimeString("es-AR", {
      //    timeZone: "America/Argentina/Buenos_Aires",
      //  })}`
      //);
      setTimeout(ejecutarCiclo, intervaloMonitoreo);
    }
  };

  await ejecutarCiclo(); // Iniciar el primer ciclo

  // Devolver una promesa que nunca se resuelve para mantener el await en monitorearYFinalizar pendiente
  return new Promise(() => {});
}

async function monitorearYFinalizar() {
  let browser: any = null;
  try {
    await conectarMongoDB();

    browser = await chromium.launch({
      headless: true,
      timeout: 300000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        //                '--disable-gpu'
      ],
    });
    console.log(
      `Navegador Playwright lanzado. Inicialmente conectado: ${browser.isConnected()}`
    );
    navegadorAbierto = true;

    await monitorearCotizaciones(browser);
  } catch (error) {
    console.error(
      "Error fatal en la aplicación (monitorearYFinalizar):",
      error
    );
  } finally {
    console.log("Bloque finally de monitorearYFinalizar alcanzado.");
    if (navegadorAbierto && browser && browser.isConnected()) {
      try {
        await browser.close();
        console.log(
          "Navegador cerrado desde finalmente de monitorearYFinalizar."
        );
      } catch (e) {
        console.error(
          "Error al cerrar el navegador en finalmente de monitorearYFinalizar:",
          e
        );
      }
    } else if (navegadorAbierto && browser && !browser.isConnected()) {
      // Esto podría pasar si el ciclo de monitoreo lo cerró y actualizó navegadorAbierto = false,
      // pero si no lo hizo, este log es útil.
      console.log(
        "El navegador ya estaba desconectado (o fue cerrado por el monitor) al llegar al finalmente de monitorearYFinalizar."
      );
    } else if (!navegadorAbierto) {
      console.log(
        "El navegador fue marcado como no abierto (posiblemente cerrado por el monitor) antes del finalmente de monitorearYFinalizar."
      );
    }
    navegadorAbierto = false; // Asegurar que se marque como no abierto
    await desconectarMongoDB();
    console.log(
      "Desconexión de MongoDB desde finalmente de monitorearYFinalizar."
    );
  }
}

monitorearYFinalizar();

// === SECHEEP: Automatización de extracción de facturas y descarga de PDFs ===
async function extraerFacturasYDescargarPDFs(usuario: string, password: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://oficinavirtual.secheep.gob.ar/Identity/Account/Login", { waitUntil: "domcontentloaded" });

  // Login
  await page.fill('input[name="Input.Email"]', usuario);
  await page.fill('input[name="Input.Password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // Ir a Facturas
  await page.click('a:has-text("Facturas")');
  await page.waitForSelector("#suministro");

  // Obtener todos los suministros
  const suministros = await page.$$eval('#suministro option', opts =>
    opts.map(o => ({
      value: (o as HTMLOptionElement).value,
      text: o.textContent?.trim() || ""
    }))
  );
  const resultados: any[] = [];

  for (const suministro of suministros) {
    if (!suministro.value) continue; // Saltar opción vacía
    await page.selectOption('#suministro', suministro.value);
    // Esperar a que la tabla se actualice (puede ser por AJAX)
    await page.waitForTimeout(1500); // Ajustar si hay mejor evento

    // Verificar si la tabla está vacía
    const tablaVacia = await page.$('text="No hay registros que mostrar"');
    if (tablaVacia) {
      console.log(`Suministro ${suministro.text}: sin facturas.`);
      continue;
    }

    // Extraer filas de la tabla de facturas
    const filas = await page.$$('#tablaFacturas tbody tr');
    if (filas.length === 0) {
      console.log(`Suministro ${suministro.text}: tabla sin filas.`);
      continue;
    }

    for (const fila of filas) {
      const columnas = await fila.$$eval('td', tds => tds.map(td => td.textContent?.trim() || ""));
      // Buscar el link de PDF
      const linkPDF = await fila.$('a[href$=".pdf"]');
      let pdfPath: string | null = null;
      if (linkPDF) {
        const pdfUrl = await linkPDF.getAttribute('href');
        if (pdfUrl) {
          // Descargar el PDF
          const pdfResp = await page.goto(pdfUrl);
          const buffer = await pdfResp?.body();
          if (buffer) {
            const nombrePDF = `factura_${suministro.value}_${columnas[0] || Date.now()}.pdf`;
            const rutaPDF = path.join(__dirname, '..', 'facturas', nombrePDF);
            await fs.ensureDir(path.dirname(rutaPDF));
            await fs.writeFile(rutaPDF, buffer);
            pdfPath = rutaPDF;
            console.log(`PDF descargado: ${rutaPDF}`);
          }
        }
      }
      resultados.push({ suministro: suministro.text, datos: columnas, pdf: pdfPath });
    }
  }
  await browser.close();
  // Mostrar resumen
  console.table(resultados.map(r => ({ Suministro: r.suministro, Factura: r.datos[0], PDF: r.pdf ? 'Descargado' : 'No' })));
  return resultados;
}

// === INTEGRACIÓN: Llamar a la función de SECHEEP después del monitoreo de cotizaciones ===

// Ejemplo de uso (ajustar usuario y password desde .env o variables):
// (async () => {
//   const usuario = process.env.SECHEEP_USER || "";
//   const password = process.env.SECHEEP_PASS || "";
//   if (!usuario || !password) {
//     console.error("Faltan credenciales de SECHEEP en .env");
//     return;
//   }
//   await extraerFacturasYDescargarPDFs(usuario, password);
// })();
