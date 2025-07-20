import { CreateProductDto } from './create-product.dto';

export type UpdateProductDto=Partial<CreateProductDto>
/*export class UpdateProductDto extends PartialType(CreateProductDto) {}
export class UpdateProductDto{}*/