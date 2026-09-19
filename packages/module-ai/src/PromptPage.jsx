import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@appica/ui-react/button';
import { Popover } from '@appica/ui-react/popover';
import { PopoverContent } from '@appica/ui-react/popover';
import { PopoverTrigger } from '@appica/ui-react/popover';
import { Card } from '@appica/ui-react/card';
import { Skeleton } from '@appica/ui-react/skeleton';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { Switch } from '@appica/ui-react/switch';
import { Badge } from '@appica/ui-react/badge';
import { Alert, AlertTitle, AlertDescription } from '@appica/ui-react/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogClose } from '@appica/ui-react/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@appica/ui-react/dialog';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { useReducedMotion } from '@appica/ui-react/hooks/use-reduced-motion';
import { Bolt, Copy, DotsVertical, Eye, Pencil, Plus, Search, Trash } from '@appica/icons-react';
import { motion } from 'motion/react';
import { api, copyToClipboard, Empty, LoadingButton } from '@personal-workbench/core';

const STATUS_ITEMS = { all: '全部状态', active: '已启用', disabled: '已停用' };

function readPromptFilters() {
  if (typeof window === 'undefined') return { query: '', category: '', status: 'all' };
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  return {
    query: params.get('query') || '',
    category: params.get('category') || '',
    status: Object.hasOwn(STATUS_ITEMS, status) ? status : 'all'
  };
}

function syncPromptFilters(filters) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.category) params.set('category', filters.category);
  if (filters.status !== 'all') params.set('status', filters.status);
  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

function emptyPromptInput() {
  return { title: '', category: '', content: '', notes: '', tagsText: '', enabled: true };
}

function emptyShortPromptInput() {
  return { title: '', category: '思维方式', content: '', notes: '', tagsText: '', enabled: true };
}

function promptInputFrom(prompt) {
  return {
    title: prompt.title,
    category: prompt.category,
    content: prompt.content,
    notes: prompt.notes,
    tagsText: prompt.tags.join('、'),
    enabled: prompt.enabled
  };
}

function parseTags(value) {
  return value.split(/[、,，\n]/).map((tag) => tag.trim()).filter(Boolean);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function PromptEditor({ value, onChange, error }) {
  const shouldAutoFocus = typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches;
  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="error"><AlertTitle>提示词未保存</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <Field>
        <FieldLabel>名称</FieldLabel>
        <Input name="title" autoComplete="off" autoFocus={shouldAutoFocus} required value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} placeholder="例如：拆解复杂问题…" />
      </Field>
      <Field>
        <FieldLabel>分类</FieldLabel>
        <Input name="category" autoComplete="off" required value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })} placeholder="例如：研究、写作、编程…" />
      </Field>
      <Field>
        <FieldLabel>提示词正文</FieldLabel>
        <Textarea name="content" autoComplete="off" required rows={9} value={value.content} onChange={(event) => onChange({ ...value, content: event.target.value })} placeholder="写入可以直接复制使用的提示词…" />
      </Field>
      <Field>
        <FieldLabel>备注 / 使用说明</FieldLabel>
        <Textarea name="notes" autoComplete="off" rows={3} value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="说明适用场景或注意事项（可选）…" />
      </Field>
      <Field>
        <FieldLabel>标签</FieldLabel>
        <Input name="tags" autoComplete="off" value={value.tagsText} onChange={(event) => onChange({ ...value, tagsText: event.target.value })} placeholder="用逗号或顿号分隔，例如：研究、框架…" />
      </Field>
      <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-background-subtle px-3 py-3">
        <span>
          <span className="block text-sm font-medium text-foreground-strong">启用提示词</span>
          <span className="mt-1 block text-xs text-foreground-muted">停用后仍会保留，可通过状态筛选找回。</span>
        </span>
        <Switch aria-label="启用提示词" checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
      </label>
    </div>
  );
}

function PromptLoadingState({ short = false }) {
  const count = short ? 3 : 4;
  const gridClassName = short ? 'ai-short-prompt-grid ai-loading-grid' : 'ai-prompt-grid ai-loading-grid';
  return (
    <div className="ai-loading-state" aria-live="polite" aria-busy="true">
      <span className="sr-only">{short ? '正在加载短提示词…' : '正在加载提示词…'}</span>
      <div className={gridClassName} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => <Skeleton key={index} effect="shimmer" className={short ? 'h-56' : 'h-64'} />)}
      </div>
    </div>
  );
}

