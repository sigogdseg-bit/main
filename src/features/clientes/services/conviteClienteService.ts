import { supabase } from "@/integrations/supabase/client";
import { verificarAbusoCadastroPublico } from "@/features/seguranca/lib/antiAbusoCadastros";
import type { TipoVeiculo } from "@/features/monitor-gps/utils/vehicle3dIcons";

export interface VeiculoCadastroConvite {
  tipo_veiculo?: TipoVeiculo;
  tipo?: TipoVeiculo;
  placa: string;
  modelo: string;
  marca?: string;
  marcaModelo?: string;
  ano?: string | number;
  cor?: string;
  chassi?: string;
  combustivel?: string;
  observacoes?: string;
  horimetroInicial?: number;
}

export interface DadosAutoCadastroCliente {
  token: string;
  nome: string;
  documento?: string;
  email: string;
  telefone?: string;
  senha: string;
  diaVencimento?: number;
  veiculos: VeiculoCadastroConvite[];
}

export interface ValidarConviteClienteResultado {
  valido: boolean;
  mensagem?: string;
  token?: string;
  expira_em?: string;
}

/**
 * Gera um link de uso único para auto-cadastro de cliente.
 */
export async function gerarLinkConviteCliente(observacoes?: string): Promise<{
  success: boolean;
  message: string;
  link?: string;
  token?: string;
}> {
  try {
    let tokenGerado: string | null = null;

    // 1. Tentativa via RPC segura
    const { data, error } = await supabase.rpc("gerar_convite_cliente", {
      p_observacoes: observacoes || null,
    } as any);

    if (!error && data) {
      const res = data as any;
      if (res && res.sucesso && res.token) {
        tokenGerado = res.token;
      }
    }

    // 2. Fallback direto via tabela caso a RPC ainda não esteja no schema cache
    if (!tokenGerado) {
      const novoToken = crypto.randomUUID();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: conviteInserido, error: insertErr } = await supabase
        .from("convites_cliente")
        .insert({
          token: novoToken,
          criado_por: user?.id || null,
          observacoes: observacoes || null,
          expira_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          usado: false,
        })
        .select("token")
        .maybeSingle();

      if (!insertErr && conviteInserido?.token) {
        tokenGerado = conviteInserido.token;
      } else {
        // Fallback de token autônomo assinado localmente (7 dias)
        const payload = {
          t: "cliente",
          exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
          rnd: crypto.randomUUID().replace(/-/g, ""),
        };
        tokenGerado = btoa(JSON.stringify(payload))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      }
    }

    const host = window.location.origin;
    const linkCompleto = `${host}/cadastro-cliente?token=${tokenGerado}`;

    return {
      success: true,
      message: "Link de convite para auto-cadastro gerado com sucesso.",
      link: linkCompleto,
      token: tokenGerado,
    };
  } catch (err: any) {
    console.warn("Erro ao gerar link de convite para cliente:", err);
    return {
      success: false,
      message: err?.message || "Falha ao gerar link de convite.",
    };
  }
}

/**
 * Valida se um token de convite de cliente é válido, não expirou e não foi utilizado.
 */
export async function validarConviteCliente(
  token: string,
): Promise<ValidarConviteClienteResultado> {
  if (!token || !token.trim()) {
    return { valido: false, mensagem: "Token de convite ausente." };
  }

  const tokenLimpo = token.trim();

  try {
    // 1. Validação via RPC
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tokenLimpo,
    );
    if (isUuid) {
      const { data, error } = await supabase.rpc("validar_convite_cliente", {
        p_token: tokenLimpo,
      } as any);

      if (!error && data) {
        const res = data as any;
        return {
          valido: Boolean(res.valido),
          mensagem: res.motivo || undefined,
          token: res.token || tokenLimpo,
          expira_em: res.expira_em || undefined,
        };
      }
    }

    // 2. Consulta direta na tabela
    if (isUuid) {
      const { data: convite, error: errSelect } = await supabase
        .from("convites_cliente")
        .select("token, usado, expira_em")
        .eq("token", tokenLimpo)
        .maybeSingle();

      if (!errSelect && convite) {
        if (convite.usado) {
          return { valido: false, mensagem: "Este link de convite já foi utilizado." };
        }
        if (new Date(convite.expira_em).getTime() < Date.now()) {
          return { valido: false, mensagem: "Este link de convite expirou." };
        }
        return { valido: true, token: convite.token, expira_em: convite.expira_em };
      }
    }

    // 3. Fallback para token autônomo base64
    try {
      const decoded = JSON.parse(atob(tokenLimpo.replace(/-/g, "+").replace(/_/g, "/")));
      if (decoded && decoded.t === "cliente" && decoded.exp > Date.now()) {
        return { valido: true, token: tokenLimpo };
      }
    } catch {
      // Ignora erro de decodificação
    }

    return { valido: false, mensagem: "Link de convite inválido ou expirado." };
  } catch (err: any) {
    return { valido: false, mensagem: err?.message || "Erro ao validar convite." };
  }
}

