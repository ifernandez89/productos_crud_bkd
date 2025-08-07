import { Injectable, OnModuleInit } from '@nestjs/common';
import {PrismaClient} from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit{
    private _product: any;
    public get product(): any {
        return this._product;
    }
    public set product(value: any) {
        this._product = value;
    }
    async onModuleInit(){
        await this.$connect();
    }
}
