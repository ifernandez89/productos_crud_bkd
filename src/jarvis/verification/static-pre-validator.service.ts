import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';
import * as path from 'path';
import {
  StaticValidationOptions,
  StaticValidationResult,
  StructuredDiagnostic,
} from './verification-harness.types';

@Injectable()
export class StaticPreValidatorService {
  private readonly defaultSecurityRules: Array<{
    pattern: RegExp;
    reason: string;
  }> = [
    {
      pattern: /\beval\s*\(/,
      reason: 'Uso prohibido de eval() detectado (riesgo de ejecución arbitraria).',
    },
    {
      pattern: /\bnew\s+Function\s*\(|\bFunction\s*\(/,
      reason: 'Uso prohibido del constructor Function() detectado.',
    },
    {
      pattern: /\bchild_process\b|\b(?:execSync|spawnSync|execFileSync)\s*\(/,
      reason: 'Acceso no autorizado a subprocesos del sistema anfitrión (child_process).',
    },
    {
      pattern: /\bprocess\.env\b/,
      reason: 'Acceso prohibido a process.env (aislamiento de secretos y credenciales).',
    },
    {
      pattern: /\b(?:__JARBEES_HIDDEN_TESTS__|hiddenTestsSource|checkpointIntegrityHash)\b/,
      reason: 'Intento prohibido de inspeccionar o alterar las pruebas ocultas o el evaluador.',
    },
  ];

  validateFiles(
    files: Record<string, string>,
    options: StaticValidationOptions = {},
  ): StaticValidationResult {
    const compileErrors: StructuredDiagnostic[] = [];
    const scopeErrors: StructuredDiagnostic[] = [];
    const securityViolations: StructuredDiagnostic[] = [];
    const lintWarnings: StructuredDiagnostic[] = [];

    let totalFunctions = 0;
    let totalCyclomatic = 1;
    let totalLines = 0;

    const allowedSet = options.allowedFiles
      ? new Set(options.allowedFiles.map((f) => this.normalizeRelPath(f)))
      : null;

    const fileEntries = Object.entries(files);
    if (fileEntries.length === 0) {
      compileErrors.push({
        category: 'SYNTAX_OR_COMPILE_ERROR',
        severity: 'error',
        message: 'No se proporcionó ningún archivo de código para validar.',
      });
    }

    for (const [rawFilePath, rawContent] of fileEntries) {
      const normalizedPath = this.normalizeRelPath(rawFilePath);

      // 1. Verificar confinamiento de archivos e intentos de path traversal
      if (
        rawFilePath.includes('..') ||
        path.isAbsolute(rawFilePath) ||
        normalizedPath.startsWith('..')
      ) {
        securityViolations.push({
          category: 'SECURITY_INVARIANT_VIOLATION',
          severity: 'critical',
          file: rawFilePath,
          message: `Violación de confinamiento de ruta (path traversal o ruta absoluta): "${rawFilePath}".`,
        });
      } else if (allowedSet && !allowedSet.has(normalizedPath)) {
        securityViolations.push({
          category: 'SECURITY_INVARIANT_VIOLATION',
          severity: 'critical',
          file: rawFilePath,
          message: `Intento de modificar un archivo externo a la misión ("${rawFilePath}"). Archivos permitidos: [${[...allowedSet].join(', ')}].`,
        });
      }

      const content = (rawContent ?? '').trim();
      if (!content) {
        compileErrors.push({
          category: 'SYNTAX_OR_COMPILE_ERROR',
          severity: 'error',
          file: normalizedPath,
          message: `El archivo "${normalizedPath}" está vacío.`,
        });
        continue;
      }

      const lines = content.split(/\r?\n/);
      totalLines += lines.length;

      // 2. Reglas de seguridad e invariantes críticos
      const activeSecurityRules = [
        ...this.defaultSecurityRules,
        ...(options.forbiddenPatterns ?? []).map((r) => ({
          pattern: r.pattern,
          reason: r.reason,
        })),
      ];

      for (const rule of activeSecurityRules) {
        const match = rule.pattern.exec(content);
        if (match) {
          const lineNum = this.findLineNumber(content, match.index);
          securityViolations.push({
            category: 'SECURITY_INVARIANT_VIOLATION',
            severity: 'critical',
            file: normalizedPath,
            line: lineNum,
            message: rule.reason,
            evidence: match[0],
          });
        }
      }

      // 3. Diagnósticos sintácticos de TypeScript (transpileModule + AST)
      const tsResult = ts.transpileModule(content, {
        fileName: normalizedPath.endsWith('.ts')
          ? normalizedPath
          : `${normalizedPath}.ts`,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          experimentalDecorators: true,
          strict: false,
          noEmitOnError: false,
        },
      });

      if (tsResult.diagnostics && tsResult.diagnostics.length > 0) {
        for (const diag of tsResult.diagnostics) {
          const messageText = ts.flattenDiagnosticMessageText(
            diag.messageText,
            '\n',
          );
          let lineNum: number | undefined;
          if (diag.file && typeof diag.start === 'number') {
            const pos = diag.file.getLineAndCharacterOfPosition(diag.start);
            lineNum = pos.line + 1;
          }
          compileErrors.push({
            category: 'SYNTAX_OR_COMPILE_ERROR',
            severity: 'error',
            file: normalizedPath,
            line: lineNum,
            message: `TS${diag.code}: ${messageText}`,
          });
        }
      }

      // 4. Análisis AST con TypeScript SourceFile (redeclaraciones léxicas, métricas y lint)
      const sourceFile = ts.createSourceFile(
        normalizedPath,
        content,
        ts.ScriptTarget.ES2022,
        true,
      );
      const astAnalysis = this.analyzeAstNode(sourceFile, normalizedPath);
      compileErrors.push(...astAnalysis.redeclarationErrors);
      lintWarnings.push(...astAnalysis.lintWarnings);
      totalFunctions += astAnalysis.functionCount;
      totalCyclomatic += astAnalysis.branchCount;

      // 5. Análisis de alcance léxico en bloques try / catch / finally
      const blockScopeDiagnostics = this.detectTryCatchBlockScopeLeaks(
        content,
        normalizedPath,
      );
      scopeErrors.push(...blockScopeDiagnostics);
    }

    // 6. Verificar exportaciones / contratos obligatorios (deben existir en al menos uno de los archivos del conjunto)
    if (
      options.requiredExports &&
      options.requiredExports.length > 0 &&
      fileEntries.length > 0
    ) {
      for (const symbolName of options.requiredExports) {
        const symbolRegex = new RegExp(
          `\\b(?:function|class|const|let|var|interface|type|enum)\\s+${symbolName}\\b|\\bexports\\.${symbolName}\\b|\\bmodule\\.exports\\b`,
        );
        const foundInAnyFile = fileEntries.some(([, rawContent]) =>
          symbolRegex.test((rawContent ?? '').trim()),
        );
        if (!foundInAnyFile) {
          const primaryFile = this.normalizeRelPath(fileEntries[0][0]);
          compileErrors.push({
            category: 'SYNTAX_OR_COMPILE_ERROR',
            severity: 'error',
            file: primaryFile,
            message: `Violación de contrato: No se encontró el símbolo requerido "${symbolName}" en los archivos de la misión.`,
          });
        }
      }
    }

    const passed =
      securityViolations.length === 0 &&
      compileErrors.length === 0 &&
      scopeErrors.length === 0;

    return {
      passed,
      compileErrors,
      scopeErrors,
      securityViolations,
      lintWarnings,
      astMetrics: {
        functionCount: totalFunctions,
        cyclomaticEstimate: totalCyclomatic,
        lineCount: totalLines,
      },
    };
  }

  private analyzeAstNode(
    sourceFile: ts.SourceFile,
    fileName: string,
  ): {
    redeclarationErrors: StructuredDiagnostic[];
    lintWarnings: StructuredDiagnostic[];
    functionCount: number;
    branchCount: number;
  } {
    const redeclarationErrors: StructuredDiagnostic[] = [];
    const lintWarnings: StructuredDiagnostic[] = [];
    let functionCount = 0;
    let branchCount = 0;

    const visitScope = (node: ts.Node, scopeDecls: Map<string, number>) => {
      ts.forEachChild(node, (child) => {
        if (
          ts.isFunctionDeclaration(child) ||
          ts.isMethodDeclaration(child) ||
          ts.isArrowFunction(child) ||
          ts.isFunctionExpression(child)
        ) {
          functionCount++;
        }

        if (
          ts.isIfStatement(child) ||
          ts.isForStatement(child) ||
          ts.isForOfStatement(child) ||
          ts.isForInStatement(child) ||
          ts.isWhileStatement(child) ||
          ts.isConditionalExpression(child) ||
          ts.isCaseClause(child) ||
          ts.isCatchClause(child)
        ) {
          branchCount++;
        }

        if (ts.isVariableDeclarationList(child)) {
          const isVar = (child.flags & ts.NodeFlags.BlockScoped) === 0;
          if (isVar) {
            const line =
              sourceFile.getLineAndCharacterOfPosition(child.getStart()).line +
              1;
            lintWarnings.push({
              category: 'LINT_OR_CONTRACT_WARNING',
              severity: 'warning',
              file: fileName,
              line,
              message:
                'Uso de "var" detectado; se recomienda "const" o "let" para alcance de bloque.',
            });
          }

          for (const decl of child.declarations) {
            if (ts.isIdentifier(decl.name)) {
              const idName = decl.name.text;
              const line =
                sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line +
                1;
              if (scopeDecls.has(idName) && !isVar) {
                redeclarationErrors.push({
                  category: 'SYNTAX_OR_COMPILE_ERROR',
                  severity: 'error',
                  file: fileName,
                  line,
                  message: `Identificador '${idName}' redeclarado en el mismo ámbito (declaración previa en línea ${scopeDecls.get(idName)}).`,
                });
              } else {
                scopeDecls.set(idName, line);
              }
            }
          }
        }

        if (ts.isCatchClause(child) && child.block.statements.length === 0) {
          const line =
            sourceFile.getLineAndCharacterOfPosition(child.getStart()).line + 1;
          lintWarnings.push({
            category: 'LINT_OR_CONTRACT_WARNING',
            severity: 'warning',
            file: fileName,
            line,
            message: 'Bloque catch vacío detectado (silencia errores sin trazabilidad).',
          });
        }

        if (
          ts.isBlock(child) ||
          ts.isSourceFile(child) ||
          ts.isFunctionLike(child) ||
          ts.isModuleBlock(child)
        ) {
          visitScope(child, new Map<string, number>());
        } else {
          visitScope(child, scopeDecls);
        }
      });
    };

    visitScope(sourceFile, new Map<string, number>());

    return {
      redeclarationErrors,
      lintWarnings,
      functionCount,
      branchCount,
    };
  }

  /**
   * Detecta variables declaradas con const/let en el nivel superior de un bloque try { ... }
   * que luego son referenciadas dentro de catch { ... } o finally { ... } provocando ReferenceError en ejecución.
   */
  private detectTryCatchBlockScopeLeaks(
    code: string,
    fileName: string,
  ): StructuredDiagnostic[] {
    const diagnostics: StructuredDiagnostic[] = [];
    const tryRegex = /\btry\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = tryRegex.exec(code)) !== null) {
      const openBraceIdx = code.indexOf('{', match.index);
      const tryBlock = this.extractBalancedBlock(code, openBraceIdx);
      if (!tryBlock) continue;

      let afterTry = code.slice(tryBlock.end + 1).trimStart();
      let catchAndFinallyText = '';

      if (afterTry.startsWith('catch')) {
        const catchBrace = afterTry.indexOf('{');
        const catchBlock = this.extractBalancedBlock(afterTry, catchBrace);
        if (catchBlock) {
          catchAndFinallyText += catchBlock.body + '\n';
          afterTry = afterTry.slice(catchBlock.end + 1).trimStart();
        }
      }

      if (afterTry.startsWith('finally')) {
        const finBrace = afterTry.indexOf('{');
        const finBlock = this.extractBalancedBlock(afterTry, finBrace);
        if (finBlock) {
          catchAndFinallyText += finBlock.body + '\n';
        }
      }

      if (!catchAndFinallyText) continue;

      const declRegex = /\b(?:let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
      let declMatch: RegExpExecArray | null;
      while ((declMatch = declRegex.exec(tryBlock.body)) !== null) {
        const varName = declMatch[1];
        const redeclaredInCatch = new RegExp(
          `\\b(?:let|const|var)\\s+${varName}\\b|catch\\s*\\(\\s*${varName}\\b`,
        ).test(catchAndFinallyText);

        if (
          !redeclaredInCatch &&
          new RegExp(`\\b${varName}\\b`).test(catchAndFinallyText)
        ) {
          const line = this.findLineNumber(
            code,
            openBraceIdx + declMatch.index,
          );
          diagnostics.push({
            category: 'STATIC_SCOPE_ERROR',
            severity: 'error',
            file: fileName,
            line,
            message: `Error de alcance de bloque (block-scope): '${varName}' fue declarada con let/const dentro de try { ... } pero se referencia en catch/finally. Declárala antes del bloque try.`,
            evidence: varName,
          });
        }
      }
    }

    return diagnostics;
  }

  private extractBalancedBlock(
    src: string,
    startBraceIdx: number,
  ): { body: string; end: number } | null {
    if (startBraceIdx < 0 || src[startBraceIdx] !== '{') return null;
    let depth = 0;
    let inString: string | null = null;
    let escape = false;

    for (let i = startBraceIdx; i < src.length; i++) {
      const ch = src[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (inString) {
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return {
            body: src.slice(startBraceIdx + 1, i),
            end: i,
          };
        }
      }
    }
    return null;
  }

  private findLineNumber(content: string, index: number): number {
    if (index <= 0) return 1;
    let lines = 1;
    for (let i = 0; i < index && i < content.length; i++) {
      if (content[i] === '\n') lines++;
    }
    return lines;
  }

  private normalizeRelPath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  }
}

