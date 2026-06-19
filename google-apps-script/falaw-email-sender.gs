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
    var payload = JSON.parse(e.postData.contents);

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

    // Envia de ferrazandrade@falaw.com.br (conta logada)
    GmailApp.sendEmail(to, subject, '', {
      htmlBody: html,
      replyTo: replyTo,
      name: 'Falaw Advogados'
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Responde a requisições OPTIONS (preflight CORS) — necessário para no-cors do browser
function doGet(e) {
  return ContentService
    .createTextOutput('Falaw Email Sender ativo.')
    .setMimeType(ContentService.MimeType.TEXT);
}
