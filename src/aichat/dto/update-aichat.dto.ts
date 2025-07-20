import { PartialType } from '@nestjs/swagger';
import { CreateAichatDto } from './create-aichat.dto';

export class UpdateAichatDto extends PartialType(CreateAichatDto) {}
