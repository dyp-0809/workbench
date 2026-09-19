const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentHub } = require('../local-hub/src/content-hub.js');

async function withHub({ skillsDirectory, skillSources, dataDirectory }, run) {
  const ownsDataDirectory = !dataDirectory;
  const databaseDirectory = dataDirectory || fs.mkdtempSync(path.join(os.tmpdir(), 'x-skills-data-'));
  const hub = await createContentHub({ dataDirectory: databaseDirectory, skillsDirectory, skillSources, now: () => new Date('2026-09-15T00:00:00.000Z') });
  const address = await hub.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run({ baseUrl, dataDirectory: databaseDirectory });
  } finally {
    await hub.close();
    if (ownsDataDirectory) fs.rmSync(databaseDirectory, { recursive: true, force: true });
  }
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

function writeSkill(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('技能目录递归扫描并返回显式 agent 类型和未分类项', async () => {
  const skillsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-skills-root-'));
  try {
    writeSkill(skillsDirectory, 'alpha/SKILL.md', `---\nname: Alpha Skill\ndescription: 处理 Alpha 工作流\nagentType: builder\n---\n\n# Alpha\n\nUse **Alpha**.\n`);
    writeSkill(skillsDirectory, 'waza/skills/beta/SKILL.md', `---\nname: Beta Skill\ndescription: Beta description\n---\n\n## Beta\n`);
    fs.mkdirSync(path.join(skillsDirectory, 'broken', 'SKILL.md'), { recursive: true });

    await withHub({ skillsDirectory }, async ({ baseUrl }) => {
      const result = await request(baseUrl, '/v1/skills');
      assert.equal(result.response.status, 200);
      assert.deepEqual(result.payload.skills.map(({ id }) => id), ['alpha/SKILL.md', 'waza/skills/beta/SKILL.md']);
      assert.equal(result.payload.skills[0].name, 'Alpha Skill');
      assert.equal(result.payload.skills[1].name, 'Beta Skill');
      assert.equal(result.payload.skills[0].agentType, 'builder');
      assert.equal(result.payload.skills[1].agentType, '未分类');
      assert.equal(result.payload.skills[0].content, '---\nname: Alpha Skill\ndescription: 处理 Alpha 工作流\nagentType: builder\n---\n\n# Alpha\n\nUse **Alpha**.\n');
      assert.equal(result.payload.warnings.length, 1);
      assert.match(result.payload.warnings[0].path, /broken\/SKILL\.md$/);
    });
  } finally {
    fs.rmSync(skillsDirectory, { recursive: true, force: true });
  }
});

test('技能目录按 agent 来源聚合并返回路径和数量', async () => {
  const roots = ['pi', 'omp', 'codex', 'hermes'].map((agent) => ({
    id: agent,
    label: agent === 'omp' ? 'OMP' : agent[0].toUpperCase() + agent.slice(1),
    directory: fs.mkdtempSync(path.join(os.tmpdir(), `x-skills-${agent}-`))
  }));
  try {
    roots.forEach((source, index) => {
      writeSkill(source.directory, `skill-${index}/SKILL.md`, `---\nname: ${source.label} Skill\n---\n\n# ${source.label}\n`);
    });
    await withHub({ skillSources: roots }, async ({ baseUrl }) => {
      const result = await request(baseUrl, '/v1/skills');
      assert.equal(result.response.status, 200);
      assert.deepEqual(result.payload.agents, roots.map((source) => ({ id: source.id, label: source.label, count: 1 })));
      assert.deepEqual(result.payload.skills.map(({ id }) => id), roots.map((source, index) => `${source.id}:skill-${index}/SKILL.md`));
      assert.equal(result.payload.skills[0].agentLabel, 'Pi');
      assert.match(result.payload.skills[0].path, /x-skills-pi-.*\/skill-0\/SKILL\.md$/);
    });
  } finally {
    roots.forEach((source) => fs.rmSync(source.directory, { recursive: true, force: true }));
  }
});

test('素材列表接口支持 GET 并返回已保存素材', async () => {
  const skillsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-skills-materials-'));
  try {
    await withHub({ skillsDirectory }, async ({ baseUrl }) => {
      const created = await request(baseUrl, '/v1/materials', {
        method: 'POST',
        body: JSON.stringify({ content: '可复用的素材内容', topic: '测试', mayQuoteVerbatim: true })
      });
      assert.equal(created.response.status, 201);

      const result = await request(baseUrl, '/v1/materials');
      assert.equal(result.response.status, 200);
      assert.deepEqual(result.payload.materials.map((material) => material.id), [created.payload.material.id]);
      assert.equal(result.payload.materials[0].mayQuoteVerbatim, true);
    });
  } finally {
    fs.rmSync(skillsDirectory, { recursive: true, force: true });
  }
});

test('技能备注通过 API 持久化并在服务重启后回读', async () => {
  const skillsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-skills-notes-'));
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-skills-data-'));
  writeSkill(skillsDirectory, 'alpha/SKILL.md', '---\nname: Alpha Skill\n---\n\n# Alpha\n');
  try {
    await withHub({ skillsDirectory, dataDirectory }, async ({ baseUrl }) => {
      const updated = await request(baseUrl, `/v1/skills/${encodeURIComponent('alpha/SKILL.md')}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: '用于研究阶段。' })
      });
      assert.equal(updated.response.status, 200);
      assert.equal(updated.payload.skill.note, '用于研究阶段。');
    });

    await withHub({ skillsDirectory, dataDirectory }, async ({ baseUrl }) => {
      const result = await request(baseUrl, '/v1/skills');
      assert.equal(result.response.status, 200);
      assert.equal(result.payload.skills[0].note, '用于研究阶段。');
    });
  } finally {
    fs.rmSync(skillsDirectory, { recursive: true, force: true });
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('技能备注接口拒绝目录外和不存在的 skill 标识', async () => {
  const skillsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'x-skills-invalid-'));
  try {
    writeSkill(skillsDirectory, 'alpha/SKILL.md', '---\nname: Alpha Skill\n---\n');
    await withHub({ skillsDirectory }, async ({ baseUrl }) => {
      const traversal = await request(baseUrl, `/v1/skills/${encodeURIComponent('../outside/SKILL.md')}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: '不应保存' })
      });
      assert.equal(traversal.response.status, 404);

      const missing = await request(baseUrl, `/v1/skills/${encodeURIComponent('missing/SKILL.md')}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: '不应保存' })
      });
      assert.equal(missing.response.status, 404);
    });
  } finally {
    fs.rmSync(skillsDirectory, { recursive: true, force: true });
  }
});
