import { describe, it } from "node:test";
import assert from "node:assert";
import {
  clusterizarVeiculos,
  gerarMarcadorClusterHtml,
} from "../../features/monitor-gps/utils/clusterVeiculos";
import type { VeiculoGps } from "../../features/monitor-gps/types";

describe("Agrupamento Tático de Veículos e Enquadramento da Frota", () => {
  const veiculosExemplo: VeiculoGps[] = [
    {
      id: "v1",
      placa: "KVP6G73",
      marca_modelo: "Mitsubishi L200",
      latitude: -22.52,
      longitude: -44.1,
      ignicao: true,
      velocidade: 40,
      bloqueado: false,
      status_operacional: "em_rota",
      tipo_veiculo: "camionete",
      cliente_nome: "Cliente A",
    },
    {
      id: "v2",
      placa: "LLX1E37",
      marca_modelo: "Fiat Uno",
      latitude: -22.521,
      longitude: -44.102,
      ignicao: false,
      velocidade: 0,
      bloqueado: false,
      status_operacional: "estacionado",
      tipo_veiculo: "carro",
      cliente_nome: "Cliente A",
    },
    {
      id: "v3",
      placa: "RFO6I08",
      marca_modelo: "Caminhão Volvo",
      latitude: -22.9068, // Rio de Janeiro (veículo distante)
      longitude: -43.1729,
      ignicao: true,
      velocidade: 60,
      bloqueado: false,
      status_operacional: "em_rota",
      tipo_veiculo: "caminhao",
      cliente_nome: "Cliente B",
    },
  ];

  it("1. Deve agrupar veículos próximos em nível de zoom baixo (visão de estado/país)", () => {
    // Zoom 10 (visão distante)
    const elementos = clusterizarVeiculos(veiculosExemplo, 10);
    // v1 e v2 estão juntos em Volta Redonda, v3 está longe no Rio de Janeiro
    assert.strictEqual(elementos.length, 2);

    const clusterVR = elementos.find((el) => el.tipo === "cluster");
    assert.ok(clusterVR);
    if (clusterVR && clusterVR.tipo === "cluster") {
      assert.strictEqual(clusterVR.cluster.quantidade, 2);
      const ids = clusterVR.cluster.veiculos.map((v) => v.id);
      assert.ok(ids.includes("v1"));
      assert.ok(ids.includes("v2"));
    }

    const isoladoRJ = elementos.find((el) => el.tipo === "veiculo");
    assert.ok(isoladoRJ);
    if (isoladoRJ && isoladoRJ.tipo === "veiculo") {
      assert.strictEqual(isoladoRJ.veiculo.id, "v3");
    }
  });

  it("2. Deve voltar a exibir os pins individuais ao dar zoom (zoom >= 14)", () => {
    // Zoom 15 (visão de rua)
    const elementos = clusterizarVeiculos(veiculosExemplo, 15);
    assert.strictEqual(elementos.length, 3);
    assert.ok(elementos.every((el) => el.tipo === "veiculo"));
  });

  it("3. O marcador de cluster deve ter fundo laranja escuro e número em preto", () => {
    const html = gerarMarcadorClusterHtml(5);
    // Círculo com fundo laranja escuro
    assert.ok(html.includes("linear-gradient(135deg, #f97316 0%, #ea580c 45%, #c2410c 100%)"));
    assert.ok(html.includes("border: 3px solid #7c2d12"));
    // Número em preto
    assert.ok(html.includes("color: #000000"));
    assert.ok(html.includes("5"));
  });
});
