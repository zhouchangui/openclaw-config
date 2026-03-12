import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_PLATFORM_BASE = 'http://127.0.0.1:3000';
const DEFAULT_REPORT_STORAGE_CONFIG_PATH = path.resolve(path.dirname(__filename), '..', 'config.json');
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const TEMPLATE_TEXT_FILE_EXTENSIONS = new Set(['.html', '.htm', '.md', '.txt']);
const TOKEN_REFRESH_BUFFER_MS = 5000;
const STYLESHEET_TAG_RE = /(<link\s+rel=["']stylesheet["']\s+href=["']styles\.css)(["']\s*\/?>)/i;
const SCRIPT_TAG_RE = /(<script\s+src=["']report\.js)(["']\s*><\/script>)/i;
let authTokenCache = null;

// ── helpers ───────────────────────────────────────────────────────────────────

function isDirectorySync(dirPath) {
    try { return fs.statSync(dirPath).isDirectory(); } catch { return false; }
}

function readJsonIfExists(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return null;
    }
}

function getPlatformBaseUrl() {
    const base = (process.env.PLATFORM_BASE_URL || DEFAULT_PLATFORM_BASE).replace(/\/$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
}

function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function appendQueryParam(url, key, value) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function getReportStorageConfig(env = process.env) {
    const configPath = env.REPORT_STORAGE_CONFIG_PATH
        ? path.resolve(env.REPORT_STORAGE_CONFIG_PATH)
        : DEFAULT_REPORT_STORAGE_CONFIG_PATH;
    const fileConfig = readJsonIfExists(configPath) || {};
    const storage = fileConfig.storage || {};
    const provider = env.REPORT_STORAGE_PROVIDER || storage.provider || null;

    if (!provider) return null;

    if (provider !== 'cloudflare-r2') {
        return { provider };
    }

    const config = {
        provider,
        endpoint: normalizeBaseUrl(env.REPORT_R2_ENDPOINT || storage.endpoint),
        bucket: env.REPORT_R2_BUCKET || storage.bucket || '',
        accessKeyId: env.REPORT_R2_ACCESS_KEY_ID || storage.accessKeyId || '',
        secretAccessKey: env.REPORT_R2_SECRET_ACCESS_KEY || storage.secretAccessKey || '',
        publicBaseUrl: normalizeBaseUrl(env.REPORT_PUBLIC_BASE_URL || storage.publicBaseUrl),
        keyPrefix: String(env.REPORT_KEY_PREFIX || storage.keyPrefix || 'reports').replace(/^\/+|\/+$/g, ''),
    };

    const missing = Object.entries(config)
        .filter(([key, value]) => ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey', 'publicBaseUrl'].includes(key) && !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        throw new Error(`Cloudflare R2 report config is incomplete: missing ${missing.join(', ')}`);
    }

    return config;
}

function decodeJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    const [, payload] = token.split('.');
    if (!payload) return null;

    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
    } catch {
        return null;
    }
}

function getCredentialConfig(env = process.env) {
    return {
        appId: env.AGENT_APP_ID || env.DDM_APP_ID || null,
        appSecret: env.AGENT_APP_SECRET || env.DDM_APP_SECRET || null,
    };
}

function getCachedAuthToken() {
    if (!authTokenCache?.token || !authTokenCache?.expiresAt) return null;
    if ((authTokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS) <= Date.now()) {
        authTokenCache = null;
        return null;
    }
    return authTokenCache.token;
}

async function exchangeCredentialsForToken() {
    const { appId, appSecret } = getCredentialConfig();
    if (!appId || !appSecret) {
        throw new Error('AGENT_TOKEN is missing, and AGENT_APP_ID/AGENT_APP_SECRET are not set.');
    }

    const url = `${getPlatformBaseUrl()}/agent/auth`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
        },
    });

    const text = await response.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = null;
    }

    if (!response.ok) {
        throw new Error(`POST /agent/auth failed (${response.status}): ${text}`);
    }
    if (!body?.success || !body?.rabbitmq?.token) {
        throw new Error(`Agent auth failed: ${text || 'empty response'}`);
    }

    const expiresAt = body.rabbitmq.tokenExpiry
        ? Date.parse(body.rabbitmq.tokenExpiry)
        : ((decodeJwtPayload(body.rabbitmq.token)?.exp || 0) * 1000);

    if (Number.isFinite(expiresAt) && expiresAt > 0) {
        authTokenCache = {
            token: body.rabbitmq.token,
            expiresAt,
        };
    } else {
        authTokenCache = {
            token: body.rabbitmq.token,
            expiresAt: Date.now() + (55 * 60 * 1000),
        };
    }

    return body.rabbitmq.token;
}

