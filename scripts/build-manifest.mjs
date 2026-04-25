#!/usr/bin/env node
// @ts-check
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..');

const isDev = process.argv.includes('--dev');

const DEV_HOST_URL = 'https://localhost:3000';
const PROD_HOST_URL = 'https://ulrik-s.github.io/KATS-Addin';

const templatePath = resolve(root, 'manifest/manifest.template.xml');
const guidPath = resolve(root, 'manifest/guid.txt');
const packagePath = resolve(root, 'package.json');

const defaultOut = isDev
  ? resolve(root, 'manifest/manifest.dev.xml')
  : resolve(root, 'dist/manifest.xml');
const outPath = process.env.KATS_MANIFEST_OUT
  ? resolve(root, process.env.KATS_MANIFEST_OUT)
  : defaultOut;

const template = readFileSync(templatePath, 'utf8');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

const version = process.env.KATS_VERSION ?? pkg.version;
const guid = (process.env.KATS_ADDIN_GUID ?? readFileSync(guidPath, 'utf8')).trim();

const defaultHost = isDev ? DEV_HOST_URL : PROD_HOST_URL;
let hostUrl = (process.env.KATS_HOST_URL ?? defaultHost).trim();
if (hostUrl.endsWith('/')) hostUrl = hostUrl.slice(0, -1);

const replacements = {
  '{{HOST_URL}}': hostUrl,
  '{{VERSION}}': version,
  '{{GUID}}': guid,
};

let xml = template;
for (const [needle, value] of Object.entries(replacements)) {
  xml = xml.split(needle).join(value);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, xml, 'utf8');

console.log(
  `manifest.xml written → ${outPath}\n  HOST_URL = ${hostUrl}\n  VERSION  = ${version}\n  GUID     = ${guid}`,
);

if (isDev) {
  const isMac = process.platform === 'darwin';
  if (isMac) {
    console.log(
      `\nSideload (Mac, en gång): kör \`yarn sideload\` i ett separat fönster.\n` +
        `Det kopierar manifestet till Words wef-mapp; sedan startar du om Word.\n\n` +
        `(Mac Word saknar dialog för XML-uppladdning — wef-mappen är vägen.)`,
    );
  } else {
    console.log(
      `\nSideload (en gång):\n  1. Starta Word.\n  2. Infoga → Mina tillägg → Ladda upp eget tillägg.\n  3. Välj filen ovan (${outPath}).\n` +
        `  4. Acceptera HTTPS-certifikatet om Word frågar.\n\n` +
        `MGA-fliken syns nu i ribbon. Vid kodändringar laddar Vite om task panen automatiskt.`,
    );
  }
}
