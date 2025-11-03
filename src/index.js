const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

const publicDir = path.join(__dirname, '..', 'public');

const toIntSeconds = (ms) => Math.floor(ms / 1000);

function sanitizeFileId(fileId) {
  return path.basename(fileId);
}

function getFilePathFromId(fileId) {
  const safeId = sanitizeFileId(fileId);
  return path.join(publicDir, safeId);
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (e) {
    return false;
  }
}

function computeMd5(filePath) {
  const hash = crypto.createHash('md5');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/v3/3rd/files/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const filePath = getFilePathFromId(fileId);
  if (!fileExists(filePath)) {
    res.status(404).json({ message: 'file not found' });
    return;
  }
  const stats = fs.statSync(filePath);
  res.json({
    code: 0,
    data: {
      id: fileId,
      name: path.basename(filePath),
      version: 1,
      size: stats.size,
      create_time: toIntSeconds(stats.birthtimeMs || Date.now()),
      modify_time: toIntSeconds(stats.mtimeMs || Date.now()),
      creator_id: 'system',
      modifier_id: 'system',
    }
  });
});

app.get('/v3/3rd/files/:fileId/download', (req, res) => {
  const fileId = req.params.fileId;
  const filePath = getFilePathFromId(fileId);
  if (!fileExists(filePath)) {
    res.json({ code: 40004 })
    return;
  }
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/public/${encodeURIComponent(path.basename(filePath))}`;
  const digest = computeMd5(filePath);
  res.json({
    code: 0,
    data: {
      url,
      digest,
      digest_type: 'md5',
      headers: {},
    }
  });
});

app.get(/^\/public\/(.+)$/i, (req, res) => {
  const requestedPath = req.params[0];
  if (!requestedPath) {
    res.json({ code: 40004 })
    return;
  }
  const absolutePath = path.join(publicDir, requestedPath);
  if (!fileExists(absolutePath)) {
    res.json({ code: 40004 })
    return;
  }
  const filename = path.basename(absolutePath);
  res.download(absolutePath, filename);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

