#!/usr/bin/env node
// @ts-check
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..');

const templatePath = resolve(root, 'manifest/manifest.template.xml');
const guidPath = resolve(root, 'manifest/guid.txt');
const packagePath = resolve(root, 'package.json');
const outDir = resolve(root, 'dist');
const outPath = resolve(outDir, 'manifest.xml');

const template = readFileSync(templatePath, 'utf8');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

const version = process.env.KATS_VERSION ?? pkg.version;
const guid = (process.env.KATS_ADDIN_GUID ?? readFileSync(guidPath, 'utf8')).trim();

let hostUrl = (process.env.KATS_HOST_URL ?? 'https://ulrik-s.github.io/KATS-Addin').trim();
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

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, xml, 'utf8');

console.log(
  `manifest.xml written → ${outPath}\n  HOST_URL = ${hostUrl}\n  VERSION  = ${version}\n  GUID     = ${guid}`,
);
