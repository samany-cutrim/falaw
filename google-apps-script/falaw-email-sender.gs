/**
 * Falaw E-mail Sender — Google Apps Script
 * Implante como Web App na conta ferrazandrade@falaw.com.br:
 *   Implantar → Nova implantação → Web App
 *   Executar como: Eu (ferrazandrade@falaw.com.br)
 *   Quem pode acessar: Qualquer pessoa
 *
 * Depois copie a URL gerada e cole em:
 *   Admin Falaw → Configurações → Google Apps Script — URL de envio de e-mail
 */

// Token opcional para evitar uso indevido (coloque qualquer string secreta)
var SECRET_TOKEN = 'TROQUE_ESTE_TOKEN';

function doPost(e) {
  try {
    if (!e) throw new Error('Evento (e) indefinido — não execute doPost diretamente; use testDoPost.');
    Logger.log('doPost chamado. postData: ' + JSON.stringify(e.postData));

    if (!e.postData || !e.postData.contents) {
      throw new Error('postData vazio ou ausente. type: ' + (e.postData ? e.postData.type : 'null'));
    }

    var payload = JSON.parse(e.postData.contents);
    Logger.log('payload.to: ' + payload.to);
    Logger.log('payload.subject: ' + payload.subject);

    // Validação de token (se configurado)
    if (SECRET_TOKEN && SECRET_TOKEN !== 'TROQUE_ESTE_TOKEN') {
      if (payload.token !== SECRET_TOKEN) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    var subject = payload.subject || '(sem assunto)';
    var html    = payload.html    || payload.body || '';
    var to      = payload.to      || '';
    var replyTo = payload.replyTo || 'ferrazandrade@falaw.com.br';

    if (!to) throw new Error('Campo "to" vazio.');

    Logger.log('Enviando para: ' + to);

    // Envia de ferrazandrade@falaw.com.br (conta logada)
    GmailApp.sendEmail(to, subject, '', {
      htmlBody: html,
      replyTo: replyTo,
      name: 'Falaw Advogados'
    });

    Logger.log('Email enviado com sucesso para: ' + to);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('ERRO doPost: ' + err.message + ' | stack: ' + err.stack);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function testDoPost() {
  var mockEvent = {
    postData: {
      contents: JSON.stringify({
        subject: 'Teste GAS Falaw',
        html: '<p>Teste de envio via doPost simulado.</p>',
        to: 'ferrazandrade@falaw.com.br',
        replyTo: 'ferrazandrade@falaw.com.br'
      }),
      type: 'application/json'
    }
  };
  var result = doPost(mockEvent);
  Logger.log('Resultado: ' + result.getContent());
}

function testSendEmail() {
  GmailApp.sendEmail(
    'ferrazandrade@falaw.com.br',
    'Teste GAS Falaw',
    '',
    { htmlBody: '<p>Teste de autorização do GAS.</p>', name: 'Falaw Advogados' }
  );
  Logger.log('Teste enviado com sucesso.');
}

// Responde a requisições OPTIONS (preflight CORS) — necessário para no-cors do browser
function doGet(e) {
  return ContentService
    .createTextOutput('Falaw Email Sender ativo.')
    .setMimeType(ContentService.MimeType.TEXT);
}
