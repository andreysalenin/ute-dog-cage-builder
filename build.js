// Assemble the single-file page: node build.js -> index.html
// (inlines src/*.js plus three.js r128 and jsPDF 2.5.1 from node_modules, so it works offline)
const fs = require('fs');
const path = require('path');
const here = __dirname;
const rd = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const strip = (js) => js.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');
const guard = (js, name) => {
  if (/<\/script/i.test(js)) throw new Error(`${name} contains </script`);
  if (/<!--/.test(js)) throw new Error(`${name} contains <!--`);
  return js;
};

// version label: build date and a short hash of the sources, shown at the bottom of the settings
const crypto = require('crypto');
const BUILD = (() => {
  const h = crypto.createHash('sha1');
  for (const f of ['src/page.html', 'src/core.js', 'src/viewer.js', 'src/drawings.js', 'src/app.js']) h.update(rd(f));
  const d = new Date();
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${h.digest('hex').slice(0, 7)}, built ${d.getUTCDate()} ${mon} ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
})();
const page = rd('src/page.html').replace('__BUILD__', BUILD);
const cut = page.indexOf('</style>') + '</style>'.length;
const headPart = page.slice(0, cut).trim();
const bodyPart = page.slice(cut).trim();
const own = ['core.js', 'viewer.js', 'drawings.js', 'app.js'].map(f => `<script>\n${guard(rd('src/' + f), f)}\n</script>`).join('\n');

{
  const three = guard(strip(rd('node_modules/three/build/three.min.js')), 'three');
  const jspdf = guard(strip(rd('node_modules/jspdf/dist/jspdf.umd.min.js')), 'jspdf');
  const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Parametric steel or aluminium SHS dog cages for a ute tray: N x 2 layout, live 3D model with tray and ute, A3 drawing set and STEP export.">
${headPart}
</head>
<body>
${bodyPart}
<!-- three.js r128 (MIT) -->
<script>
${three}
</script>
<!-- jsPDF 2.5.1 (MIT) -->
<script>
${jspdf}
</script>
${own}
</body>
</html>
`;
  fs.writeFileSync(path.join(here, 'index.html'), out);
  console.log('index.html', (out.length / 1024).toFixed(0), 'KB');
}
