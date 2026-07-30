-- Corrige "duplicate key value violates unique constraint pauta_audiencias_pkey"
-- no sync automático (projuris-sync). A tabela tem DUAS constraints
-- independentes: a PK em id e um UNIQUE em (processo, data_audiencia, horario).
-- upsert_pauta_audiencia() só tratava conflito em (processo, data_audiencia,
-- horario) — se um id já existisse na tabela associado a uma combinação
-- diferente dessas 3 colunas (linha antiga/legada, ou o mesmo processo com
-- horário levemente diferente de como foi gravado antes), o ON CONFLICT não
-- encontrava a linha e o INSERT batia de frente na PK, derrubando o sync
-- inteiro (erro 500 na edge function, pauta parava de atualizar).
--
-- Agora primeiro tenta UPDATE pela chave de negócio (processo/data/horario);
-- se nenhuma linha bater, faz INSERT com ON CONFLICT (id) DO UPDATE como
-- fallback — cobre os dois caminhos de conflito possíveis na tabela.
CREATE OR REPLACE FUNCTION upsert_pauta_audiencia(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id                    text            := (p->>'id');
  v_processo              text            := COALESCE(p->>'processo', '');
  v_reclamante            text            := COALESCE(p->>'reclamante', '');
  v_reclamada             text            := COALESCE(p->>'reclamada', '');
  v_cliente               text            := COALESCE(p->>'cliente', '');
  v_vara                  text            := COALESCE(p->>'vara', '');
  v_data_audiencia        date            := (p->>'data_audiencia')::date;
  v_horario               text            := COALESCE(p->>'horario', '');
  v_tipo_audiencia        text            := COALESCE(p->>'tipo_audiencia', '');
  v_modalidade            text            := COALESCE(p->>'modalidade', '');
  v_status                text            := COALESCE(NULLIF(p->>'status', ''), 'agendada');
  v_origem                text            := COALESCE(NULLIF(p->>'origem', ''), 'pje');
  v_link                  text            := COALESCE(p->>'link', '');
  v_id_senha              text            := COALESCE(p->>'id_senha', '');
  v_advogado              text            := COALESCE(p->>'advogado', '');
  v_tipo_responsabilidade text            := COALESCE(p->>'tipo_responsabilidade', '');
  v_comentarios           text            := COALESCE(p->>'comentarios', '');
  v_testemunha_necessaria boolean         := COALESCE((p->>'testemunha_necessaria')::boolean, false);
  v_updated_at            timestamptz     := COALESCE((NULLIF(p->>'updated_at', ''))::timestamptz, now());
  v_updated               boolean;
BEGIN
  UPDATE pauta_audiencias SET
    id                    = v_id,
    reclamante            = CASE WHEN v_reclamante <> '' THEN v_reclamante ELSE pauta_audiencias.reclamante END,
    reclamada             = CASE WHEN v_reclamada  <> '' THEN v_reclamada  ELSE pauta_audiencias.reclamada  END,
    cliente               = CASE WHEN v_cliente    <> '' THEN v_cliente    ELSE pauta_audiencias.cliente    END,
    vara                  = CASE WHEN v_vara       <> '' THEN v_vara       ELSE pauta_audiencias.vara       END,
    tipo_audiencia        = CASE WHEN v_tipo_audiencia <> '' THEN v_tipo_audiencia ELSE pauta_audiencias.tipo_audiencia END,
    modalidade            = CASE WHEN v_modalidade <> '' THEN v_modalidade ELSE pauta_audiencias.modalidade END,
    status                = v_status,
    link                  = CASE WHEN v_link       <> '' THEN v_link       ELSE pauta_audiencias.link       END,
    id_senha              = CASE WHEN v_id_senha   <> '' THEN v_id_senha   ELSE pauta_audiencias.id_senha   END,
    advogado              = CASE WHEN v_advogado   <> '' THEN v_advogado   ELSE pauta_audiencias.advogado   END,
    tipo_responsabilidade = CASE WHEN v_tipo_responsabilidade <> '' THEN v_tipo_responsabilidade ELSE pauta_audiencias.tipo_responsabilidade END,
    comentarios           = CASE WHEN v_comentarios <> '' THEN v_comentarios ELSE pauta_audiencias.comentarios END,
    testemunha_necessaria = v_testemunha_necessaria,
    updated_at            = v_updated_at
  WHERE processo = v_processo AND data_audiencia = v_data_audiencia AND horario = v_horario;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated THEN RETURN; END IF;

  INSERT INTO pauta_audiencias (
    id, processo, reclamante, reclamada, cliente, vara,
    data_audiencia, horario, tipo_audiencia, modalidade,
    status, origem, link, id_senha, advogado,
    tipo_responsabilidade, comentarios, testemunha_necessaria,
    updated_at
  )
  VALUES (
    v_id, v_processo, v_reclamante, v_reclamada, v_cliente, v_vara,
    v_data_audiencia, v_horario, v_tipo_audiencia, v_modalidade,
    v_status, v_origem, v_link, v_id_senha, v_advogado,
    v_tipo_responsabilidade, v_comentarios, v_testemunha_necessaria,
    v_updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    processo              = EXCLUDED.processo,
    reclamante            = CASE WHEN EXCLUDED.reclamante <> '' THEN EXCLUDED.reclamante ELSE pauta_audiencias.reclamante END,
    reclamada             = CASE WHEN EXCLUDED.reclamada  <> '' THEN EXCLUDED.reclamada  ELSE pauta_audiencias.reclamada  END,
    cliente               = CASE WHEN EXCLUDED.cliente    <> '' THEN EXCLUDED.cliente    ELSE pauta_audiencias.cliente    END,
    vara                  = CASE WHEN EXCLUDED.vara       <> '' THEN EXCLUDED.vara       ELSE pauta_audiencias.vara       END,
    data_audiencia        = EXCLUDED.data_audiencia,
    horario               = EXCLUDED.horario,
    tipo_audiencia        = CASE WHEN EXCLUDED.tipo_audiencia <> '' THEN EXCLUDED.tipo_audiencia ELSE pauta_audiencias.tipo_audiencia END,
    modalidade            = CASE WHEN EXCLUDED.modalidade <> '' THEN EXCLUDED.modalidade ELSE pauta_audiencias.modalidade END,
    status                = EXCLUDED.status,
    link                  = CASE WHEN EXCLUDED.link       <> '' THEN EXCLUDED.link       ELSE pauta_audiencias.link       END,
    id_senha              = CASE WHEN EXCLUDED.id_senha   <> '' THEN EXCLUDED.id_senha   ELSE pauta_audiencias.id_senha   END,
    advogado              = CASE WHEN EXCLUDED.advogado   <> '' THEN EXCLUDED.advogado   ELSE pauta_audiencias.advogado   END,
    tipo_responsabilidade = CASE WHEN EXCLUDED.tipo_responsabilidade <> '' THEN EXCLUDED.tipo_responsabilidade ELSE pauta_audiencias.tipo_responsabilidade END,
    comentarios           = CASE WHEN EXCLUDED.comentarios <> '' THEN EXCLUDED.comentarios ELSE pauta_audiencias.comentarios END,
    testemunha_necessaria = EXCLUDED.testemunha_necessaria,
    updated_at            = EXCLUDED.updated_at;
END;
$$;
