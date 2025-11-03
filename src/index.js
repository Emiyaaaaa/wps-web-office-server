const Koa = require('koa');
const Router = require('koa-router');
const send = require('koa-send');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = new Koa();
const router = new Router();

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

router.get('/', async (ctx) => {
  ctx.body = 'Hello World';
});

router.get('/v3/3rd/files/:fileId', async (ctx) => {
  const fileId = ctx.params.fileId;
  const filePath = getFilePathFromId(fileId);
  if (!fileExists(filePath)) {
    ctx.status = 404;
    ctx.body = { message: 'file not found' };
    return;
  }
  const stats = fs.statSync(filePath);
  ctx.body = {
    id: fileId,
    name: path.basename(filePath),
    version: 1,
    size: stats.size,
    create_time: toIntSeconds(stats.birthtimeMs || Date.now()),
    modify_time: toIntSeconds(stats.mtimeMs || Date.now()),
    creator_id: 'system',
    modifier_id: 'system',
  };
});

router.get('/v3/3rd/files/:fileId/download', async (ctx) => {
  const fileId = ctx.params.fileId;
  const filePath = getFilePathFromId(fileId);
  if (!fileExists(filePath)) {
    ctx.status = 404;
    ctx.body = { message: 'file not found' };
    return;
  }
  const baseUrl = `${ctx.protocol}://${ctx.host}`;
  const url = `${baseUrl}/public/${encodeURIComponent(path.basename(filePath))}`;
  const digest = computeMd5(filePath);
  ctx.body = {
    url,
    digest,
    digest_type: 'md5',
    headers: {},
  };
});

router.get(/^\/public\/(.+)$/i, async (ctx) => {
  const requestedPath = ctx.captures && ctx.captures[0];
  if (!requestedPath) {
    ctx.status = 404;
    ctx.body = { message: 'file not found' };
    return;
  }
  // Force download
  const filename = path.basename(requestedPath);
  ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await send(ctx, requestedPath, { root: publicDir });
});

app.use(router.routes());
app.use(router.allowedMethods());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

