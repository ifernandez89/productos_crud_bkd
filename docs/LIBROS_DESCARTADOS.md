# Registro de Libros Descartados por Corrupción / Error Estructural

Este documento contiene la lista de archivos PDF que fueron descartados y eliminados del sistema debido a corrupción física en disco, truncamiento por error de servidor de descarga u otros fallos insalvables de estructura.

---

## 📚 Jacobo Grinberg-Zylberbaum

| Título del Libro | Nombre de Archivo Original | Razón del Descarte | Estado |
| :--- | :--- | :--- | :--- |
| **Los Chamanes de México Vol 5.2 (El Cerebro y los Chamanes)** | `Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-El-Cerebro-y-los-Chamanes-Vol-5-2.pdf` | Archivo PDF truncado a la mitad por error 500 FastCGI del servidor remoto. Estructura xref inválida. | ❌ Eliminado del disco e índice |
| **Los Chamanes de México Vol 6** | `Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-6.pdf` | Archivo PDF truncado a la mitad por error 500 FastCGI del servidor remoto. Estructura xref inválida. | ❌ Eliminado del disco e índice |
| **Los Chamanes de México Vol 7** | `Jacobo-Grinberg-Zylberbaum/Los-Chamanes-de-Mexico-Vol-7.pdf` | Archivo PDF truncado a la mitad por error 500 FastCGI del servidor remoto. Estructura xref inválida. | ❌ Eliminado del disco e índice |

---

### 📝 Instrucciones para re-incorporación:
Si en el futuro se obtienen copias sanas y completas de estos volúmenes:
1. Colocar el archivo PDF completo en `docs/libros/Jacobo-Grinberg-Zylberbaum/`.
2. Ejecutar `npx ts-node scripts/scan-books.ts` para actualizar el índice.
3. Ejecutar `npx ts-node scripts/ingest-author.ts "Grinberg"` para procesar e indexar automáticamente los nuevos libros.
