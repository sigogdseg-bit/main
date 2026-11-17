import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Comutação Automática de Perfil por Modelo (J16 vs G900L)", () => {
  const filePath = path.resolve(
    process.cwd(),
    "src/features/seguranca/components/RastreadorJ16View.tsx",
  );
  const fileContent = fs.readFileSync(filePath, "utf8");

  it("1. Deve conter a função unificada aplicarPerfilModelo tratando todos, j16 e g900l", () => {
    assert.ok(
      fileContent.includes("const aplicarPerfilModelo = (modelo:"),
      "aplicarPerfilModelo deve estar declarada no componente",
    );
    assert.ok(fileContent.includes('if (modelo === "g900l")'), "Deve tratar modelo g900l");
    assert.ok(fileContent.includes('else if (modelo === "j16")'), "Deve tratar modelo j16");
  });

  it("2. Deve comutar os comandos Coban corretos no modelo G900L", () => {
    assert.ok(
      fileContent.includes("adminip${senha} 167.234.233.82 7003"),
      "G900L deve apontar adminip sem hash",
    );
    assert.ok(fileContent.includes("fix030s***n${senha}"), "G900L deve aplicar timer fix030s***n");
    assert.ok(fileContent.includes("hbt${senha} 300"), "G900L deve aplicar hbt");
    assert.ok(fileContent.includes("time zone${senha} 0"), "G900L deve aplicar fuso time zone");
    assert.ok(fileContent.includes("check${senha}"), "G900L deve aplicar check");
    assert.ok(fileContent.includes("status${senha}"), "G900L deve aplicar status");
    assert.ok(fileContent.includes("reset${senha}"), "G900L deve aplicar reset");
  });

  it("3. Seletor de Perfil deve estar presente na Seção 1 (Grade de Parâmetros) e Seção 2 (Tabela)", () => {
    const ocorrenciasJ16 = (fileContent.match(/aplicarPerfilModelo\("j16"\)/g) || []).length;
    const ocorrenciasG900L = (fileContent.match(/aplicarPerfilModelo\("g900l"\)/g) || []).length;
    assert.ok(
      ocorrenciasJ16 >= 2,
      `aplicarPerfilModelo("j16") deve aparecer ao menos 2 vezes (Seção 1 e Seção 2). Encontrado: ${ocorrenciasJ16}`,
    );
    assert.ok(
      ocorrenciasG900L >= 2,
      `aplicarPerfilModelo("g900l") deve aparecer ao menos 2 vezes (Seção 1 e Seção 2). Encontrado: ${ocorrenciasG900L}`,
    );
  });

  it("4. Ações rápidas de 1 clique na tabela e cards devem comutar dinamicamente por modelo do dispositivo", () => {
    assert.ok(
      fileContent.includes('mod.includes("g900")') && fileContent.includes('mod.includes("coban")'),
      "Deve detectar se o dispositivo é G900L nas ações rápidas",
    );
    assert.ok(
      fileContent.includes('const cmdStatus = ehG900L ? `status${senha}` : "STATUS#";'),
      "STATUS deve comutar para status<senha> se G900L",
    );
    assert.ok(
      fileContent.includes('const cmdParam = ehG900L ? `check${senha}` : "PARAM#";'),
      "PARAM deve comutar para check<senha> se G900L",
    );
    assert.ok(
      fileContent.includes('const cmdReleDesbloqueio = ehG900L ? `resume${senha}` : "RELAY,0";'),
      "LIBERAR deve comutar para resume<senha> se G900L",
    );
    assert.ok(
      fileContent.includes('const cmdReleBloqueio = ehG900L ? `stop${senha}` : "RELAY,1";'),
      "CORTAR deve comutar para stop<senha> se G900L",
    );
  });
});
