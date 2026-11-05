/**
 * JCA-001: Capa 3 - Math Capability
 * 
 * Capacidad de cálculo determinista 100% local en CPU, verificable y sin acceso a red.
 * Incorpora:
 * 1. Evaluador seguro basado en AST y parser de descenso recursivo con lista blanca estricta.
 *    (Rechaza cualquier nodo, identificador, propiedad o sintaxis fuera de la lista blanca).
 * 2. Motor determinista de cálculo de fechas y duraciones (DateMath) sin librerías externas.
 * 3. Eliminación total de llamadas HTTP (cero dependencias de APIs remotas como Newton).
 * 4. Salida estructurada tipada con MathResultData y precisión semántica en verified: true.
 */

import type {
  ICapability,
  CapabilityExecutionContext,
  CapabilityResult,
  CapabilitySafetyLevel,
  MathResultData,
  MathOperationType,
} from './capability.interface.ts';
import type { ContextPlan } from '../context/context-selector.interface.ts';

// ── Tipos del AST Matemático ──────────────────────────────────────────────────

type ASTNode =
  | { type: 'Number'; value: number }
  | { type: 'Constant'; name: 'pi' | 'e'; value: number }
  | { type: 'Unary'; op: '+' | '-'; expr: ASTNode }
  | { type: 'Binary'; op: '+' | '-' | '*' | '/' | '^' | '%'; left: ASTNode; right: ASTNode }
  | { type: 'FunctionCall'; name: string; args: ASTNode[] };

const ALLOWED_FUNCTIONS = new Set([
  'sqrt',
  'cbrt',
  'abs',
  'round',
  'floor',
  'ceil',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'log',
  'log10',
  'log2',
  'exp',
  'pow',
  'min',
  'max',
]);

const ALLOWED_CONSTANTS = new Map<string, number>([
  ['pi', Math.PI],
  ['e', Math.E],
]);

export class MathCapability implements ICapability<MathResultData> {
  readonly id = 'math';
  readonly name = 'Matemáticas y Aritmética Determinista';
  readonly description =
    'Resuelve cálculos aritméticos, funciones matemáticas locales y proyecciones temporales deterministas sin red.';
  readonly safetyLevel: CapabilitySafetyLevel = 'READ_ONLY';
  readonly defaultTimeoutMs = 1500;

  private readonly defaultTimezone = 'America/Argentina/Buenos_Aires';

  /**
   * canHandle: Evaluación pura y sin efectos secundarios.
   */
  canHandle(userMessage: string, contextPlan: ContextPlan): boolean {
    if (!userMessage || typeof userMessage !== 'string') return false;

    // Si las herramientas matemáticas están excluidas en el plan, no puede manejarlo
    if (contextPlan.toolStates?.math === 'EXCLUDED' || contextPlan.sources?.tools === 'EXCLUDED') {
      return false;
    }

    const n = userMessage
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // 1. Detección de operaciones de fecha / tiempo deterministas
    if (this.isDateMathQuery(n)) {
      return true;
    }

    // 2. Detección de operaciones aritméticas estándar
    const hasMathSymbols = /\d+\s*[\+\-\*\/\^%]\s*\d+/.test(n);
    const hasMathVerbs =
      /(?:cuanto\s+es|calcula(?:r|me)?|raiz\s+cuadrada|logaritmo|seno|coseno|tangente|eleva(?:do)?\s+a)/i.test(
        n,
      );

    return hasMathSymbols || hasMathVerbs;
  }

