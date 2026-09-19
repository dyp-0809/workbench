import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Alert, AlertDescription, AlertTitle } from '@appica/ui-react/alert';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogClose } from '@appica/ui-react/alert-dialog';
import { Badge } from '@appica/ui-react/badge';
import { Button } from '@appica/ui-react/button';
import { Skeleton } from '@appica/ui-react/skeleton';
import { Card } from '@appica/ui-react/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@appica/ui-react/dialog';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Input } from '@appica/ui-react/input';
import { Tabs, TabsList, TabsTrigger } from '@appica/ui-react/tabs';
import { Textarea } from '@appica/ui-react/textarea';
import { useReducedMotion } from '@appica/ui-react/hooks/use-reduced-motion';
import { Bolt, ChevronRight, Copy, FileText, Refresh, Search } from '@appica/icons-react';
import { motion } from 'motion/react';
import { api, copyToClipboard, Empty, LoadingButton } from '@personal-workbench/core';

const UNCLASSIFIED = '未分类';

function readSkillPageState() {
  if (typeof window === 'undefined') return { agent: '', query: '' };
  const params = new URLSearchParams(window.location.search);
  return { agent: params.get('agent') || params.get('type') || '', query: params.get('query') || '' };
}

function syncSkillPageState(state) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (state.agent) params.set('agent', state.agent);
  if (state.query) params.set('query', state.query);
  const search = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
}

function safeMarkdownUrl(value) {
  try {
    const url = new URL(value, 'https://local-workbench.invalid');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}

function markdownComponents() {
  return {
    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
    img: () => null,
    pre: ({ node, ...props }) => <pre {...props} className="max-w-full overflow-x-auto overscroll-contain rounded-[var(--radius-md)] bg-background-muted p-3 text-xs leading-5" />,
    code: ({ node, inline, ...props }) => inline
      ? <code {...props} className="rounded bg-background-muted px-1 py-0.5 text-xs" />
      : <code {...props} />
  };
}

function SkillCard({ skill, onOpen, onCopyPath, index }) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.32, delay: Math.min(index * 0.045, 0.24), ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={reduced ? undefined : { scale: 0.995 }}
      className="ai-skill-card"
    >
      <button type="button" className="ai-skill-card-trigger" onClick={() => onOpen(skill)}>
        <div className="ai-skill-card-top">
          <span className="ai-skill-icon" aria-hidden="true"><FileText /></span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="ai-skill-card-title">{skill.name}</h3>
                <p className="ai-skill-card-id">{skill.id}</p>
              </div>
              <ChevronRight className="ai-skill-card-arrow" aria-hidden="true" />
            </div>
          </div>
        </div>
        <p className="ai-skill-card-description">{skill.description || '没有描述。'}</p>
        {skill.note && <p className="ai-skill-card-note">备注：{skill.note}</p>}
      </button>
      <div className="ai-skill-card-footer">
        <Badge variant="outline" size="sm">{skill.agentLabel || skill.agent || UNCLASSIFIED}</Badge>
        <span className="ai-skill-card-date">更新于 {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(skill.updatedAt))}</span>
        <div className="ai-skill-card-footer-actions">
          <Button type="button" size="sm" variant="ghost" onClick={() => void onCopyPath(skill)}>
            <Copy data-icon="start" />
            复制路径
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(skill)}>查看详情</Button>
        </div>
      </div>
    </motion.article>
  );
}

function SkillLoadingState() {
  return (
    <div className="ai-loading-state" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在扫描本机 skill…</span>
      <div className="ai-skill-grid ai-loading-grid" aria-hidden="true">
        {[1, 2, 3, 4].map((item) => <Skeleton key={item} effect="shimmer" className="h-64" />)}
      </div>
    </div>
  );
}

const SkillGrid = memo(function SkillGrid({ skills, onOpen, onCopyPath }) {
  return (
    <div className={`ai-skill-grid ${skills.length > 50 ? 'is-long-list' : ''}`}>
      {skills.map((skill, index) => <SkillCard key={skill.id} skill={skill} index={index} onOpen={onOpen} onCopyPath={onCopyPath} />)}
    </div>
  );
});

