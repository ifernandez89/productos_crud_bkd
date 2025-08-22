import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';

@Injectable()
export class ModelService {
    public model: ChatOllama | null = null;;

    constructor() { }

    public async create() {
        this.model = new ChatOllama({//para 2 min
            model: "llama3.2:1b",//gemma:2b //phi //gemma3:1b //llama3.2:1b(great for summarization)//
            temperature: 0.3,   // creatividad balanceada para naturalidad sin divagar
            topP: 0.9,         // limita un poco la aleatoriedad para coherencia
            topK: 20,           // suficiente para diversidad pero sin dispersarse
            numPredict: 512,    // para respuestas medianas a largas
            repeatPenalty: 1.1, // penaliza repeticiones y mejora fluidez
            stop: [],     //["\n\n"] para cortar respuestas completas
        });
    }

    async getModel() {
        if (!this.model) {
            await this.create();
        }
        return this.model;
    }
}