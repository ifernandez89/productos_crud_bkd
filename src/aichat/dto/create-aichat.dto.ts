import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateAichatDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    pregunta: string;
    
    @ApiProperty()
    @IsBoolean()
    @IsOptional()
    agente: boolean
}