const SkillDetailDialog = memo(function SkillDetailDialog({
  skill,
  noteDraft,
  noteSaving,
  noteError,
  closeConfirmOpen,
  onOpenChange,
  onClose,
  onCopyPath,
  onNoteChange,
  onSave,
  onDiscard,
  onCloseConfirmChange
}) {
  return (
    <>
      <Dialog open={Boolean(skill)} onOpenChange={onOpenChange}>
        <DialogContent className="h-[min(92dvh,56rem)] max-h-[calc(100dvh-2rem)] sm:w-180">
          <DialogHeader>
            <DialogTitle>{skill?.name || '能力详情'}</DialogTitle>
            <DialogDescription>{skill ? <>来源：{skill.agentLabel || skill.agent || UNCLASSIFIED} · <span translate="no">{skill.id}</span></> : ''}</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {skill && <div className="flex flex-col gap-5 px-6 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">来源：{skill.agentLabel || skill.agent || UNCLASSIFIED}</Badge>
                <span className="break-all text-xs text-foreground-muted" translate="no">{skill.id}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-background-muted p-3">
                <code className="min-w-0 flex-1 break-all text-xs text-foreground-muted">{skill.path}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => void onCopyPath(skill)}>
                  <Copy data-icon="start" />复制路径
                </Button>
              </div>
              <div className="min-w-0 text-sm leading-6 text-foreground-strong [&_a]:text-primary [&_a]:underline [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ms-5 [&_li]:list-disc [&_p]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:text-start">
                <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeMarkdownUrl} components={markdownComponents()}>{skill.content}</ReactMarkdown>
              </div>
              <Field>
                <FieldLabel htmlFor="skill-note">备注</FieldLabel>
                <Textarea id="skill-note" name="note" autoComplete="off" rows={4} value={noteDraft} onChange={onNoteChange} placeholder="记录这个 skill 的使用场景或注意事项…" />
                {noteError && <p className="m-0 mt-1 text-xs text-error-emphasis" role="alert">{noteError}</p>}
              </Field>
            </div>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="soft" onClick={onClose}>关闭</Button>
            <LoadingButton loading={noteSaving} disabled={!skill || noteDraft === (skill.note || '')} onClick={onSave}>保存备注</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={closeConfirmOpen} onOpenChange={onCloseConfirmChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的备注？</AlertDialogTitle>
            <AlertDialogDescription>关闭后本次修改不会保存到这台设备。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" variant="soft">继续编辑</Button>} />
            <AlertDialogClose render={<Button type="button" variant="destructive" onClick={onDiscard}>放弃修改</Button>} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

function SkillsPage() {
  const initialState = readSkillPageState();
  const [skills, setSkills] = useState([]);
  const [agents, setAgents] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [activeAgent, setActiveAgent] = useState(initialState.agent);
  const [queryDraft, setQueryDraft] = useState(initialState.query);
  const [query, setQuery] = useState(initialState.query);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [detailSkill, setDetailSkill] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const result = await api('/skills');
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setSkills(result.skills || []);
      setAgents(result.agents || []);
      setWarnings(result.warnings || []);
    } catch (error) {
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setSkills([]);
      setAgents([]);
      setWarnings([]);
      setLoadError(error.message);
    } finally {
      if (mountedRef.current && requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (!agents.length) return;
    if (!agents.some((agent) => agent.id === activeAgent)) setActiveAgent(agents[0].id);
  }, [activeAgent, agents]);

  useEffect(() => {
    syncSkillPageState({ agent: activeAgent, query });
  }, [activeAgent, query]);

  const filteredSkills = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return skills
      .filter((skill) => !activeAgent || skill.agent === activeAgent)
      .filter((skill) => !normalizedQuery || [skill.name, skill.description, skill.note].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery)));
  }, [activeAgent, query, skills]);

  function submitSearch(event) {
    event.preventDefault();
    setQuery(queryDraft.trim());
  }


  const copySkillPath = useCallback(async (skill) => {
    const skillPath = String(skill.path || '');
    if (!skillPath) {
      setNotice('当前 skill 没有可复制的路径。');
      return;
    }
    try {
      if (!await copyToClipboard(skillPath)) throw new Error('复制失败');
      setNotice(`已复制「${skill.name}」的路径。`);
    } catch {
      setNotice('复制路径失败，请检查浏览器剪贴板权限。');
    }
  }, []);
  const openDetail = useCallback((skill) => {
    setDetailSkill(skill);
    setNoteDraft(skill.note || '');
    setNoteError('');
    setCloseConfirmOpen(false);
  }, []);

  const closeDetail = useCallback(() => {
    if (detailSkill && noteDraft !== (detailSkill.note || '')) {
      setCloseConfirmOpen(true);
      return;
    }
    setDetailSkill(null);
    setNoteError('');
  }, [detailSkill, noteDraft]);

  const saveNote = useCallback(async () => {
    if (!detailSkill) return;
    setNoteSaving(true);
    setNoteError('');
    try {
      const result = await api(`/skills/${encodeURIComponent(detailSkill.id)}`, { method: 'PATCH', body: JSON.stringify({ note: noteDraft }) });
      const savedSkill = result.skill;
      setSkills((current) => current.map((skill) => skill.id === savedSkill.id ? savedSkill : skill));
      setDetailSkill(savedSkill);
      setNoteDraft(savedSkill.note || '');
      setNotice('备注已保存。');
    } catch (error) {
      setNoteError(error.message);
    } finally {
      setNoteSaving(false);
    }
  }, [detailSkill, noteDraft]);
  const handleNoteChange = useCallback((event) => setNoteDraft(event.target.value), []);
  const handleDialogOpenChange = useCallback((open) => {
    if (!open) closeDetail();
  }, [closeDetail]);
  const discardNote = useCallback(() => {
    setCloseConfirmOpen(false);
    setDetailSkill(null);
    setNoteError('');
  }, []);
  const activeAgentLabel = agents.find((agent) => agent.id === activeAgent)?.label || '全部来源';

  return (
    <div className="ai-page-shell ai-skills-page">
      <header className="ai-page-hero">
        <div className="ai-page-hero-copy">
          <div className="ai-eyebrow"><Bolt aria-hidden="true" /> AI / 本机能力</div>
          <h1 className="ai-page-title">技能库</h1>
          <p className="ai-page-lede">按用途找到已安装的本机能力，为常用能力补充个人备注。 <span className="ai-page-technical-note" translate="no">来源：Agent · 文件：SKILL.md</span></p>
        </div>
        <div className="ai-page-hero-stat" role="group" aria-label={`已索引 ${skills.length} 个本机能力`}>
          <span>本机能力</span>
          <strong className="tabular-nums">{skills.length}</strong>
          <span>个</span>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} className="ai-page-hero-action">
          <Refresh data-icon="start" />刷新索引
        </Button>
      </header>

      {notice && <p className="ai-live-notice" role="status" aria-live="polite">{notice}</p>}
      {loadError && <Alert variant="error"><AlertTitle>无法加载本机能力</AlertTitle><AlertDescription>{loadError}</AlertDescription><Button type="button" variant="outline" size="sm" onClick={() => void load()}>重试</Button></Alert>}
      {warnings.length > 0 && <Alert variant="warning"><AlertTitle>扫描已部分完成</AlertTitle><AlertDescription>有 {warnings.length} 个文件或目录无法读取；其余能力仍可正常展示。</AlertDescription></Alert>}

      <Card className="ai-control-card">
        <div className="ai-control-heading">
          <div>
            <span className="ai-panel-kicker">浏览</span>
            <h3>找到适合当前任务的能力</h3>
          </div>
          <span className="ai-result-count tabular-nums">{filteredSkills.length} / {skills.length}</span>
        </div>
        {agents.length > 0 && (
          <Tabs value={activeAgent} onValueChange={setActiveAgent} variant="line" className="min-w-0">
            <TabsList className="ai-tabs-list max-w-full overflow-x-auto overscroll-contain" aria-label="按来源筛选">
              {agents.map((agent) => <TabsTrigger key={agent.id} value={agent.id}>{agent.label}<span className="ai-tab-count">{agent.count}</span></TabsTrigger>)}
            </TabsList>
          </Tabs>
        )}
        <form className="ai-search-form" onSubmit={submitSearch}>
          <Input name="query" autoComplete="off" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="搜索名称、描述或备注…" aria-label="搜索本机能力" />
          <Button type="submit" variant="outline"><Search data-icon="start" />搜索</Button>
        </form>
      </Card>

      <div className="ai-results-heading">
        <div>
          <span className="ai-panel-kicker">已索引技能</span>
          <h3>本机能力库</h3>
        </div>
        <span className="text-sm text-foreground-muted">{activeAgentLabel}</span>
      </div>

      {loading ? <SkillLoadingState /> : filteredSkills.length ? (
        <SkillGrid skills={filteredSkills} onOpen={openDetail} onCopyPath={copySkillPath} />
      ) : <Empty description={skills.length ? '没有符合当前条件的本机能力。试试其他关键词或来源。' : '没有发现可用的本机能力。'} className="ai-empty-state" />}

      <SkillDetailDialog
        skill={detailSkill}
        noteDraft={noteDraft}
        noteSaving={noteSaving}
        noteError={noteError}
        closeConfirmOpen={closeConfirmOpen}
        onOpenChange={handleDialogOpenChange}
        onClose={closeDetail}
        onCopyPath={copySkillPath}
        onNoteChange={handleNoteChange}
        onSave={saveNote}
        onDiscard={discardNote}
        onCloseConfirmChange={setCloseConfirmOpen}
      />
    </div>
  );
}

export { SkillsPage };