function ShortPromptEditor({ value, onChange, error }) {
  const shouldAutoFocus = typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches;
  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="error"><AlertTitle>短提示词未保存</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <Field>
        <FieldLabel>短提示词</FieldLabel>
        <Input name="short-title" autoComplete="off" autoFocus={shouldAutoFocus} required maxLength={200} value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} placeholder="例如：第一性原理…" />
      </Field>
      <Field>
        <FieldLabel>使用说明</FieldLabel>
        <Textarea name="short-content" autoComplete="off" required rows={4} value={value.content} onChange={(event) => onChange({ ...value, content: event.target.value })} placeholder="说明它适合在什么场景下使用…" />
      </Field>
      <Field>
        <FieldLabel>分类</FieldLabel>
        <Input name="short-category" autoComplete="off" value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })} placeholder="例如：思维方式、写作…" />
      </Field>
      <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-background-subtle px-3 py-3">
        <span>
          <span className="block text-sm font-medium text-foreground-strong">启用短提示词</span>
          <span className="mt-1 block text-xs text-foreground-muted">停用后仍会保留，可在后续整理时重新启用。</span>
        </span>
        <Switch aria-label="启用短提示词" checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
      </label>
    </div>
  );
}

function PromptOverflowMenu({ prompt, short = false, onPreview, onEdit, onToggle, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const actionLabel = short ? '短提示词操作' : '提示词操作';

  function runAction(action) {
    setMenuOpen(false);
    action();
  }

  return (
    <>
      <div className="ai-prompt-card-menu">
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger className="ai-prompt-card-menu-trigger" aria-label={`${actionLabel}：${prompt.title}`}><DotsVertical aria-hidden="true" /></PopoverTrigger>
          <PopoverContent arrow={false} className="ai-prompt-menu-content">
            <div className="ai-prompt-menu-list">
              {!short && <Button type="button" variant="ghost" size="sm" className="ai-prompt-menu-item" onClick={() => runAction(() => onPreview(prompt))}><Eye data-icon="start" />预览</Button>}
              <Button type="button" variant="ghost" size="sm" className="ai-prompt-menu-item" onClick={() => runAction(() => onEdit(prompt))}><Pencil data-icon="start" />编辑</Button>
              <Button type="button" variant="ghost" size="sm" className="ai-prompt-menu-item" onClick={() => runAction(() => onToggle(prompt))}>{prompt.enabled ? '停用' : '启用'}</Button>
              <div className="ai-prompt-menu-separator" role="separator" />
              <Button type="button" variant="ghost" size="sm" className="ai-prompt-menu-item is-destructive" onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}><Trash data-icon="start" />删除</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除「{prompt.title}」？</AlertDialogTitle>
            <AlertDialogDescription>{short ? '删除后无法恢复。' : '删除后无法恢复，提示词正文、备注和标签都会被移除。'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" variant="soft">取消</Button>} />
            <AlertDialogClose render={<Button type="button" variant="destructive" onClick={() => onDelete(prompt.id)} />}>
              {short ? '删除短提示词' : '删除提示词'}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ShortPromptCard({ prompt, onCopy, onEdit, onToggle, onDelete, index }) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.3, delay: Math.min(index * 0.04, 0.2), ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.995 }}
      className={`ai-short-prompt-card ${prompt.enabled ? '' : 'is-disabled'}`}
    >
      <div className="ai-short-prompt-heading">
        <span className="ai-short-prompt-mark" aria-hidden="true"><Bolt /></span>
        <Badge variant={prompt.enabled ? 'success' : 'secondary'} size="sm">{prompt.enabled ? '启用' : '停用'}</Badge>
      </div>
      <div>
        <h3 className="ai-short-prompt-title">{prompt.title}</h3>
        <p className="ai-short-prompt-description">{prompt.content}</p>
      </div>
      <div className="ai-short-prompt-meta">
        <Badge variant="outline" size="sm">{prompt.category}</Badge>
        <span>更新于 {formatDateTime(prompt.updatedAt)}</span>
      </div>
      <div className="ai-short-prompt-actions">
        <Button type="button" size="sm" onClick={() => onCopy(prompt)}><Copy data-icon="start" />复制</Button>
        <PromptOverflowMenu short prompt={prompt} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
      </div>
    </motion.article>
  );
}


