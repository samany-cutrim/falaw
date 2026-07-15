"""
whatsapp_notify.py — Falaw Advogados
Envia notificação via WhatsApp (CallMeBot) para os advogados INTERNOS do escritório
com audiências no dia seguinte.

Variáveis de ambiente necessárias:
  SUPABASE_URL, SUPABASE_KEY

Cadastro de cada advogado no CallMeBot (feito UMA VEZ por pessoa):
  1. Adicionar o número do CallMeBot aos contatos do celular:
     +34 644 51 95 23 (conferir o número atual em https://www.callmebot.com/blog/free-api-whatsapp-messages/)
  2. Enviar pelo WhatsApp a mensagem: "I allow callmebot to send me messages"
  3. O bot responde com a API key pessoal (ex: "Your APIKEY is 123456")
  4. Cadastrar essa key no admin (Equipe → editar membro → campo "API key CallMeBot")
     ou direto na tabela `equipe` do Supabase, coluna `callmebot_apikey`.

Sem a API key cadastrada, o advogado é pulado (fica registrado no log).
"""

import os
import sys
import time
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

SUPABASE_URL = os.getenv('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')

CALLMEBOT_URL = 'https://api.callmebot.com/whatsapp.php'
# Pausa entre envios — o CallMeBot é gratuito e limita a frequência de requisições
CALLMEBOT_INTERVALO_S = 5

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
    """Retorna mapa nome/sigla→dados dos advogados internos (tabela equipe)."""
    rows = _supabase_get('equipe', {'select': 'nome,email,celular,callmebot_apikey,sigla'})
    mapa = {}
    for r in rows:
        nome = (r.get('nome') or '').strip()
        cel  = (r.get('celular') or '').strip()
        if nome and cel:
            # Indexa pelo nome completo e por cada palavra (para match por sobrenome)
            mapa[nome.lower()] = r
            for token in nome.lower().split():
                if len(token) > 2:
                    mapa.setdefault(token, r)
    # Sigla do escritório (ex: SC = Samany Cutrim) tem prioridade sobre
    # qualquer coincidência de nome — por isso é indexada por último,
    # sobrescrevendo entradas anteriores.
    for r in rows:
        sigla = (r.get('sigla') or '').strip().lower()
        if sigla and (r.get('celular') or '').strip():
            mapa[sigla] = r
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


def enviar_whatsapp(numero: str, apikey: str, mensagem: str) -> bool:
    """Envia mensagem de texto via CallMeBot (API key pessoal do destinatário)."""
    params = {
        'phone': f'+{numero}',
        'text': mensagem,
        'apikey': apikey,
    }
    try:
        r = requests.get(CALLMEBOT_URL, params=params, timeout=60)
        # O CallMeBot responde 200 com HTML; erros vêm no corpo
        # (ex.: "APIKey is invalid", "ERROR: ...").
        corpo = (r.text or '').upper()
        if r.status_code == 200 and 'INVALID' not in corpo and 'ERROR' not in corpo:
            return True
        log.warning('CallMeBot retornou %s: %s', r.status_code, r.text[:200])
        return False
    except Exception as e:
        log.error('Erro ao enviar WhatsApp para %s: %s', numero, e)
        return False


def main():
    log.info('=' * 60)
    log.info('Falaw WhatsApp Notify (CallMeBot) — %s', date.today().isoformat())
    log.info('=' * 60)

    if not all([SUPABASE_URL, SUPABASE_KEY]):
        log.error('Variáveis de ambiente incompletas (SUPABASE_URL/SUPABASE_KEY). Abortando.')
        sys.exit(1)

    audiencias = buscar_audiencias_amanha()
    log.info('%d audiência(s) encontrada(s) para amanhã.', len(audiencias))
    if not audiencias:
        log.info('Nenhuma audiência amanhã. Encerrando.')
        return

    equipe = buscar_equipe()

    enviados = 0
    sem_celular = 0
    sem_apikey = 0
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

        if not (adv_info.get('callmebot_apikey') or '').strip():
            log.warning('Advogado "%s" sem API key CallMeBot cadastrada — '
                        'ver instruções no cabeçalho deste script.', adv_raw)
            sem_apikey += 1
            continue

        numero = _formatar_numero(adv_info['celular'])
        if not numero:
            log.warning('Celular inválido "%s" para %s', adv_info['celular'], adv_raw)
            sem_celular += 1
            continue

        if numero not in por_adv:
            por_adv[numero] = {'info': adv_info, 'audiencias': []}
        por_adv[numero]['audiencias'].append(aud)

    primeiro = True
    for numero, dados in por_adv.items():
        adv_nome = dados['info'].get('nome', '')
        apikey   = dados['info']['callmebot_apikey'].strip()
        auds = dados['audiencias']
        # Uma mensagem por audiência
        for aud in auds:
            if not primeiro:
                time.sleep(CALLMEBOT_INTERVALO_S)
            primeiro = False
            mensagem = _formatar_mensagem(aud, adv_nome)
            ok = enviar_whatsapp(numero, apikey, mensagem)
            if ok:
                log.info('✓ Enviado para %s (%s)', adv_nome, numero)
                enviados += 1
            else:
                erros += 1

    log.info('=' * 60)
    log.info('Enviados: %d | Sem celular: %d | Sem API key: %d | Erros: %d',
             enviados, sem_celular, sem_apikey, erros)
    log.info('=' * 60)


if __name__ == '__main__':
    main()
