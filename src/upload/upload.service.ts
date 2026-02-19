import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadService {
  convertToBase64(file: Express.Multer.File): string {
    const base64 = file.buffer.toString('base64');
    const mimeType = file.mimetype;
    return `data:${mimeType};base64,${base64}`;
  }
}
