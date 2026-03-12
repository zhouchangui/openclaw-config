import { writeJsonFile } from './io.mjs';

export function buildPublishResult({
  reportType,
  key,
  status,
  publish = false,
  dryRun = true,
  platform = null,
  reportId = null,
  url = null,
  bucket = null,
  path = null,
  uploadedAt = null,
  publishedAt = null,
  markdownPath = null,
  htmlPath = null,
  dataPath = null,
  messageSummary = null,
  notifyStatus = 'skipped',
  notifyTarget = null,
  notifiedAt = null,
  issues = []
}) {
  if (!reportType) {
    throw new Error('reportType is required.');
  }

  if (!key) {
    throw new Error('key is required.');
  }

  if (!status) {
    throw new Error('status is required.');
  }

  return {
    ok: status !== 'failed',
    reportType,
    key,
    status,
    publish,
    dryRun,
    platform,
    reportId,
    url,
    bucket,
    path,
    uploadedAt,
    publishedAt,
    markdownPath,
    htmlPath,
    dataPath,
    messageSummary,
    notifyStatus,
    notifyTarget,
    notifiedAt,
    issues
  };
}

export async function writePublishResult(filePath, result) {
  await writeJsonFile(filePath, result);
  return result;
}
