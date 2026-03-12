import { readTextFile, writeTextFile } from './io.mjs';

const STYLESHEET_TAG_RE = /<link\s+rel=["']stylesheet["']\s+href=["']styles\.css["']\s*\/?>/i;
const SCRIPT_TAG_RE = /<script\s+src=["']report\.js["']\s*><\/script>/i;
const TEMPLATE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveValue(source, dotPath) {
  return dotPath.split('.').reduce((current, key) => current?.[key], source);
}

export function renderHtmlTemplate(template, reportData) {
  return template.replace(TEMPLATE_RE, (_, dotPath) => {
    const value = resolveValue(reportData, dotPath.trim());
    return value === undefined || value === null ? '' : escapeHtml(value);
  });
}

export async function renderHtmlReport({ templateDir, reportData, outputPath }) {
  const [indexHtml, stylesCss, reportJs] = await Promise.all([
    readTextFile(`${templateDir}/index.html`),
    readTextFile(`${templateDir}/styles.css`),
    readTextFile(`${templateDir}/report.js`)
  ]);

  const hydratedHtml = renderHtmlTemplate(indexHtml, reportData);
  const injectedJs = reportJs.replace(/__REPORT_DATA__/g, JSON.stringify(reportData));

  if (injectedJs.includes('__REPORT_DATA__')) {
    throw new Error('report.js still contains the __REPORT_DATA__ placeholder after injection.');
  }

  const withStyles = STYLESHEET_TAG_RE.test(hydratedHtml)
    ? hydratedHtml.replace(STYLESHEET_TAG_RE, `<style>\n${stylesCss}\n</style>`)
    : hydratedHtml.replace('</head>', `<style>\n${stylesCss}\n</style>\n</head>`);

  const finalHtml = SCRIPT_TAG_RE.test(withStyles)
    ? withStyles.replace(SCRIPT_TAG_RE, `<script>\n${injectedJs}\n</script>`)
    : withStyles.replace('</body>', `<script>\n${injectedJs}\n</script>\n</body>`);

  await writeTextFile(outputPath, finalHtml);
  return { outputPath, html: finalHtml };
}
