import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidepanelDir = path.join(root, 'src', 'sidepanel');
const htmlFile = path.join(root, 'sidepanel.html');

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  const errors = [];

  lines.forEach((line, index) => {
    // Check for <div or </div (case-insensitive)
    if (/<div[\s>]|<\/div>/i.test(line)) {
      errors.push({ line: index + 1, content: line.trim() });
    }
  });

  return errors;
}

function walk(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (/\.(tsx|ts|jsx|js|html)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = [htmlFile, ...walk(sidepanelDir)];
let totalErrors = 0;

console.log('🔍 [NewtonAgent Semantic Linter] Verificando conformidade estrita de zero <div> tags...');

for (const file of allFiles) {
  const errors = checkFile(file);
  const rel = path.relative(root, file);
  if (errors.length > 0) {
    console.error(`❌ VIOLAÇÃO em ${rel}:`);
    errors.forEach((e) => {
      console.error(`   Linha ${e.line}: ${e.content}`);
    });
    totalErrors += errors.length;
  }
}

if (totalErrors > 0) {
  console.error(`\n🚨 FALHA: Foram encontradas ${totalErrors} ocorrências de tags <div>.`);
  process.exit(1);
} else {
  console.log('✅ SUCESSO: Zero <div> tags detectadas! Todos os componentes utilizam 100% de tags semânticas.');
  process.exit(0);
}