async function getAuthHeader() {
    const token = process.env.AGENT_TOKEN || getCachedAuthToken() || await exchangeCredentialsForToken();
    return `Bearer ${token}`;
}

async function postJson(pathname, body) {
    const url = `${getPlatformBaseUrl()}${pathname}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: await getAuthHeader() },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`POST ${pathname} failed (${response.status}): ${text}`);
    return text;
}

function getMimeType(fileName) {
    const ext = path.extname(fileName).toLowerCase().slice(1);
    const map = {
        html: 'text/html', css: 'text/css', js: 'text/javascript',
        svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
        jpeg: 'image/jpeg', gif: 'image/gif', md: 'text/markdown; charset=utf-8',
    };
    return map[ext] || 'application/octet-stream';
}

// ── template resolution ───────────────────────────────────────────────────────

export function resolveTemplateDirForRuntime(templateName) {
    if (!templateName || typeof templateName !== 'string') return null;
    const name = templateName.trim();
    if (!name) return null;

    const agentAssetsPath = process.env.AGENT_ASSETS_PATH
        ? path.resolve(process.env.AGENT_ASSETS_PATH)
        : null;
    // In Docker: script lives at /assets/skills/report/scripts/impl.js → 3 levels up = /assets
    // In TUI:   script lives at .../dingding-agent-runtime/skills/report/scripts/impl.js → 3 levels up = dingding-agent-runtime
    const scriptRoot = path.resolve(path.dirname(__filename), '..', '..', '..');
    const isDocker = fs.existsSync('/.dockerenv');

    const candidates = [
        // 1. 优先使用运行时环境变量（ddm run 在 TUI 和 Docker 都会设置）
        ...(agentAssetsPath ? [path.join(agentAssetsPath, 'report-templates', name)] : []),
        // 2. Docker 明确回退（/.dockerenv 存在但 AGENT_ASSETS_PATH 未设置时）
        ...(isDocker ? [path.join('/assets', 'report-templates', name)] : []),
        // 3. 脚本根目录（Docker 中等价于 /assets；TUI 中为 dingding-agent-runtime，通常无模板）
        path.join(scriptRoot, 'report-templates', name),
        // 4. 当前工作目录（TUI 手动执行时，从 agent 目录运行即可命中）
        path.join(process.cwd(), 'report-templates', name),
    ];

    for (const c of [...new Set(candidates)]) {
        if (isDirectorySync(c)) return c;
    }
    return null;
}

// ── template rendering ────────────────────────────────────────────────────────

export function getValueByPath(source, expression) {
    if (source == null || typeof expression !== 'string') return undefined;
    return expression.trim()
        .replace(/\[(\d+)\]/g, '.$1')
        .replace(/^\./, '')
        .split('.')
        .filter(Boolean)
        .reduce((cur, seg) => (cur == null || typeof cur !== 'object' ? undefined : cur[seg]), source);
}

function formatTemplateValue(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
        const primitiveOnly = value.every(i => i == null || typeof i !== 'object');
        return primitiveOnly ? value.map(i => (i == null ? '' : String(i))).join('、') : JSON.stringify(value);
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export function renderTemplateText(raw, options = {}) {
    const { reportData = {}, templateVars = {} } = options;
    const unresolved = new Set();

    const rendered = String(raw).replace(PLACEHOLDER_PATTERN, (_match, expressionRaw) => {
        const key = String(expressionRaw || '').trim();
        const value = Object.prototype.hasOwnProperty.call(templateVars, key)
            ? templateVars[key]
            : getValueByPath(reportData, key);
        const formatted = formatTemplateValue(value);
        if (!formatted) { unresolved.add(key); return `{{ ${key} }}`; }
        return formatted;
    });

    return { rendered, unresolved: [...unresolved] };
}

function collectFilesRecursively(dirPath, result = []) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) collectFilesRecursively(fullPath, result);
        else if (entry.isFile()) result.push(fullPath);
    }
    return result;
}

export function renderTemplateFilesInDir(dirPath, options = {}) {
    const files = collectFilesRecursively(dirPath)
        .filter(f => TEMPLATE_TEXT_FILE_EXTENSIONS.has(path.extname(f).toLowerCase()));
    const unresolvedByFile = [];

    for (const filePath of files) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { rendered, unresolved } = renderTemplateText(raw, options);
        if (rendered !== raw) fs.writeFileSync(filePath, rendered, 'utf-8');
        if (unresolved.length > 0) {
            unresolvedByFile.push({ file: path.relative(dirPath, filePath), placeholders: unresolved });
        }
    }

    if (unresolvedByFile.length > 0) {
        const details = unresolvedByFile
            .map(item => `- ${item.file}: ${item.placeholders.map(k => `{{ ${k} }}`).join(', ')}`)
            .join('\n');
        throw new Error(`Template placeholders unresolved:\n${details}`);
    }

    return { filesProcessed: files.length };
}

export function injectReportDataIntoTemplateReportJs(reportJsPath, reportData) {
    if (!fs.existsSync(reportJsPath)) return false;
    const raw = fs.readFileSync(reportJsPath, 'utf-8');
    const occurrences = (raw.match(/__REPORT_DATA__/g) || []).length;
    if (occurrences === 0) return false;
    if (occurrences !== 1) throw new Error(`report.js must contain exactly one __REPORT_DATA__ placeholder: ${reportJsPath}`);
    fs.writeFileSync(reportJsPath, raw.replace('__REPORT_DATA__', JSON.stringify(reportData ?? {}, null, 2)), 'utf-8');
    return true;
}

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirSync(srcPath, destPath);
        else if (entry.isFile()) fs.copyFileSync(srcPath, destPath);
    }
}

export function materializeTemplateToTempDir(srcTemplateDir, reportData, options = {}) {
    const { templateVars = {}, assetVersion = null } = options;
    const runId = crypto.randomBytes(6).toString('hex');
    const outDir = path.join(process.cwd(), '.tmp', 'report', `out-${runId}`);

    copyDirSync(srcTemplateDir, outDir);
    console.error(`[Report] Using template dir: ${srcTemplateDir}`);

    renderTemplateFilesInDir(outDir, { reportData: reportData ?? {}, templateVars });
    injectReportDataIntoTemplateReportJs(path.join(outDir, 'report.js'), reportData ?? {});
    if (assetVersion) {
        const indexHtmlPath = path.join(outDir, 'index.html');
        if (fs.existsSync(indexHtmlPath)) {
            const rawIndexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
            const withVersionedStyles = rawIndexHtml.replace(
                STYLESHEET_TAG_RE,
                `$1?v=${encodeURIComponent(assetVersion)}$2`
            );
            const withVersionedAssets = withVersionedStyles.replace(
                SCRIPT_TAG_RE,
                `$1?v=${encodeURIComponent(assetVersion)}$2`
            );
            fs.writeFileSync(indexHtmlPath, withVersionedAssets, 'utf-8');
        }
    }

    return outDir;
}

// ── upload ────────────────────────────────────────────────────────────────────

function sha256Hex(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function hmacSha256(key, value, encoding) {
    const digest = crypto.createHmac('sha256', key).update(value).digest();
    return encoding ? digest.toString(encoding) : digest;
}

function toAmzTimestamp(date) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function buildCanonicalHeaders(headers) {
    return Object.entries(headers)
        .map(([key, value]) => [key.toLowerCase().trim(), String(value).trim()])
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${value}\n`)
        .join('');
}