function PromptCard({ prompt, onPreview, onEdit, onCopy, onToggle, onDelete, index }) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.32, delay: Math.min(index * 0.045, 0.24), ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduced ? undefined : { y: -3 }}
      whileTap={reduced ? undefined : { scale: 0.995 }}
      className={`ai-prompt-card ${prompt.enabled ? '' : 'is-disabled'}`}
    >
      <div className="ai-prompt-card-heading">
        <div className="ai-prompt-card-title-wrap">
          <span className="ai-prompt-icon" aria-hidden="true"><Bolt /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="ai-prompt-card-title">{prompt.title}</h3>
              <Badge variant={prompt.enabled ? 'success' : 'secondary'} size="sm">{prompt.enabled ? '已启用' : '已停用'}</Badge>
            </div>
            <div className="ai-prompt-card-tags">
              <Badge variant="outline" size="sm">{prompt.category}</Badge>
              {prompt.tags.map((tag) => <Badge key={tag} variant="soft" size="sm">{tag}</Badge>)}
            </div>
          </div>
        </div>
        <span className="ai-prompt-card-date">更新于 {formatDateTime(prompt.updatedAt)}</span>
      </div>
      <div className="ai-prompt-content">
        <p>{prompt.content}</p>
      </div>
      {prompt.notes && <p className="ai-prompt-notes">{prompt.notes}</p>}
      <div className="ai-prompt-card-actions">
        <Button type="button" size="sm" onClick={() => onCopy(prompt)}><Copy data-icon="start" />复制</Button>
        <PromptOverflowMenu prompt={prompt} onPreview={onPreview} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
      </div>
    </motion.article>
  );
}

