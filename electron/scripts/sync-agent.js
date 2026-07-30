const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'print-agent', 'src');
const DST = path.join(__dirname, '..', 'src', 'agent');

function walkDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'index.ts') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      walkDir(s, d);
    } else if (entry.name.endsWith('.ts')) {
      const content = fs.readFileSync(s, 'utf-8');
      const banner = '/* AUTO-GENERADO por sync-agent.js — NO EDITAR */\n';
      fs.writeFileSync(d, banner + content, 'utf-8');
    }
  }
}

console.log('[sync-agent] Copiando print-agent/src → electron/src/agent');
walkDir(SRC, DST);
console.log('[sync-agent] OK');