function buildSignedHeaders(headers) {
    return Object.keys(headers)
        .map((key) => key.toLowerCase().trim())
        .sort((left, right) => left.localeCompare(right))
        .join(';');
}

function encodeObjectKeyForUrl(objectKey) {
    return objectKey
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

function sanitizeSegment(value, fallback = 'report') {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

function buildReportObjectPrefix({ title, reportData = {}, storageConfig }) {
    const prefixParts = [];
    if (storageConfig.keyPrefix) {
        prefixParts.push(storageConfig.keyPrefix);
    }

    const reportType = reportData?.reportType ? sanitizeSegment(reportData.reportType, 'report') : null;
    const reportKeySource = reportData?.slot || reportData?.tradingDate || reportData?.reportId || title;
    const reportKey = sanitizeSegment(reportKeySource, `report-${Date.now()}`);

    if (reportType) {
        prefixParts.push(reportType);
    }
    prefixParts.push(reportKey);
    return prefixParts.join('/');
}

function joinUrl(baseUrl, objectKey) {
    return `${normalizeBaseUrl(baseUrl)}/${String(objectKey).replace(/^\/+/, '')}`;
}

async function uploadFileToCloudflareR2(content, objectKey, mimeType, storageConfig) {
    const uploadUrl = new URL(storageConfig.endpoint);
    uploadUrl.pathname = `/${encodeObjectKeyForUrl(path.posix.join(storageConfig.bucket, objectKey))}`;

    const body = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const now = new Date();
    const amzDate = toAmzTimestamp(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body);
    const headers = {
        'content-type': mimeType,
        host: uploadUrl.host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
    };
    const signedHeaders = buildSignedHeaders(headers);
    const canonicalRequest = [
        'PUT',
        uploadUrl.pathname || '/',
        '',
        buildCanonicalHeaders(headers),
        signedHeaders,
        payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = hmacSha256(`AWS4${storageConfig.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, 'auto');
    const kService = hmacSha256(kRegion, 's3');
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = hmacSha256(kSigning, stringToSign, 'hex');

    const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            ...headers,
            Authorization: `AWS4-HMAC-SHA256 Credential=${storageConfig.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        body,
    });

    if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(`Cloudflare R2 upload failed: ${response.status}${detail ? ` ${detail}` : ''}`);
    }
}

async function uploadDirectoryToCloudflareR2(dirPath, { title, reportData, storageConfig, assetVersion = null }) {
    const files = [];
    function walk(p, rel = '') {
        for (const item of fs.readdirSync(p)) {
            const fp = path.join(p, item);
            const rp = path.posix.join(rel, item);
            if (fs.statSync(fp).isDirectory()) walk(fp, rp);
            else files.push({ fullPath: fp, relPath: rp });
        }
    }
    walk(dirPath);

    const objectPrefix = buildReportObjectPrefix({ title, reportData, storageConfig });
    let indexUrl = null;
    let firstUrl = null;

    console.error(`[Report] Uploading directory to Cloudflare R2: ${dirPath} -> ${objectPrefix}`);

    for (const { fullPath, relPath } of files) {
        const buffer = fs.readFileSync(fullPath);
        const mimeType = getMimeType(relPath);
        const objectKey = path.posix.join(objectPrefix, relPath);
        await uploadFileToCloudflareR2(buffer, objectKey, mimeType, storageConfig);
        const publicUrl = joinUrl(storageConfig.publicBaseUrl, objectKey);
        if (!firstUrl) firstUrl = publicUrl;
        if (relPath === 'index.html') indexUrl = publicUrl;
    }

    return {
        fileId: null,
        downloadUrl: assetVersion && (indexUrl ?? firstUrl)
            ? appendQueryParam(indexUrl ?? firstUrl, 'v', assetVersion)
            : indexUrl ?? firstUrl,
    };
}

async function uploadFile(content, fileName, { folderId } = {}) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const mimeType = getMimeType(fileName);

    const prepareRes = JSON.parse(await postJson('/agent/storage/upload/prepare', {
        fileName, fileSize: buffer.length, entityType: 'agent_report', mimeType, folderId,
    }));
    if (prepareRes.status === 'error') throw new Error(prepareRes.body || 'Prepare failed');

    const uploadRes = await fetch(prepareRes.presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: buffer,
    });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

    return JSON.parse(await postJson('/agent/storage/upload/complete', {
        sessionId: prepareRes.sessionId, contentHash: hash, isPublic: true,
    }));
}

