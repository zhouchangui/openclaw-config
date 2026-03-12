import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const DEFAULT_REPORT_SKILL_SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../skills/report/scripts/index.js'
);

function parseJson(value, context) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${context} did not return valid JSON: ${error.message}`);
  }
}

function extractErrorMessage(stderr) {
  const text = String(stderr || '').trim();
  if (!text) {
    return 'report skill failed with empty stderr';
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.message === 'string' && parsed.message) {
      return parsed.message;
    }
  } catch {
    return text;
  }

  return text;
}

export function resolveReportSkillScriptPath(env = process.env) {
  return env.REPORT_SKILL_SCRIPT_PATH
    ? path.resolve(env.REPORT_SKILL_SCRIPT_PATH)
    : DEFAULT_REPORT_SKILL_SCRIPT_PATH;
}

export function listMissingReportSkillCredentials(env = process.env) {
  const missing = [];
  const hasToken = Boolean(env.AGENT_TOKEN);
  const hasAppCredentials = Boolean(
    (env.AGENT_APP_ID || env.DDM_APP_ID) &&
    (env.AGENT_APP_SECRET || env.DDM_APP_SECRET)
  );

  if (!hasToken && !hasAppCredentials) {
    missing.push('AGENT_TOKEN or AGENT_APP_ID/AGENT_APP_SECRET');
  }

  const scriptPath = resolveReportSkillScriptPath(env);
  if (!existsSync(scriptPath)) {
    missing.push(`REPORT_SKILL_SCRIPT_PATH (${scriptPath})`);
  }

  return missing;
}

async function runReportSkillCommand(command, input, { cwd, env = process.env } = {}) {
  const scriptPath = resolveReportSkillScriptPath(env);
  if (!existsSync(scriptPath)) {
    throw new Error(`Report skill script not found: ${scriptPath}`);
  }

  try {
    const { stdout } = await execFile('node', [scriptPath, command, JSON.stringify(input)], {
      cwd,
      env
    });
    return parseJson(stdout, `report skill ${command}`);
  } catch (error) {
    throw new Error(extractErrorMessage(error.stderr || error.message));
  }
}

export async function publishReportWithSkill({
  templatePath,
  title,
  summary,
  reportData,
  deliveries,
  cwd,
  env = process.env
}) {
  if (!templatePath || !path.isAbsolute(templatePath)) {
    throw new Error('templatePath must be an absolute path.');
  }

  if (!title) {
    throw new Error('title is required for report skill publish.');
  }

  if (!summary) {
    throw new Error('summary is required for report skill publish.');
  }

  const result = await runReportSkillCommand(
    'publish',
    {
      templatePath,
      title,
      summary,
      reportData,
      ...(Array.isArray(deliveries) && deliveries.length > 0 ? { deliveries } : {})
    },
    { cwd, env }
  );

  if (result?.success !== true) {
    throw new Error('report skill publish did not return success=true');
  }

  if (!result.reportId || !result.url) {
    throw new Error('report skill publish response is missing reportId or url');
  }

  return {
    platform: 'ddm',
    reportId: result.reportId,
    url: result.url,
    publishedAt: new Date().toISOString()
  };
}
