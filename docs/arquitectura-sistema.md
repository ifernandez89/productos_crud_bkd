# Arquitectura del sistema

Este proyecto es un backend NestJS para gestión de productos con integración de IA, persistencia en PostgreSQL mediante Prisma y un módulo de carga de imágenes. La aplicación no es solo un CRUD: combina catálogo de productos, historial de preguntas/respuestas y dos rutas de procesamiento de IA, una local con Ollama y otra externa con OpenRouter, además de un subsistema Python de razonamiento jerárquico.

## Propósito funcional

El sistema está pensado para:

- Administrar productos con metadatos comerciales como marca, stock, estado de oferta, destacado y nuevo.
- Responder preguntas del usuario usando el catálogo de productos como contexto.
- Guardar el historial de preguntas y respuestas generadas por IA.
- Convertir imágenes subidas a base64 para reutilizarlas en otros flujos.
- Ejecutar una variante experimental basada en HRM/Python para resolver preguntas desde un proceso externo.

## Stack y estructura general

La base tecnológica es:

- NestJS como framework principal.
- Prisma como capa de acceso a datos.
- PostgreSQL como base de datos.
- Swagger para documentación de API.
- Class Validator y ValidationPipe global para validación de DTOs.
- LangChain y Ollama para la integración de IA local.
- Axios para la integración con OpenRouter.
- Multer para recepción de archivos en el módulo de carga.
- Python para el flujo de HRM.

La aplicación arranca con un prefijo global `/api`, habilita CORS y expone Swagger en `/api/docs`.

## Diseño por módulos

### Núcleo de aplicación

El `AppModule` ensambla cuatro piezas:

- `PrismaModule` como proveedor global de acceso a datos.
- `ProductsModule` para el catálogo.
- `AichatModule` para preguntas, IA y persistencia de conversaciones.
- `UploadModule` para imágenes.

El bootstrap configura validación estricta:

- elimina propiedades no declaradas en los DTOs,
- rechaza payloads extra,
- transforma tipos de entrada automáticamente.

### Persistencia

La persistencia está centralizada en `PrismaService`, que extiende `PrismaClient` y conecta o desconecta la base de datos en el ciclo de vida de Nest.

Los modelos definidos en Prisma son:

- `Product`.
- `Pregunta`.

### Catálogo de productos

El módulo `products` implementa un CRUD completo:

- crear producto,
- listar productos,
- obtener producto por id,
- actualizar producto,
- eliminar producto.

La lógica se divide en tres capas:

- `ProductsController` expone endpoints HTTP.
- `ProductsService` aplica reglas de negocio y manejo de errores.
- `ProductsRepository` ejecuta las operaciones Prisma.

### IA y conversación

El módulo `aichat` maneja tres capacidades distintas:

- preguntas sobre productos con contexto comercial,
- almacenamiento del historial de respuestas,
- ejecución de motores de IA local, remota y experimental.

El modelo local de Ollama está fijado en `llama3.2:3b` dentro de `src/aichat/models/ollamaModel.ts`.

La ruta principal de preguntas ahora realiza una recuperación ligera sobre el historial de preguntas y respuestas guardadas, además de usar el catálogo de productos como contexto. Esto no es un vector store completo, pero sí una forma práctica de RAG sobre el conocimiento ya persistido.

La estructura interna separa responsabilidades así:

- `AichatController` recibe solicitudes y valida el input básico.
- `AichatService` orquesta el flujo de respuesta.
- `PreguntasRepository` persiste preguntas y respuestas.
- `OllamaModelService` administra el modelo local.
- `ConverterService` ayuda con conversiones de valores booleanos.
- `ProductsRepository` se reutiliza para enriquecer el contexto de IA con el catálogo.

### Carga de archivos

El módulo `upload` recibe una imagen por `multipart/form-data`, valida que el archivo exista y que sea realmente una imagen, y devuelve el contenido en formato base64 con prefijo `data:<mime>;base64,...`.

## Qué soporta exactamente

### Productos

El modelo de producto soporta estos campos:

- `name` como identificador comercial único.
- `description` opcional.
- `price` numérico.
- `image` opcional.
- `stock`.
- `isFeatured`, `isOnSale` e `isNew` como banderas opcionales.
- `marca` obligatoria.
- `createdAT` y `updatedAt` como metadatos temporales.

La API de productos soporta:

- creación con validación de esquema,
- lectura completa,
- lectura por id,
- actualización parcial,
- eliminación.

### Preguntas con IA

El sistema soporta dos caminos principales para responder preguntas:

1. Modo local con Ollama.
2. Modo remoto con OpenRouter.

El cuerpo de entrada acepta:

- `pregunta`, obligatoria.
- `agente`, opcional, para seleccionar la ruta de ejecución.

En ambos casos, el sistema construye un prompt enriquecido con el catálogo de productos para que la IA pueda recomendar, comparar o explicar artículos disponibles.

Además, recupera preguntas previas relevantes desde la tabla `Pregunta` y las inyecta como contexto para aportar memoria conversacional.

Además, guarda el intercambio en la tabla `Pregunta`.

### HRM / Python

Existe un soporte adicional para ejecutar un flujo HRM en Python desde `AichatService`.

Ese flujo:

- invoca `src/hrm/hrm_runner.py`,
- pasa la pregunta como argumento,
- espera una respuesta JSON con el campo `response`,
- reintenta ante fallos,
- registra la salida en la tabla de preguntas.

