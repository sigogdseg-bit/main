export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type HunterRole =
  | "superadmin"
  | "adm"
  | "operador"
  | "supervisor"
  | "cliente"
  | "locatario"
  | "instalador"
  | "motorista"
  | "funcionario"
  | "revendedor"
  | "vendedor"
  | "superadmin_auditor"
  | "cliente_degustacao"
  | "financeiro"
  | "vigilante";
export type PlanoCliente = "basico" | "pro" | "master" | "personalizado";
export type StatusCliente = "aguardando_instalacao" | "ativo" | "bloqueado" | "cancelado";
export type StatusMensalidade = "pago" | "pendente" | "vencido";
export type StatusRastreador = "estoque" | "instalado" | "manutencao" | "desativado";
export type StatusAtendimento = "aberto" | "em_andamento" | "resolvido" | "cancelado";
export type PrioridadeAtendimento = "baixa" | "media" | "alta" | "urgente";
export type StatusInstalacao =
  "nao_instalado" | "agendada" | "concluida_com_pendencia" | "concluida";
export type StatusPagamentoInstalacao = "pendente" | "pago";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          nome: string;
          email: string;
          role: HunterRole;
          ativo: boolean;
          cliente_id?: string | null;
          valor_por_instalacao: number | null;
          chave_pix: string | null;
          endereco_instalacao: string | null;
          theme_preference: string | null;
          map_theme_preference: string | null;
          visivel_no_chat?: boolean | null;
          sessao_ativa?: boolean | null;
          ultimo_login?: string | null;
          ultimo_logout?: string | null;
          degustacao_primeiro_acesso_em?: string | null;
          degustacao_expira_em?: string | null;
          degustacao_revalidada_em?: string | null;
          tipo_supervisor?: string | null;
          acesso_veiculos?: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          nome: string;
          email: string;
          role?: HunterRole;
          ativo?: boolean;
          cliente_id?: string | null;
          valor_por_instalacao?: number | null;
          chave_pix?: string | null;
          endereco_instalacao?: string | null;
          theme_preference?: string | null;
          map_theme_preference?: string | null;
          visivel_no_chat?: boolean | null;
          sessao_ativa?: boolean | null;
          ultimo_login?: string | null;
          ultimo_logout?: string | null;
          degustacao_primeiro_acesso_em?: string | null;
          degustacao_expira_em?: string | null;
          degustacao_revalidada_em?: string | null;
          tipo_supervisor?: string | null;
          acesso_veiculos?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          email?: string;
          role?: HunterRole;
          ativo?: boolean;
          cliente_id?: string | null;
          valor_por_instalacao?: number | null;
          chave_pix?: string | null;
          endereco_instalacao?: string | null;
          theme_preference?: string | null;
          map_theme_preference?: string | null;
          visivel_no_chat?: boolean | null;
          sessao_ativa?: boolean | null;
          ultimo_login?: string | null;
          ultimo_logout?: string | null;
          degustacao_primeiro_acesso_em?: string | null;
          degustacao_expira_em?: string | null;
          degustacao_revalidada_em?: string | null;
          tipo_supervisor?: string | null;
          acesso_veiculos?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: HunterRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: HunterRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: HunterRole;
          created_at?: string;
        };
      };
      user_module_access: {
        Row: {
          id: string;
          user_id: string;
          module: string;
          ativo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          module: string;
          ativo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          module?: string;
          ativo?: boolean;
          created_at?: string;
        };
      };
      clientes: {
        Row: {
          id: string;
          user_id: string | null;
          instalador_id: string | null;
          nome_razao_social: string;
          documento: string | null;
          email: string | null;
          telefone: string | null;
          status: StatusCliente;
          plano: PlanoCliente;
          data_agendamento: string | null;
          hora_agendamento: string | null;
          status_agendamento: string | null;
          dias_historico_plano: number;
          dias_retencao_banco: number;
          dia_vencimento: number;
          valor_mensalidade: number;
          status_bloqueio_localizacao?: string;
          status_bloqueio_acesso?: string;
          motivo_bloqueio_manual?: string | null;
          bloqueio_atualizado_em?: string | null;
          bloqueio_atualizado_por?: string | null;
          notificar_nf_pendente?: boolean | null;
          canais_notificacao_nf?: Json | null;
          alertas_operacionais?: Json | null;
          contatos_alertas?: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          instalador_id?: string | null;
          nome_razao_social: string;
          documento?: string | null;
          email?: string | null;
          telefone?: string | null;
          status?: StatusCliente;
          plano?: PlanoCliente;
          data_agendamento?: string | null;
          hora_agendamento?: string | null;
          status_agendamento?: string | null;
          dias_historico_plano?: number;
          dias_retencao_banco?: number;
          dia_vencimento?: number;
          valor_mensalidade?: number;
          status_bloqueio_localizacao?: string;
          status_bloqueio_acesso?: string;
          motivo_bloqueio_manual?: string | null;
          bloqueio_atualizado_em?: string | null;
          bloqueio_atualizado_por?: string | null;
          notificar_nf_pendente?: boolean | null;
          canais_notificacao_nf?: Json | null;
          alertas_operacionais?: Json | null;
          contatos_alertas?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          instalador_id?: string | null;
          nome_razao_social?: string;
          documento?: string | null;
          email?: string | null;
          telefone?: string | null;
          status?: StatusCliente;
          plano?: PlanoCliente;
          data_agendamento?: string | null;
          hora_agendamento?: string | null;
          status_agendamento?: string | null;
          dias_historico_plano?: number;
          dias_retencao_banco?: number;
          dia_vencimento?: number;
          valor_mensalidade?: number;
          status_bloqueio_localizacao?: string;
          status_bloqueio_acesso?: string;
          motivo_bloqueio_manual?: string | null;
          bloqueio_atualizado_em?: string | null;
          bloqueio_atualizado_por?: string | null;
          notificar_nf_pendente?: boolean | null;
          canais_notificacao_nf?: Json | null;
          alertas_operacionais?: Json | null;
          contatos_alertas?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      funcionarios_cliente: {
        Row: {
          id: string;
          cliente_id: string;
          user_id: string;
          nome: string;
          email: string;
          telefone: string | null;
          cargo: string | null;
          modulos_permitidos: string[];
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          user_id: string;
          nome: string;
          email: string;
          telefone?: string | null;
          cargo?: string | null;
          modulos_permitidos?: string[];
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          user_id?: string;
          nome?: string;
          email?: string;
          telefone?: string | null;
          cargo?: string | null;
          modulos_permitidos?: string[];
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      mensalidades: {
        Row: {
          id: string;
          cliente_id: string;
          mes_referencia: number;
          ano_referencia: number;
          numero_parcela: number | null;
          total_parcelas: number | null;
          valor: number;
          data_vencimento: string;
          status: StatusMensalidade;
          data_pagamento: string | null;
          comprovante_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          mes_referencia: number;
          ano_referencia: number;
          numero_parcela?: number | null;
          total_parcelas?: number | null;
          valor: number;
          data_vencimento: string;
          status?: StatusMensalidade;
          data_pagamento?: string | null;
          comprovante_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          mes_referencia?: number;
          ano_referencia?: number;
          numero_parcela?: number | null;
          total_parcelas?: number | null;
          valor?: number;
          data_vencimento?: string;
          status?: StatusMensalidade;
          data_pagamento?: string | null;
          comprovante_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chips: {
        Row: {
          id: string;
          iccid: string;
          operadora: string;
          linha: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iccid: string;
          operadora: string;
          linha?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iccid?: string;
          operadora?: string;
          linha?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      rastreadores: {
        Row: {
          id: string;
          imei: string;
          modelo: string;
          chip_id: string | null;
          status: StatusRastreador;
          ultima_comunicacao: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          imei: string;
          modelo: string;
          chip_id?: string | null;
          status?: StatusRastreador;
          ultima_comunicacao?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          imei?: string;
          modelo?: string;
          chip_id?: string | null;
          status?: StatusRastreador;
          ultima_comunicacao?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      veiculos: {
        Row: {
          id: string;
          cliente_id: string;
          rastreador_id: string | null;
          placa: string;
          marca_modelo: string;
          cor: string | null;
          ano: number | null;
          chassi: string | null;
          ignicao_status: boolean;
          bloqueado: boolean;
          velocidade_atual: number;
          odometro_km: number;
          odometro_wgs84_km: number | null;
          odometro_cinematico_km: number | null;
          odometro_motor_a_km: number | null;
          odometro_motor_b_km: number | null;
          odometro_motor_c_km: number | null;
          odometro_motor_media_km: number | null;
          odometro_motor_a_pesos: Json | null;
          odometro_motor_b_pesos: Json | null;
          odometro_motor_c_pesos: Json | null;
          odometro_motor_a_estado: string | null;
          odometro_motor_b_estado: string | null;
          odometro_motor_c_estado: string | null;
          ultima_latitude: number | null;
          ultima_longitude: number | null;
          ultima_atualizacao: string | null;
          odometro_hardware_km: number | null;
          odometro_hardware_atualizado_em: string | null;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          rastreador_id?: string | null;
          placa: string;
          marca_modelo: string;
          cor?: string | null;
          ano?: number | null;
          chassi?: string | null;
          ignicao_status?: boolean;
          bloqueado?: boolean;
          velocidade_atual?: number;
          odometro_km?: number;
          odometro_wgs84_km?: number | null;
          odometro_cinematico_km?: number | null;
          odometro_motor_a_km?: number | null;
          odometro_motor_b_km?: number | null;
          odometro_motor_c_km?: number | null;
          odometro_motor_media_km?: number | null;
          odometro_motor_a_pesos?: Json | null;
          odometro_motor_b_pesos?: Json | null;
          odometro_motor_c_pesos?: Json | null;
          odometro_motor_a_estado?: string | null;
          odometro_motor_b_estado?: string | null;
          odometro_motor_c_estado?: string | null;
          odometro_hardware_km?: number | null;
          odometro_hardware_atualizado_em?: string | null;
          ultima_latitude?: number | null;
          ultima_longitude?: number | null;
          ultima_atualizacao?: string | null;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          rastreador_id?: string | null;
          placa?: string;
          marca_modelo?: string;
          cor?: string | null;
          ano?: number | null;
          chassi?: string | null;
          ignicao_status?: boolean;
          bloqueado?: boolean;
          velocidade_atual?: number;
          odometro_km?: number;
          odometro_wgs84_km?: number | null;
          odometro_cinematico_km?: number | null;
          odometro_motor_a_km?: number | null;
          odometro_motor_b_km?: number | null;
          odometro_motor_c_km?: number | null;
          odometro_motor_media_km?: number | null;
          odometro_motor_a_pesos?: Json | null;
          odometro_motor_b_pesos?: Json | null;
          odometro_motor_c_pesos?: Json | null;
          odometro_motor_a_estado?: string | null;
          odometro_motor_b_estado?: string | null;
          odometro_motor_c_estado?: string | null;
          odometro_hardware_km?: number | null;
          odometro_hardware_atualizado_em?: string | null;
          ultima_latitude?: number | null;
          ultima_longitude?: number | null;
          ultima_atualizacao?: string | null;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      telemetria_posicoes: {
        Row: {
          id: number;
          veiculo_id: string;
          rastreador_id: string | null;
          latitude: number;
          longitude: number;
          velocidade: number;
          ignicao: boolean;
          odometro: number | null;
          tensao_bateria: number | null;
          satelites: number | null;
          rumo: number | null;
          data_hora_gps: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          veiculo_id: string;
          rastreador_id?: string | null;
          latitude: number;
          longitude: number;
          velocidade?: number;
          ignicao?: boolean;
          odometro?: number | null;
          tensao_bateria?: number | null;
          satelites?: number | null;
          rumo?: number | null;
          data_hora_gps: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          veiculo_id?: string;
          rastreador_id?: string | null;
          latitude?: number;
          longitude?: number;
          velocidade?: number;
          ignicao?: boolean;
          odometro?: number | null;
          tensao_bateria?: number | null;
          satelites?: number | null;
          rumo?: number | null;
          data_hora_gps?: string;
          created_at?: string;
        };
      };
      viagens_trajetos: {
        Row: {
          id: string;
          veiculo_id: string;
          inicio_at: string;
          fim_at: string | null;
          km_percorrido: number;
          velocidade_media: number;
          velocidade_maxima: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          veiculo_id: string;
          inicio_at: string;
          fim_at?: string | null;
          km_percorrido?: number;
          velocidade_media?: number;
          velocidade_maxima?: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          veiculo_id?: string;
          inicio_at?: string;
          fim_at?: string | null;
          km_percorrido?: number;
          velocidade_media?: number;
          velocidade_maxima?: number;
          status?: string;
          created_at?: string;
        };
      };
      atendimentos: {
        Row: {
          id: string;
          numero_protocolo: number;
          cliente_id: string;
          veiculo_id: string | null;
          tipo: string;
          prioridade: PrioridadeAtendimento;
          status: StatusAtendimento;
          titulo: string;
          descricao_inicial: string;
          solucao_conclusao: string | null;
          aberto_por: string | null;
          finalizado_por: string | null;
          finalizado_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          numero_protocolo?: number;
          cliente_id: string;
          veiculo_id?: string | null;
          tipo: string;
          prioridade?: PrioridadeAtendimento;
          status?: StatusAtendimento;
          titulo: string;
          descricao_inicial: string;
          solucao_conclusao?: string | null;
          aberto_por?: string | null;
          finalizado_por?: string | null;
          finalizado_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          numero_protocolo?: number;
          cliente_id?: string;
          veiculo_id?: string | null;
          tipo?: string;
          prioridade?: PrioridadeAtendimento;
          status?: StatusAtendimento;
          titulo?: string;
          descricao_inicial?: string;
          solucao_conclusao?: string | null;
          aberto_por?: string | null;
          finalizado_por?: string | null;
          finalizado_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      atendimento_providencias: {
        Row: {
          id: string;
          atendimento_id: string;
          usuario_id: string;
          usuario_nome: string;
          usuario_role: string;
          providencia: string;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          atendimento_id: string;
          usuario_id: string;
          usuario_nome: string;
          usuario_role: string;
          providencia: string;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          atendimento_id?: string;
          usuario_id?: string;
          usuario_nome?: string;
          usuario_role?: string;
          providencia?: string;
          ip_address?: string | null;
          created_at?: string;
        };
      };
      system_login_logs: {
        Row: {
          id: string;
          session_id: string;
          user_id: string | null;
          email: string;
          role: string;
          ip_address: string | null;
          user_agent: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id?: string | null;
          email: string;
          role: string;
          ip_address?: string | null;
          user_agent?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string | null;
          email?: string;
          role?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          status?: string;
          created_at?: string;
        };
      };
      system_activity_logs: {
        Row: {
          id: string;
          user_id: string | null;
          acao: string;
          detalhe: string | null;
          ip_address: string | null;
          hash_sha256: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          acao: string;
          detalhe?: string | null;
          ip_address?: string | null;
          hash_sha256?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          acao?: string;
          detalhe?: string | null;
          ip_address?: string | null;
          hash_sha256?: string | null;
          created_at?: string;
        };
      };
      dispositivos_autorizados: {
        Row: {
          id: string;
          user_id: string;
          fingerprint: string;
          nome_dispositivo: string | null;
          status: string;
          ultimo_acesso: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          fingerprint: string;
          nome_dispositivo?: string | null;
          status?: string;
          ultimo_acesso?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          fingerprint?: string;
          nome_dispositivo?: string | null;
          status?: string;
          ultimo_acesso?: string;
          created_at?: string;
        };
      };
      instalacoes: {
        Row: {
          id: string;
          instalador_id: string;
          cliente_id: string;
          veiculo_id: string | null;
          placa: string;
          marca: string;
          modelo: string;
          ano: number | null;
          cor: string | null;
          km_instalacao: number;
          rastreador_imei: string;
          rastreador_modelo: string | null;
          chip_iccid: string | null;
          chip_operadora: string | null;
          posicao_instalacao: string | null;
          status: StatusInstalacao;
          motivo_pendencia_recusa: string | null;
          observacoes: string | null;
          valor_instalacao: number;
          status_pagamento: StatusPagamentoInstalacao;
          pago_em: string | null;
          pago_por: string | null;
          comprovante_pagamento: string | null;
          created_at: string;
          updated_at: string;
          concluida_at: string | null;
        };
        Insert: {
          id?: string;
          instalador_id: string;
          cliente_id: string;
          veiculo_id?: string | null;
          placa: string;
          marca: string;
          modelo: string;
          ano?: number | null;
          cor?: string | null;
          km_instalacao?: number;
          rastreador_imei: string;
          rastreador_modelo?: string | null;
          chip_iccid?: string | null;
          chip_operadora?: string | null;
          posicao_instalacao?: string | null;
          status?: StatusInstalacao;
          motivo_pendencia_recusa?: string | null;
          observacoes?: string | null;
          valor_instalacao?: number;
          status_pagamento?: StatusPagamentoInstalacao;
          pago_em?: string | null;
          pago_por?: string | null;
          comprovante_pagamento?: string | null;
          created_at?: string;
          updated_at?: string;
          concluida_at?: string | null;
        };
        Update: {
          id?: string;
          instalador_id?: string;
          cliente_id?: string;
          veiculo_id?: string | null;
          placa?: string;
          marca?: string;
          modelo?: string;
          ano?: number | null;
          cor?: string | null;
          km_instalacao?: number;
          rastreador_imei?: string;
          rastreador_modelo?: string | null;
          chip_iccid?: string | null;
          chip_operadora?: string | null;
          posicao_instalacao?: string | null;
          status?: StatusInstalacao;
          motivo_pendencia_recusa?: string | null;
          observacoes?: string | null;
          valor_instalacao?: number;
          status_pagamento?: StatusPagamentoInstalacao;
          pago_em?: string | null;
          pago_por?: string | null;
          comprovante_pagamento?: string | null;
          created_at?: string;
          updated_at?: string;
          concluida_at?: string | null;
        };
      };
      instalacoes_historico_atendimentos: {
        Row: {
          id: string;
          instalacao_id: string;
          instalador_id: string;
          status_atendimento: string;
          motivo: string | null;
          observacoes: string | null;
          km_no_atendimento: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          instalacao_id: string;
          instalador_id: string;
          status_atendimento: string;
          motivo?: string | null;
          observacoes?: string | null;
          km_no_atendimento?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          instalacao_id?: string;
          instalador_id?: string;
          status_atendimento?: string;
          motivo?: string | null;
          observacoes?: string | null;
          km_no_atendimento?: number;
          created_at?: string;
        };
      };
      trajetos_salvos: {
        Row: {
          id: string;
          user_id: string;
          cliente_id: string | null;
          veiculo_id: string | null;
          nome: string;
          retornar_ao_ponto_saida: boolean;
          saida: Json;
          paradas: Json;
          chegada: Json;
          distancia_km: number;
          duracao_minutos: number;
          trechos: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          cliente_id?: string | null;
          veiculo_id?: string | null;
          nome: string;
          retornar_ao_ponto_saida?: boolean;
          saida: Json;
          paradas?: Json;
          chegada: Json;
          distancia_km?: number;
          duracao_minutos?: number;
          trechos?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          cliente_id?: string | null;
          veiculo_id?: string | null;
          nome?: string;
          retornar_ao_ponto_saida?: boolean;
          saida?: Json;
          paradas?: Json;
          chegada?: Json;
          distancia_km?: number;
          duracao_minutos?: number;
          trechos?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      areas_seguras: {
        Row: {
          id: string;
          veiculo_id: string | null;
          cliente_id: string | null;
          nome: string;
          tipo: string;
          latitude: number;
          longitude: number;
          raio_metros: number;
          poligono_geojson: Json | null;
          regra_entrada: string;
          regra_saida: string;
          hora_inicio: string | null;
          hora_fim: string | null;
          dias_semana: number[] | null;
          tolerancia_metros: number;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          veiculo_id?: string | null;
          cliente_id?: string | null;
          nome: string;
          tipo?: string;
          latitude: number;
          longitude: number;
          raio_metros?: number;
          poligono_geojson?: Json | null;
          regra_entrada?: string;
          regra_saida?: string;
          hora_inicio?: string | null;
          hora_fim?: string | null;
          dias_semana?: number[] | null;
          tolerancia_metros?: number;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          veiculo_id?: string | null;
          cliente_id?: string | null;
          nome?: string;
          tipo?: string;
          latitude?: number;
          longitude?: number;
          raio_metros?: number;
          poligono_geojson?: Json | null;
          regra_entrada?: string;
          regra_saida?: string;
          hora_inicio?: string | null;
          hora_fim?: string | null;
          dias_semana?: number[] | null;
          tolerancia_metros?: number;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      horarios_utilizacao: {
        Row: {
          id: string;
          veiculo_id: string;
          cliente_id: string | null;
          dias_semana: number[];
          hora_inicio: string;
          hora_fim: string;
          permitir_fim_de_semana: boolean;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          veiculo_id: string;
          cliente_id?: string | null;
          dias_semana?: number[];
          hora_inicio?: string;
          hora_fim?: string;
          permitir_fim_de_semana?: boolean;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          veiculo_id?: string;
          cliente_id?: string | null;
          dias_semana?: number[];
          hora_inicio?: string;
          hora_fim?: string;
          permitir_fim_de_semana?: boolean;
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      regras_veiculo: {
        Row: {
          id: string;
          veiculo_id: string;
          cliente_id: string | null;
          limite_velocidade_geral: number;
          tolerancia_excesso_segundos: number;
          alerta_movimento_nao_autorizado: boolean;
          alerta_ignicao_fora_horario: boolean;
          alerta_baixa_tensao_v: number;
          minutos_limite_sem_comunicacao: number;
          alertas_ativos?: Json | null;
          canais_alertas?: Json | null;
          whatsapp_destinatarios?: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          veiculo_id: string;
          cliente_id?: string | null;
          limite_velocidade_geral?: number;
          tolerancia_excesso_segundos?: number;
          alerta_movimento_nao_autorizado?: boolean;
          alerta_ignicao_fora_horario?: boolean;
          alerta_baixa_tensao_v?: number;
          minutos_limite_sem_comunicacao?: number;
          alertas_ativos?: Json | null;
          canais_alertas?: Json | null;
          whatsapp_destinatarios?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          veiculo_id?: string;
          cliente_id?: string | null;
          limite_velocidade_geral?: number;
          tolerancia_excesso_segundos?: number;
          alerta_movimento_nao_autorizado?: boolean;
          alerta_ignicao_fora_horario?: boolean;
          alerta_baixa_tensao_v?: number;
          minutos_limite_sem_comunicacao?: number;
          alertas_ativos?: Json | null;
          canais_alertas?: Json | null;
          whatsapp_destinatarios?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      rotas_monitoradas: {
        Row: {
          id: string;
          veiculo_id: string;
          cliente_id: string | null;
          trajeto_salvo_id: string | null;
          nome: string;
          coordenadas_rota: Json;
          tolerancia_desvio_metros: number;
          status: string;
          desvio_detectado: boolean;
          ultima_distancia_desvio_m: number;
          iniciada_at: string;
          encerrada_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          veiculo_id: string;
          cliente_id?: string | null;
          trajeto_salvo_id?: string | null;
          nome: string;
          coordenadas_rota: Json;
          tolerancia_desvio_metros?: number;
          status?: string;
          desvio_detectado?: boolean;
          ultima_distancia_desvio_m?: number;
          iniciada_at?: string;
          encerrada_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          veiculo_id?: string;
          cliente_id?: string | null;
          trajeto_salvo_id?: string | null;
          nome?: string;
          coordenadas_rota?: Json;
          tolerancia_desvio_metros?: number;
          status?: string;
          desvio_detectado?: boolean;
          ultima_distancia_desvio_m?: number;
          iniciada_at?: string;
          encerrada_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      compartilhamentos_temporarios: {
        Row: {
          id: string;
          token: string;
          veiculo_id: string;
          cliente_id: string | null;
          expira_em: string;
          revogado: boolean;
          criado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          veiculo_id: string;
          cliente_id?: string | null;
          expira_em: string;
          revogado?: boolean;
          criado_por?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          token?: string;
          veiculo_id?: string;
          cliente_id?: string | null;
          expira_em?: string;
          revogado?: boolean;
          criado_por?: string | null;
          created_at?: string;
        };
      };
      veiculo_convidados: {
        Row: {
          id: string;
          veiculo_id: string;
          cliente_id: string | null;
          convidado_email: string;
          convidado_nome: string;
          convidado_user_id: string | null;
          ativo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          veiculo_id: string;
          cliente_id?: string | null;
          convidado_email: string;
          convidado_nome: string;
          convidado_user_id?: string | null;
          ativo?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          veiculo_id?: string;
          cliente_id?: string | null;
          convidado_email?: string;
          convidado_nome?: string;
          convidado_user_id?: string | null;
          ativo?: boolean;
          created_at?: string;
        };
      };
      notificacoes_configuracoes: {
        Row: {
          id: string;
          user_id: string;
          veiculo_id: string | null;
          alertas_ativos: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          veiculo_id?: string | null;
          alertas_ativos?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          veiculo_id?: string | null;
          alertas_ativos?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      eventos_veiculo: {
        Row: {
          id: string;
          veiculo_id: string;
          cliente_id: string | null;
          tipo: string;
          titulo: string;
          descricao: string;
          severidade: string;
          latitude: number | null;
          longitude: number | null;
          velocidade: number | null;
          detalhes: Json | null;
          data_hora: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          veiculo_id: string;
          cliente_id?: string | null;
          tipo: string;
          titulo: string;
          descricao: string;
          severidade?: string;
          latitude?: number | null;
          longitude?: number | null;
          velocidade?: number | null;
          detalhes?: Json | null;
          data_hora?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          veiculo_id?: string;
          cliente_id?: string | null;
          tipo?: string;
          titulo?: string;
          descricao?: string;
          severidade?: string;
          latitude?: number | null;
          longitude?: number | null;
          velocidade?: number | null;
          detalhes?: Json | null;
          data_hora?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_superadmin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_adm: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_operador: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      expurgar_telemetria_antiga: {
        Args: Record<PropertyKey, never>;
        Returns: {
          posicoes_removidas: number;
          viagens_removidas: number;
        }[];
      };
      salvar_preferencia_mapa: {
        Args: {
          p_mapa: string;
        };
        Returns: void;
      };
      salvar_preferencia_tema: {
        Args: {
          p_tema: string;
        };
        Returns: void;
      };
    };
    Enums: {
      hunter_role: HunterRole;
      plano_cliente: PlanoCliente;
      status_cliente: StatusCliente;
      status_mensalidade: StatusMensalidade;
      status_rastreador: StatusRastreador;
      status_atendimento: StatusAtendimento;
      prioridade_atendimento: PrioridadeAtendimento;
    };
  };
}
