// Turns the single-file build into a page fragment for hosts that add their own
// <html>/<head>/<body> skeleton (the publish step wraps the file itself).
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-single/index.html', 'utf8');
const out = src
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?html[^>]*>/gi, '')
  .replace(/<\/?head[^>]*>/gi, '')
  .replace(/<\/?body[^>]*>/gi, '')
  .replace(/<meta charset="[^"]*"\s*\/?>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .trim();

writeFileSync('dist-single/louver-portfolio.html', out + '\n');
console.log(`wrote dist-single/louver-portfolio.html (${(out.length / 1024).toFixed(0)} KB)`);
