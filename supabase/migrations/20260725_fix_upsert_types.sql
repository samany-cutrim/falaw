-- Corrige tipos de data e outros campos no upsert_pauta_audiencia
CREATE OR REPLACE FUNCTION upsert_pauta_audiencia(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO pauta_audiencias (
    id, processo, reclamante, reclamada, cliente,
    data_audiencia, horario, tipo_audiencia, modalidade, vara,
    status, origem, link, id_senha, advogado,
    tipo_responsabilidade, comentarios, testemunha_necessaria,
    updated_at
  )
  VALUES (
    (p->>'id'),
    (p->>'processo'),
    NULLIF(p->>'reclamante', ''),
    NULLIF(p->>'reclamada', ''),
    NULLIF(p->>'cliente', ''),
    (p->>'data_audiencia')::date,
    NULLIF(p->>'horario', ''),
    NULLIF(p->>'tipo_audiencia', ''),
    NULLIF(p->>'modalidade', ''),
    NULLIF(p->>'vara', ''),
    COALESCE(NULLIF(p->>'status', ''), 'agendada'),
    COALESCE(NULLIF(p->>'origem', ''), 'pje'),
    NULLIF(p->>'link', ''),
    NULLIF(p->>'id_senha', ''),
    NULLIF(p->>'advogado', ''),
    NULLIF(p->>'tipo_responsabilidade', ''),
    NULLIF(p->>'comentarios', ''),
    COALESCE((p->>'testemunha_necessaria')::boolean, false),
    COALESCE((NULLIF(p->>'updated_at', ''))::timestamptz, now())
  )
  ON CONFLICT (processo, data_audiencia, horario) DO UPDATE SET
    id                    = EXCLUDED.id,
    reclamante            = COALESCE(NULLIF(EXCLUDED.reclamante, ''),    pauta_audiencias.reclamante),
    reclamada             = COALESCE(NULLIF(EXCLUDED.reclamada, ''),     pauta_audiencias.reclamada),
    cliente               = COALESCE(NULLIF(EXCLUDED.cliente, ''),       pauta_audiencias.cliente),
    tipo_audiencia        = COALESCE(NULLIF(EXCLUDED.tipo_audiencia, ''),pauta_audiencias.tipo_audiencia),
    modalidade            = COALESCE(NULLIF(EXCLUDED.modalidade, ''),    pauta_audiencias.modalidade),
    vara                  = COALESCE(NULLIF(EXCLUDED.vara, ''),          pauta_audiencias.vara),
    status                = EXCLUDED.status,
    link                  = COALESCE(NULLIF(EXCLUDED.link, ''),          pauta_audiencias.link),
    id_senha              = COALESCE(NULLIF(EXCLUDED.id_senha, ''),      pauta_audiencias.id_senha),
    advogado              = COALESCE(NULLIF(EXCLUDED.advogado, ''),      pauta_audiencias.advogado),
    tipo_responsabilidade = COALESCE(NULLIF(EXCLUDED.tipo_responsabilidade, ''), pauta_audiencias.tipo_responsabilidade),
    comentarios           = COALESCE(NULLIF(EXCLUDED.comentarios, ''),   pauta_audiencias.comentarios),
    testemunha_necessaria = EXCLUDED.testemunha_necessaria,
    updated_at            = EXCLUDED.updated_at;
END;
$$;