function PromptPage() {
  const [prompts, setPrompts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [shortPrompts, setShortPrompts] = useState([]);
  const [filters, setFilters] = useState(readPromptFilters);
  const [queryDraft, setQueryDraft] = useState(() => readPromptFilters().query);
  const [loading, setLoading] = useState(true);
  const [shortLoading, setShortLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [shortLoadError, setShortLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shortDialogOpen, setShortDialogOpen] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState(null);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [editingShortPrompt, setEditingShortPrompt] = useState(null);
  const [promptInput, setPromptInput] = useState(emptyPromptInput);
  const [shortPromptInput, setShortPromptInput] = useState(emptyShortPromptInput);
  const [dialogError, setDialogError] = useState('');
  const [shortDialogError, setShortDialogError] = useState('');
  const [saving, setSaving] = useState(false);
  const [shortSaving, setShortSaving] = useState(false);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const shortRequestRef = useRef(0);
  const filtersRef = useRef(filters);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const activeFilters = filtersRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setLoadError('');
    }
    const params = new URLSearchParams({ query: activeFilters.query, category: activeFilters.category, status: activeFilters.status, kind: 'full' });
    try {
      const result = await api(`/prompts?${params.toString()}`);
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setPrompts(result.prompts || []);
      setCategories(result.categories || []);
    } catch (error) {
      if (!mountedRef.current || requestId !== requestRef.current) return;
      setPrompts([]);
      setLoadError(error.message);
    } finally {
      if (mountedRef.current && requestId === requestRef.current) setLoading(false);
    }
  }, []);

  const loadShortPrompts = useCallback(async () => {
    const requestId = ++shortRequestRef.current;
    setShortLoading(true);
    setShortLoadError('');
    try {
      const result = await api('/prompts?kind=short&status=all');
      if (!mountedRef.current || requestId !== shortRequestRef.current) return;
      setShortPrompts(result.prompts || []);
    } catch (error) {
      if (!mountedRef.current || requestId !== shortRequestRef.current) return;
      setShortPrompts([]);
      setShortLoadError(error.message);
    } finally {
      if (mountedRef.current && requestId === shortRequestRef.current) setShortLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [filters, load]);

  useEffect(() => {
    void loadShortPrompts();
    return () => { shortRequestRef.current += 1; };
  }, [loadShortPrompts]);

  function updateFilters(next) {
    const updated = { ...filtersRef.current, ...next };
    filtersRef.current = updated;
    setFilters(updated);
    syncPromptFilters(updated);
  }

  function openCreate() {
    setEditingPrompt(null);
    setPromptInput(emptyPromptInput());
    setDialogError('');
    setDialogOpen(true);
  }

  function openEdit(prompt) {
    setEditingPrompt(prompt);
    setPromptInput(promptInputFrom(prompt));
    setDialogError('');
    setDialogOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setDialogOpen(false);
    setEditingPrompt(null);
    setPromptInput(emptyPromptInput());
    setDialogError('');
  }

  function openShortCreate() {
    setEditingShortPrompt(null);
    setShortPromptInput(emptyShortPromptInput());
    setShortDialogError('');
    setShortDialogOpen(true);
  }

  function openShortEdit(prompt) {
    setEditingShortPrompt(prompt);
    setShortPromptInput(promptInputFrom(prompt));
    setShortDialogError('');
    setShortDialogOpen(true);
  }

  function closeShortEditor() {
    if (shortSaving) return;
    setShortDialogOpen(false);
    setEditingShortPrompt(null);
    setShortPromptInput(emptyShortPromptInput());
    setShortDialogError('');
  }

  async function saveShortPrompt() {
    setShortSaving(true);
    setShortDialogError('');
    try {
      const input = { ...shortPromptInput, kind: 'short', tags: editingShortPrompt?.tags || [] };
      if (editingShortPrompt) {
        await api(`/prompts/${editingShortPrompt.id}`, { method: 'PATCH', body: JSON.stringify(input) });
        setNotice('短提示词已更新。');
      } else {
        await api('/prompts', { method: 'POST', body: JSON.stringify(input) });
        setNotice('短提示词已保存。');
      }
      closeShortEditor();
      await loadShortPrompts();
    } catch (error) {
      setShortDialogError(error.message);
    } finally {
      setShortSaving(false);
    }
  }

  async function toggleShortPrompt(prompt) {
    try {
      await api(`/prompts/${prompt.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !prompt.enabled }) });
      setNotice(prompt.enabled ? '短提示词已停用。' : '短提示词已启用。');
      await loadShortPrompts();
    } catch {
      // API 错误已由工作台 Shell 的全局 Toast 展示。
    }
  }

  async function deleteShortPrompt(id) {
    try {
      await api(`/prompts/${id}`, { method: 'DELETE' });
      setNotice('短提示词已删除。');
      await loadShortPrompts();
    } catch {
      // API 错误已由工作台 Shell 的全局 Toast 展示。
    }
  }

  async function savePrompt() {
    setSaving(true);
    setDialogError('');
    try {
      const input = { ...promptInput, tags: parseTags(promptInput.tagsText) };
      if (editingPrompt) {
        await api(`/prompts/${editingPrompt.id}`, { method: 'PATCH', body: JSON.stringify(input) });
        setNotice('提示词已更新。');
      } else {
        await api('/prompts', { method: 'POST', body: JSON.stringify(input) });
        setNotice('提示词已保存。');
      }
      closeEditor();
      await load();
    } catch (error) {
      setDialogError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt(prompt) {
    try {
      if (!await copyToClipboard(prompt.content)) throw new Error('复制失败');
      setNotice(`「${prompt.title}」已复制。`);
    } catch {
      setNotice('复制失败，请检查浏览器剪贴板权限。');
    }
  }
  async function copyShortPrompt(prompt) {
    try {
      if (!await copyToClipboard(prompt.title)) throw new Error('复制失败');
      setNotice(`「${prompt.title}」已复制。`);
    } catch {
      setNotice('复制失败，请检查浏览器剪贴板权限。');
    }
  }

  async function togglePrompt(prompt) {
    try {
      await api(`/prompts/${prompt.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !prompt.enabled }) });
      setNotice(prompt.enabled ? '提示词已停用。' : '提示词已启用。');
      await load();
    } catch {
      // API 错误已由工作台 Shell 的全局 Toast 展示。
    }
  }

  async function deletePrompt(id) {
    try {
      await api(`/prompts/${id}`, { method: 'DELETE' });
      setNotice('提示词已删除。');
      await load();
    } catch {
      // API 错误已由工作台 Shell 的全局 Toast 展示。
    }
  }

  return (
    <div className="ai-page-shell ai-prompts-page">
      <header className="ai-page-hero">
        <div className="ai-page-hero-copy">
          <div className="ai-eyebrow"><Bolt aria-hidden="true" /> AI / 可复用工作流</div>
          <h1 className="ai-page-title">提示词库</h1>
          <p className="ai-page-lede">把经过验证的工作流沉淀为可复用提示词，搜索、预览，然后一键复制。</p>
        </div>
        <div className="ai-page-stats" role="group" aria-label={`${prompts.length} 条提示词，${categories.length} 个分类`}>
          <div><strong className="tabular-nums">{prompts.length}</strong><span>当前结果</span></div>
          <div><strong className="tabular-nums">{categories.length}</strong><span>个分类</span></div>
        </div>
        <Button onClick={openCreate} className="ai-page-hero-action"><Plus data-icon="start" />新建提示词</Button>
      </header>

      {notice && <p className="ai-live-notice" role="status" aria-live="polite">{notice}</p>}
      {loadError && <Alert variant="error"><AlertTitle>无法加载提示词</AlertTitle><AlertDescription>{loadError}</AlertDescription><Button type="button" variant="outline" size="sm" onClick={() => void load()}>重试</Button></Alert>}

      <Card className="ai-short-prompt-section">
        <div className="ai-short-prompt-header">
          <div>
            <span className="ai-panel-kicker">快速提示</span>
            <h3>短提示词</h3>
            <p>几个字，快速改变思考方向。适合第一性原理、反向思考等高频提醒。</p>
          </div>
          <div className="ai-short-prompt-header-actions">
            <span className="ai-result-count tabular-nums">{shortPrompts.length} 条</span>
            <Button type="button" variant="outline" onClick={openShortCreate}><Plus data-icon="start" />新增短提示词</Button>
          </div>
        </div>
        {shortLoadError && <Alert variant="error"><AlertTitle>无法加载短提示词</AlertTitle><AlertDescription>{shortLoadError}</AlertDescription><Button type="button" variant="outline" size="sm" onClick={() => void loadShortPrompts()}>重试</Button></Alert>}
        {shortLoading ? <PromptLoadingState short /> : shortPrompts.length ? (
          <div className={`ai-short-prompt-grid ${shortPrompts.length > 50 ? 'is-long-list' : ''}`}>
            {shortPrompts.map((prompt, index) => <ShortPromptCard key={prompt.id} prompt={prompt} index={index} onCopy={copyShortPrompt} onEdit={openShortEdit} onToggle={toggleShortPrompt} onDelete={deleteShortPrompt} />)}
          </div>
        ) : <Empty description="还没有短提示词，先保存一个你常用的思考提醒。" className="ai-short-prompt-empty" />}
      </Card>

      <Card className="ai-control-card">
        <div className="ai-control-heading">
          <div>
            <span className="ai-panel-kicker">搜索库</span>
            <h3>从你的工作流中找到答案</h3>
          </div>
          <Badge variant={filters.status === 'all' ? 'secondary' : 'primary'}>{STATUS_ITEMS[filters.status]}</Badge>
        </div>
        <form className="ai-search-form" onSubmit={(event) => { event.preventDefault(); updateFilters({ query: queryDraft.trim() }); }}>
          <Input name="query" autoComplete="off" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="搜索名称、正文、备注或标签…" aria-label="搜索提示词" />
          <Button type="submit" variant="outline"><Search data-icon="start" />搜索</Button>
        </form>
        <div className="ai-filter-grid">
          <Field>
            <FieldLabel>分类</FieldLabel>
            <Select value={filters.category || undefined} onValueChange={(category) => updateFilters({ category: category || '' })}>
              <SelectTrigger clearable><SelectValue placeholder="全部分类" /></SelectTrigger>
              <SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>状态</FieldLabel>
            <Select items={STATUS_ITEMS} value={filters.status} onValueChange={(status) => updateFilters({ status })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="ai-results-heading">
        <div>
          <span className="ai-panel-kicker">精选提示词</span>
          <h3>提示词集合</h3>
        </div>
        <span className="text-sm text-foreground-muted">{filters.category || '全部分类'}</span>
      </div>

      {loading ? <PromptLoadingState /> : prompts.length ? (
        <div className={`ai-prompt-grid ${prompts.length > 50 ? 'is-long-list' : ''}`}>
          {prompts.map((prompt, index) => <PromptCard key={prompt.id} prompt={prompt} index={index} onPreview={setPreviewPrompt} onEdit={openEdit} onCopy={copyPrompt} onToggle={togglePrompt} onDelete={deletePrompt} />)}
        </div>
      ) : <Empty description={filters.query || filters.category || filters.status !== 'all' ? '没有符合条件的提示词。试试其他关键词或筛选条件。' : '还没有提示词，新建一条开始维护。'} className="ai-empty-state" />}

      <Dialog open={dialogOpen} onOpenChange={(nextOpen) => { if (nextOpen) setDialogOpen(true); else closeEditor(); }}>
        <DialogContent className="h-150 max-h-[calc(100dvh-2rem)] sm:w-140">
          <DialogHeader>
            <DialogTitle>{editingPrompt ? '编辑提示词' : '新建提示词'}</DialogTitle>
            <DialogDescription>{editingPrompt ? '修改后保存即可更新本地提示词。' : <>保存后，这条提示词才会保存在这台设备上。 <span className="ai-technical-note" translate="no">存储：SQLite</span></>}</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><div className="px-6 pb-2"><PromptEditor value={promptInput} onChange={setPromptInput} error={dialogError} /></div></DialogBody>
          <DialogFooter>
            <Button type="button" variant="soft" disabled={saving} onClick={closeEditor}>取消</Button>
            <LoadingButton loading={saving} disabled={!promptInput.title.trim() || !promptInput.content.trim()} onClick={savePrompt}>{editingPrompt ? '保存修改' : '保存提示词'}</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shortDialogOpen} onOpenChange={(nextOpen) => { if (nextOpen) setShortDialogOpen(true); else closeShortEditor(); }}>
        <DialogContent className="h-160 max-h-[calc(100dvh-2rem)] sm:w-120">
          <DialogHeader>
            <DialogTitle>{editingShortPrompt ? '编辑短提示词' : '新增短提示词'}</DialogTitle>
            <DialogDescription>保存一个短小、可直接插入思考过程的提醒。</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><div className="px-6 pb-2"><ShortPromptEditor value={shortPromptInput} onChange={setShortPromptInput} error={shortDialogError} /></div></DialogBody>
          <DialogFooter>
            <Button type="button" variant="soft" disabled={shortSaving} onClick={closeShortEditor}>取消</Button>
            <LoadingButton loading={shortSaving} disabled={!shortPromptInput.title.trim() || !shortPromptInput.content.trim()} onClick={saveShortPrompt}>{editingShortPrompt ? '保存修改' : '保存短提示词'}</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={Boolean(previewPrompt)} onOpenChange={(open) => { if (!open) setPreviewPrompt(null); }}>
        <DialogContent className="h-138 max-h-[calc(100dvh-2rem)] sm:w-140">
          <DialogHeader>
            <DialogTitle>{previewPrompt?.title || '提示词预览'}</DialogTitle>
            <DialogDescription>{previewPrompt ? `${previewPrompt.category} · 更新于 ${formatDateTime(previewPrompt.updatedAt)}` : ''}</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {previewPrompt && <div className="flex flex-col gap-4 px-6 pb-2">
              <div className="flex flex-wrap gap-1.5">{previewPrompt.tags.map((tag) => <Badge key={tag} variant="soft" size="sm">{tag}</Badge>)}</div>
              <div className="whitespace-pre-wrap break-words rounded-[var(--radius-md)] border border-border bg-background-subtle p-4 text-sm leading-6 text-foreground-strong">{previewPrompt.content}</div>
              {previewPrompt.notes && <div><div className="text-xs font-medium text-foreground-muted">使用说明</div><p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground-strong">{previewPrompt.notes}</p></div>}
            </div>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="soft" onClick={() => setPreviewPrompt(null)}>关闭</Button>
            {previewPrompt && <Button type="button" onClick={async () => { await copyPrompt(previewPrompt); setPreviewPrompt(null); }}><Copy data-icon="start" />复制提示词</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { PromptPage };
