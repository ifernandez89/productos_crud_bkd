import { Tool } from "@langchain/core/tools";
import axios from "axios";

export class ProductsTool extends Tool {
    name = "Traer productos";
    description = "GET productos";

    async _call(input: string): Promise<string> {
        try {
            // Consultar la API
            const response = await axios.get(`http://localhost:4000/api/products`, {
                params: { query: input },
            });
            const productos = response.data;
            if (productos && productos.length > 0) {
                return `Actualmente hay ${productos.length} productos en la base de datos.`;
            } else {
                return `No se encontraron productos que coincidan con "${input}".`;
            }
        } catch (error) {
            return "Hubo un error al consultar la base de datos de productos.";
        }
    }
}