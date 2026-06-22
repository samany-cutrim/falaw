const fs = require('fs');
const path = 'c:/Users/manyc/Falaw/html/Falaw/falaw.com.br/blog/articles-data.js';
let src = fs.readFileSync(path, 'utf8');

// Evaluate to get FALAW_ARTICLES
eval(src);
const a = FALAW_ARTICLES.find(x => x.id.startsWith('stf-are-1532603-sobresto'));
const oldContent = a.content;
console.log('len:', oldContent.length, 'tail:', JSON.stringify(oldContent.slice(-20)));

// Fix: remove the extra } — current tail is "]}}]}" should be "]}]}"
const newContent = oldContent.slice(0, -4) + ']}';
console.log('new tail:', JSON.stringify(newContent.slice(-20)));

try {
  const p = JSON.parse(newContent);
  console.log('Parse OK! sections:', p.sections.length);
} catch(e) {
  console.log('Still broken:', e.message); process.exit(1);
}

// Replace in source file — the content field value is stored as a JSON string in the JS file
// We need to find the exact escaped version in the source
const oldEscaped = JSON.stringify(oldContent).slice(1,-1); // remove outer quotes
const newEscaped = JSON.stringify(newContent).slice(1,-1);
console.log('old escaped tail:', oldEscaped.slice(-20));
console.log('new escaped tail:', newEscaped.slice(-20));

if (!src.includes(oldEscaped)) {
  console.log('Could not find old escaped content in source!'); process.exit(1);
}

const newSrc = src.replace(oldEscaped, newEscaped);
fs.writeFileSync(path, newSrc, 'utf8');
console.log('File updated.');
