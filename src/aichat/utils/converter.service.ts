import { Injectable } from '@nestjs/common';

@Injectable()
export class ConverterService {
  public toBoolean(value: string | number | boolean): boolean {
    return (
      value === true ||
      value === '1' ||
      Number(value) === 1 ||
      value === 'true' ||
      value === 'TRUE'
    );
  }
}
