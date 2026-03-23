/**
 * Cloudflare Worker — Proxy para API da Anthropic (Claude)
 *
 * Deploy:
 *   1. Acesse https://workers.cloudflare.com e crie um novo Worker
 *   2. Cole este código no editor
 *   3. Substitua ANTHROPIC_API_KEY pela sua chave real
 *      (ou configure como variável de ambiente nas Settings do Worker)
 *   4. Clique em "Deploy"
 *   5. Copie a URL do Worker (ex: https://claude-proxy.SEU-USER.workers.dev)
 *   6. Cole essa URL no campo "Claude Proxy URL" em Admin → Configurações
 */

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────

// Substitua pela sua chave da Anthropic (https://console.anthropic.com)
// OU configure como variável de ambiente "ANTHROPIC_API_KEY" nas Settings do Worker
const ANTHROPIC_API_KEY = 'COLOQUE_SUA_CHAVE_AQUI';

// Origens permitidas (deixe '*' para permitir qualquer origem)
const ALLOWED_ORIGIN = '*';

// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    // Chave via variável de ambiente tem prioridade sobre a constante acima
    const apiKey = (env && env.ANTHROPIC_API_KEY) || ANTHROPIC_API_KEY;

    // Headers CORS comuns
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Só aceita POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Método não permitido' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Valida chave configurada
    if (!apiKey || apiKey === 'COLOQUE_SUA_CHAVE_AQUI') {
      return new Response(
        JSON.stringify({ error: 'API Key da Anthropic não configurada no Worker.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Lê o body enviado pelo admin
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Body inválido — esperado JSON.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Encaminha para a Anthropic
    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Erro ao conectar com a Anthropic: ' + err.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await anthropicRes.json();

    return new Response(JSON.stringify(data), {
      status: anthropicRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
