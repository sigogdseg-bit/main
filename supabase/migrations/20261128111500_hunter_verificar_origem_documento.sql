-- Distingue contratos (contratos_clientes) de outros documentos emitidos (documentos_emitidos)
-- na RPC pública hunter_verificar_autenticidade_contrato para suprimir o download de contrato em laudos/relatórios.

CREATE OR REPLACE FUNCTION public.hunter_verificar_autenticidade_contrato(
  p_identificador TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_contrato RECORD;
  v_cliente RECORD;
  v_doc RECORD;
  v_identificador_limpo TEXT;
  v_origem_tipo TEXT;
BEGIN
  IF p_identificador IS NULL OR TRIM(p_identificador) = '' THEN
    RETURN jsonb_build_object(
      'autentico', false,
      'mensagem', 'Identificador de verificação não informado.'
    );
  END IF;

  v_identificador_limpo := UPPER(TRIM(p_identificador));

  -- 1. Tenta buscar em contratos_clientes
  BEGIN
    SELECT * INTO v_contrato
    FROM public.contratos_clientes
    WHERE selo_autenticidade = v_identificador_limpo
       OR codigo_verificacao = v_identificador_limpo
       OR hash_pdf_assinado = LOWER(v_identificador_limpo)
       OR hash_pdf_original = LOWER(v_identificador_limpo)
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT nome_razao_social, documento, email INTO v_cliente
      FROM public.clientes
      WHERE id = v_contrato.cliente_id;

      RETURN jsonb_build_object(
        'autentico', true,
        'mensagem', 'Contrato autêntico localizado no sistema GD Rastreamento.',
        'contrato_id', v_contrato.id,
        'numero_contrato', v_contrato.numero_contrato,
        'selo_autenticidade', v_contrato.selo_autenticidade,
        'codigo_verificacao', v_contrato.codigo_verificacao,
        'status', v_contrato.status,
        'data_emissao', v_contrato.data_emissao,
        'data_assinatura', v_contrato.data_assinatura,
        'emitido_por_nome', v_contrato.emitido_por_nome,
        'assinado_por_nome', v_contrato.assinado_por_nome,
        'cliente_nome', COALESCE(v_cliente.nome_razao_social, 'N/I'),
        'hash_pdf_original', v_contrato.hash_pdf_original,
        'hash_pdf_assinado', v_contrato.hash_pdf_assinado,
        'origem_tipo', 'contrato'
      );
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  -- 2. Tenta buscar em documentos_emitidos (cadeia de custódia forense global)
  BEGIN
    SELECT * INTO v_doc
    FROM public.documentos_emitidos
    WHERE hash_sha256 = LOWER(v_identificador_limpo)
       OR (metadata->>'selo') = v_identificador_limpo
       OR (metadata->>'codigo') = v_identificador_limpo
       OR (metadata->>'numero_contrato') = v_identificador_limpo
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_origem_tipo := CASE
        WHEN v_doc.tipo_documento = 'COPIA_AUTENTICA_CONTRATO' THEN 'contrato'
        ELSE 'documento'
      END;

      RETURN jsonb_build_object(
        'autentico', true,
        'mensagem', 'Documento oficial autêntico localizado no sistema GD Rastreamento.',
        'contrato_id', v_doc.id,
        'numero_contrato', COALESCE(v_doc.metadata->>'numero_contrato', v_doc.nome_arquivo, 'DOC-OFICIAL'),
        'selo_autenticidade', COALESCE(v_doc.metadata->>'selo', 'SGD-' || UPPER(SUBSTRING(v_doc.id::text FROM 1 FOR 8))),
        'codigo_verificacao', COALESCE(v_doc.metadata->>'codigo', UPPER(SUBSTRING(v_doc.id::text FROM 1 FOR 6))),
        'status', 'assinado',
        'data_emissao', v_doc.created_at,
        'data_assinatura', v_doc.created_at,
        'emitido_por_nome', COALESCE(NULLIF(TRIM(v_doc.emissor_nome), ''), 'GD Rastreamento'),
        'assinado_por_nome', COALESCE(NULLIF(TRIM(v_doc.emissor_nome), ''), 'GD Rastreamento'),
        'cliente_nome', COALESCE(v_doc.metadata->>'cliente_nome', v_doc.descricao, 'Cliente'),
        'hash_pdf_original', v_doc.hash_sha256,
        'hash_pdf_assinado', v_doc.hash_sha256,
        'origem_tipo', v_origem_tipo,
        'tipo_documento', v_doc.tipo_documento
      );
    END IF;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'autentico', false,
    'mensagem', 'Nenhum documento ou contrato autêntico localizado para o código ou hash informado.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hunter_verificar_autenticidade_contrato(TEXT) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
