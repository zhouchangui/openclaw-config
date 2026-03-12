import path from 'node:path';

import { buildPublishResult, writePublishResult } from './publish-result.mjs';
import { listMissingReportSkillCredentials, publishReportWithSkill } from './report-skill-publish.mjs';

function dedupeIssues(issues) {
  return Array.from(new Set(issues.filter(Boolean)));
}

function mergeStatus(baseStatus, { publish, dryRun, publishIssues, url }) {
  if (baseStatus === 'failed') {
    return 'failed';
  }

  if (publish && !dryRun) {
    if (publishIssues.length > 0 || !url) {
      return 'failed';
    }
    return 'published';
  }

  if (baseStatus === 'partial' || publishIssues.length > 0) {
    return 'partial';
  }

  return baseStatus;
}

export async function finalizePublishFlow({
  reportType,
  key,
  status,
  publish = false,
  dryRun = true,
  workspaceRoot,
  templatePath,
  artifacts,
  reportData,
  messageSummary,
  env = process.env
}) {
  const publishIssues = [];
  let publishTarget = {
    platform: publish ? 'ddm' : null,
    reportId: null,
    url: null,
    publishedAt: null
  };

  if (publish) {
    if (dryRun) {
      publishTarget = {
        platform: 'ddm',
        reportId: `dry-run:${reportType}:${key}`,
        url: `dry-run://ddm/${reportType}/${key}`,
        publishedAt: new Date().toISOString()
      };
    } else {
      const missing = listMissingReportSkillCredentials(env);
      if (missing.length > 0) {
        const message = `Missing required publish credentials: ${missing.join(', ')}`;
        const failureResult = buildPublishResult({
          reportType,
          key,
          status: 'failed',
          publish,
          dryRun,
          platform: 'ddm',
          reportId: null,
          url: null,
          bucket: null,
          path: path.relative(workspaceRoot, artifacts.htmlPath),
          uploadedAt: null,
          publishedAt: null,
          markdownPath: artifacts.markdownPath,
          htmlPath: artifacts.htmlPath,
          dataPath: artifacts.dataPath,
          messageSummary,
          notifyStatus: 'skipped',
          notifyTarget: null,
          notifiedAt: null,
          issues: [message]
        });
        await writePublishResult(artifacts.publishResultPath, failureResult);
        throw new Error(message);
      }

      try {
        publishTarget = await publishReportWithSkill({
          cwd: workspaceRoot,
          templatePath,
          title: reportData?.title || `${reportType} report`,
          summary: reportData?.conclusion?.text || reportData?.summary || reportData?.title || `${reportType} report`,
          reportData,
          env,
          deliveries: undefined
        });
      } catch (error) {
        const issue = String(error.message || error);
        publishIssues.push(issue);
        const failureResult = buildPublishResult({
          reportType,
          key,
          status: 'failed',
          publish,
          dryRun,
          platform: 'ddm',
          reportId: null,
          url: null,
          bucket: null,
          path: path.relative(workspaceRoot, artifacts.htmlPath),
          uploadedAt: null,
          publishedAt: null,
          markdownPath: artifacts.markdownPath,
          htmlPath: artifacts.htmlPath,
          dataPath: artifacts.dataPath,
          messageSummary,
          notifyStatus: 'skipped',
          notifyTarget: null,
          notifiedAt: null,
          issues: dedupeIssues(publishIssues)
        });
        await writePublishResult(artifacts.publishResultPath, failureResult);
        throw error;
      }
    }
  }

  const issues = dedupeIssues(publishIssues);
  const publishResult = buildPublishResult({
    reportType,
    key,
    status: mergeStatus(status, {
      publish,
      dryRun,
      publishIssues: issues,
      url: publishTarget.url
    }),
    publish,
    dryRun,
    platform: publishTarget.platform,
    reportId: publishTarget.reportId,
    url: publishTarget.url,
    bucket: null,
    path: path.relative(workspaceRoot, artifacts.htmlPath),
    uploadedAt: null,
    publishedAt: publishTarget.publishedAt,
    markdownPath: artifacts.markdownPath,
    htmlPath: artifacts.htmlPath,
    dataPath: artifacts.dataPath,
    messageSummary,
    notifyStatus: 'skipped',
    notifyTarget: null,
    notifiedAt: null,
    issues
  });

  await writePublishResult(artifacts.publishResultPath, publishResult);
  return publishResult;
}
