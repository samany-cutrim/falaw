-- Drop de todas as versões do RPC para garantir substituição limpa
DROP FUNCTION IF EXISTS upsert_pauta_audiencia(json);
DROP FUNCTION IF EXISTS upsert_pauta_audiencia(jsonb);

CREATE OR REPLACE FUNCTION upsert_pauta_audiencia(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO pauta_audiencias (
    id, processo, reclamante, reclamada, cliente, vara,
    data_audiencia, horario, tipo_audiencia, modalidade,
    status, origem, link, id_senha, advogado,
    tipo_responsabilidade, comentarios, testemunha_necessaria,
    updated_at
  )
  VALUES (
    (p->>'id'),
    COALESCE(p->>'processo', ''),
    COALESCE(p->>'reclamante', ''),
    COALESCE(p->>'reclamada', ''),
    COALESCE(p->>'cliente', ''),
    COALESCE(p->>'vara', ''),
    (p->>'data_audiencia')::date,
    COALESCE(p->>'horario', ''),
    COALESCE(p->>'tipo_audiencia', ''),
    COALESCE(p->>'modalidade', ''),
    COALESCE(NULLIF(p->>'status', ''), 'agendada'),
    COALESCE(NULLIF(p->>'origem', ''), 'pje'),
    COALESCE(p->>'link', ''),
    COALESCE(p->>'id_senha', ''),
    COALESCE(p->>'advogado', ''),
    COALESCE(p->>'tipo_responsabilidade', ''),
    COALESCE(p->>'comentarios', ''),
    COALESCE((p->>'testemunha_necessaria')::boolean, false),
    COALESCE((NULLIF(p->>'updated_at', ''))::timestamptz, now())
  )
  ON CONFLICT (processo, data_audiencia, horario) DO UPDATE SET
    id                    = EXCLUDED.id,
    reclamante            = CASE WHEN EXCLUDED.reclamante <> '' THEN EXCLUDED.reclamante ELSE pauta_audiencias.reclamante END,
    reclamada             = CASE WHEN EXCLUDED.reclamada  <> '' THEN EXCLUDED.reclamada  ELSE pauta_audiencias.reclamada  END,
    cliente               = CASE WHEN EXCLUDED.cliente    <> '' THEN EXCLUDED.cliente    ELSE pauta_audiencias.cliente    END,
    vara                  = CASE WHEN EXCLUDED.vara       <> '' THEN EXCLUDED.vara       ELSE pauta_audiencias.vara       END,
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
