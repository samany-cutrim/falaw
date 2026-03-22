/**
 * FA Law Blog — Registro de Artigos
 *
 * Como publicar um novo artigo:
 *   1. Crie o arquivo HTML do artigo na pasta blog/
 *   2. Adicione uma entrada neste array abaixo
 *   3. Faça commit e push — o card aparece automaticamente na listagem
 *
 * Campos:
 *   id        — slug único (string)
 *   title     — título do artigo
 *   category  — categoria exibida no card
 *   excerpt   — resumo curto (~200 caracteres)
 *   date      — data de publicação
 *   readTime  — tempo estimado de leitura
 *   url       — caminho para o HTML, relativo à raiz do site (ex: "blog/meu-artigo.html")
 *   published — true = aparece na listagem | false = rascunho (não aparece)
 */
var FALAW_ARTICLES = [
  {
    id: 'berna-artigo',
    title: 'BERNA: a IA brasileira que desafia a litigância predatória em escala nacional',
    category: 'Inovação Jurídica',
    excerpt: 'Em março de 2026, o CNJ nacionalizou a BERNA — ferramenta de inteligência artificial desenvolvida pelo TJGO que analisa petições por similaridade semântica. O que muda para advogados, magistrados e escritórios de contencioso de massa.',
    date: 'Março de 2026',
    readTime: '7 min',
    url: 'blog/berna-artigo.html',
    published: true
  }
];
