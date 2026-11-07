import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('dist/manifest.webmanifest', 'utf8'));
if (manifest.display !== 'standalone' || manifest.start_url !== '/' || manifest.scope !== '/') {
  throw new Error('Invalid standalone PWA manifest');
}
for (const size of ['192x192', '512x512']) {
  if (!manifest.icons.some(icon => icon.sizes === size)) throw new Error(`Missing ${size} install icon`);
}
for (const icon of manifest.icons) {
  if (!fs.existsSync(`dist${icon.src}`)) throw new Error(`Missing install icon: ${icon.src}`);
}

// Cache every emitted static asset, including future dynamically imported chunks.
function emittedAssets(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? emittedAssets(path) : [path.slice('dist'.length)];
  });
}
const assets = emittedAssets('dist/assets');
const html = fs.readFileSync('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)) {
  if (!assets.includes(match[1])) throw new Error(`Missing emitted entry asset: ${match[1]}`);
}
let worker = fs.readFileSync('dist/sw.js', 'utf8');
const catalog = /(["'])\/bibles\/index\.json\1/;
if (!catalog.test(worker)) throw new Error('Service worker precache catalog marker missing');
worker = worker.replace(catalog, match => [match, ...assets.map(asset => JSON.stringify(asset))].join(','));
if (!worker.includes('scripture-focus-v1')) throw new Error('Service worker version marker missing');
worker = worker.replace('scripture-focus-v1', `scripture-focus-${Date.now()}`);
for (const asset of assets) {
  if (!worker.includes(JSON.stringify(asset))) throw new Error(`Offline precache missing asset: ${asset}`);
}
fs.writeFileSync('dist/sw.js', worker);
console.log(`Manifest, install icons and offline precache validated (${assets.length} emitted assets).`);