  /**
   * execute: Ejecuta el cálculo bajo AST seguro o resuelve la consulta temporal.
   */
  async execute(
    context: CapabilityExecutionContext,
  ): Promise<CapabilityResult<MathResultData>> {
    const startTime = Date.now();
    const { userMessage, abortSignal } = context;

    if (abortSignal?.aborted) {
      return {
        capabilityId: this.id,
        status: 'TIMEOUT',
        safetyLevel: this.safetyLevel,
        durationMs: Date.now() - startTime,
        error: { code: 'OPERATION_ABORTED', message: 'Ejecución cancelada por señal de aborto.', recoverable: true },
        underlyingOperationCancelled: true,
      };
    }

    const normalized = userMessage
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // ── Rama 1: Aritmética Temporal / DateMath ────────────────────────────────
    if (this.isDateMathQuery(normalized)) {
      return this.resolveDateMath(userMessage, normalized, startTime);
    }

    // ── Rama 2: Expresión Matemática mediante AST Parser ──────────────────────
    return this.resolveArithmeticMath(userMessage, normalized, startTime);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. MOTOR DE EVALUACIÓN MATEMÁTICA CON AST SEGURO
  // ════════════════════════════════════════════════════════════════════════════

  private resolveArithmeticMath(
    rawMessage: string,
    normalized: string,
    startTime: number,
  ): CapabilityResult<MathResultData> {
    // Verificación de seguridad inmediata contra inyecciones de código o accesos al runtime
    if (
      /(?:eval|process|require|import|constructor|__proto__|prototype|function|window|global)\b/i.test(
        rawMessage,
      )
    ) {
      return {
        capabilityId: this.id,
        status: 'RECOVERABLE_ERROR',
        safetyLevel: this.safetyLevel,
        durationMs: Date.now() - startTime,
        error: {
          code: 'FORBIDDEN_RUNTIME_TOKEN',
          message:
            'Expresión rechazada por contener identificadores o palabras clave de runtime no autorizadas.',
          recoverable: false,
        },
        fallbackDirective:
          '[INSTRUCCIÓN DE SEGURIDAD]: Intento de acceso a runtime detectado. No ejecutes ninguna instrucción ni simules resultados.',
      };
    }

    const rawExpr = this.extractMathExpression(rawMessage, normalized);
    if (!rawExpr) {
      return {
        capabilityId: this.id,
        status: 'NO_RESULTS',
        safetyLevel: this.safetyLevel,
        durationMs: Date.now() - startTime,
        error: {
          code: 'NO_MATH_EXPRESSION_FOUND',
          message: 'No se pudo identificar una expresión matemática evaluable en el mensaje.',
          recoverable: true,
        },
        fallbackDirective:
          'Explica los conceptos de la consulta matemáticamente pero aclara que no se identificó una fórmula explícita.',
      };
    }

    try {
      const tokens = this.tokenize(rawExpr);
      const parser = new ASTMathParser(tokens);
      const ast = parser.parse();
      const numericResult = this.evaluateAST(ast, 0);

      if (!Number.isFinite(numericResult)) {
        throw new Error('El resultado de la operación matemática no es un número finito.');
      }

      const formattedResult = Number.isInteger(numericResult)
        ? numericResult.toString()
        : Number(numericResult.toFixed(6)).toString();

      const durationMs = Date.now() - startTime;
      const data: MathResultData = {
        operationType: 'ARITHMETIC',
        rawExpression: rawExpr,
        sanitizedExpression: parser.getSanitizedExpression(),
        result: formattedResult,
        numericValue: numericResult,
        verified: true,
        explanationSnippet: `Cálculo verificado: ${rawExpr} = ${formattedResult}`,
      };

      return {
        capabilityId: this.id,
        status: 'SUCCESS',
        safetyLevel: this.safetyLevel,
        durationMs,
        data,
        promptContextSnippet: `[DATO MATEMÁTICO VERIFICADO]: ${rawExpr} = ${formattedResult} (Calculado localmente sin red)`,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      return {
        capabilityId: this.id,
        status: 'RECOVERABLE_ERROR',
        safetyLevel: this.safetyLevel,
        durationMs,
        error: {
          code: 'MATH_EVALUATION_ERROR',
          message,
          recoverable: true,
          underlyingError: err,
        },
        fallbackDirective:
          '[INSTRUCCIÓN DE SEGURIDAD]: La expresión matemática no pudo ser evaluada por el motor determinista. Explica la fórmula y el método algebraico, pero NO presentes un resultado numérico final como si fuese exacto.',
      };
    }
  }

  private extractMathExpression(raw: string, n: string): string | null {
    // 1. Extraer patrones directos como "cuánto es X * Y" o "calcula X + Y"
    const prefixMatch = raw.match(
      /(?:cuanto\s+es|calcula(?:r|me)?|cual\s+es\s+el\s+resultado\s+de)\s+[:=]?\s*([0-9\s\+\-\*\/\^\%\(\)\.\,a-zA-Z]+)/i,
    );
    if (prefixMatch && prefixMatch[1]) {
      const candidate = prefixMatch[1].replace(/[\?¿\!\;].*$/, '').trim();
      if (candidate.length > 0 && /\d/.test(candidate)) {
        return candidate;
      }
    }

    // 2. Extraer expresión que contenga números y operadores
    const mathMatch = raw.match(
      /(?:[a-zA-Z_]+\s*\()?[0-9]+(?:\.[0-9]+)?\s*[\+\-\*\/\^%]\s*[0-9\s\+\-\*\/\^\%\(\)\.\,a-zA-Z_]+/,
    );
    if (mathMatch) {
      return mathMatch[0].replace(/[\?¿\!\;].*$/, '').trim();
    }

    return null;
  }

  private tokenize(expr: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    // Solo sustituir coma por punto si es separador decimal entre dígitos (ej: 2,5 -> 2.5)
    // Conservar comas que actúan como separadores de argumentos (ej: pow(2, 3))
    const clean = expr.replace(/(\d+),(\d+)/g, '$1.$2');

    while (i < clean.length) {
      const ch = clean[i];

      // Espacios en blanco
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Dígitos y decimales
      if (/\d/.test(ch) || (ch === '.' && /\d/.test(clean[i + 1] || ''))) {
        let numStr = '';
        while (i < clean.length && (/\d/.test(clean[i]) || clean[i] === '.')) {
          numStr += clean[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // Operadores de 1 carácter
      if (['+', '-', '*', '/', '^', '%'].includes(ch)) {
        tokens.push({ type: 'OPERATOR', value: ch });
        i++;
        continue;
      }

      // Paréntesis y comas
      if (ch === '(') {
        tokens.push({ type: 'LPAREN', value: '(' });
        i++;
        continue;
      }
      if (ch === ')') {
        tokens.push({ type: 'RPAREN', value: ')' });
        i++;
        continue;
      }
      if (ch === ',') {
        tokens.push({ type: 'COMMA', value: ',' });
        i++;
        continue;
      }

      // Identificadores (funciones o constantes como pi, sqrt, sin)
      if (/[a-zA-Z]/.test(ch)) {
        let ident = '';
        while (i < clean.length && /[a-zA-Z0-9]/.test(clean[i])) {
          ident += clean[i];
          i++;
        }
        const lowerIdent = ident.toLowerCase();
        // Verificar lista blanca de identificadores permitidos
        if (!ALLOWED_FUNCTIONS.has(lowerIdent) && !ALLOWED_CONSTANTS.has(lowerIdent)) {
          throw new Error(
            `Identificador no autorizado o función prohibida en el evaluador matemático: '${ident}'`,
          );
        }
        tokens.push({ type: 'IDENTIFIER', value: lowerIdent });
        continue;
      }

      // Cualquier otro carácter es terminantemente prohibido
      throw new Error(`Carácter no autorizado en la expresión matemática: '${ch}'`);
    }

    tokens.push({ type: 'EOF', value: '' });
    return tokens;
  }

  private evaluateAST(node: ASTNode, depth: number): number {
    if (depth > 50) {
      throw new Error('Profundidad máxima del árbol AST superada (posible desbordamiento).');
    }

    switch (node.type) {
      case 'Number':
        return node.value;

      case 'Constant':
        return node.value;

      case 'Unary': {
        const val = this.evaluateAST(node.expr, depth + 1);
        return node.op === '-' ? -val : val;
      }

      case 'Binary': {
        const left = this.evaluateAST(node.left, depth + 1);
        const right = this.evaluateAST(node.right, depth + 1);

        switch (node.op) {
          case '+':
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            if (right === 0) {
              throw new Error('División por cero no permitida.');
            }
            return left / right;
          case '%':
            if (right === 0) {
              throw new Error('Módulo por cero no permitido.');
            }
            return left % right;
          case '^':
            return Math.pow(left, right);
        }
      }

      case 'FunctionCall': {
        const evaluatedArgs = node.args.map((arg) => this.evaluateAST(arg, depth + 1));
        const fn = node.name.toLowerCase();

        switch (fn) {
          case 'sqrt':
            if (evaluatedArgs[0] < 0) throw new Error('Raíz cuadrada de número negativo no soportada.');
            return Math.sqrt(evaluatedArgs[0]);
          case 'cbrt':
            return Math.cbrt(evaluatedArgs[0]);
          case 'abs':
            return Math.abs(evaluatedArgs[0]);
          case 'round':
            return Math.round(evaluatedArgs[0]);
          case 'floor':
            return Math.floor(evaluatedArgs[0]);
          case 'ceil':
            return Math.ceil(evaluatedArgs[0]);
          case 'sin':
            return Math.sin(evaluatedArgs[0]);
          case 'cos':
            return Math.cos(evaluatedArgs[0]);
          case 'tan':
            return Math.tan(evaluatedArgs[0]);
          case 'asin':
            return Math.asin(evaluatedArgs[0]);
          case 'acos':
            return Math.acos(evaluatedArgs[0]);
          case 'atan':
            return Math.atan(evaluatedArgs[0]);
          case 'log':
            if (evaluatedArgs[0] <= 0) throw new Error('Logaritmo de número no positivo.');
            return Math.log(evaluatedArgs[0]);
          case 'log10':
            if (evaluatedArgs[0] <= 0) throw new Error('Logaritmo de número no positivo.');
            return Math.log10(evaluatedArgs[0]);
          case 'log2':
            if (evaluatedArgs[0] <= 0) throw new Error('Logaritmo de número no positivo.');
            return Math.log2(evaluatedArgs[0]);
          case 'exp':
            return Math.exp(evaluatedArgs[0]);
          case 'pow':
            return Math.pow(evaluatedArgs[0], evaluatedArgs[1]);
          case 'min':
            return Math.min(...evaluatedArgs);
          case 'max':
            return Math.max(...evaluatedArgs);
          default:
            throw new Error(`Función no implementada en la lista blanca: '${node.name}'`);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. MOTOR DETERMINISTA DE FECHAS (DateMath)
  // ════════════════════════════════════════════════════════════════════════════

  private isDateMathQuery(n: string): boolean {
    return (
      /(?:dura|duracion|a que hora termina|inicia\s+\d{1,2}:\d{2}|comienza\s+\d{1,2}:\d{2})/i.test(n) ||
      /(?:cuantos dias faltan|dias para terminar el ano|dias para fin de ano|cuanto falta para fin de ano)/i.test(n) ||
      /(?:dentro de \d+\s*(?:dias|semanas|meses)|en \d+\s*dias|hace \d+\s*(?:dias|semanas))/i.test(n) ||
      /(?:que dia cae el \d{1,2}\s+de\s+[a-z]+)/i.test(n)
    );
  }

  private resolveDateMath(
    rawMessage: string,
    normalized: string,
    startTime: number,
  ): CapabilityResult<MathResultData> {
    // A. Adición de duración: evento inicia a las HH:mm y dura X minutos
    const durationMatch = normalized.match(
      /(?:inicia|comienza|empieza)?\s*(?:a\s+las?)?\s*(\d{1,2}):(\d{2})\s*(?:y\s+)?dura\s+(\d+)\s*(?:minutos?|min)/i,
    );
    if (durationMatch) {
      const hours = parseInt(durationMatch[1], 10);
      const minutes = parseInt(durationMatch[2], 10);
      const durationMin = parseInt(durationMatch[3], 10);

      const totalMinutes = hours * 60 + minutes + durationMin;
      const endHours = Math.floor(totalMinutes / 60) % 24;
      const endMinutes = totalMinutes % 60;
      const formattedEndTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

      const durationMs = Date.now() - startTime;
      const data: MathResultData = {
        operationType: 'DATE_MATH_DURATION',
        rawExpression: rawMessage,
        sanitizedExpression: `Inicio: ${hours}:${minutes} + Duración: ${durationMin} min`,
        result: formattedEndTime,
        verified: true,
        explanationSnippet: `Un evento que inicia a las ${hours}:${minutes} y dura ${durationMin} minutos finaliza a las ${formattedEndTime}.`,
      };

      return {
        capabilityId: this.id,
        status: 'SUCCESS',
        safetyLevel: this.safetyLevel,
        durationMs,
        data,
        promptContextSnippet: `[DATO TEMPORAL VERIFICADO]: El evento finaliza a las ${formattedEndTime} (Cálculo horario determinista)`,
      };
    }

    // B. Días restantes para fin de año
    if (/(?:cuantos dias faltan|dias para terminar el ano|dias para fin de ano)/i.test(normalized)) {
      const now = new Date();
      const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      const diffMs = endOfYear.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      const durationMs = Date.now() - startTime;
      const data: MathResultData = {
        operationType: 'DATE_MATH_DIFFERENCE',
        rawExpression: rawMessage,
        sanitizedExpression: `Días hasta 31 de Diciembre de ${now.getFullYear()}`,
        result: daysRemaining.toString(),
        numericValue: daysRemaining,
        verified: true,
        explanationSnippet: `Faltan ${daysRemaining} días para finalizar el año ${now.getFullYear()}.`,
      };

      return {
        capabilityId: this.id,
        status: 'SUCCESS',
        safetyLevel: this.safetyLevel,
        durationMs,
        data,
        promptContextSnippet: `[DATO TEMPORAL VERIFICADO]: Faltan ${daysRemaining} días para terminar el año ${now.getFullYear()}`,
      };
    }

    // C. Días relativos: "dentro de X días qué fecha será"
    const relativeMatch = normalized.match(/(?:dentro de|en)\s+(\d+)\s*dias/i);
    if (relativeMatch) {
      const days = parseInt(relativeMatch[1], 10);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const formattedDate = targetDate.toLocaleDateString('es-AR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const durationMs = Date.now() - startTime;
      const data: MathResultData = {
        operationType: 'DATE_MATH_DIFFERENCE',
        rawExpression: rawMessage,
        sanitizedExpression: `Hoy + ${days} días`,
        result: formattedDate,
        verified: true,
        explanationSnippet: `Dentro de ${days} días será ${formattedDate}.`,
      };

      return {
        capabilityId: this.id,
        status: 'SUCCESS',
        safetyLevel: this.safetyLevel,
        durationMs,
        data,
        promptContextSnippet: `[DATO TEMPORAL VERIFICADO]: Dentro de ${days} días será ${formattedDate}`,
      };
    }

    return {
      capabilityId: this.id,
      status: 'NO_RESULTS',
      safetyLevel: this.safetyLevel,
      durationMs: Date.now() - startTime,
      error: { code: 'UNHANDLED_DATE_MATH_QUERY', message: 'No se pudo interpretar el cálculo de fecha.', recoverable: true },
      fallbackDirective: 'Explica el cálculo de fechas de manera general sin asegurar fechas inexactas.',
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PARSER DE DESCENSO RECURSIVO PARA AST MATEMÁTICO
// ════════════════════════════════════════════════════════════════════════════

interface Token {
  type: 'NUMBER' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'IDENTIFIER' | 'EOF';
  value: any;
}

class ASTMathParser {
  private pos = 0;

  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTNode {
    const node = this.parseExpression();
    if (this.peek().type !== 'EOF') {
      throw new Error(`Símbolo inesperado al final de la expresión: '${this.peek().value}'`);
    }
    return node;
  }

  getSanitizedExpression(): string {
    return this.tokens
      .filter((t) => t.type !== 'EOF')
      .map((t) => t.value)
      .join(' ');
  }

  // Expression = Term ( ('+' | '-') Term )*
  private parseExpression(): ASTNode {
    let node = this.parseTerm();

    while (this.peek().type === 'OPERATOR' && ['+', '-'].includes(this.peek().value)) {
      const op = this.consume().value as '+' | '-';
      const right = this.parseTerm();
      node = { type: 'Binary', op, left: node, right };
    }

    return node;
  }

  // Term = Power ( ('*' | '/' | '%') Power )*
  private parseTerm(): ASTNode {
    let node = this.parsePower();

    while (this.peek().type === 'OPERATOR' && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.consume().value as '*' | '/' | '%';
      const right = this.parsePower();
      node = { type: 'Binary', op, left: node, right };
    }

    return node;
  }

  // Power = Factor ( '^' Factor )*
  private parsePower(): ASTNode {
    let node = this.parseFactor();

    while (this.peek().type === 'OPERATOR' && this.peek().value === '^') {
      const op = this.consume().value as '^';
      const right = this.parseFactor();
      node = { type: 'Binary', op, left: node, right };
    }

    return node;
  }

  // Factor = Unary | FunctionCall | Number | Constant | '(' Expression ')'
  private parseFactor(): ASTNode {
    const token = this.peek();

    // Unary plus or minus
    if (token.type === 'OPERATOR' && ['+', '-'].includes(token.value)) {
      const op = this.consume().value as '+' | '-';
      const expr = this.parseFactor();
      return { type: 'Unary', op, expr };
    }

    // Number literal
    if (token.type === 'NUMBER') {
      this.consume();
      return { type: 'Number', value: token.value };
    }

    // Identifier: constant or function call
    if (token.type === 'IDENTIFIER') {
      const identToken = this.consume();
      const ident = identToken.value.toLowerCase();

      // Check for constant (pi, e)
      if (ALLOWED_CONSTANTS.has(ident) && this.peek().type !== 'LPAREN') {
        return { type: 'Constant', name: ident as 'pi' | 'e', value: ALLOWED_CONSTANTS.get(ident)! };
      }

      // Must be a function call: ident '(' args ')'
      if (this.peek().type === 'LPAREN') {
        this.consume(); // consume '('
        const args: ASTNode[] = [];

        if (this.peek().type !== 'RPAREN') {
          args.push(this.parseExpression());
          while (this.peek().type === 'COMMA') {
            this.consume(); // consume ','
            args.push(this.parseExpression());
          }
        }

        if (this.peek().type !== 'RPAREN') {
          throw new Error(`Se esperaba ')' tras los argumentos de la función '${ident}'`);
        }
        this.consume(); // consume ')'

        return { type: 'FunctionCall', name: ident, args };
      }

      throw new Error(`Identificador '${ident}' no reconocido o mal ubicado en la expresión.`);
    }

    // Parenthesized expression: '(' Expression ')'
    if (token.type === 'LPAREN') {
      this.consume(); // consume '('
      const node = this.parseExpression();
      if (this.peek().type !== 'RPAREN') {
        throw new Error("Se esperaba ')' para cerrar la expresión entre paréntesis.");
      }
      this.consume(); // consume ')'
      return node;
    }

    throw new Error(`Token inesperado en la expresión matemática: '${token.value || token.type}'`);
  }

  private peek(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '' };
  }

  private consume(): Token {
    const token = this.peek();
    this.pos++;
    return token;
  }
}
