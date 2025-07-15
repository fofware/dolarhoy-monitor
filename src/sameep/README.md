# SAMEEP - Sistema de Automatización de Portal

Este directorio contiene todos los scripts relacionados con la automatización del portal SAMEEP para la extracción de datos de clientes y descarga de facturas.

## Estructura de Archivos

### Archivos Principales (Sistema Actual - Recomendado)

- **`sameep-class.ts`** - Clase principal con toda la funcionalidad SAMEEP integrada con Playwright
- **`ejecutar-sameep-fase1.ts`** - Script para recolección de datos solamente (sin descarga de PDFs)
- **`ejecutar-sameep-fase2.ts`** - Script para captura de URLs de PDFs con progreso detallado

### Archivos de Versiones Anteriores

- **`sameep-completo.ts`** - Versión anterior de la clase principal
- **`index-sameep.ts`** - Script original de SAMEEP
- **`descargar-factura-sameep.ts`** - Script específico para descarga de facturas
- **`ejecutar-sameep-completo.ts`** - DEPRECADO: Ejecutor de versión anterior (comentado)
- **`ejemplo-sameep-completo.ts`** - Ejemplo de uso de versión anterior

### Archivos de Pruebas

- **`test-fase2.ts`** - Pruebas para la fase 2 del sistema
- **`test-cliente2.ts`** - Pruebas específicas del cliente 2
- **`test-cliente5.ts`** - Pruebas específicas del cliente 5

### Archivos de Utilidades

- **`ejemplo-interfaces.ts`** - Ejemplos de uso de las interfaces exportadas

## Sistema Recomendado (Dos Fases)

### Fase 1: Recolección de Datos

```bash
npx ts-node src/sameep/ejecutar-sameep-fase1.ts
```

- Procesa todos los clientes
- Extrae información completa
- Guarda datos en JSON
- NO descarga PDFs

### Fase 2: Captura de URLs

```bash
npx ts-node src/sameep/ejecutar-sameep-fase2.ts
```

- Carga datos del JSON de Fase 1
- Navega a cada factura
- Captura URLs de PDFs disponibles
- Muestra progreso por cliente

## Características del Sistema

### ✅ Funcionalidades Implementadas

- **Detección Avanzada de PDFs**: Usa patrón `style="display:none"` para detectar disponibilidad
- **Navegación Multi-Suministro**: Maneja clientes con múltiples suministros
- **Arquitectura Robusta**: Sistema de dos fases para mayor estabilidad
- **Logging Detallado**: Progreso y estadísticas completas
- **Integración Playwright**: Reemplazo completo de axios para mayor confiabilidad

### 📊 Resultados Probados

- **Procesamiento**: 100% de clientes procesados exitosamente (10/10)
- **Captura de URLs**: 77% de éxito en captura de URLs de PDFs
- **Detección**: 92.6% de precisión en detección de PDFs disponibles

## Variables de Entorno Requeridas

```env
SAMEEP_USER=tu_usuario
SAMEEP_PASS=tu_contraseña
```

## Notas Técnicas

- El sistema utiliza Playwright para navegación dinámica
- Las URLs de PDFs se capturan desde iframes del portal
- El sistema maneja automáticamente timeouts y reintentos
- Los datos se guardan en formato JSON con timestamps

## Interfaces Exportadas

El archivo `sameep-class.ts` exporta las siguientes interfaces TypeScript para uso en otros módulos:

### Interfaces Principales

- **`Cliente`** - Representa un cliente del sistema SAMEEP

  ```typescript
  interface Cliente {
    id: string;
    nombre: string;
    suministros: Suministro[];
  }
  ```

- **`Suministro`** - Representa un suministro eléctrico de un cliente

  ```typescript
  interface Suministro {
    id: string;
    clienteId: string;
    numeroSuministro: string;
    calle: string;
    altura: string;
    piso: string;
    comprobantes: Comprobante[];
  }
  ```

- **`Comprobante`** - Representa una factura o comprobante de pago

  ```typescript
  interface Comprobante {
    id: string;
    clienteId: string;
    suministroId: string;
    numeroFactura: string;
    fechaEmision: Date;
    periodo: string;
    // ... más campos
    tienePdf: boolean;
    urlPdf?: string;
    fechaProcesamiento: Date;
  }
  ```

- **`DatosRecolectados`** - Estructura de datos completa del sistema
  ```typescript
  interface DatosRecolectados {
    clientes: Cliente[];
    totalClientes: number;
    totalSuministros: number;
    totalComprobantes: number;
    // ... más estadísticas
    fechaRecoleccion: Date;
  }
  ```

### Uso de las Interfaces

```typescript
import {
  SameepDataCollector,
  Cliente,
  Suministro,
  Comprobante,
  DatosRecolectados,
} from './sameep-class';

// Usar las interfaces para tipado fuerte
function procesarCliente(cliente: Cliente): void {
  console.log(`Procesando: ${cliente.nombre}`);
}
```

Ver `ejemplo-interfaces.ts` para más ejemplos de uso.
