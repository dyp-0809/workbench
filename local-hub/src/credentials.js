function createCredentialStore(db, now = () => new Date()) {
  const read = db.prepare('SELECT value FROM credentials WHERE name = ?');
  const write = db.prepare(`INSERT INTO credentials(name, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  const remove = db.prepare('DELETE FROM credentials WHERE name = ?');

  return {
    get(name) {
      const row = read.get(String(name));
      return row?.value ?? null;
    },
    set(name, value) {
      write.run(String(name), String(value), now().toISOString());
    },
    delete(name) {
      remove.run(String(name));
    }
  };
}

module.exports = { createCredentialStore };