Este subsistema es más experimental y está pensado como integración de razonamiento externo, no como parte del CRUD principal.

### Conversión de imágenes

El endpoint de upload soporta:

- recepción de un archivo único llamado `image`,
- validación de que exista archivo,
- validación de que el MIME empiece por `image/`,
- salida en base64 lista para transporte o almacenamiento temporal.

## Flujo de ejecución

### Arranque de la API

1. Nest levanta `AppModule`.
2. Se carga configuración global desde entorno.
3. Prisma se inicializa como módulo global.
4. Se registran módulos de productos, IA y upload.
5. La app expone documentación Swagger.
6. El servidor escucha en el puerto `4000` o en `PORT` si está definido.

### Alta de producto

1. El controller recibe el payload.
2. `ValidationPipe` valida el DTO.
3. El service delega al repository.
4. Prisma persiste el registro.
5. El service traduce errores de base de datos a excepciones HTTP.

### Pregunta a la IA

1. El controller verifica que `pregunta` no esté vacía.
2. El service toma el catálogo actual de productos.
3. Se arma un prompt con contexto del catálogo.
4. Se ejecuta Ollama o OpenRouter según la ruta elegida.
5. La respuesta se guarda en `Pregunta`.
6. Se retorna la respuesta al cliente.

### Subida de imagen

1. El controller recibe un archivo por `multipart/form-data`.
2. Se valida presencia y tipo MIME.
3. Se convierte el buffer a base64.
4. Se devuelve una cadena `data:` lista para reutilización.

## Modelo de datos

### Product

La entidad de producto está optimizada para catálogo comercial y recomendación por IA. La combinación de nombre, marca, precio, stock y banderas de negocio permite construir respuestas contextuales.

### Pregunta

La entidad de pregunta funciona como bitácora de conversación:

- `texto` almacena la consulta original,
- `respuesta` guarda el texto generado,
- `createdAt` permite ordenar historial y auditar actividad.

## Convenciones de API

- Prefijo común: `/api`.
- Swagger: `/api/docs`.
- Versionado explícito en código no está implementado; el proyecto usa el nivel de release del repositorio y el changelog para documentación de cambios.
- Las rutas usan validación estricta de tipos e ids numéricos.

### Endpoints principales

| Método | Ruta | Propósito |
| --- | --- | --- |
| `POST` | `/api/products` | Crear un producto. |
| `GET` | `/api/products` | Listar todos los productos. |
| `GET` | `/api/products/:id` | Obtener un producto por id. |
| `PATCH` | `/api/products/:id` | Actualizar un producto. |
| `DELETE` | `/api/products/:id` | Eliminar un producto. |
| `POST` | `/api/aichat/preguntar` | Enviar una pregunta y obtener respuesta de IA. |
| `GET` | `/api/aichat/listar` | Consultar el historial de preguntas y respuestas. |
| `GET` | `/api/aichat` | Acceso genérico al recurso aichat. |
| `GET` | `/api/aichat/:id` | Obtener un registro de aichat por id. |
| `PATCH` | `/api/aichat/:id` | Actualizar un registro de aichat. |
| `DELETE` | `/api/aichat/:id` | Eliminar un registro de aichat. |
| `POST` | `/api/upload/image` | Subir una imagen y devolver su base64. |

### Variables de entorno

| Variable | Requerida | Uso |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Conexión a PostgreSQL para Prisma. |
| `OPENROUTER_API_KEY` | Solo para IA remota | Autenticación contra OpenRouter. |
| `PORT` | No | Puerto del servidor; si no existe se usa `4000`. |

## Dependencias funcionales clave

- Prisma requiere `DATABASE_URL` apuntando a PostgreSQL.
- Ollama usa el modelo local `llama3.2:3b` para la ruta local.
- OpenRouter requiere `OPENROUTER_API_KEY` para la ruta remota.
- HRM depende de Python y de las librerías del directorio `src/hrm`.

## Qué está bien soportado hoy

- CRUD completo de productos.
- Validación de entrada.
- Historial persistido de preguntas y respuestas.
- AI local con Ollama.
- AI remota con OpenRouter.
- Integración experimental con Python/HRM.
- Conversión de imágenes a base64.
- Documentación Swagger en tiempo de ejecución.

## Qué parece ser experimental o auxiliar

- Los archivos de `src/aichat/agents` no están integrados de forma clara en el flujo principal del controller; parecen prototipos de agentes LangChain o scripts auxiliares.
- El subsistema `src/hrm` es mucho más cercano a un laboratorio de investigación que a un módulo de negocio tradicional.
- Algunos métodos generados por Nest en `AichatService` devuelven textos de marcador y no tienen impacto funcional real.

## Riesgos y puntos de mantenimiento

- La integración con OpenRouter depende de una API externa y de red estable.
- La integración con Ollama depende de que el modelo local esté disponible.
- El HRM en Python depende de un entorno Python compatible y del script `hrm_runner.py`.
- La validación de algunos DTOs podría necesitar ajustes finos si se envían números o booleanos como cadenas desde formularios.
- El modelo `Product` usa `name` como campo único, así que la duplicidad de nombres está prohibida por diseño.

## Resumen ejecutivo

Este sistema es un backend NestJS de catálogo de productos con inteligencia artificial asistida por contexto de inventario. Su núcleo es un CRUD de productos sobre PostgreSQL; encima de eso, agrega respuestas de IA con persistencia de historial, dos motores de generación alternativos, soporte para imágenes en base64 y una integración experimental de razonamiento en Python.