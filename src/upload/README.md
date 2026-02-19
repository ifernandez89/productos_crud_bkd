# Upload Module

Este módulo maneja la carga de imágenes y las convierte a formato base64.

## Endpoint

### POST /upload/image

Sube una imagen y retorna su representación en base64.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Archivo de imagen con el campo `image`

**Response:**
```json
{
  "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Ejemplo con curl:**
```bash
curl -X POST \
  http://localhost:3000/upload/image \
  -H 'Content-Type: multipart/form-data' \
  -F 'image=@/path/to/your/image.png'
```

**Ejemplo con JavaScript (fetch):**
```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

fetch('/upload/image', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('Base64:', data.base64);
});
```

## Validaciones

- El archivo debe ser una imagen (mime type debe empezar con 'image/')
- Se requiere que se envíe un archivo

## Formatos soportados

Cualquier formato de imagen válido:
- PNG
- JPEG/JPG
- GIF
- WebP
- SVG
- etc.