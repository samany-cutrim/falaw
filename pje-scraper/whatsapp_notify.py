"""
whatsapp_notify.py — Falaw Advogados
Envia notificação via WhatsApp (Evolution API) para os advogados INTERNOS do escritório
com audiências no dia seguinte.

Variáveis de ambiente necessárias:
  SUPABASE_URL, SUPABASE_KEY
  EVOLUTION_API_URL   — ex: https://falaw-evolution.onrender.com
  EVOLUTION_API_KEY   — chave definida em AUTHENTICATION_API_KEY do serviço
  EVOLUTION_INSTANCE  — nome da instância (ex: falaw)
"""

import os
import sys
import logging
import requests
from datetime import date, timedelta
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.getLogger(__name__)

SUPABASE_URL  = os.getenv('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY  = os.getenv('SUPABASE_KEY', '')
EVO_URL       = os.getenv('EVOLUTION_API_URL', '').rstrip('/')
EVO_KEY       = os.getenv('EVOLUTION_API_KEY', '')
EVO_INSTANCE  = os.getenv('EVOLUTION_INSTANCE', 'falaw')

SUPABASE_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
}


def _supabase_get(path: str, params: dict = None):
    r = requests.get(f'{SUPABASE_URL}/rest/v1/{path}', headers=SUPABASE_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def buscar_audiencias_amanha():
    """Retorna audiências agendadas para amanhã (não canceladas)."""
    amanha = (date.today() + timedelta(days=1)).isoformat()
    params = {
        'select': 'id,data,hora,vara,reclamada,tipo,advogado,modalidade,status',
        'data': f'eq.{amanha}',
        'status': 'neq.cancelada',
        'order': 'hora.asc',
    }
    return _supabase_get('pauta_audiencias', params)


def buscar_equipe():
    """Retorna mapa nome→celular dos advogados internos (tabela equipe)."""
    rows = _supabase_get('equipe', {'select': 'nome,email,celular'})
    mapa = {}
    for r in rows:
        nome = (r.get('nome') or '').strip()
        cel  = (r.get('celular') or '').strip()
        if nome and cel:
            # Indexa pelo nome completo e por cada palavra (para match por sigla/sobrenome)
            mapa[nome.lower()] = r
            for token in nome.lower().split():
                if len(token) > 2:
                    mapa.setdefault(token, r)
    return mapa


def _formatar_numero(celular: str) -> str | None:
    """Normaliza celular para formato internacional (55DDD9XXXXXXXX)."""
    digits = ''.join(c for c in celular if c.isdigit())
    if not digits:
        return None
    # Adiciona DDI Brasil se não tiver
    if not digits.startswith('55'):
        digits = '55' + digits
    # Mínimo 12 dígitos: 55 + DDD(2) + número(8 ou 9)
    if len(digits) < 12:
        return None
    return digits


def _formatar_mensagem(aud: dict, adv_nome: str) -> str:
    data_fmt = aud.get('data', '')
    if data_fmt:
        d = date.fromisoformat(data_fmt)
        data_fmt = d.strftime('%d/%m/%Y')
    hora   = aud.get('hora', '') or ''
    vara   = aud.get('vara', '') or ''
    recl   = aud.get('reclamada', '') or ''
    tipo   = aud.get('tipo', '') or ''
    modal  = (aud.get('modalidade', '') or 'PRESENCIAL').upper()

    linhas = [
        f'*Falaw Advogados — Lembrete de Audiência*',
        '',
        f'Olá, *{adv_nome}*! 👋',
        '',
        f'Você tem uma audiência *amanhã*:',
        '',
        f'📅 *Data:* {data_fmt}',
    ]
    if hora:
        linhas.append(f'🕐 *Horário:* {hora}')
    if vara:
        linhas.append(f'⚖️  *Vara:* {vara}')
    if recl:
        linhas.append(f'🏢 *Reclamada:* {recl}')
    if tipo:
        linhas.append(f'📋 *Tipo:* {tipo}')
    linhas.append(f'📍 *Modalidade:* {modal}')
    linhas += [
        '',
        '_Falaw Advogados_',
    ]
    return '\n'.join(linhas)


def enviar_whatsapp(numero: str, mensagem: str) -> bool:
    """Envia mensagem de texto via Evolution API."""
    url = f'{EVO_URL}/message/sendText/{EVO_INSTANCE}'
    headers = {
        'apikey': EVO_KEY,
        'Content-Type': 'application/json',
    }
    payload = {
        'number': numero,
        'text': mensagem,
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30)
        if r.status_code in (200, 201):
            return True
        log.warning('Evolution API retornou %s: %s', r.status_code, r.text[:200])
        return False
    except Exception as e:
        log.error('Erro ao enviar WhatsApp para %s: %s', numero, e)
        return False


def main():
    log.info('=' * 60)
    log.info('Falaw WhatsApp Notify — %s', date.today().isoformat())
    log.info('=' * 60)

    if not all([SUPABASE_URL, SUPABASE_KEY, EVO_URL, EVO_KEY]):
        log.error('Variáveis de ambiente incompletas. Abortando.')
        sys.exit(1)

    audiencias = buscar_audiencias_amanha()
    log.info('%d audiência(s) encontrada(s) para amanhã.', len(audiencias))
    if not audiencias:
        log.info('Nenhuma audiência amanhã. Encerrando.')
        return

    equipe = buscar_equipe()

    enviados = 0
    sem_celular = 0
    erros = 0
    # Agrupa por advogado para não enviar duplicata (vários processos no mesmo dia)
    por_adv: dict[str, dict] = {}  # celular → {adv_info, audiencias[]}
    for aud in audiencias:
        adv_raw = (aud.get('advogado') or '').strip()
        if not adv_raw:
            log.warning('Audiência sem advogado: %s', aud.get('id'))
            sem_celular += 1
            continue

        # Tenta encontrar pelo nome/token
        adv_info = equipe.get(adv_raw.lower())
        if not adv_info:
            for token in adv_raw.lower().split():
                adv_info = equipe.get(token)
                if adv_info:
                    break

        if not adv_info or not adv_info.get('celular'):
            log.warning('Sem celular para advogado "%s"', adv_raw)
            sem_celular += 1
            continue

        numero = _formatar_numero(adv_info['celular'])
        if not numero:
            log.warning('Celular inválido "%s" para %s', adv_info['celular'], adv_raw)
            sem_celular += 1
            continue

        if numero not in por_adv:
            por_adv[numero] = {'info': adv_info, 'audiencias': []}
        por_adv[numero]['audiencias'].append(aud)

    for numero, dados in por_adv.items():
        adv_nome = dados['info'].get('nome', '')
        auds = dados['audiencias']
        # Uma mensagem por audiência
        for aud in auds:
            mensagem = _formatar_mensagem(aud, adv_nome)
            ok = enviar_whatsapp(numero, mensagem)
            if ok:
                log.info('✓ Enviado para %s (%s)', adv_nome, numero)
                enviados += 1
            else:
                erros += 1

    log.info('=' * 60)
    log.info('Enviados: %d | Sem celular: %d | Erros: %d', enviados, sem_celular, erros)
    log.info('=' * 60)


if __name__ == '__main__':
    main()
