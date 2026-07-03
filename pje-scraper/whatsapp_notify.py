"""
whatsapp_notify.py — Falaw Advogados
Envia notificação via WhatsApp (Evolution API) para correspondentes/advogados
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
        'select': 'id,data,hora,vara,reclamada,tipo,correspondente_nome,correspondente_email,modalidade,status',
        'data': f'eq.{amanha}',
        'status': 'neq.cancelada',
        'order': 'hora.asc',
    }
    return _supabase_get('pauta_audiencias', params)


def buscar_correspondentes():
    """Retorna mapa email→{nome,celular} de correspondentes."""
    rows = _supabase_get('correspondentes', {'select': 'nome,email,celular'})
    return {r['email']: r for r in rows if r.get('email')}


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


def _formatar_mensagem(aud: dict, corr_nome: str) -> str:
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
        f'Olá, *{corr_nome}*! 👋',
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
        '_Qualquer dúvida entre em contato com o escritório._',
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

    correspondentes = buscar_correspondentes()

    enviados = 0
    sem_celular = 0
    erros = 0

    for aud in audiencias:
        email = aud.get('correspondente_email', '')
        nome  = aud.get('correspondente_nome', '') or 'Correspondente'

        corr = correspondentes.get(email, {})
        celular_raw = corr.get('celular', '') or ''
        if not celular_raw:
            log.warning('Sem celular: %s <%s> — audiência %s', nome, email, aud.get('id'))
            sem_celular += 1
            continue

        numero = _formatar_numero(celular_raw)
        if not numero:
            log.warning('Celular inválido "%s" para %s', celular_raw, nome)
            sem_celular += 1
            continue

        mensagem = _formatar_mensagem(aud, corr.get('nome') or nome)
        ok = enviar_whatsapp(numero, mensagem)
        if ok:
            log.info('✓ Enviado para %s (%s)', nome, numero)
            enviados += 1
        else:
            erros += 1

    log.info('=' * 60)
    log.info('Enviados: %d | Sem celular: %d | Erros: %d', enviados, sem_celular, erros)
    log.info('=' * 60)


if __name__ == '__main__':
    main()