async function uploadDirectory(dirPath, context = {}) {
    const storageConfig = getReportStorageConfig();
    if (storageConfig?.provider === 'cloudflare-r2') {
        return uploadDirectoryToCloudflareR2(dirPath, {
            title: context.title,
            reportData: context.reportData,
            storageConfig,
            assetVersion: context.assetVersion,
        });
    }

    const files = [];
    function walk(p, rel = '') {
        for (const item of fs.readdirSync(p)) {
            const fp = path.join(p, item), rp = path.join(rel, item);
            if (fs.statSync(fp).isDirectory()) walk(fp, rp);
            else files.push({ fullPath: fp, relPath: rp });
        }
    }
    walk(dirPath);

    const folderId = crypto.randomBytes(8).toString('hex');
    let indexResult = null, firstResult = null;
    console.error(`[Report] Uploading directory: ${dirPath} (folderId: ${folderId})`);

    for (const { fullPath, relPath } of files) {
        const result = await uploadFile(fs.readFileSync(fullPath), relPath, { folderId });
        if (!firstResult) firstResult = result;
        if (relPath === 'index.html') indexResult = result;
    }

    return indexResult ?? firstResult;
}

// ── main ──────────────────────────────────────────────────────────────────────

export async function main() {
    const [command, ...args] = process.argv.slice(2);
    let inputs = {};
    if (args.length > 0) {
        try { inputs = JSON.parse(args[args.length - 1]); } catch { /* ignore */ }
    }

    try {
        switch (command) {
            case 'resolve-template-path': {
                const { template } = inputs;
                if (!template) throw new Error('Provide "template" name.');
                const templatePath = resolveTemplateDirForRuntime(template);
                if (!templatePath) throw new Error(`Template "${template}" not found.`);
                console.log(JSON.stringify({ success: true, template, templatePath }));                break;
            }

            case 'publish': {
                const { template, templatePath, title, summary, reportData, templateVars, deliveries } = inputs;
                if (!title) throw new Error('"title" is required.');
                if (!summary) throw new Error('"summary" is required.');

                let srcDir = null;
                if (templatePath && typeof templatePath === 'string') {
                    srcDir = path.resolve(process.cwd(), templatePath);
                } else if (template && typeof template === 'string') {
                    srcDir = resolveTemplateDirForRuntime(template);
                    if (!srcDir) throw new Error(`Template "${template}" not found.`);
                }
                if (!srcDir) throw new Error('"template" or "templatePath" is required.');

                const assetVersion = Date.now().toString(36);
                const outDir = materializeTemplateToTempDir(srcDir, reportData, {
                    templateVars: templateVars ?? {},
                    assetVersion,
                });
                let fileId, reportUrl;
                try {
                    const result = await uploadDirectory(outDir, { title, reportData, assetVersion });
                    fileId = result?.fileId;
                    reportUrl = result?.downloadUrl;
                } finally {
                    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
                }

                console.error(`[Report] Final Report URL: ${reportUrl}`);

                const raw = await postJson('/agent/reports', { title, summary, reportUrl, fileId, deliveries });
                let result;
                try { result = JSON.parse(raw); } catch { throw new Error(`Invalid /agent/reports response: ${raw}`); }
                if (result?.success !== true) throw new Error(`Report publish failed: ${raw}`);
                if (typeof result?.inserted === 'number' && result.inserted <= 0) {
                    throw new Error('Report publish failed: no recipients delivered (inserted=0)');
                }
                console.log(JSON.stringify({
                    ...result,
                    reportId: result?.reportId || fileId || reportUrl,
                    url: result?.url || reportUrl,
                }));
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (err) {
        const msg = String(err?.message || '');
        const hint = /certificate|UNABLE_TO_VERIFY|self signed|CERT_/i.test(msg)
            ? 'Certificate error. Check PLATFORM_BASE_URL and TLS cert. For local dev use http://127.0.0.1:3000.'
            : undefined;
        console.error(JSON.stringify({ status: 'error', message: msg, hint, stack: err?.stack }));
        process.exit(1);
    }
}

if (process.argv[1]) {
    let invokedPath, currentPath;
    try { invokedPath = fs.realpathSync(path.resolve(process.argv[1])); } catch { invokedPath = path.resolve(process.argv[1]); }
    try { currentPath = fs.realpathSync(__filename); } catch { currentPath = __filename; }
    if (invokedPath === currentPath) main();
}