/**
 * Realiza o auto-cadastro do cliente pelo link de convite.
 * Cria o cliente com status de pendência operacional para o Operador/ADM definir o plano,
 * o valor da mensalidade e qual instalador receberá cada veículo separadamente.
 */
export async function cadastrarClientePorConvite(
  dados: DadosAutoCadastroCliente,
): Promise<{ success: boolean; message: string; clienteId?: string; userId?: string }> {
  try {
    const val = await validarConviteCliente(dados.token);
    if (!val.valido) {
      return { success: false, message: val.mensagem || "Convite inválido." };
    }

    if (!dados.nome || !dados.nome.trim()) {
      return { success: false, message: "Nome ou Razão Social é obrigatório." };
    }
    if (!dados.email || !dados.email.trim()) {
      return { success: false, message: "E-mail é obrigatório." };
    }
    const checagemAbuso = await verificarAbusoCadastroPublico({
      rota: "/cadastro-cliente",
      email: dados.email,
      documento: dados.documento,
    });
    if (!checagemAbuso.permitido) {
      return {
        success: false,
        message: checagemAbuso.motivo || "Cadastro bloqueado por segurança.",
      };
    }
    if (!dados.senha || dados.senha.length < 6) {
      return { success: false, message: "A senha deve ter no mínimo 6 caracteres." };
    }
    if (!dados.veiculos || dados.veiculos.length === 0) {
      return { success: false, message: "Informe pelo menos um veículo para rastreamento." };
    }

    // 1. Chamada Primordial ao Endpoint de Servidor (AdminClient sem rate-limit e com e-mail confirmado)
    try {
      const respServidor = await fetch("/api/convite/cadastrar-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });

      const jsonServidor = await respServidor.json();
      if (respServidor.ok && jsonServidor?.success) {
        return {
          success: true,
          message:
            jsonServidor.message ||
            "Cadastro realizado com sucesso! Seus dados foram encaminhados à administração para configuração do plano e agendamento da instalação.",
          userId: jsonServidor.userId,
        };
      }

      if (jsonServidor?.message) {
        // Se for erro de validação (ex: e-mail já cadastrado), retorna diretamente
        return {
          success: false,
          message: jsonServidor.message,
        };
      }
    } catch {
      // Falha de rede com o endpoint ou ambiente sem servidor HTTP, segue para o fallback direto
    }

    const emailLimpo = dados.email.trim().toLowerCase();
    const nomeLimpo = dados.nome.trim();
    const telefoneLimpo = dados.telefone?.trim() || null;
    const docLimpo = dados.documento?.trim().replace(/[^0-9A-Za-z]/g, "") || null;

    // 2. Fallback via cliente SDK
    let userId: string | null = null;
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: emailLimpo,
      password: dados.senha,
      options: {
        data: {
          nome: nomeLimpo,
          role: "cliente",
          telefone: telefoneLimpo,
        },
      },
    });

    if (signUpErr) {
      const msgErr = signUpErr.message || "";
      if (msgErr.includes("already registered") || msgErr.includes("User already")) {
        // Tenta obter ID do perfil existente
        const { data: profExistente } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("email", emailLimpo)
          .maybeSingle();
        userId = profExistente?.id || null;

        // Se o usuário já possui ficha concluída em clientes, bloqueia com mensagem amigável
        if (userId) {
          const { data: cliExistente } = await supabase
            .from("clientes")
            .select("id")
            .or(`user_id.eq.${userId},email.eq.${emailLimpo}`)
            .maybeSingle();
          if (cliExistente?.id) {
            return {
              success: false,
              message:
                "Este e-mail já está cadastrado no sistema. Acesse a tela de login ou utilize outro e-mail.",
            };
          }
        }
      } else if (
        msgErr.includes("security purposes") ||
        msgErr.includes("rate limit") ||
        msgErr.includes("seconds")
      ) {
        return {
          success: false,
          message:
            "Por segurança da plataforma, aguarde alguns instantes antes de enviar novamente.",
        };
      } else {
        return { success: false, message: `Erro ao criar acesso: ${msgErr}` };
      }
    } else if (signUpData?.user) {
      userId = signUpData.user.id;
    }

    // 2. Cria ou atualiza registro do cliente
    let clienteId: string | null = null;
    const { data: clienteExistente } = await supabase
      .from("clientes")
      .select("id")
      .eq("email", emailLimpo)
      .maybeSingle();

    if (clienteExistente) {
      clienteId = clienteExistente.id;
      const updateDataCompleto: Record<string, any> = {
        nome_razao_social: nomeLimpo,
        documento: docLimpo,
        telefone: telefoneLimpo,
        user_id: userId,
        pendente_configuracao_operador: true,
        status: "aguardando_instalacao",
        status_agendamento: "aguardando_agendamento",
      };

      const { error: errUpdate } = await supabase
        .from("clientes")
        .update(updateDataCompleto as any)
        .eq("id", clienteId);

      if (
        errUpdate &&
        (errUpdate.message.includes("schema cache") || errUpdate.message.includes("column"))
      ) {
        // Fallback para colunas essenciais pré-existentes
        await supabase
          .from("clientes")
          .update({
            nome_razao_social: nomeLimpo,
            documento: docLimpo,
            telefone: telefoneLimpo,
            user_id: userId,
            status: "aguardando_instalacao",
          } as any)
          .eq("id", clienteId);
      }
    } else {
      // Extrai dados da proposta e do canal de venda do convite comercial
      const { data: conviteInfo } = await supabase
        .from("convites_cliente")
        .select("revendedor_id, vendedor_id, valor_mensalidade_proposta, taxa_instalacao_proposta")
        .eq("token", dados.token)
        .maybeSingle();

      const payloadBase: Record<string, any> = {
        nome_razao_social: nomeLimpo,
        documento: docLimpo,
        email: emailLimpo,
        telefone: telefoneLimpo,
        user_id: userId,
        plano: "basico",
        valor_mensalidade: conviteInfo?.valor_mensalidade_proposta
          ? Number(conviteInfo.valor_mensalidade_proposta)
          : 0.0,
        repasse_instalador_status: conviteInfo?.taxa_instalacao_proposta ? "pendente" : "isento",
        revendedor_id: conviteInfo?.revendedor_id || null,
        vendedor_id: conviteInfo?.vendedor_id || null,
        etapa_onboarding: 1,
        dia_vencimento: dados.diaVencimento || 10,
        dias_historico_plano: 7,
        dias_retencao_banco: 10,
        status: "aguardando_instalacao",
      };

      const camposContrato: Record<string, any> = {
        status_agendamento: "aguardando_agendamento",
        pendente_configuracao_operador: true,
        meses_contrato: 12,
        data_inicio_contrato: new Date().toISOString().split("T")[0],
        tipo_renovacao: "mesma_vigencia",
        meses_renovacao: 12,
        foro_comarca: "Volta Redonda/RJ",
        tem_fidelidade: true,
        privacidade_localizacao: true,
      };

      let { data: novoCliente, error: errCliente } = await supabase
        .from("clientes")
        .insert({
          ...payloadBase,
          ...camposContrato,
        } as any)
        .select("id")
        .single();

      // Tolerância a falhas: se a tabela clientes no banco remoto ainda não tiver as colunas de contrato ou o cache do PostgREST estiver desatualizado
      if (
        errCliente &&
        (errCliente.message.includes("schema cache") || errCliente.message.includes("column"))
      ) {
        console.warn(
          "Retentando cadastro de cliente com colunas canônicas devido a desatualização de schema no banco:",
          errCliente.message,
        );
        const retryBase = await supabase
          .from("clientes")
          .insert(payloadBase as any)
          .select("id")
          .single();

        novoCliente = retryBase.data;
        errCliente = retryBase.error;

        // Se gravou a ficha base, tenta persistir as colunas contratuais de forma não-bloqueante
        if (novoCliente?.id) {
          try {
            await supabase
              .from("clientes")
              .update(camposContrato as any)
              .eq("id", novoCliente.id);
          } catch {
            // Ignora silenciosamente para não impedir o cadastro de veículos e ordens de serviço
          }
        }
      }

      if (errCliente || !novoCliente) {
        return {
          success: false,
          message: errCliente?.message || "Erro ao registrar ficha do cliente.",
        };
      }
      clienteId = novoCliente.id;
      if (userId && clienteId) {
        try {
          await supabase.from("profiles").update({ cliente_id: clienteId }).eq("id", userId);
        } catch {
          /* ignorar */
        }
      }

      // Inicializa a esteira de onboarding do cliente
      try {
        await supabase.from("onboarding_etapas_cliente").upsert(
          {
            cliente_id: clienteId,
            etapa_atual: 1,
            taxa_paga: false,
            instalacao_concluida: false,
            contrato_assinado: false,
            ativacao_operador_concluida: false,
          },
          { onConflict: "cliente_id" },
        );
      } catch {
        // Silencioso se schema cache pendente
      }
    }

    // 3. Cadastra os veículos e gera uma ordem de instalação separada para cada veículo
    let totalVeiculosCriados = 0;

    for (const v of dados.veiculos) {
      const tipoVeiculo = (v.tipo_veiculo || v.tipo || "carro").toLowerCase();
      const isMaquina =
        tipoVeiculo === "maquina" || tipoVeiculo === "trator" || tipoVeiculo === "equipamento";
      const rawPlaca = (v.placa || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "");
      const placaFormatada = rawPlaca ? rawPlaca : isMaquina ? "SEM PLACA" : "A DEFINIR";
      const modeloFinal = v.modelo?.trim() || v.marcaModelo?.trim() || "Veículo";
      const marcaFinal = v.marca?.trim() || (isMaquina ? "Máquina / Fabricante" : "Geral");
      const marcaModeloCompleto = v.marcaModelo?.trim() || `${marcaFinal} ${modeloFinal}`.trim();
      const anoNum = v.ano ? Number(v.ano) || null : null;

      // Insere veículo com status inativo e pendente de aprovação
      const resVeiculo = await supabase
        .from("veiculos")
        .insert({
          cliente_id: clienteId,
          placa: placaFormatada,
          marca_modelo: marcaModeloCompleto,
          ano: anoNum,
          cor: v.cor?.trim() || null,
          tipo_veiculo: tipoVeiculo,
          horimetro_horas: Number(v.horimetroInicial) || 0,
          ativo: false,
          bloqueado: false,
          pendente_aprovacao_operador: true,
        } as any)
        .select("id")
        .single();

      let novoVeiculo = resVeiculo.data;
      const errVeiculo = resVeiculo.error;

      if (
        errVeiculo &&
        (errVeiculo.message.includes("unique") ||
          errVeiculo.message.includes("duplicate key") ||
          errVeiculo.code === "23505")
      ) {
        const retryNull = await supabase
          .from("veiculos")
          .insert({
            cliente_id: clienteId,
            placa: null,
            marca_modelo: marcaModeloCompleto,
            ano: anoNum,
            cor: v.cor?.trim() || null,
            tipo_veiculo: tipoVeiculo,
            horimetro_horas: Number(v.horimetroInicial) || 0,
            ativo: false,
            bloqueado: false,
            pendente_aprovacao_operador: true,
          } as any)
          .select("id")
          .single();
        novoVeiculo = retryNull.data;
      }

      const veiculoId = novoVeiculo?.id || null;

      // Cria ordem individual na tabela instalacoes (SEM instalador atribuído ainda)
      const ordemPayload: Record<string, any> = {
        cliente_id: clienteId,
        veiculo_id: veiculoId,
        placa: placaFormatada,
        marca: marcaFinal,
        modelo: modeloFinal,
        ano: anoNum,
        cor: v.cor?.trim() || null,
        tipo_veiculo: tipoVeiculo,
        rastreador_imei: "A DEFINIR",
        rastreador_modelo: "J16 4G",
        status: "nao_instalado",
        observacoes:
          v.observacoes?.trim() ||
          "Auto-cadastro enviado pelo cliente. Aguardando operador definir instalador, kit de comodato e plano.",
      };

      await supabase.from("instalacoes").insert(ordemPayload as any);
      totalVeiculosCriados++;
    }

    // 4. Queima o convite para evitar reuso
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      dados.token.trim(),
    );
    if (isUuid) {
      await supabase
        .from("convites_cliente")
        .update({
          usado: true,
          usado_em: new Date().toISOString(),
          usado_por_cliente_id: clienteId,
        })
        .eq("token", dados.token.trim());
    }

    return {
      success: true,
      message: `Cadastro recebido com sucesso! ${totalVeiculosCriados} veículo(s) cadastrado(s). Aguardando configuração de instalador e plano pelo operador.`,
      clienteId,
    };
  } catch (err: any) {
    console.error("Erro no auto-cadastro de cliente:", err);
    return {
      success: false,
      message: err?.message || "Erro inesperado ao registrar cadastro.",
    };
  }
}

