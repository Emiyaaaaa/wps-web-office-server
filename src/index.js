const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
// Parse JSON bodies for upload-related APIs
app.use(express.json());

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

// 三阶段保存 - 准备上传阶段
// GET /v3/3rd/files/:file_id/upload/prepare
app.get('/v3/3rd/files/:file_id/upload/prepare', (req, res) => {
  res.json({ code: 0, data: { digest_types: ['sha1'] }, message: '' });
});

// 内部接收上传实体的存储端点（第二阶段返回的 PUT 地址）
// 通过原始字节流接收文件并写入 public 目录，文件名使用 file_id
app.put('/v3/3rd/files/:file_id/upload/storage', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
  const fileId = req.params.file_id;
  const filePath = getFilePathFromId(fileId.replace('_', '.'));
  try {
    fs.writeFileSync(filePath, req.body);
    res.status(200).end();
  } catch (e) {
    res.status(500).json({ code: 50000, message: 'store failed' });
  }
});

// 三阶段保存 - 获取上传地址
// POST /v3/3rd/files/:file_id/upload/address
app.post('/v3/3rd/files/:file_id/upload/address', (req, res) => {
  const fileId = req.params.file_id;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/v3/3rd/files/${encodeURIComponent(fileId)}/upload/storage`;
  res.json({
    code: 0,
    data: {
      method: 'PUT',
      url,
      headers: {},
      params: {},
      send_back_params: { uploaded_via: 'local' }
    },
    message: ''
  });
});

// 三阶段保存 - 完成上传
// POST /v3/3rd/files/:file_id/upload/complete
app.post('/v3/3rd/files/:file_id/upload/complete', (req, res) => {
  const fileId = req.params.file_id;
  const filePath = getFilePathFromId(fileId.replace('_', '.'));
  if (!fileExists(filePath)) {
    res.json({ code: 40004 });
    return;
  }
  const stats = fs.statSync(filePath);
  const nowCreate = toIntSeconds(stats.birthtimeMs || Date.now());
  const nowModify = toIntSeconds(stats.mtimeMs || Date.now());
  const nameFromRequest = (req.body && req.body.request && req.body.request.name) || path.basename(filePath);
  res.json({
    code: 0,
    data: {
      id: String(fileId),
      name: String(nameFromRequest),
      version: 1,
      size: stats.size,
      create_time: nowCreate,
      modify_time: nowModify,
      creator_id: 'system',
      modifier_id: 'system'
    },
    message: ''
  });
});

app.get('/v3/3rd/users', (req, res) => {
  const userIdsParam = req.query.user_ids;
  const fallbackIds = ['system'];
  const userIds = Array.isArray(userIdsParam)
    ? userIdsParam
    : (typeof userIdsParam === 'string' && userIdsParam)
      ? userIdsParam.split(',').filter(Boolean)
      : fallbackIds;

  const users = userIds.map((id) => ({
    id: String(id),
    name: id === 'system' ? 'system' : `user name${String(id)}`,
    avatar_url: 'https://avatars.githubusercontent.com/u/37606228?v=4',
  }));

  res.json({ code: 0, data: users });
});

app.get('/v3/3rd/files/:fileId', (req, res) => {
  const fileId = req.params.fileId.replace('_', '.');
  const filePath = getFilePathFromId(fileId);
  if (!fileExists(filePath)) {
    res.json({ code: 40004 })
    return;
  }
  const stats = fs.statSync(filePath);
  res.json({
    code: 0,
    data: {
      id: req.params.fileId,
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
  const fileId = req.params.fileId.replace('_', '.');
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

app.get('/v3/3rd/files/:file_id/permission', (req, res) => {
  const fileId = (req.params.file_id || '').replace('_', '.');
  const filePath = getFilePathFromId(fileId);
  if (!fileExists(filePath)) {
    res.json({ code: 40004 })
    return;
  }
  res.json({
    code: 0,
    data: {
      user_id: 'system',
      read: 1,
      update: 1,
      download: 1,
      rename: 1,
      history: 1,
      copy: 1,
      print: 1,
      saveas: 1,
      comment: 1,
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

