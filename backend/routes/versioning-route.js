'use strict';

const express = require('express');
const router = express.Router();

const security = require('../api/security');
const versioning = require('../api/versioning');
const storageUtils = require('../api/storage-utils');
const logger = require('../api/logger');

// ---------------------------------------------------------------------------
// List revisions for a file path (no content, metadata only)
// POST /nexl/versioning/list
// Body: { filePath: string, limit?: number, offset?: number }
// ---------------------------------------------------------------------------
router.post('/list', function (req, res, next) {
  const username = security.getLoggedInUsername(req);
  if (!security.hasReadPermission(username)) {
    security.sendError(res, 'No read permissions');
    return;
  }

  const filePath = req.body.filePath;
  if (!filePath) {
    security.sendError(res, 'filePath is required', 400);
    return;
  }

  try {
    const revisions = versioning.listRevisions(filePath, req.body.limit, req.body.offset);
    res.json({ revisions });
  } catch (e) {
    logger.log.error('Failed to list revisions: ' + e.message);
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Get full content of one revision
// POST /nexl/versioning/get
// Body: { filePath: string, revisionNo: number }
// ---------------------------------------------------------------------------
router.post('/get', function (req, res, next) {
  const username = security.getLoggedInUsername(req);
  if (!security.hasReadPermission(username)) {
    security.sendError(res, 'No read permissions');
    return;
  }

  const filePath = req.body.filePath;
  const revisionNo = parseInt(req.body.revisionNo, 10);
  if (!filePath || isNaN(revisionNo)) {
    security.sendError(res, 'filePath and revisionNo are required', 400);
    return;
  }

  try {
    const revision = versioning.getRevision(filePath, revisionNo);
    if (!revision) {
      security.sendError(res, 'Revision not found', 404);
      return;
    }
    res.json({ revision });
  } catch (e) {
    logger.log.error('Failed to get revision: ' + e.message);
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Restore a revision (re-saves the file + creates a new revision entry)
// POST /nexl/versioning/restore
// Body: { filePath: string, revisionNo: number }
// ---------------------------------------------------------------------------
router.post('/restore', function (req, res, next) {
  const username = security.getLoggedInUsername(req);
  if (!security.hasWritePermission(username)) {
    security.sendError(res, 'No write permissions');
    return;
  }

  const filePath = req.body.filePath;
  const revisionNo = parseInt(req.body.revisionNo, 10);
  if (!filePath || isNaN(revisionNo)) {
    security.sendError(res, 'filePath and revisionNo are required', 400);
    return;
  }

  let revision;
  try {
    revision = versioning.getRevision(filePath, revisionNo);
  } catch (e) {
    logger.log.error('Failed to fetch revision for restore: ' + e.message);
    next(e);
    return;
  }

  if (!revision) {
    security.sendError(res, 'Revision not found', 404);
    return;
  }

  storageUtils.saveFileToStorage(filePath, revision.content, undefined)
    .then(() => {
      try {
        versioning.saveRevision({
          filePath,
          content: revision.content,
          savedBy: username,
          label: `Restored from revision #${revisionNo}`
        });
      } catch (e) {
        logger.log.error('Failed to record restore revision: ' + e.message);
      }
      logger.log.log('verbose', `[${filePath}] restored to revision #${revisionNo} by [${username}]`);
      res.json({});
    })
    .catch(next);
});

// ---------------------------------------------------------------------------
// Soft-delete a revision (admin only)
// POST /nexl/versioning/delete
// Body: { filePath: string, revisionNo: number }
// ---------------------------------------------------------------------------
router.post('/delete', function (req, res, next) {
  if (!security.isAdmin(req)) {
    security.sendError(res, 'Admin access required', 403);
    return;
  }

  const filePath = req.body.filePath;
  const revisionNo = parseInt(req.body.revisionNo, 10);
  if (!filePath || isNaN(revisionNo)) {
    security.sendError(res, 'filePath and revisionNo are required', 400);
    return;
  }

  try {
    versioning.deleteRevision(filePath, revisionNo);
    res.json({});
  } catch (e) {
    logger.log.error('Failed to delete revision: ' + e.message);
    next(e);
  }
});

module.exports = router;
