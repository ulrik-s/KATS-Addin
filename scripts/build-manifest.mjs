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
const prodGuidPath = resolve(root, 'manifest/guid.txt');
const devGuidPath = resolve(root, 'manifest/guid.dev.txt');
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

// Dev and prod must use different GUIDs. Office identifies an add-in
// by its <Id>; with the same GUID, sideloading dev on top of an
// admin-deployed prod produces two ribbon entries that share cache
// state, where clicks on the dev menu can race-load the prod bundle.
// KATS_ADDIN_GUID overrides for prod (used by release CI to pin the
// production GUID); dev always reads from guid.dev.txt locally.
const guid = isDev
  ? readFileSync(devGuidPath, 'utf8').trim()
  : (process.env.KATS_ADDIN_GUID ?? readFileSync(prodGuidPath, 'utf8')).trim();

const defaultHost = isDev ? DEV_HOST_URL : PROD_HOST_URL;
let hostUrl = (process.env.KATS_HOST_URL ?? defaultHost).trim();
if (hostUrl.endsWith('/')) hostUrl = hostUrl.slice(0, -1);

// Suffix on display name + ribbon-tab label so the two coexisting
// installed add-ins are visually tellable apart in Word.
const nameSuffix = isDev ? ' (DEV)' : '';

const replacements = {
  '{{HOST_URL}}': hostUrl,
  '{{VERSION}}': version,
  '{{GUID}}': guid,
  '{{NAME_SUFFIX}}': nameSuffix,
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

if (isDev && process.env.KATS_SUPPRESS_DEV_HINT !== '1') {
  console.log(
    `\nNästa steg: \`yarn sideload\` registrerar manifestet i Word via\n` +
      `Microsofts officiella office-addin-debugging-verktyg.`,
  );
}
