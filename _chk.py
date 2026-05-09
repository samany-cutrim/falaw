import os
base = 'html/Falaw/falaw.com.br/blog'
for fn in sorted(os.listdir(base)):
    if not fn.endswith('.html') or fn == 'reader.html': continue
    with open(os.path.join(base, fn), encoding='utf-8') as f:
        c = f.read()
    print(fn,
          'nav-links=' + str('nav-links' in c),
          'nav-counter=' + str('nav-counter' in c),
          'whatsapp=' + str('whatsapp-btn' in c))
