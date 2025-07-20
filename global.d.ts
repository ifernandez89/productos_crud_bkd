declare module "node-signpdf" {
    export class SignPdf {
      sign(pdfBuffer: Buffer, p12Buffer: Buffer): Buffer;
    }
  
    export function plainAddPlaceholder(options: {
      pdfBuffer: Buffer;
      reason: string;
      signatureLength: number;
    }): Buffer;
  }