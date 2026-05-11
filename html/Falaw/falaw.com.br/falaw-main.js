/* ============================================================
   FALAW — falaw-main.js
   Deps: GSAP 3 + ScrollTrigger (CDN)
   ============================================================ */

(function () {
  'use strict';

  /* ── Utils ── */
  const lerp = (a, b, t) => a + (b - a) * t;
  const qs   = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa  = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ────────────────────────────────────────
     LANGUAGE SWITCHER + SHARED TRANSLATIONS
  ──────────────────────────────────────── */
  const LANG_STORAGE_KEY = 'fa_site_lang';
  const DEFAULT_LANG = 'pt';

  const uiText = {
    nav: {
      aria: { pt: 'Principal', en: 'Primary' },
      logo: { pt: 'Falaw Advogados — Início', en: 'Falaw Advogados — Home' },
      burger: { pt: 'Menu', en: 'Menu' },
      links: {
        'index.html': { pt: 'Home', en: 'Home' },
        'founder.html': { pt: 'Founder', en: 'Founder' },
        'atuacoes/index.html': { pt: 'Atuações', en: 'Practice Areas' },
        'equipe.html': { pt: 'Nossa Equipe', en: 'Our Team' },
        'contato/index.html': { pt: 'Contato', en: 'Contact' },
        'blog.html': { pt: 'Blog', en: 'Blog' },
        'cliente/index.html': { pt: 'Área do Cliente', en: 'Client Area' },
        'trabalhe-conosco.html': { pt: 'Trabalhe Conosco', en: 'Careers' },
        'privacidade.html': { pt: 'Política de Privacidade', en: 'Privacy Policy' },
        'cookies.html': { pt: 'Cookies', en: 'Cookies' },
        'termos.html': { pt: 'Termos de Uso', en: 'Terms of Use' }
      }
    },
    footerCopy: {
      pt: '© 2026 · Falaw Advogados · Todos os direitos reservados',
      en: '© 2026 · Falaw Advogados · All rights reserved'
    },
    backToSite: {
      pt: '← Voltar ao site',
      en: '← Back to site'
    },
    phrases: {
      newsletter: {
        alreadySubscribed: { pt: 'Já inscrito ✓', en: 'Already subscribed ✓' },
        subscribed: { pt: 'Inscrito ✓', en: 'Subscribed ✓' }
      },
      contact: {
        sent: { pt: 'Mensagem enviada ✓', en: 'Message sent ✓' },
        successTitle: { pt: 'Mensagem enviada com sucesso!', en: 'Message sent successfully!' },
        successBody: { pt: 'Entraremos em contato em breve.', en: 'We will contact you shortly.' }
      },
      blog: {
        all: { pt: 'Todos', en: 'All' },
        results: function (count, filtered, lang) {
          if (lang === 'en') {
            if (filtered) return count + (count === 1 ? ' article found' : ' articles found');
            return count + (count === 1 ? ' article' : ' articles');
          }
          if (filtered) return count + (count === 1 ? ' artigo encontrado' : ' artigos encontrados');
          return count + (count === 1 ? ' artigo' : ' artigos');
        },
        noResults: { pt: 'Nenhum artigo encontrado para', en: 'No articles found for' },
        clear: { pt: 'Limpar busca', en: 'Clear search' },
        readArticle: { pt: 'Ler artigo', en: 'Read article' },
        readTime: { pt: 'de leitura', en: 'read' },
        searchPlaceholder: { pt: 'Buscar artigos…', en: 'Search articles…' },
        searchLabel: { pt: 'Buscar artigos', en: 'Search articles' },
        clearLabel: { pt: 'Limpar busca', en: 'Clear search' }
      },
      careers: {
        invalidType: { pt: '✗ Tipo não permitido. Use PDF, DOC ou DOCX.', en: '✗ Unsupported file type. Use PDF, DOC or DOCX.' },
        invalidSize: function (size, lang) {
          return lang === 'en' ? `✗ File too large. Maximum ${size} MB.` : `✗ Arquivo muito grande. Máximo ${size} MB.`;
        },
        invalidContent: { pt: '✗ Conteúdo do arquivo inválido.', en: '✗ Invalid file content.' },
        requiredFields: { pt: 'Por favor, preencha nome e e-mail.', en: 'Please fill in your name and email.' },
        attachCv: { pt: 'Por favor, anexe seu currículo.', en: 'Please attach your resume.' },
        sending: { pt: 'Enviando…', en: 'Sending…' }
      }
    }
  };

  const pageText = {
    home: {
      title: {
        pt: 'Falaw Advogados — Escritório de Direito Trabalhista em São Paulo',
        en: 'Falaw Advogados — Labor and Employment Law Firm in Sao Paulo'
      },
      description: {
        pt: 'Falaw Advogados: especialistas em Direito do Trabalho para startups, tecnologia e empresas em crescimento. Assessoria trabalhista, contencioso, compliance e relações sindicais em São Paulo.',
        en: 'Falaw Advogados: labor and employment counsel for startups, technology businesses and companies in growth mode. Advisory, litigation, compliance and union relations in Sao Paulo.'
      },
      entries: [
        { selector: '#s-hero', data: 'label', pt: 'Home', en: 'Home' },
        { selector: '#s-como', data: 'label', pt: 'Como Atuamos', en: 'How We Work' },
        { selector: '#s-areas', data: 'label', pt: 'Nossas Atuações', en: 'Practice Areas' },
        { selector: '#s-ajudar', data: 'label', pt: 'Como Iremos Te Ajudar', en: 'How We Help' },
        { selector: '#s-diferenciais', data: 'label', pt: 'Nossos Diferenciais', en: 'Our Difference' },
        { selector: '#s-newsletter', data: 'label', pt: 'Newsletter', en: 'Newsletter' },
        { selector: '.nav-counter', text: { pt: '01 — Home', en: '01 — Home' } },
        { selector: '.dot-nav .dot:nth-child(2)', attr: 'aria-label', pt: 'Como Atuamos', en: 'How We Work' },
        { selector: '.dot-nav .dot:nth-child(3)', attr: 'aria-label', pt: 'Nossas Atuações', en: 'Practice Areas' },
        { selector: '.dot-nav .dot:nth-child(4)', attr: 'aria-label', pt: 'Como Iremos Te Ajudar', en: 'How We Help' },
        { selector: '.hero-caption', text: { pt: 'Falaw Advogados · São Paulo, Brasil', en: 'Falaw Advogados · Sao Paulo, Brazil' } },
        { selector: '#s-hero .label', text: { pt: 'Direito Trabalhista · São Paulo, Brasil', en: 'Labor Law · Sao Paulo, Brazil' } },
        { selector: '#s-hero .hero-title', html: { pt: 'Mais do que<br>um <span class="ht-accent">Escritório,</span><br>somos <span class="ht-accent">Parceiros</span><br>de Negócio', en: 'More than<br>a <span class="ht-accent">Law Firm,</span><br>we are <span class="ht-accent">Business</span><br>Partners' } },
        { selector: '#s-hero .hero-sub', text: { pt: 'Promova o crescimento sustentável de sua empresa com assessoria trabalhista especializada em startups e tecnologia.', en: 'Drive sustainable growth with labor and employment counsel tailored to startups and technology businesses.' } },
        { selector: '#s-hero .cta', html: { pt: 'Fale conosco <span class="arr">→</span>', en: 'Talk to us <span class="arr">→</span>' } },
        { selector: '#s-como .label', text: { pt: '02 — Como Atuamos', en: '02 — How We Work' } },
        { selector: '#s-como h2', html: { pt: 'Como<br>Atuamos!', en: 'How<br>We Work' } },
        { selector: '#s-como .como-text p', text: { pt: 'Apaixonados por ambientes disruptivos, desenvolvemos um trabalho diferenciado de adequação de empresas à legislação trabalhista, com construção de práticas que permitam o crescimento sustentável de nossos clientes — dentro da visão de negócio, mas mitigando problemas futuros de passivo trabalhista.', en: 'We thrive in disruptive environments and build labor strategies that adapt companies to employment regulations while supporting sustainable growth, business velocity and lower long-term labor exposure.' } },
        { selector: '#s-como .cta', html: { pt: 'Solicite um contato <span class="arr">→</span>', en: 'Request a call <span class="arr">→</span>' } },
        { selector: '#s-areas .label', text: { pt: '03 — Nossas Atuações', en: '03 — Practice Areas' } },
        { selector: '.area-item[data-idx="0"] .area-item-title', text: { pt: 'Startup & Tecnologia', en: 'Startups & Technology' } },
        { selector: '.area-item[data-idx="1"] .area-item-title', text: { pt: 'Contencioso', en: 'Litigation' } },
        { selector: '.area-item[data-idx="2"] .area-item-title', text: { pt: 'Consultivo', en: 'Advisory' } },
        { selector: '.area-item[data-idx="3"] .area-item-title', text: { pt: 'Relações Sindicais', en: 'Union Relations' } },
        { selector: '.area-item[data-idx="4"] .area-item-title', text: { pt: 'Consultoria Preventiva e Auditoria', en: 'Preventive Consulting & Audit' } },
        { selector: '.area-item[data-idx="5"] .area-item-title', text: { pt: 'Treinamentos', en: 'Training' } },
        { selector: '.area-panel[data-panel="0"] .area-panel-title', html: { pt: 'Startup &<br>Tecnologia', en: 'Startups &<br>Technology' } },
        { selector: '.area-panel[data-panel="0"] .area-panel-desc', text: { pt: 'Vasta experiência com startups e unicórnios brasileiros. Assessoramos nossos clientes antes mesmo do lançamento das plataformas ao público, construindo estruturas trabalhistas sólidas desde a origem do negócio.', en: 'Deep experience with startups and Brazilian unicorns. We advise clients even before launch, building solid labor structures from the very beginning of the business.' } },
        { selector: '.area-panel[data-panel="1"] .area-panel-title', html: { pt: 'Contencioso<br>Massificado e<br>Estratégico', en: 'High-Volume and<br>Strategic<br>Litigation' } },
        { selector: '.area-panel[data-panel="1"] .area-panel-desc', text: { pt: 'Atuação em contencioso trabalhista massificado e estratégico — nas esferas judicial e administrativa (MPT e MTE) — em qualquer instância ou Tribunal do país. Gestão inteligente do passivo, redução de custos processuais e defesa qualificada dos interesses empresariais.', en: 'Representation in high-volume and strategic employment litigation, both judicial and administrative, before any court or labor authority in Brazil. Smart liability management, lower litigation costs and qualified defense of business interests.' } },
        { selector: '.area-panel[data-panel="2"] .area-panel-title', text: { pt: 'Consultivo', en: 'Advisory' } },
        { selector: '.area-panel[data-panel="2"] .area-panel-desc', text: { pt: 'Suporte jurídico constante nas mais variadas matérias trabalhistas do cotidiano empresarial. Garantimos conformidade e segurança jurídica para que seus negócios cresçam sem passivos — com respostas ágeis e linguagem alinhada à realidade do seu negócio.', en: 'Ongoing labor and employment support for the day-to-day needs of the business. We secure compliance and legal certainty so your company can scale without hidden liabilities.' } },
        { selector: '.area-panel[data-panel="3"] .area-panel-title', html: { pt: 'Relações<br>Sindicais', en: 'Union<br>Relations' } },
        { selector: '.area-panel[data-panel="3"] .area-panel-desc', text: { pt: 'Gestão estratégica das relações sindicais, negociação coletiva e assessoria em acordos e convenções coletivas de trabalho. Proteção dos interesses empresariais com visão preventiva e dialógica.', en: 'Strategic union relations, collective bargaining and support in labor agreements and conventions. Protection of business interests with a preventive and collaborative approach.' } },
        { selector: '.area-panel[data-panel="4"] .area-panel-title', html: { pt: 'Consultoria<br>Preventiva e<br>Auditoria', en: 'Preventive<br>Consulting and<br>Audit' } },
        { selector: '.area-panel[data-panel="4"] .area-panel-desc', text: { pt: 'Diagnóstico completo da conformidade trabalhista da empresa: mapeamento de passivos latentes, revisão de contratos e políticas internas, adequação às normas regulamentadoras e elaboração de planos de ação corretivos. Transformamos vulnerabilidades em segurança jurídica antes que virem litígios.', en: 'A full labor compliance diagnosis: hidden liability mapping, contract and policy review, regulatory adequacy and corrective action plans. We turn vulnerabilities into legal certainty before they become disputes.' } },
        { selector: '.area-panel[data-panel="5"] .area-panel-title', text: { pt: 'Treinamentos', en: 'Training' } },
        { selector: '.area-panel[data-panel="5"] .area-panel-desc', text: { pt: 'Programas de treinamento e educação corporativa em Direito do Trabalho voltados à cultura de compliance, prevenção de conflitos e capacitação de líderes e equipes de RH. Serviços oferecidos por FA Consultoria e Educação Corporativa.', en: 'Corporate education and training programs in labor law focused on compliance culture, conflict prevention and leadership and HR capability building. Services delivered by FA Consultoria e Educacao Corporativa.' } },
        { selector: '.area-panel[data-panel="0"] .cta, .area-panel[data-panel="1"] .cta, .area-panel[data-panel="2"] .cta, .area-panel[data-panel="3"] .cta', html: { pt: 'Fale conosco <span class="arr">→</span>', en: 'Talk to us <span class="arr">→</span>' } },
        { selector: '.area-panel[data-panel="4"] .cta', html: { pt: 'Conheça a FA Consultoria <span class="arr">→</span>', en: 'Meet FA Consultoria <span class="arr">→</span>' } },
        { selector: '.area-panel[data-panel="5"] .cta', html: { pt: 'Conheça a FA Consultoria <span class="arr">→</span>', en: 'Meet FA Consultoria <span class="arr">→</span>' } },
        { selector: '#s-ajudar .label', text: { pt: '04 — Como Iremos Te Ajudar', en: '04 — How We Help' } },
        { selector: '#s-ajudar h2', html: { pt: 'Como iremos<br>te ajudar!', en: 'How we<br>help you' } },
        { selector: '#s-ajudar .ajudar-card:nth-child(1) .ajudar-title', text: { pt: 'Foco no Crescimento', en: 'Growth Focus' } },
        { selector: '#s-ajudar .ajudar-card:nth-child(1) .ajudar-desc', text: { pt: 'Contamos com uma equipe motivada, comprometida e apaixonada por ambientes disruptivos.', en: 'We have a motivated team committed to fast-moving and disruptive environments.' } },
        { selector: '#s-ajudar .ajudar-card:nth-child(2) .ajudar-title', text: { pt: 'Processos Otimizados', en: 'Optimized Processes' } },
        { selector: '#s-ajudar .ajudar-card:nth-child(2) .ajudar-desc', text: { pt: 'Temos uma vasta experiência na área de Direito do Trabalho com startups e empresas na área de tecnologia.', en: 'We bring extensive labor-law experience with startups and technology companies.' } },
        { selector: '#s-ajudar .ajudar-card:nth-child(3) .ajudar-title', text: { pt: 'Experiência no Novo', en: 'Experience in What Is New' } },
        { selector: '#s-ajudar .ajudar-card:nth-child(3) .ajudar-desc', text: { pt: 'Atuamos com os principais unicórnios brasileiros e acompanhamos toda evolução de tais empresas nas mais diferentes fases de crescimento.', en: 'We advise leading Brazilian unicorns and have followed their growth through multiple stages of scale.' } },
        { selector: '#s-ajudar .cta', html: { pt: 'Solicite um contato <span class="arr">→</span>', en: 'Request a call <span class="arr">→</span>' } },
        { selector: '#s-diferenciais .label', text: { pt: '05 — Nossos Diferenciais', en: '05 — Our Difference' } },
        { selector: '#s-diferenciais h2', html: { pt: 'O jurídico que<br>impulsiona o seu<br>crescimento.', en: 'Legal counsel that<br>pushes your<br>growth forward.' } },
        { selector: '#s-diferenciais p', text: { pt: 'Ao seu lado — não no seu caminho. Construímos estruturas jurídicas que permitem escalar com segurança, sem travar decisões nem criar passivos que comprometem o futuro.', en: 'At your side, not in your way. We build legal structures that let you scale safely without slowing decisions or creating liabilities that compromise the future.' } },
        { selector: '#s-diferenciais .cta', html: { pt: 'Fale com um especialista <span class="arr">→</span>', en: 'Talk to a specialist <span class="arr">→</span>' } },
        { selector: '#s-newsletter .label', text: { pt: 'Newsletter', en: 'Newsletter' } },
        { selector: '#s-newsletter h2', html: { pt: 'Fique por<br>dentro do<br>Direito 4.0', en: 'Stay ahead in<br>Labor Law<br>4.0' } },
        { selector: '#s-newsletter p', text: { pt: 'Receba artigos, análises e novidades sobre Direito Trabalhista, startups e inovação jurídica diretamente no seu e-mail.', en: 'Receive articles, insights and updates on labor law, startups and legal innovation directly in your inbox.' } },
        { selector: '#newsletter-email', attr: 'placeholder', pt: 'Seu melhor e-mail', en: 'Your best email' },
        { selector: '.newsletter-form button', html: { pt: 'Inscrever <span class="arr">→</span>', en: 'Subscribe <span class="arr">→</span>' } },
        { selector: '.newsletter-disclaimer', text: { pt: 'Sem spam. Apenas conteúdo relevante. Cancele quando quiser.', en: 'No spam. Only relevant content. Unsubscribe anytime.' } }
      ]
    },
    founder: {
      title: { pt: 'Founder — Falaw Advogados | Especialista em Direito Trabalhista', en: 'Founder — Falaw Advogados | Labor Law Specialist' },
      description: { pt: 'Conheca a fundadora da Falaw Advogados: advogada especialista em Direito do Trabalho, palestrante, docente e referencia em advocacia trabalhista para startups e tecnologia em Sao Paulo.', en: 'Meet the founder of Falaw Advogados: a labor-law specialist, professor, speaker and reference in employment counsel for startups and technology in Sao Paulo.' },
      entries: [
        { selector: '#s-hero', data: 'label', pt: 'Founder', en: 'Founder' },
        { selector: '#s-formacao', data: 'label', pt: 'Biografia', en: 'Biography' },
        { selector: '#s-atuacao', data: 'label', pt: 'Atuação', en: 'Practice' },
        { selector: '#s-selos', data: 'label', pt: 'Reconhecimentos', en: 'Recognition' },
        { selector: '.nav-counter', text: { pt: '01 — Founder', en: '01 — Founder' } },
        { selector: '.dot-nav .dot:nth-child(2)', attr: 'aria-label', pt: 'Biografia', en: 'Biography' },
        { selector: '.dot-nav .dot:nth-child(3)', attr: 'aria-label', pt: 'Atuação', en: 'Practice' },
        { selector: '.dot-nav .dot:nth-child(4)', attr: 'aria-label', pt: 'Reconhecimentos', en: 'Recognition' },
        { selector: '#s-hero .hero-sub', text: { pt: 'Doutora em Direito do Trabalho e da Seguridade Social pela Faculdade de Direito da USP. Árbitra, professora e palestrante. Especialista em temas envolvendo inovação e tecnologia atrelados ao Direito do Trabalho.', en: 'PhD in Labor and Social Security Law from the University of Sao Paulo. Arbitrator, professor and speaker. Specialist in innovation- and technology-related labor law matters.' } },
        { selector: '#s-hero .cta', html: { pt: 'Solicitar contato <span class="arr">→</span>', en: 'Request contact <span class="arr">→</span>' } },
        { selector: '.hero-caption', text: { pt: 'Tatiana G. Ferraz Andrade · Founder & Managing Partner', en: 'Tatiana G. Ferraz Andrade · Founder & Managing Partner' } },
        { selector: '#s-formacao .label', text: { pt: '02 — Formação & Trajetória', en: '02 — Education & Journey' } },
        { selector: '#s-formacao h2', html: { pt: 'Sólida<br>Base<br>Acadêmica', en: 'A Strong<br>Academic<br>Foundation' } },
        { selector: '#s-atuacao .label', text: { pt: '03 — Atuação Profissional', en: '03 — Professional Practice' } },
        { selector: '#s-atuacao h2', html: { pt: 'Trajetória<br>de Excelência', en: 'A Record<br>of Excellence' } },
        { selector: '#s-atuacao .founder-bio', html: { pt: '<p>Participa como palestrante em conferências, seminários e palestras organizadas por órgãos de classe. Professora na Faculdade de Direito Damásio, na Universidade Presbiteriana Mackenzie e na Escola Superior de Advocacia (ESA OAB-SP). Autora de diversos artigos publicados em sites, jornais e revistas especializadas e livros. Forte atuação com questões envolvendo altos executivos, tema da tese de doutorado. Árbitra. É fluente em inglês e em espanhol.</p><p>Atuação direta nos debates sobre regulamentação das plataformas no Brasil.</p>', en: '<p>Speaker at conferences, seminars and industry events. Professor at Faculdade de Direito Damasio, Universidade Presbiteriana Mackenzie and ESA OAB-SP. Author of articles, books and publications in specialized media. Strong practice in matters involving senior executives, the subject of her doctoral thesis. Arbitrator. Fluent in English and Spanish.</p><p>Direct participation in the debate on platform regulation in Brazil.</p>' } },
        { selector: '#s-selos .label', text: { pt: '04 — Reconhecimentos', en: '04 — Recognition' } },
        { selector: '#s-selos h2', html: { pt: 'Selos &<br>Premiações', en: 'Awards &<br>Recognitions' } },
        { selector: '#s-selos .selos-desc', text: { pt: 'Reconhecimentos que atestam o compromisso do escritório com a excelência jurídica e a valorização da advocacia de alta performance.', en: 'Recognition that reflects the firm’s commitment to legal excellence and high-performance advocacy.' } }
      ]
    },
    team: {
      title: { pt: 'Nossa Equipe — Falaw Advogados | Advogados Trabalhistas SP', en: 'Our Team — Falaw Advogados | Employment Lawyers in Sao Paulo' },
      description: { pt: 'Conheca o time da Falaw Advogados. Profissionais especializados em Direito do Trabalho, contencioso, consultivo, compliance e relacoes sindicais em Sao Paulo.', en: 'Meet Falaw Advogados’ team. Professionals specialized in labor law, litigation, advisory, compliance and union relations in Sao Paulo.' },
      entries: [
        { selector: '#s-hero', data: 'label', pt: 'Nossa Equipe', en: 'Our Team' },
        { selector: '#s-equipe', data: 'label', pt: 'Equipe', en: 'Team' },
        { selector: '.nav-counter', text: { pt: '01 — Nossa Equipe', en: '01 — Our Team' } },
        { selector: '.dot-nav .dot:nth-child(2)', attr: 'aria-label', pt: 'Equipe', en: 'Team' },
        { selector: '#s-hero .label', text: { pt: 'Nossa Equipe · Falaw Advogados', en: 'Our Team · Falaw Advogados' } },
        { selector: '#s-hero .hero-title', html: { pt: 'Alta<br>Performance', en: 'High<br>Performance' } },
        { selector: '#s-hero .hero-sub', text: { pt: 'Conheça nossa equipe de alta performance, engajada na revolução do Direito 4.0 com conceitos disruptivos. Passe o mouse sobre o nome para conhecer cada profissional.', en: 'Meet our high-performance team, engaged with the evolution of Law 4.0 and disruptive thinking. Hover over each name to learn more about every professional.' } },
        { selector: '#s-hero .cta', html: { pt: 'Solicitar contato <span class="arr">→</span>', en: 'Request contact <span class="arr">→</span>' } },
        { selector: '.hero-caption', text: { pt: 'Falaw Advogados · São Paulo, Brasil', en: 'Falaw Advogados · Sao Paulo, Brazil' } }
      ]
    },
    contact: {
      title: { pt: 'Contato — Falaw Advogados | Advogados Trabalhistas Sao Paulo', en: 'Contact — Falaw Advogados | Employment Lawyers in Sao Paulo' },
      description: { pt: 'Entre em contato com a Falaw Advogados. Escritorio especializado em Direito do Trabalho na Av. Francisco Matarazzo, 1752, Sao Paulo/SP. Agende sua consulta.', en: 'Get in touch with Falaw Advogados. A labor and employment law firm at Av. Francisco Matarazzo, 1752, Sao Paulo/SP. Schedule your consultation.' },
      entries: [
        { selector: '#s-contato', data: 'label', pt: 'Contato', en: 'Contact' },
        { selector: '.nav-counter', text: { pt: '01 — Contato', en: '01 — Contact' } },
        { selector: '.dot-nav .dot:nth-child(1)', attr: 'aria-label', pt: 'Contato', en: 'Contact' },
        { selector: '.contato-info .label', text: { pt: 'Fale Conosco', en: 'Talk to Us' } },
        { selector: '.contato-info h1', html: { pt: 'Vamos<br>Conversar!', en: 'Let’s<br>Talk' } },
        { selector: '.contato-info > p', text: { pt: 'Localizado no coração de São Paulo, nosso escritório está preparado para recebê-lo com toda a estrutura necessária para uma assessoria jurídica de alta performance. Sediados em São Paulo, atuamos em todo o Brasil por intermédio de acordos operacionais com parceiros credenciados.', en: 'Located in the heart of Sao Paulo, our office is ready to support you with the structure required for high-performance legal counsel. Based in Sao Paulo, we act across Brazil through operational agreements with accredited partners.' } },
        { selector: '.contato-details > div:nth-child(1) .detail-label', text: { pt: 'Endereço', en: 'Address' } },
        { selector: '.contato-map-btn', html: { pt: 'Ver no mapa <span class="arr">→</span>', en: 'View on map <span class="arr">→</span>' } },
        { selector: '.contato-details > div:nth-child(2) .detail-label', text: { pt: 'Telefone', en: 'Phone' } },
        { selector: '.contato-details > div:nth-child(3) .detail-label', text: { pt: 'WhatsApp', en: 'WhatsApp' } },
        { selector: '.contato-details > div:nth-child(4) .detail-label', text: { pt: 'E-mail', en: 'Email' } },
        { selector: '.contato-details > div:nth-child(5) .detail-label', text: { pt: 'Horário de Atendimento', en: 'Business Hours' } },
        { selector: '.contato-details > div:nth-child(5) .detail-val', text: { pt: 'Segunda a Sexta · 09h às 18h', en: 'Monday to Friday · 9am to 6pm' } },
        { selector: 'label[for="nome"]', text: { pt: 'Nome completo', en: 'Full name' } },
        { selector: 'label[for="empresa"]', text: { pt: 'Empresa', en: 'Company' } },
        { selector: 'label[for="email"]', text: { pt: 'E-mail', en: 'Email' } },
        { selector: 'label[for="telefone"]', text: { pt: 'Telefone / WhatsApp', en: 'Phone / WhatsApp' } },
        { selector: 'label[for="mensagem"]', text: { pt: 'Como podemos ajudar?', en: 'How can we help?' } },
        { selector: '.form-submit', html: { pt: 'Enviar mensagem <span class="arr">→</span>', en: 'Send message <span class="arr">→</span>' } },
        { selector: '#formSuccess p:first-child', text: { pt: 'Mensagem enviada com sucesso!', en: 'Message sent successfully!' } },
        { selector: '#formSuccess p:last-child', text: { pt: 'Entraremos em contato em breve.', en: 'We will contact you shortly.' } }
      ]
    },
    practice: {
      title: { pt: 'Areas de Atuacao — Falaw Advogados | Direito do Trabalho SP', en: 'Practice Areas — Falaw Advogados | Employment Law in Sao Paulo' },
      description: { pt: 'Falaw Advogados atua em: Startup & Tecnologia, Contencioso Massificado, Consultivo Trabalhista, Relacoes Sindicais, Consultoria Preventiva, Auditoria e Treinamentos em Sao Paulo.', en: 'Falaw Advogados acts in startups and technology, litigation, labor advisory, union relations, preventive consulting, audit and training in Sao Paulo.' },
      entries: [
        { selector: '#s-hero', data: 'label', pt: 'Atuações', en: 'Practice Areas' },
        { selector: '#s-areas', data: 'label', pt: 'Áreas', en: 'Areas' },
        { selector: '#s-diferenciais', data: 'label', pt: 'Diferenciais', en: 'Advantages' },
        { selector: '.nav-counter', text: { pt: '01 — Atuações', en: '01 — Practice Areas' } },
        { selector: '.dot-nav .dot:nth-child(2)', attr: 'aria-label', pt: 'Áreas', en: 'Areas' },
        { selector: '.dot-nav .dot:nth-child(3)', attr: 'aria-label', pt: 'Diferenciais', en: 'Advantages' },
        { selector: '.hero-caption', text: { pt: 'Falaw Advogados · São Paulo, Brasil', en: 'Falaw Advogados · Sao Paulo, Brazil' } },
        { selector: '#s-hero .label', text: { pt: 'Áreas de Expertise', en: 'Areas of Expertise' } },
        { selector: '#s-hero .hero-title', text: { pt: 'Atuações', en: 'Practice Areas' } },
        { selector: '#s-hero .hero-sub', text: { pt: 'O Falaw Advogados se destaca por oferecer uma combinação única de especialização setorial, abordagem preventiva, serviços personalizados e comprometimento com a inovação. Nossa missão é ser um parceiro estratégico para nossos clientes, contribuindo para seu sucesso e crescimento sustentável.', en: 'Falaw Advogados stands out for combining sector expertise, preventive work, tailored service and a genuine commitment to innovation. Our mission is to be a strategic partner in our clients’ sustainable growth.' } },
        { selector: '#s-hero .cta', html: { pt: 'Solicitar contato <span class="arr">→</span>', en: 'Request contact <span class="arr">→</span>' } },
        { selector: '#s-diferenciais .label', text: { pt: '03 — Nossos Diferenciais', en: '03 — Our Advantages' } },
        { selector: '#s-diferenciais h2', html: { pt: 'Nossos<br>Diferenciais!', en: 'Why<br>Falaw' } },
        { selector: '.svc-section-inner .container > div:nth-child(1) .svc-title', html: { pt: 'Consultoria Trabalhista<br/>Preventiva', en: 'Preventive Labor<br/>Consulting' } },
        { selector: '.svc-section-inner .container > div:nth-child(1) .svc-list li', items: { pt: ['Colaboramos diretamente com os departamentos de Recursos Humanos e Jurídico de nossos clientes para evitar passivos trabalhistas e promover um ambiente de trabalho saudável em todas as fases contratuais.', 'Atuamos em projetos específicos, como kits admissionais, contratos, políticas internas personalizadas, bem como suporte de compliance e sindicâncias.', '<strong>Consultoria permanente:</strong> Suporte jurídico constante nas mais diversas questões do cotidiano empresarial e adequação às constantes mudanças na legislação, garantindo conformidade e segurança jurídica.', 'Oferecemos assessoria estratégica para empresas de tecnologia, plataformas digitais e startups, promovendo o crescimento sustentável, dentro da visão de negócio.'], en: ['We work directly with the HR and Legal departments of our clients to prevent labor liabilities and promote a healthy work environment throughout all contractual phases.', 'We act on specific projects such as onboarding kits, contracts, customised internal policies, compliance support and internal investigations.', '<strong>Ongoing consulting:</strong> Continuous legal support on the most diverse day-to-day business matters, keeping you aligned with frequent legislative changes and ensuring legal certainty.', 'We provide strategic advisory for technology companies, digital platforms and startups, enabling sustainable growth within a business-first mindset.'] } },
        { selector: '.svc-section-inner .container > div:nth-child(3) .svc-title', html: { pt: 'Gestão de Contencioso<br/>Trabalhista', en: 'Labor Litigation<br/>Management' } },
        { selector: '.svc-section-inner .container > div:nth-child(3) .svc-list li', items: { pt: ['Representamos empresas em demandas judiciais trabalhistas, atuando de forma proativa na defesa dos interesses corporativos. Nossa equipe possui expertise em litígios complexos, buscando soluções eficientes que minimizem riscos e protejam a imagem de nossas clientes, nas esferas contenciosa e administrativa em qualquer instância ou tribunal do país, incluindo o Ministério Público do Trabalho (MPT) e o Ministério do Trabalho e Emprego (MTE).', 'Buscamos reduzir o passivo trabalhista por meio da celebração de acordos, contando com uma equipe especializada.'], en: ['We represent companies in labor lawsuits, acting proactively in defense of corporate interests. Our team has expertise in complex litigation, seeking efficient solutions that minimize risks and protect the reputation of our clients before any court or administrative body in the country, including the Labor Prosecutor\'s Office (MPT) and the Ministry of Labor and Employment (MTE).', 'We seek to reduce labor liabilities through the negotiation of settlements, relying on a specialized team.'] } },
        { selector: '.svc-section-inner .container > div:nth-child(5) .svc-title', html: { pt: 'Equipe de Legal Operations<br/>Dedicada', en: 'Dedicated Legal<br/>Operations Team' } },
        { selector: '.svc-section-inner .container > div:nth-child(5) .svc-list li', items: { pt: ['Para oferecer soluções jurídicas ainda mais eficientes e alinhadas às necessidades dos nossos clientes, contamos com uma equipe dedicada de Legal Operations (Legal Ops), responsável por otimizar processos internos, implementar tecnologias inovadoras e aprimorar a gestão de processos, utilizando ferramentas analíticas para monitorar métricas de desempenho, identificar tendências e fornecer insights estratégicos para diminuição de passivo e de custos da empresa.', 'Nossa equipe de Legal Ops trabalha em sintonia com os advogados e demais profissionais do escritório, focando na entrega de serviços jurídicos de alta qualidade de maneira mais ágil e eficaz. Assim, nossos clientes podem contar com um parceiro estratégico comprometido com a inovação e a excelência operacional.'], en: ['To deliver even more efficient legal solutions aligned with our clients\' needs, we have a dedicated Legal Operations (Legal Ops) team responsible for optimising internal processes, implementing innovative technologies and improving process management, using analytical tools to monitor performance metrics, identify trends and provide strategic insights for reducing liabilities and company costs.', 'Our Legal Ops team works in close coordination with the firm\'s lawyers and professionals, focusing on delivering high-quality legal services in a faster and more effective way. Our clients can count on a strategic partner committed to innovation and operational excellence.'] } },
        { selector: '.svc-section-inner .container > div:nth-child(7) .svc-title', html: { pt: 'Relações<br/>Sindicais', en: 'Union<br/>Relations' } },
        { selector: '.svc-section-inner .container > div:nth-child(7) .svc-list li', items: { pt: ['Assessoramos em negociações coletivas em todo o território nacional, defendendo os interesses de nossos clientes. Mantemos relacionamentos saudáveis e duradouros com sindicatos, atuando diretamente para a proteção dos direitos e interesses empresariais.'], en: ['We advise on collective bargaining across the country, defending our clients\' interests. We maintain healthy and lasting relationships with trade unions, acting directly to protect business rights and interests.'] } },
        { selector: '.svc-section-inner .container > div:nth-child(9) .svc-title', html: { pt: 'Palestras, Cursos<br/>e Workshops', en: 'Lectures, Courses<br/>and Workshops' } },
        { selector: '.svc-section-inner .container > div:nth-child(9) .svc-list li', items: { pt: ['Oferecemos palestras e treinamentos, apresentando soluções que agregam valor ao cliente e influenciam diretamente a cultura empresarial. Nosso foco é a diminuição de riscos de passivos trabalhistas, com mapeamento prévio realizado pela equipe por meio de contato direto e constante. Nossos profissionais estão comprometidos em fornecer conhecimento atualizado e relevante.'], en: ['We offer lectures and training sessions that add value to our clients and directly influence corporate culture. Our focus is on reducing the risk of labor liabilities, supported by prior mapping conducted through direct and ongoing contact with each client. Our professionals are committed to providing up-to-date and relevant knowledge.'] } },
        { selector: '.dif-card:nth-child(1) .dif-card-title', text: { pt: 'Especialização no Setor de Tecnologia e Startups', en: 'Specialisation in Technology and Startups' } },
        { selector: '.dif-card:nth-child(1) .dif-card-desc', text: { pt: 'Temos vasta experiência com empresas de tecnologia, plataformas digitais e startups, compreendendo profundamente as particularidades e desafios desse mercado inovador e dinâmico.', en: 'We have extensive experience with technology companies, digital platforms and startups, with a deep understanding of the particularities and challenges of this innovative and dynamic market.' } },
        { selector: '.dif-card:nth-child(2) .dif-card-title', text: { pt: 'Atuação Preventiva e Colaborativa', en: 'Preventive and Collaborative Approach' } },
        { selector: '.dif-card:nth-child(2) .dif-card-desc', text: { pt: 'Trabalhamos diretamente com os departamentos de Recursos Humanos e Jurídico dos clientes para desenvolver políticas e práticas que promovem um ambiente de trabalho saudável e evitam passivos trabalhistas futuros.', en: 'We work directly with clients\' HR and Legal departments to develop policies and practices that promote a healthy work environment and prevent future labor liabilities.' } },
        { selector: '.dif-card:nth-child(3) .dif-card-title', text: { pt: 'Equipe Dedicada de Legal Operations', en: 'Dedicated Legal Operations Team' } },
        { selector: '.dif-card:nth-child(3) .dif-card-desc', text: { pt: 'Contamos com uma equipe especializada em Legal Ops, responsável por otimizar processos internos, implementar tecnologias inovadoras e aprimorar a gestão de projetos jurídicos, garantindo agilidade e eficiência nos serviços prestados.', en: 'We have a specialized Legal Ops team responsible for optimising internal processes, implementing innovative technologies and improving the management of legal projects, ensuring agility and efficiency in services delivered.' } },
        { selector: '.dif-card:nth-child(4) .dif-card-title', text: { pt: 'Não somos apenas um escritório de advocacia, somos parceiros de negócios', en: 'We are not just a law firm — we are business partners' } },
        { selector: '.dif-card:nth-child(4) .dif-card-desc', text: { pt: 'Sabemos que a área trabalhista é um enorme desafio para o crescimento das empresas no Brasil e, por isso, somos um escritório que agrega ao cliente, trazendo ideias inovadoras e opções para a tomada de decisões, dentro da visão de negócios e reduzindo custos e riscos de passivo.', en: 'We know that employment law is a major challenge for business growth in Brazil. That is why we add real value to our clients by bringing innovative ideas and decision-making options within a business vision, while reducing costs and liability risks.' } },
        { selector: '.dif-card:nth-child(5) .dif-card-title', text: { pt: 'Suporte Jurídico Constante e Multidisciplinar', en: 'Ongoing and Multidisciplinary Legal Support' } },
        { selector: '.dif-card:nth-child(5) .dif-card-desc', text: { pt: 'Disponibilizamos assistência jurídica contínua nas mais variadas matérias do Direito Trabalhista que envolvem o cotidiano das empresas, garantindo respostas ágeis e assertivas.', en: 'We provide continuous legal assistance across the full range of employment law matters that affect businesses on a daily basis, ensuring fast and accurate responses.' } }
      ]
    },
    blog: {
      title: { pt: 'Blog Juridico — Falaw Advogados | Direito do Trabalho e Inovacao', en: 'Legal Blog — Falaw Advogados | Employment Law and Innovation' },
      description: { pt: 'Blog juridico da Falaw Advogados: artigos sobre Direito do Trabalho, inovacao juridica, compliance trabalhista, startups e tecnologia. Conteudo especializado para empresas em Sao Paulo.', en: 'Falaw Advogados legal blog: articles on employment law, legal innovation, labor compliance, startups and technology. Specialized content for companies in Sao Paulo.' },
      entries: [
        { selector: '.nav-counter', text: { pt: '— Blog', en: '— Blog' } },
        { selector: '.hero-caption', text: { pt: 'Falaw Advogados · São Paulo, Brasil', en: 'Falaw Advogados · Sao Paulo, Brazil' } },
        { selector: '.blog-page .label', text: { pt: 'Blog · Falaw Advogados', en: 'Blog · Falaw Advogados' } },
        { selector: '.blog-page .hero-title', html: { pt: 'Artigos &<br>Reflexões', en: 'Articles &<br>Insights' } },
        { selector: '.blog-page .hero-sub', text: { pt: 'Reflexões sobre Direito do Trabalho, inovação jurídica e estratégia empresarial. Conteúdo produzido pelo time do Falaw Advogados para manter clientes e parceiros sempre informados.', en: 'Insights on employment law, legal innovation and business strategy. Content produced by the Falaw team to keep clients and partners informed.' } },
        { selector: '#blogSearch', attr: 'placeholder', pt: 'Buscar artigos…', en: 'Search articles…' },
        { selector: '#blogSearch', attr: 'aria-label', pt: 'Buscar artigos', en: 'Search articles' },
        { selector: '#searchClear', attr: 'aria-label', pt: 'Limpar busca', en: 'Clear search' }
      ]
    },
    careers: {
      title: { pt: 'Trabalhe Conosco — Falaw Advogados', en: 'Careers — Falaw Advogados' },
      description: { pt: 'Trabalhe Conosco — Falaw Advogados', en: 'Careers at Falaw Advogados' },
      entries: [
        { selector: '.nav-counter', text: { pt: '— Vagas', en: '— Careers' } },
        { selector: '.careers-kicker', text: { pt: 'Falaw Advogados · Carreiras', en: 'Falaw Advogados · Careers' } },
        { selector: '.careers-title', html: { pt: 'Trabalhe<br><em>Conosco</em>', en: 'Join<br><em>Us</em>' } },
        { selector: '.careers-lead', text: { pt: 'Somos um escritório de advocacia comprometido com excelência, ética e resultados. Se você compartilha desses valores, queremos conhecer você.', en: 'We are a law firm committed to excellence, ethics and results. If you share these values, we want to meet you.' } },
        { selector: '.value-item:nth-child(1) .value-num', text: { pt: 'EXCELÊNCIA', en: 'EXCELLENCE' } },
        { selector: '.value-item:nth-child(1) .value-label', text: { pt: 'Comprometimento com a qualidade em cada caso', en: 'Commitment to quality in every matter' } },
        { selector: '.value-item:nth-child(2) .value-num', text: { pt: 'ÉTICA', en: 'ETHICS' } },
        { selector: '.value-item:nth-child(2) .value-label', text: { pt: 'Integridade como fundamento de todas as relações', en: 'Integrity as the foundation of every relationship' } },
        { selector: '.value-item:nth-child(3) .value-num', text: { pt: 'INOVAÇÃO', en: 'INNOVATION' } },
        { selector: '.value-item:nth-child(3) .value-label', text: { pt: 'Soluções jurídicas modernas e estratégicas', en: 'Modern and strategic legal solutions' } },
        { selector: '.form-section-title', text: { pt: 'Envie seu Currículo', en: 'Send Your Resume' } },
        { selector: '.form-section-sub', text: { pt: 'Preencha o formulário abaixo e anexe seu currículo em PDF ou Word. Nossa equipe entrará em contato caso haja uma oportunidade alinhada ao seu perfil.', en: 'Fill out the form below and attach your resume in PDF or Word format. Our team will contact you if an opportunity matches your profile.' } },
        { selector: 'label[for="name"]', text: { pt: 'Nome completo *', en: 'Full name *' } },
        { selector: 'label[for="email"]', text: { pt: 'E-mail *', en: 'Email *' } },
        { selector: 'label[for="phone"]', text: { pt: 'Telefone / WhatsApp', en: 'Phone / WhatsApp' } },
        { selector: 'label[for="linkedin"]', text: { pt: 'LinkedIn (opcional)', en: 'LinkedIn (optional)' } },
        { selector: 'label[for="message"]', text: { pt: 'Apresentação (opcional)', en: 'Intro (optional)' } },
        { selector: '.form-group > label:not([for])', text: { pt: 'Currículo *', en: 'Resume *' } },
        { selector: '.upload-label', text: { pt: 'Clique ou arraste o arquivo aqui', en: 'Click or drag your file here' } },
        { selector: '.upload-hint', text: { pt: 'PDF · DOC · DOCX · máx. 10 MB', en: 'PDF · DOC · DOCX · max. 10 MB' } },
        { selector: '.btn-submit-careers', text: { pt: 'Enviar candidatura', en: 'Send application' } },
        { selector: '.form-success-title', text: { pt: 'Candidatura enviada!', en: 'Application sent!' } },
        { selector: '.form-success-text', html: { pt: 'Recebemos seu currículo e agradecemos o interesse em fazer parte da equipe Falaw.<br>Entraremos em contato caso haja uma oportunidade alinhada ao seu perfil.', en: 'We received your resume and appreciate your interest in joining the Falaw team.<br>We will contact you if an opportunity matches your profile.' } }
      ]
    },
    privacy: {
      title: { pt: 'Política de Privacidade — Falaw Advogados', en: 'Privacy Policy — Falaw Advogados' },
      description: { pt: 'Política de Privacidade da Falaw Advogados. Saiba como coletamos, usamos, armazenamos e protegemos seus dados pessoais em conformidade com a LGPD.', en: 'Privacy Policy of Falaw Advogados. Learn how we collect, use, store and protect your personal data in compliance with the Brazilian Data Protection Act (LGPD).' },
      entries: [
        { selector: '.nav-counter', text: { pt: '— Privacidade', en: '— Privacy' } },
        { selector: '.article-kicker', text: { pt: 'Legal · LGPD', en: 'Legal · LGPD' } },
        { selector: '.article-header h1', html: { pt: 'Política de<br><em>Privacidade</em>', en: 'Privacy<br><em>Policy</em>' } },
        { selector: '.article-meta span:last-child', text: { pt: 'Lei nº 13.709/2018 — LGPD', en: 'Brazilian Data Protection Act (LGPD)' } },
        { selector: '.article-back a', text: { pt: '← Voltar ao site', en: '← Back to site' } },
        { selector: '.article-body > div:nth-child(1) p:nth-child(1)', text: { pt: 'A Falaw Advogados respeita a sua privacidade e está comprometida com a proteção dos seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados – LGPD (Lei nº 13.709/2018).', en: 'Falaw Advogados respects your privacy and is committed to protecting your personal data in accordance with the Brazilian General Data Protection Law – LGPD (Law No. 13,709/2018).' } },
        { selector: '.article-body > div:nth-child(1) p:nth-child(2)', text: { pt: 'Esta Política de Privacidade descreve como coletamos, utilizamos, armazenamos e protegemos os dados pessoais dos usuários que acessam nosso site, preenchem formulários ou se inscrevem em nossa newsletter.', en: 'This Privacy Policy describes how we collect, use, store and protect the personal data of users who access our website, fill out forms or subscribe to our newsletter.' } },
        { selector: '.article-body > div:nth-child(3) .article-section-label', text: { pt: '01 · Dados que coletamos', en: '01 · Data we collect' } },
        { selector: '.article-body > div:nth-child(3) h2', text: { pt: 'Dados pessoais que coletamos', en: 'Personal data we collect' } },
        { selector: '.article-body > div:nth-child(3) p:first-of-type', html: { pt: '<strong>a) Dados fornecidos diretamente por você</strong>', en: '<strong>a) Data you provide directly</strong>' } },
        { selector: '.article-body > div:nth-child(3) .article-feature-box:nth-child(3) h3', text: { pt: 'Podemos coletar, conforme o caso', en: 'We may collect, as applicable' } },
        { selector: '.article-body > div:nth-child(3) .article-feature-box:nth-child(3) li', items: { pt: ['Nome completo', 'E-mail', 'Telefone/WhatsApp', 'Empresa e cargo', 'Mensagem enviada via formulário de contato', 'Dados fornecidos voluntariamente em inscrições para eventos, cursos, mentorias ou materiais gratuitos'], en: ['Full name', 'Email', 'Phone / WhatsApp', 'Company and job title', 'Message submitted via contact form', 'Data voluntarily provided when registering for events, courses, mentoring or free materials'] } },
        { selector: '.article-body > div:nth-child(3) p:last-of-type', html: { pt: '<strong>b) Dados coletados automaticamente</strong>', en: '<strong>b) Automatically collected data</strong>' } },
        { selector: '.article-body > div:nth-child(3) .article-feature-box:nth-child(5) h3', text: { pt: 'Quando você navega em nosso site, podemos coletar', en: 'When you browse our website, we may collect' } },
        { selector: '.article-body > div:nth-child(3) .article-feature-box:nth-child(5) li', items: { pt: ['Endereço IP', 'Tipo de navegador e dispositivo', 'Páginas acessadas', 'Data e horário de acesso', 'Tempo de permanência no site', 'Dados coletados por cookies (ver Política de Cookies)'], en: ['IP address', 'Browser type and device', 'Pages visited', 'Date and time of access', 'Time spent on the site', 'Data collected via cookies (see Cookie Policy)'] } },
        { selector: '.article-body > div:nth-child(5) .article-section-label', text: { pt: '02 · Finalidades', en: '02 · Purposes' } },
        { selector: '.article-body > div:nth-child(5) h2', text: { pt: 'Finalidades do tratamento dos dados', en: 'Purposes of data processing' } },
        { selector: '.article-body > div:nth-child(5) .article-feature-box h3', text: { pt: 'Utilizamos seus dados pessoais para', en: 'We use your personal data to' } },
        { selector: '.article-body > div:nth-child(5) .article-feature-box li', items: { pt: ['Responder a solicitações enviadas via formulário de contato', 'Enviar newsletters, conteúdos educativos e comunicações institucionais (quando autorizado)', 'Enviar propostas comerciais e materiais informativos', 'Executar contratos de advocacia, consultoria e assessoria jurídica', 'Melhorar a experiência de navegação no site', 'Realizar análises estatísticas e de desempenho do site', 'Cumprir obrigações legais e regulatórias'], en: ['Respond to requests submitted via the contact form', 'Send newsletters, educational content and institutional communications (when authorised)', 'Send commercial proposals and informational materials', 'Perform contracts for legal representation, consulting and advisory services', 'Improve the browsing experience on the website', 'Conduct statistical and performance analytics', 'Comply with legal and regulatory obligations'] } },
        { selector: '.article-body > div:nth-child(5) p:last-of-type', text: { pt: 'Você pode cancelar sua inscrição na newsletter a qualquer momento, por meio do link de descadastro presente em todos os e-mails.', en: 'You may unsubscribe from the newsletter at any time via the unsubscribe link included in all emails.' } },
        { selector: '.article-body > div:nth-child(7) .article-section-label', text: { pt: '03 · Bases legais', en: '03 · Legal bases' } },
        { selector: '.article-body > div:nth-child(7) h2', text: { pt: 'Bases legais para o tratamento', en: 'Legal bases for processing' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box h3', text: { pt: 'Tratamos seus dados com base em', en: 'We process your data based on' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box li', items: { pt: ['<strong>Consentimento:</strong> quando você se inscreve na newsletter ou preenche formulários', '<strong>Execução de contrato:</strong> quando os dados são necessários para prestação de serviços', '<strong>Cumprimento de obrigação legal</strong>', '<strong>Legítimo interesse,</strong> respeitando sempre seus direitos e liberdades fundamentais'], en: ['<strong>Consent:</strong> when you subscribe to the newsletter or fill out forms', '<strong>Contract performance:</strong> when data is required to deliver services', '<strong>Compliance with a legal obligation</strong>', '<strong>Legitimate interest,</strong> always respecting your fundamental rights and freedoms'] } },
        { selector: '.article-body > div:nth-child(9) .article-section-label', text: { pt: '04 · Compartilhamento', en: '04 · Sharing' } },
        { selector: '.article-body > div:nth-child(9) h2', text: { pt: 'Compartilhamento de dados', en: 'Data sharing' } },
        { selector: '.article-body > div:nth-child(9) .article-highlight p', html: { pt: '<strong>A Falaw Advogados não vende ou comercializa dados pessoais.</strong>', en: '<strong>Falaw Advogados does not sell or trade personal data.</strong>' } },
        { selector: '.article-body > div:nth-child(9) .article-feature-box h3', text: { pt: 'Seus dados poderão ser compartilhados apenas com', en: 'Your data may be shared only with' } },
        { selector: '.article-body > div:nth-child(9) .article-feature-box li', items: { pt: ['Plataformas de envio de e-mails (newsletter)', 'Ferramentas de formulários e CRM', 'Serviços de hospedagem e tecnologia do site', 'Prestadores de serviços envolvidos na execução dos serviços contratados', 'Autoridades públicas, quando exigido por lei'], en: ['Email sending platforms (newsletter)', 'Form and CRM tools', 'Hosting and website technology services', 'Service providers involved in the delivery of contracted services', 'Public authorities, when required by law'] } },
        { selector: '.article-body > div:nth-child(9) p:last-of-type', text: { pt: 'Todos os terceiros com quem compartilhamos dados são obrigados a adotar medidas de segurança compatíveis com a LGPD.', en: 'All third parties with whom we share data are required to adopt security measures compatible with the LGPD.' } },
        { selector: '.article-body > div:nth-child(11) .article-section-label', text: { pt: '05 · Segurança', en: '05 · Security' } },
        { selector: '.article-body > div:nth-child(11) h2', text: { pt: 'Armazenamento e segurança dos dados', en: 'Data storage and security' } },
        { selector: '.article-body > div:nth-child(11) p:nth-child(2)', text: { pt: 'Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados contra acessos não autorizados, perda, alteração ou divulgação indevida.', en: 'We adopt appropriate technical and organisational measures to protect your data against unauthorised access, loss, alteration or improper disclosure.' } },
        { selector: '.article-body > div:nth-child(11) p:nth-child(3)', text: { pt: 'Os dados serão mantidos pelo tempo necessário para cumprir as finalidades para as quais foram coletados, respeitando prazos legais e regulatórios.', en: 'Data will be retained for as long as necessary to fulfil the purposes for which it was collected, in accordance with applicable legal and regulatory timeframes.' } },
        { selector: '.article-body > div:nth-child(13) .article-section-label', text: { pt: '06 · Seus direitos', en: '06 · Your rights' } },
        { selector: '.article-body > div:nth-child(13) h2', text: { pt: 'Seus direitos como titular dos dados', en: 'Your rights as a data subject' } },
        { selector: '.article-body > div:nth-child(13) .article-feature-box h3', text: { pt: 'Você pode, a qualquer momento, solicitar', en: 'You may, at any time, request' } },
        { selector: '.article-body > div:nth-child(13) .article-feature-box li', items: { pt: ['Confirmação da existência de tratamento', 'Acesso aos seus dados', 'Correção de dados incompletos ou desatualizados', 'Anonimização, bloqueio ou exclusão de dados desnecessários', 'Portabilidade dos dados', 'Revogação do consentimento'], en: ['Confirmation that processing is taking place', 'Access to your data', 'Correction of incomplete or outdated data', 'Anonymisation, blocking or deletion of unnecessary data', 'Data portability', 'Withdrawal of consent'] } },
        { selector: '.article-body > div:nth-child(15) .article-section-label', text: { pt: '07 · Atualizações', en: '07 · Updates' } },
        { selector: '.article-body > div:nth-child(15) h2', text: { pt: 'Alterações nesta Política', en: 'Changes to this Policy' } },
        { selector: '.article-body > div:nth-child(15) p', text: { pt: 'Esta Política de Privacidade poderá ser atualizada periodicamente. Recomendamos a consulta regular desta página.', en: 'This Privacy Policy may be updated periodically. We recommend checking this page regularly.' } },
        { selector: '.article-end-meta', text: { pt: 'Falaw Advogados · Política de Privacidade · 2026', en: 'Falaw Advogados · Privacy Policy · 2026' } },
        { selector: '.article-tag:nth-child(2)', text: { pt: 'Privacidade', en: 'Privacy' } },
        { selector: '.article-tag:nth-child(3)', text: { pt: 'Dados Pessoais', en: 'Personal Data' } }
      ]
    },
    cookies: {
      title: { pt: 'Política de Cookies — Falaw Advogados', en: 'Cookie Policy — Falaw Advogados' },
      description: { pt: 'Política de Cookies da Falaw Advogados. Entenda o que são cookies, como os utilizamos e como você pode gerenciá-los.', en: 'Cookie Policy of Falaw Advogados. Learn what cookies are, how we use them and how you can manage your preferences.' },
      entries: [
        { selector: '.nav-counter', text: { pt: '— Cookies', en: '— Cookies' } },
        { selector: '.article-kicker', text: { pt: 'Legal · Navegação', en: 'Legal · Browsing' } },
        { selector: '.article-header h1', html: { pt: 'Política de<br><em>Cookies</em>', en: 'Cookie<br><em>Policy</em>' } },
        { selector: '.article-meta span:last-child', text: { pt: 'Gestão de Cookies e Preferências', en: 'Cookie Management and Preferences' } },
        { selector: '.article-back a', text: { pt: '← Voltar ao site', en: '← Back to site' } },
        { selector: '.article-body > div:nth-child(1) p', text: { pt: 'Esta Política de Cookies explica o que são cookies, como os utilizamos e como você pode gerenciá-los em nosso site.', en: 'This Cookie Policy explains what cookies are, how we use them and how you can manage them on our website.' } },
        { selector: '.article-body > div:nth-child(3) .article-section-label', text: { pt: '01 · O que são', en: '01 · What they are' } },
        { selector: '.article-body > div:nth-child(3) h2', text: { pt: 'O que são cookies?', en: 'What are cookies?' } },
        { selector: '.article-body > div:nth-child(3) p', text: { pt: 'Cookies são pequenos arquivos de texto armazenados no seu dispositivo (computador, celular ou tablet) quando você acessa um site. Eles ajudam a garantir o funcionamento adequado da página, melhorar sua experiência e coletar informações sobre navegação.', en: 'Cookies are small text files stored on your device (computer, phone or tablet) when you visit a website. They help ensure the page works correctly, improve your experience and collect browsing information.' } },
        { selector: '.article-body > div:nth-child(5) .article-section-label', text: { pt: '02 · Como utilizamos', en: '02 · How we use them' } },
        { selector: '.article-body > div:nth-child(5) h2', text: { pt: 'Como utilizamos cookies', en: 'How we use cookies' } },
        { selector: '.article-body > div:nth-child(5) .article-feature-box h3', text: { pt: 'Utilizamos cookies para', en: 'We use cookies to' } },
        { selector: '.article-body > div:nth-child(5) .article-feature-box li', items: { pt: ['Garantir o funcionamento técnico do site', 'Melhorar a experiência do usuário', 'Analisar o desempenho e a navegação no site', 'Lembrar preferências de navegação', 'Apoiar ações de marketing e comunicação (quando aplicável)'], en: ['Ensure the technical functioning of the website', 'Improve the user experience', 'Analyse site performance and navigation', 'Remember browsing preferences', 'Support marketing and communication actions (when applicable)'] } },
        { selector: '.article-body > div:nth-child(7) .article-section-label', text: { pt: '03 · Tipos', en: '03 · Types' } },
        { selector: '.article-body > div:nth-child(7) h2', text: { pt: 'Tipos de cookies que utilizamos', en: 'Types of cookies we use' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box:nth-child(2) h3', text: { pt: 'a) Cookies necessários', en: 'a) Necessary cookies' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box:nth-child(2) li', items: { pt: ['Essenciais para o funcionamento do site. Sem eles, algumas funcionalidades podem não funcionar corretamente.'], en: ['Essential for the website to function. Without them, some features may not work correctly.'] } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box:nth-child(3) h3', text: { pt: 'b) Cookies de desempenho e análise', en: 'b) Performance and analytics cookies' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box:nth-child(3) li', items: { pt: ['Permitem entender como os usuários interagem com o site (páginas visitadas, tempo de permanência, etc.), auxiliando na melhoria contínua.'], en: ['Help understand how users interact with the site (pages visited, time spent, etc.), supporting continuous improvement.'] } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box:nth-child(4) h3', text: { pt: 'c) Cookies de funcionalidade', en: 'c) Functionality cookies' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box:nth-child(4) li', items: { pt: ['Armazenam preferências do usuário para proporcionar uma experiência mais personalizada.'], en: ['Store user preferences to provide a more personalised experience.'] } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box:nth-child(5) h3', text: { pt: 'd) Cookies de marketing (quando aplicável)', en: 'd) Marketing cookies (when applicable)' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box:nth-child(5) li', items: { pt: ['Podem ser utilizados para campanhas publicitárias e comunicação direcionada, sempre mediante seu consentimento prévio.'], en: ['May be used for advertising campaigns and targeted communication, always subject to your prior consent.'] } },
        { selector: '.article-body > div:nth-child(9) .article-section-label', text: { pt: '04 · Controle', en: '04 · Control' } },
        { selector: '.article-body > div:nth-child(9) h2', text: { pt: 'Gerenciamento e controle de cookies', en: 'Cookie management and control' } },
        { selector: '.article-body > div:nth-child(9) .article-feature-box h3', text: { pt: 'Você pode, a qualquer momento', en: 'You may, at any time' } },
        { selector: '.article-body > div:nth-child(9) .article-feature-box li', items: { pt: ['Aceitar, recusar ou personalizar cookies por meio do banner exibido no site', 'Configurar seu navegador para bloquear ou excluir cookies'], en: ['Accept, refuse or customise cookies via the banner displayed on the website', 'Configure your browser to block or delete cookies'] } },
        { selector: '.article-body > div:nth-child(9) .article-highlight p', text: { pt: 'A desativação de cookies pode afetar algumas funcionalidades do site.', en: 'Disabling cookies may affect some features of the website.' } },
        { selector: '.article-body > div:nth-child(11) .article-section-label', text: { pt: '05 · Atualizações', en: '05 · Updates' } },
        { selector: '.article-body > div:nth-child(11) h2', text: { pt: 'Alterações nesta Política', en: 'Changes to this Policy' } },
        { selector: '.article-body > div:nth-child(11) p', text: { pt: 'Esta Política de Cookies poderá ser atualizada sempre que houver mudanças técnicas ou legais. Recomendamos a consulta periódica.', en: 'This Cookie Policy may be updated whenever there are technical or legal changes. We recommend checking it periodically.' } },
        { selector: '.article-end-meta', text: { pt: 'Falaw Advogados · Política de Cookies · 2026', en: 'Falaw Advogados · Cookie Policy · 2026' } },
        { selector: '.article-tag:nth-child(2)', text: { pt: 'Privacidade', en: 'Privacy' } }
      ]
    },
    terms: {
      title: { pt: 'Termos de Uso — Falaw Advogados', en: 'Terms of Use — Falaw Advogados' },
      description: { pt: 'Termos de Uso do site da Falaw Advogados. Conheça as condições de uso, propriedade intelectual, responsabilidade e foro aplicável.', en: 'Terms of Use of the Falaw Advogados website. Read the conditions of use, intellectual property, liability and applicable jurisdiction.' },
      entries: [
        { selector: '.nav-counter', text: { pt: '— Termos', en: '— Terms' } },
        { selector: '.article-kicker', text: { pt: 'Legal · Institucional', en: 'Legal · Institutional' } },
        { selector: '.article-header h1', html: { pt: 'Termos<br><em>de Uso</em>', en: 'Terms<br><em>of Use</em>' } },
        { selector: '.article-meta span:last-child', text: { pt: 'Condições de uso deste site', en: 'Conditions of use of this website' } },
        { selector: '.article-back a', text: { pt: '← Voltar ao site', en: '← Back to site' } },
        { selector: '.article-body > div:nth-child(1) p', text: { pt: 'Ao acessar e utilizar este site, você concorda com os presentes Termos de Uso.', en: 'By accessing and using this website, you agree to these Terms of Use.' } },
        { selector: '.article-body > div:nth-child(3) .article-section-label', text: { pt: '01 · Uso do site', en: '01 · Use of the website' } },
        { selector: '.article-body > div:nth-child(3) h2', text: { pt: 'Uso do site', en: 'Use of the website' } },
        { selector: '.article-body > div:nth-child(3) p:nth-child(2)', text: { pt: 'Este site tem caráter informativo e institucional, com o objetivo de apresentar os serviços, conteúdos e iniciativas da Falaw Advogados.', en: 'This website is informational and institutional in nature, with the purpose of presenting the services, content and initiatives of Falaw Advogados.' } },
        { selector: '.article-body > div:nth-child(3) p:nth-child(3)', text: { pt: 'O usuário compromete-se a utilizar o site de forma ética, responsável e em conformidade com a legislação vigente.', en: 'Users undertake to use the website ethically, responsibly and in compliance with applicable law.' } },
        { selector: '.article-body > div:nth-child(5) .article-section-label', text: { pt: '02 · Propriedade intelectual', en: '02 · Intellectual property' } },
        { selector: '.article-body > div:nth-child(5) h2', text: { pt: 'Propriedade intelectual', en: 'Intellectual property' } },
        { selector: '.article-body > div:nth-child(5) p:nth-child(2)', text: { pt: 'Todo o conteúdo deste site, incluindo textos, materiais, artigos, vídeos, logotipos, marcas e imagens, é de propriedade exclusiva da Falaw Advogados ou de seus respectivos titulares.', en: 'All content on this website, including texts, materials, articles, videos, logos, trademarks and images, is the exclusive property of Falaw Advogados or its respective rights holders.' } },
        { selector: '.article-body > div:nth-child(5) .article-highlight p', html: { pt: 'É proibida a reprodução, distribuição ou utilização sem autorização prévia e expressa.', en: 'Reproduction, distribution or use without prior and express authorisation is prohibited.' } },
        { selector: '.article-body > div:nth-child(7) .article-section-label', text: { pt: '03 · Formulários e newsletter', en: '03 · Forms and newsletter' } },
        { selector: '.article-body > div:nth-child(7) h2', text: { pt: 'Formulários e newsletter', en: 'Forms and newsletter' } },
        { selector: '.article-body > div:nth-child(7) p:nth-child(2)', text: { pt: 'Ao preencher formulários ou se inscrever na newsletter, você declara que:', en: 'By filling out forms or subscribing to the newsletter, you declare that:' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box h3', text: { pt: 'Declarações do usuário', en: 'User declarations' } },
        { selector: '.article-body > div:nth-child(7) .article-feature-box li', items: { pt: ['As informações fornecidas são verdadeiras e completas', 'Está ciente de que seus dados serão tratados conforme nossa <a href="privacidade.html" style="color:var(--c-accent)">Política de Privacidade</a>', 'Pode cancelar sua inscrição na newsletter a qualquer momento'], en: ['The information provided is true and complete', 'You are aware that your data will be processed in accordance with our <a href="privacidade.html" style="color:var(--c-accent)">Privacy Policy</a>', 'You may unsubscribe from the newsletter at any time'] } },
        { selector: '.article-body > div:nth-child(9) .article-section-label', text: { pt: '04 · Responsabilidade', en: '04 · Liability' } },
        { selector: '.article-body > div:nth-child(9) h2', text: { pt: 'Limitação de responsabilidade', en: 'Limitation of liability' } },
        { selector: '.article-body > div:nth-child(9) .article-feature-box h3', text: { pt: 'A Falaw Advogados não se responsabiliza por', en: 'Falaw Advogados is not liable for' } },
        { selector: '.article-body > div:nth-child(9) .article-feature-box li', items: { pt: ['Interrupções temporárias no funcionamento do site', 'Erros técnicos ou indisponibilidade momentânea', 'Conteúdo de sites de terceiros acessados por links externos', 'Decisões tomadas com base em conteúdos informativos do site, que não substituem consultoria jurídica personalizada'], en: ['Temporary interruptions in the operation of the website', 'Technical errors or momentary unavailability', 'Content on third-party websites accessed via external links', 'Decisions made based on informational content on the website, which does not substitute personalised legal advice'] } },
        { selector: '.article-body > div:nth-child(11) .article-section-label', text: { pt: '05 · Links externos', en: '05 · External links' } },
        { selector: '.article-body > div:nth-child(11) h2', text: { pt: 'Links para sites de terceiros', en: 'Links to third-party websites' } },
        { selector: '.article-body > div:nth-child(11) p', text: { pt: 'Nosso site pode conter links para páginas externas. A Falaw Advogados não se responsabiliza pelas políticas de privacidade ou pelo conteúdo desses sites.', en: 'Our website may contain links to external pages. Falaw Advogados is not responsible for the privacy policies or content of those websites.' } },
        { selector: '.article-body > div:nth-child(13) .article-section-label', text: { pt: '06 · Alterações', en: '06 · Changes' } },
        { selector: '.article-body > div:nth-child(13) h2', text: { pt: 'Alterações nos Termos', en: 'Changes to the Terms' } },
        { selector: '.article-body > div:nth-child(13) p', text: { pt: 'Estes Termos de Uso poderão ser alterados a qualquer momento, sendo recomendada a revisão periódica desta página.', en: 'These Terms of Use may be amended at any time. We recommend reviewing this page periodically.' } },
        { selector: '.article-body > div:nth-child(15) .article-section-label', text: { pt: '07 · Foro', en: '07 · Jurisdiction' } },
        { selector: '.article-body > div:nth-child(15) h2', text: { pt: 'Foro', en: 'Jurisdiction' } },
        { selector: '.article-body > div:nth-child(15) p:nth-child(2)', text: { pt: 'Fica eleito o foro da comarca de São Paulo/SP, para dirimir quaisquer controvérsias relacionadas a estes Termos de Uso, com renúncia de qualquer outro.', en: 'The courts of the district of São Paulo/SP are elected to resolve any disputes relating to these Terms of Use, to the exclusion of any other jurisdiction.' } },
        { selector: '.article-end-meta', text: { pt: 'Falaw Advogados · Termos de Uso · 2026', en: 'Falaw Advogados · Terms of Use · 2026' } },
        { selector: '.article-tag:nth-child(2)', text: { pt: 'Uso', en: 'Use' } },
        { selector: '.article-tag:nth-child(3)', text: { pt: 'Legal', en: 'Legal' } }
      ]
    },
    'blog-article': {
      title: { pt: '', en: '' },
      description: { pt: '', en: '' },
      entries: [
        { selector: '.nav-counter', text: { pt: '— Blog', en: '— Blog' } },
        { selector: '.article-back a', text: { pt: '← Voltar ao Blog', en: '← Back to Blog' } },
        { selector: '#article-not-found .article-kicker', text: { pt: 'Erro', en: 'Error' } },
        { selector: '#article-not-found h1', text: { pt: 'Artigo não encontrado', en: 'Article not found' } },
        { selector: '#article-not-found .article-lede', text: { pt: 'Este artigo não está disponível.', en: 'This article is not available.' } }
      ]
    }
  };

  function normalizeHref(href) {
    return String(href || '')
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/^\.?\//, '')
      .replace(/^(\.\.\/)+/, '')
      .replace(/^\//, '');
  }

  function detectPage() {
    const path = String(window.location.pathname || '').replace(/\\/g, '/').toLowerCase();
    if (path.endsWith('/founder.html')) return 'founder';
    if (path.endsWith('/equipe.html')) return 'team';
    if (path.endsWith('/contato/index.html')) return 'contact';
    if (path.endsWith('/atuacoes/index.html')) return 'practice';
    if (path.endsWith('/blog.html')) return 'blog';
    if (path.endsWith('/trabalhe-conosco.html')) return 'careers';
    if (path.endsWith('/privacidade.html')) return 'privacy';
    if (path.endsWith('/cookies.html')) return 'cookies';
    if (path.endsWith('/termos.html')) return 'terms';
    if (path.includes('/blog/')) return 'blog-article';
    return 'home';
  }

  function getStoredLang() {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    return stored === 'en' ? 'en' : DEFAULT_LANG;
  }

  function applyEntry(entry, lang) {
    if (entry.items) {
      const arr = entry.items[lang];
      if (!arr) return;
      qsa(entry.selector).forEach((el, i) => {
        if (arr[i] !== undefined) el.innerHTML = arr[i];
      });
      return;
    }
    qsa(entry.selector).forEach(el => {
      const value = entry.text ? entry.text[lang] : entry.html ? entry.html[lang] : entry[lang];
      if (typeof value === 'undefined') return;
      if (entry.data) el.dataset[entry.data] = value;
      else if (entry.attr) el.setAttribute(entry.attr, value);
      else if (entry.html) el.innerHTML = value;
      else el.textContent = value;
    });
  }

  function setMeta(selector, value) {
    const el = qs(selector);
    if (el && typeof value === 'string') el.setAttribute('content', value);
  }

  function applySharedNavigation(lang) {
    const nav = qs('.nav');
    if (nav) nav.setAttribute('aria-label', uiText.nav.aria[lang]);

    const logo = qs('.nav-logo');
    if (logo) logo.setAttribute('aria-label', uiText.nav.logo[lang]);

    const burger = qs('.nav-burger');
    if (burger) burger.setAttribute('aria-label', uiText.nav.burger[lang]);

    qsa('.nav-links a, .footer-links a, .footer-legal-links a').forEach(link => {
      const key = normalizeHref(link.getAttribute('href'));
      if (uiText.nav.links[key]) link.textContent = uiText.nav.links[key][lang];
    });

    qsa('.team-email-icon').forEach(link => {
      link.setAttribute('aria-label', lang === 'en' ? 'Send email' : 'Enviar e-mail');
    });

    const footerCopy = qs('.footer-copy');
    if (footerCopy) footerCopy.textContent = uiText.footerCopy[lang];

    qsa('.back-btn-fixed').forEach(link => {
      link.textContent = uiText.backToSite[lang];
      link.setAttribute('aria-label', uiText.backToSite[lang]);
    });
  }

  function applyPageLanguage(lang) {
    const page = detectPage();
    const config = pageText[page];
    if (!config) return;

    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    if (config.title[lang]) document.title = config.title[lang];
    if (config.description[lang]) setMeta('meta[name="description"]', config.description[lang]);
    if (config.title[lang]) setMeta('meta[property="og:title"]', config.title[lang]);
    if (config.description[lang]) setMeta('meta[property="og:description"]', config.description[lang]);
    setMeta('meta[property="og:locale"]', lang === 'en' ? 'en_US' : 'pt_BR');
    if (config.title[lang]) setMeta('meta[name="twitter:title"]', config.title[lang]);
    if (config.description[lang]) setMeta('meta[name="twitter:description"]', config.description[lang]);

    config.entries.forEach(entry => applyEntry(entry, lang));

    qsa('.team-role-tag').forEach(tag => {
      const role = tag.textContent.trim();
      if (lang === 'en') {
        if (role === 'Advogada') tag.textContent = 'Lawyer';
        if (role === 'Advogado') tag.textContent = 'Lawyer';
        if (role === 'Advogada Controller') tag.textContent = 'Legal Controller';
        if (role === 'Assistente Administrativa') tag.textContent = 'Administrative Assistant';
        if (role === 'In Memoriam') tag.textContent = 'In Memoriam';
      }
    });
  }

  function renderLangSwitcher() {
    const nav = qs('.nav');
    const burger = qs('.nav-burger', nav);
    if (!nav || qs('.lang-switcher', nav)) return;

    const switcher = document.createElement('div');
    switcher.className = 'lang-switcher';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Language switcher');
    switcher.innerHTML = '<button type="button" data-lang="pt">PT</button><button type="button" data-lang="en">EN</button>';
    if (burger) nav.insertBefore(switcher, burger);
    else nav.appendChild(switcher);

    switcher.addEventListener('click', e => {
      const btn = e.target.closest('button[data-lang]');
      if (!btn) return;
      window.FalawI18n.setLanguage(btn.dataset.lang);
    });
  }

  window.FalawI18n = {
    getLanguage: () => getStoredLang(),
    setLanguage: (lang) => {
      const nextLang = lang === 'en' ? 'en' : DEFAULT_LANG;
      localStorage.setItem(LANG_STORAGE_KEY, nextLang);
      qsa('.lang-switcher button').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === nextLang));
      applySharedNavigation(nextLang);
      applyPageLanguage(nextLang);
      window.dispatchEvent(new CustomEvent('falaw:languagechange', { detail: { lang: nextLang } }));
    },
    t: (key, ...args) => {
      const lang = getStoredLang();
      const parts = key.split('.');
      let value = uiText.phrases;
      parts.forEach(part => { value = value && value[part]; });
      if (typeof value === 'function') return value(...args, lang);
      return value && value[lang] ? value[lang] : '';
    }
  };

  renderLangSwitcher();
  window.FalawI18n.setLanguage(getStoredLang());

  /* ────────────────────────────────────────
     CUSTOM CURSOR
  ──────────────────────────────────────── */
  (function initCursor() {
    const cursor = qs('#cursor');
    if (!cursor) return;

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;

    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

    const loop = () => {
      cx = lerp(cx, mx, 0.15);
      cy = lerp(cy, my, 0.15);
      cursor.style.transform = `translate(${cx - cursor.offsetWidth / 2}px, ${cy - cursor.offsetHeight / 2}px)`;
      requestAnimationFrame(loop);
    };
    loop();

    const expand  = () => cursor.classList.add('expanded');
    const collapse = () => cursor.classList.remove('expanded');

    qsa('a, button, .dot, .cta, .team-card, .area-card').forEach(el => {
      el.addEventListener('mouseenter', expand);
      el.addEventListener('mouseleave', collapse);
    });
  })();

  /* ────────────────────────────────────────
     NAV SCROLL PROGRESS BAR
  ──────────────────────────────────────── */
  (function initProgress() {
    const bar = qs('.nav-progress');
    if (!bar) return;
    window.addEventListener('scroll', () => {
      const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
      bar.style.width = pct + '%';
    }, { passive: true });
  })();

  /* ────────────────────────────────────────
     SECTION COUNTER + DOT NAV + ACTIVE LINK
  ──────────────────────────────────────── */
  (function initNav() {
    const sections  = qsa('.section-stack');
    const dots      = qsa('.dot');
    const counter   = qs('.nav-counter');
    const navLinks  = qsa('.nav-links a');
    if (!sections.length) return;

    let labels = sections.map(s => s.dataset.label || '');
    const ids    = sections.map(s => s.id || '');

    let current = 0;

    function setActive(idx) {
      if (idx === current && idx !== 0) return;
      current = idx;

      dots.forEach((d, i) => d.classList.toggle('active', i === idx));

      if (counter) {
        const num = String(idx + 1).padStart(2, '0');
        counter.textContent = `${num} — ${labels[idx] || ''}`;
      }

      navLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === `#${ids[idx]}`);
      });

      /* swap dot style for dark sections */
      const isDark = sections[idx].classList.contains('s-stats') ||
                     sections[idx].classList.contains('s-contato');
      dots.forEach(d => d.classList.toggle('dot-dark', isDark));
    }

    /* IntersectionObserver — detects which section is most visible */
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const idx = sections.indexOf(e.target);
          if (idx !== -1) setActive(idx);
        }
      });
    }, { threshold: 0.5 });

    sections.forEach(s => io.observe(s));
    setActive(0);

    window.addEventListener('falaw:languagechange', () => {
      labels = sections.map(s => s.dataset.label || '');
      setActive(current);
    });

    /* Click on dot → scroll to section */
    dots.forEach((d, i) => {
      d.addEventListener('click', () => sections[i].scrollIntoView({ behavior: 'smooth' }));
    });
  })();

  /* ────────────────────────────────────────
     COMO ATUAMOS — BURGUNDY SHAPE on SCROLL
  ──────────────────────────────────────── */
  (function initComoShape() {
    const shape   = qs('.como-shape');
    const section = qs('.s-como');
    if (!shape || !section) return;

    let ticking = false;

    function update() {
      const rect = section.getBoundingClientRect();
      /* progress 0 → 1 as section enters and fills viewport */
      const prog = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / window.innerHeight));
      const tx   = (1 - prog) * 120;          /* 120vw → 0vw */
      shape.style.transform = `translateX(${tx}vw)`;
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  })();

  /* ────────────────────────────────────────
     ATUAÇÕES — SVC SHAPES (slide from LEFT)
  ──────────────────────────────────────── */
  (function initSvcShapes() {
    const blocks = qsa('.svc-block');
    if (!blocks.length) return;

    let ticking = false;

    function update() {
      blocks.forEach(block => {
        const shape = qs('.svc-shape', block);
        if (!shape) return;
        const isRight = block.classList.contains('svc-block--right');
        const rect = block.getBoundingClientRect();
        const prog = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / window.innerHeight));
        const tx   = isRight ? (1 - prog) * 120 : (1 - prog) * -120;
        shape.style.transform = `translateX(${tx}vw)`;
      });
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  })();

  /* ────────────────────────────────────────
     GSAP SCROLL REVEAL
  ──────────────────────────────────────── */
  (function initReveal() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      /* Fallback: show everything without animation */
      qsa('.reveal').forEach(el => {
        el.style.opacity   = 1;
        el.style.transform = 'none';
      });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    /* Reveals inside sticky sections — grouped trigger per section */
    qsa('.section-stack').forEach(section => {
      const els = qsa('.reveal', section);
      if (!els.length) return;

      gsap.fromTo(els,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            toggleActions: 'play none none none',
          }
        }
      );
    });

    /* Reveals outside section-stack (e.g. equipe, blog) — individual triggers */
    qsa('.reveal').forEach(el => {
      if (el.closest('.section-stack')) return;
      gsap.fromTo(el,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0,
          duration: 0.7,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            toggleActions: 'play none none none',
          }
        }
      );
    });
  })();

  /* ────────────────────────────────────────
     NUMERIC COUNTERS
  ──────────────────────────────────────── */
  (function initCounters() {
    const els = qsa('[data-count]');
    if (!els.length) return;

    const easeOut = t => 1 - Math.pow(1 - t, 3);   /* easeOutCubic */

    function animateCounter(el) {
      const target   = parseFloat(el.dataset.count);
      const suffix   = el.dataset.suffix || '';
      const duration = 1200;
      const start    = performance.now();

      const tick = (now) => {
        const t   = Math.min((now - start) / duration, 1);
        const val = target * easeOut(t);
        el.textContent = (Number.isInteger(target) ? Math.round(val) : val.toFixed(1)) + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCounter(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });

    els.forEach(el => io.observe(el));
  })();

  /* ────────────────────────────────────────
     AREAS INTERATIVAS — split menu/panel
  ──────────────────────────────────────── */
  (function initAreas() {
    const items  = qsa('.area-item');
    const panels = qsa('.area-panel');
    if (!items.length || !panels.length) return;

    function activate(idx) {
      items.forEach((it, i) => {
        it.classList.toggle('active', i === idx);
        it.setAttribute('aria-pressed', i === idx);
      });
      panels.forEach((p, i) => p.classList.toggle('active', i === idx));
    }

    items.forEach((item, i) => {
      item.addEventListener('mouseenter', () => activate(i));
      item.addEventListener('click',      () => activate(i));
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(i); }
      });
    });
  })();

  /* ────────────────────────────────────────
     MOBILE NAV — hamburger toggle
  ──────────────────────────────────────── */
  (function initBurger() {
    const burger = qs('.nav-burger');
    const nav    = qs('.nav');
    const links  = qs('.nav-links');
    if (!burger || !nav) return;

    function close() {
      nav.classList.remove('nav-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    burger.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    /* Close on link click */
    if (links) {
      qsa('a', links).forEach(a => a.addEventListener('click', close));
    }

    /* Close on Escape */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });
  })();

  /* ────────────────────────────────────────
     FLOATING LABELS (ensure placeholder never shows)
  ──────────────────────────────────────── */
  /* ────────────────────────────────────────
     TEAM BIO — touch tap to expand
  ──────────────────────────────────────── */
  (function initTeamBioTouch() {
    /* Only activate on touch/coarse pointer devices */
    if (!window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
    qsa('.team-list').forEach(list => {
      list.addEventListener('click', function (e) {
        const row = e.target.closest('.team-row');
        if (!row) return;
        /* Don't toggle when clicking email icon */
        if (e.target.closest('.team-email-icon')) return;
        const isOpen = row.classList.toggle('bio-open');
        /* Close other rows */
        qsa('.team-row.bio-open', list).forEach(other => {
          if (other !== row) other.classList.remove('bio-open');
        });
        if (!isOpen) row.classList.remove('bio-open');
      });
    });
  })();

  (function initFloatingLabels() {
    qsa('.form-group input, .form-group textarea').forEach(inp => {
      inp.setAttribute('placeholder', ' ');     /* space triggers :not(:placeholder-shown) */
    });
  })();

  /* ────────────────────────────────────────
     COOKIE CONSENT BANNER
  ──────────────────────────────────────── */
  (function initCookieBanner() {
    var STORAGE_KEY = 'fa_cookie_consent';
    var lang = (function() { try { return localStorage.getItem('fa_site_lang') || 'pt'; } catch(e) { return 'pt'; } })();

    var text = {
      message: {
        pt: 'Este site utiliza cookies e tecnologias similares para melhorar sua experiência. Ao continuar navegando, você concorda com nossa <a href="/privacidade.html">Política de Privacidade</a> e <a href="/cookies.html">Política de Cookies</a>.',
        en: 'This site uses cookies and similar technologies to improve your experience. By continuing to browse, you agree to our <a href="/privacidade.html">Privacy Policy</a> and <a href="/cookies.html">Cookie Policy</a>.'
      },
      accept:  { pt: 'Aceitar', en: 'Accept' },
      dismiss: { pt: 'Continuar sem aceitar', en: 'Continue without accepting' },
      pill:    { pt: 'Cookies', en: 'Cookies' },
      tooltip: { pt: 'Preferências de cookies aceitas ✓', en: 'Cookie preferences accepted ✓' }
    };

    function t(key) { return (text[key] && (text[key][lang] || text[key]['pt'])) || ''; }

    /* Always create the accepted pill; show only after consent */
    var pill = document.createElement('div');
    pill.className = 'cookie-accepted-pill';
    pill.innerHTML =
      '<div class="cookie-accepted-pill-inner" data-tooltip="' + t('tooltip') + '">' +
        '<span class="cookie-accepted-dot"></span>' + t('pill') +
      '</div>';
    document.body.appendChild(pill);

    function showPill() { pill.classList.add('visible'); }

    var already = false;
    try { already = !!localStorage.getItem(STORAGE_KEY); } catch(e) {}
    if (already) { showPill(); return; }

    /* Build banner */
    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', lang === 'en' ? 'Cookie consent' : 'Aviso de cookies');
    bar.innerHTML =
      '<p class="cookie-bar-text">' + t('message') + '</p>' +
      '<div class="cookie-bar-actions">' +
        '<button class="cookie-bar-dismiss" id="cookie-dismiss">' + t('dismiss') + '</button>' +
        '<button class="cookie-bar-btn" id="cookie-accept">' + t('accept') + '</button>' +
      '</div>';
    document.body.appendChild(bar);

    requestAnimationFrame(function() {
      requestAnimationFrame(function() { bar.classList.add('visible'); });
    });

    function removeBar() {
      bar.classList.remove('visible');
      bar.addEventListener('transitionend', function() {
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      }, { once: true });
    }

    document.getElementById('cookie-accept').addEventListener('click', function() {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch(e) {}
      removeBar();
      showPill();
    });

    document.getElementById('cookie-dismiss').addEventListener('click', removeBar);
  })();

})();
