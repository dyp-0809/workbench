const crypto = require('node:crypto');

function encryptBackup(snapshot, password) {
  if (String(password || '').length < 12) throw new Error('备份密码至少需要 12 个字符。');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(snapshot), 'utf8'), cipher.final()]);
  return JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), payload: payload.toString('base64') });
}

function decryptBackup(encrypted, password) {
  const archive = JSON.parse(encrypted);
  if (archive.version !== 1 || archive.algorithm !== 'aes-256-gcm') throw new Error('备份格式不受支持。');
  try {
    const key = crypto.scryptSync(password, Buffer.from(archive.salt, 'base64'), 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(archive.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(archive.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(archive.payload, 'base64')), decipher.final()]).toString('utf8'));
  } catch { throw new Error('备份密码错误或文件已损坏。'); }
}

module.exports = { decryptBackup, encryptBackup };