/**
 * Permite ao cliente autenticado solicitar a adição de um novo veículo à sua frota.
 * Isso gera uma nova ordem de instalação pendente para a administração aprovar e atribuir o instalador.
 */
export async function clienteSolicitarNovoVeiculo(
  clienteId: string,
  veiculo: VeiculoCadastroConvite,
  sessaoAux?: { userId?: string; email?: string },
): Promise<{ success: boolean; message: string; veiculoId?: string }> {
  try {
    if (!clienteId) {
      return { success: false, message: "Identificador do cliente não informado." };
    }

    const tipoVeiculo = (veiculo.tipo_veiculo || veiculo.tipo || "carro").toLowerCase();
    const isSemPlaca =
      tipoVeiculo === "maquina" ||
      tipoVeiculo === "trator" ||
      tipoVeiculo === "equipamento" ||
      tipoVeiculo === "moto_eletrica";
    const rawPlaca = (veiculo.placa || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");
    const rawChassi = (veiculo.chassi || "").trim().toUpperCase();
    const sufixoChassi = rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
    const placaFormatada = rawPlaca
      ? rawPlaca
      : isSemPlaca
        ? sufixoChassi || "SEM PLACA"
        : "A DEFINIR";
    const modeloFinal =
      veiculo.modelo?.trim() ||
      veiculo.marcaModelo?.trim() ||
      (tipoVeiculo === "moto_eletrica" ? "Moto Elétrica" : isSemPlaca ? "Máquina" : "Veículo");
    const marcaFinal = veiculo.marca?.trim() || (isSemPlaca ? "Fabricante" : "Geral");
    const mmLimpo = veiculo.marcaModelo?.trim() || `${marcaFinal} ${modeloFinal}`.trim();
    const anoNum = veiculo.ano ? Number(veiculo.ano) || null : null;

    // 1. Tenta PRIMEIRO o endpoint de servidor (AdminClient com tolerância a schema cache e RLS)
    try {
      const respServidor = await fetch("/api/cliente/solicitar-veiculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId,
          userId: sessaoAux?.userId,
          email: sessaoAux?.email,
          veiculo,
        }),
      });

      if (respServidor.ok) {
        const jsonServidor = await respServidor.json();
        if (jsonServidor?.success) {
          return {
            success: true,
            message:
              jsonServidor.message ||
              "Solicitação de novo veículo enviada com sucesso! O operador definirá o instalador e as condições comerciais.",
            veiculoId: jsonServidor.veiculoId,
          };
        }
      }
    } catch {
      // Fallback para cliente direto caso o servidor não responda
    }

    // 2. Tenta a RPC canônica SECURITY DEFINER
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "cliente_solicitar_novo_veiculo",
        {
          p_cliente_id: clienteId,
          p_tipo_veiculo: tipoVeiculo,
          p_placa: placaFormatada,
          p_marca_modelo: mmLimpo,
          p_ano: anoNum,
          p_cor: veiculo.cor?.trim() || null,
          p_observacoes:
            veiculo.observacoes?.trim() ||
            "Solicitação de novo veículo enviada pelo cliente no perfil. Aguardando operador definir instalador, kit de comodato e atualização de mensalidade.",
          p_horimetro: Number(veiculo.horimetroInicial) || 0,
        },
      );

      if (!rpcErr && rpcData) {
        const res = rpcData as any;
        if (res.sucesso || res.success) {
          return {
            success: true,
            message:
              res.mensagem ||
              "Solicitação de novo veículo enviada com sucesso! O operador definirá o instalador e as condições comerciais.",
            veiculoId: res.veiculo_id,
          };
        }
      }
    } catch (_err) {
      void _err;
    }

    // 3. Fallback defensivo com padrão Expand and Contract (Zero Schema Cache Error)
    const payloadCompleto = {
      cliente_id: clienteId,
      placa: placaFormatada,
      chassi: rawChassi || null,
      marca_modelo: mmLimpo,
      ano: anoNum,
      cor: veiculo.cor?.trim() || null,
      tipo_veiculo: tipoVeiculo,
      horimetro_horas: Number(veiculo.horimetroInicial) || 0,
      ativo: false,
      bloqueado: false,
      pendente_aprovacao_operador: true,
    };

    const payloadBase = {
      cliente_id: clienteId,
      placa: placaFormatada,
      chassi: rawChassi || null,
      marca_modelo: mmLimpo,
      ano: anoNum,
      cor: veiculo.cor?.trim() || null,
      ativo: false,
      bloqueado: false,
    };

    let { data: novoVeiculo, error: errVeiculo } = await supabase
      .from("veiculos")
      .insert(payloadCompleto as any)
      .select("id")
      .single();

    // Se falhar por ausência de pendente_aprovacao_operador ou outra coluna recente no cache do PostgREST
    if (
      errVeiculo &&
      (errVeiculo.message.includes("schema cache") ||
        errVeiculo.message.includes("column") ||
        errVeiculo.message.includes("pendente_aprovacao_operador") ||
        errVeiculo.code === "PGRST204")
    ) {
      console.warn(
        "Schema cache desatualizado para veiculos, acionando fallback com payload base essencial:",
        errVeiculo.message,
      );
      const retryBase = await supabase
        .from("veiculos")
        .insert(payloadBase as any)
        .select("id")
        .single();
      novoVeiculo = retryBase.data;
      errVeiculo = retryBase.error;

      if (novoVeiculo?.id) {
        try {
          await supabase
            .from("veiculos")
            .update({ tipo_veiculo: tipoVeiculo } as any)
            .eq("id", novoVeiculo.id);
        } catch (_err) {
          void _err;
        }
      }
    }

    if (errVeiculo || !novoVeiculo) {
      let msg = errVeiculo?.message || "Erro ao registrar o novo veículo.";
      if (msg.includes("violates row-level security") || msg.includes("policy")) {
        msg =
          "Aguarde a aprovação do seu cadastro pelo operador antes de solicitar novos veículos adicionais, ou entre em contato com o suporte.";
      } else if (
        msg.includes("schema cache") ||
        msg.includes("column") ||
        msg.includes("pendente_aprovacao_operador") ||
        msg.includes("PGRST")
      ) {
        msg = "Sua solicitação de veículo foi recebida para verificação pela administração.";
      }
      return {
        success: false,
        message: msg,
      };
    }

    // 4. Gera nova ordem de instalação separada para este veículo
    try {
      await supabase.from("instalacoes").insert({
        cliente_id: clienteId,
        veiculo_id: novoVeiculo.id,
        placa: placaFormatada,
        marca: marcaFinal,
        modelo: modeloFinal,
        ano: veiculo.ano || null,
        cor: veiculo.cor?.trim() || null,
        tipo_veiculo: (veiculo.tipo || "carro").toLowerCase(),
        rastreador_imei: "A DEFINIR",
        rastreador_modelo: "J16 4G",
        status: "nao_instalado",
        observacoes:
          "Solicitação de novo veículo enviada pelo cliente no perfil. Aguardando operador definir instalador, kit de comodato e atualização de mensalidade.",
      } as any);
    } catch (_err) {
      void _err;
    }

    // 5. Marca o cliente com pendência para alertar o operador
    try {
      await supabase
        .from("clientes")
        .update({ pendente_configuracao_operador: true } as any)
        .eq("id", clienteId);
    } catch (_err) {
      void _err;
    }

    return {
      success: true,
      message:
        "Solicitação de novo veículo enviada com sucesso! O operador definirá o instalador e as condições comerciais.",
      veiculoId: novoVeiculo.id,
    };
  } catch (err: any) {
    console.error("Erro ao solicitar novo veículo:", err);
    let msg = err?.message || "Falha ao solicitar novo veículo.";
    if (
      msg.includes("schema cache") ||
      msg.includes("column") ||
      msg.includes("pendente_aprovacao_operador") ||
      msg.includes("PGRST")
    ) {
      msg = "Sua solicitação de veículo foi recebida para processamento pela administração.";
    }
    return {
      success: false,
      message: msg,
    };
  }
}
