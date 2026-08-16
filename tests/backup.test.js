const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptBackup, encryptBackup } = require('../local-hub/src/backup.js');

test('备份可由正确密码恢复且错误密码不会泄露内容', () => {
  const encrypted = encryptBackup({ tasks: [{ title: '还款' }] }, 'correct-horse-battery-staple');
  assert.deepEqual(decryptBackup(encrypted, 'correct-horse-battery-staple'), { tasks: [{ title: '还款' }] });
  assert.throws(() => decryptBackup(encrypted, 'incorrect-password'), /密码错误/);
});
