import { EvidenceService } from './evidence.service';
import { SCHOOLS_OF_THOUGHT } from './corpus-selector.service';

describe('EvidenceService', () => {
  let service: EvidenceService;
  let mockCorpusSelector: any;

  beforeEach(() => {
    mockCorpusSelector = {
      getIndex: jest.fn().mockReturnValue({
        documentos: [
          {
            titulo: "The Etheric Double",
            autor: "Arthur E. Powell",
            conceptosClave: ["prana", "auras", "chakras", "vitality"]
          },
          {
            titulo: "El Kybalion",
            autor: "Tres Iniciados",
            conceptosClave: ["polaridad", "vibracion", "ritmo"]
          }
        ]
      }),
      getAllAuthors: jest.fn().mockReturnValue(["Arthur E. Powell", "Tres Iniciados"]),
      getAllConcepts: jest.fn().mockReturnValue(["prana", "auras", "chakras", "vitality", "polaridad", "vibracion", "ritmo"]),
      getAuthorAndSchoolByTitle: jest.fn().mockImplementation((title: string) => {
        if (title === "The Etheric Double") return { author: "Arthur E. Powell", school: "TEOSOFIA" };
        if (title === "El Kybalion") return { author: "Tres Iniciados", school: "HERMETISMO" };
        return { author: "Autor Desconocido", school: "OTRO" };
      })
    };

    service = new EvidenceService(mockCorpusSelector);
  });

  it('should calculate high confidence when response is grounded in retrieved chunks', () => {
    const retrievedChunks = [
      {
        content: "Arthur Powell explica que el prana ingresa a través de los chakras y energiza el aura de salud.",
        document: { title: "The Etheric Double" }
      }
    ];

    const response = "Arthur Powell sostiene que el prana nutre el aura a través de los chakras.";
    const result = service.verifyResponse(response, retrievedChunks, "explicame el prana");
    
    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.authorsVerified).toContain("Arthur E. Powell");
    expect(result.authorsHallucinated).toHaveLength(0);
    expect(result.conceptsVerified).toContain("prana");
  });

  it('should flag hallucinated authors and concepts', () => {
    const retrievedChunks = [
      {
        content: "Arthur Powell explica que el prana ingresa a través de los chakras.",
        document: { title: "The Etheric Double" }
      }
    ];

    const response = "Arthur Powell y Jacobo Grinberg demuestran que la teoria sintérgica explica la estructura de las auras.";
    const result = service.verifyResponse(response, retrievedChunks, "que dicen de las auras");

    expect(result.confidenceScore).toBeLessThanOrEqual(50);
    expect(result.authorsHallucinated).toContain("Jacobo Grinberg");
  });

  it('should return 100% confidence for honest evasive fallback responses', () => {
    const retrievedChunks: any[] = [];
    const response = "No encontré suficiente información en la biblioteca para responder con precisión sobre este tema.";
    const result = service.verifyResponse(response, retrievedChunks, "quien invento el mate");

    expect(result.confidenceScore).toBe(100);
    expect(result.formattedReportMarkdown).toContain("Verificación de Respaldo");
  });
});
