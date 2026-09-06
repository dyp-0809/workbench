import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, buttonVariants } from '@appica/ui-react/button';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@appica/ui-react/table';
import { Field, FieldLabel, FieldDescription } from '@appica/ui-react/field';
import { Badge } from '@appica/ui-react/badge';
import { Chip } from '@appica/ui-react/chip';
import { Checkbox } from '@appica/ui-react/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@appica/ui-react/alert';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogClose } from '@appica/ui-react/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@appica/ui-react/dialog';
import { Pagination, PaginationList, PaginationItem, PaginationLink } from '@appica/ui-react/pagination';
import { Archive, ArrowUpRight, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash } from '@appica/icons-react';
import { api, Empty, LoadingButton, SectionCard } from '@personal-workbench/core';

const PAGE_SIZE = 20;
const STATUS_ITEMS = { active: '有效', archived: '已归档', all: '全部' };
const SORT_ITEMS = { updatedAt: '最近更新', createdAt: '创建时间', title: '标题', stars: 'GitHub Stars' };

function emptyRecordInput() {
  return { url: '', title: '', summary: '', categoryIds: [], tagsText: '', notes: '', sourceSnapshot: null };
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function parseTags(value) {
  return value.split(/[、,，\n]/).map((tag) => tag.trim()).filter(Boolean);
}

function captureUrlValidationError(value) {
  const source = value.trim();
  if (!source) return '请输入公开 URL。';
  let url;
  try {
    url = new URL(source);
  } catch {
    return '请输入有效的 URL。';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return '抓取仅支持 http 或 https 地址。';
  if (url.username || url.password) return '抓取地址不能包含账号或密码。';
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return '抓取仅允许受限公开地址。';
  return '';
}

function recordInputFrom(record) {
  return {
    url: record.url,
    title: record.title,
    summary: record.summary,
    categoryIds: record.categories.map((category) => category.id),
    tagsText: record.tags.join('、'),
    notes: record.notes,
    sourceSnapshot: record.sourceSnapshot || null
  };
}

function toggleCategory(categoryIds, categoryId, checked) {
  return checked ? [...new Set([...categoryIds, categoryId])] : categoryIds.filter((id) => id !== categoryId);
}

function RecordEditor({ categories, value, onChange, error, captureLoading, captureError, captureNotice, onCapture }) {
  const inactiveSelected = new Set(value.categoryIds);
  const urlError = value.url.trim() ? captureUrlValidationError(value.url) : '';
  const snapshot = value.sourceSnapshot;
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="error">
          <AlertTitle>无法保存记录</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel><span className="text-error">*</span> 公开 URL</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="url" required autoFocus autoComplete="url" value={value.url} placeholder="https://example.com/project" onChange={(event) => onChange({ ...value, url: event.target.value })} />
          <LoadingButton type="button" variant="outline" loading={captureLoading} disabled={!value.url.trim() || Boolean(urlError)} onClick={onCapture}>抓取信息</LoadingButton>
        </div>
        <FieldDescription>仅抓取受限公开 HTTP/HTTPS 页面；抓取结果只填入当前表单，点击保存后才会写入 SQLite。</FieldDescription>
        {urlError && <p className="m-0 text-sm text-error" role="alert">{urlError}</p>}
      </Field>
      {captureError && <Alert variant="error"><AlertTitle>无法抓取信息</AlertTitle><AlertDescription>{captureError}</AlertDescription></Alert>}
      {captureNotice && <Alert variant="success" role="status"><AlertTitle>已取得待确认信息</AlertTitle><AlertDescription>{captureNotice}</AlertDescription></Alert>}
      {snapshot && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-background-subtle p-3">
          <div>
            <p className="m-0 text-sm font-medium text-foreground-strong">{captureNotice ? '新来源快照待确认保存' : '已确认来源快照'}</p>
            <p className="m-0 mt-1 text-xs text-foreground-muted">只保留结构化元数据，不保存网页正文或图片。</p>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-xs text-foreground-muted">规范化地址</dt><dd className="m-0 mt-1 break-all text-foreground-strong">{snapshot.canonicalUrl || value.url}</dd></div>
            <div><dt className="text-xs text-foreground-muted">抓取时间</dt><dd className="m-0 mt-1 tabular-nums text-foreground-strong">{formatDateTime(snapshot.fetchedAt)}</dd></div>
            {snapshot.author && <div><dt className="text-xs text-foreground-muted">作者</dt><dd className="m-0 mt-1 text-foreground-strong">{snapshot.author}</dd></div>}
            {snapshot.title && <div className="min-w-0"><dt className="text-xs text-foreground-muted">来源标题</dt><dd className="m-0 mt-1 wrap-break-word text-foreground-strong">{snapshot.title}</dd></div>}
            {snapshot.summary && <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-foreground-muted">来源摘要</dt><dd className="m-0 mt-1 whitespace-pre-wrap wrap-break-word text-foreground-strong">{snapshot.summary}</dd></div>}
            {snapshot.imageUrl && <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-foreground-muted">来源图片链接</dt><dd className="m-0 mt-1 break-all text-foreground-strong">{snapshot.imageUrl}</dd></div>}
          </dl>
        </div>
      )}
      <Field>
        <FieldLabel><span className="text-error">*</span> 标题</FieldLabel>
        <Input required value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel>摘要</FieldLabel>
        <Textarea rows={3} value={value.summary} onChange={(event) => onChange({ ...value, summary: event.target.value })} placeholder="说明它解决的问题或适用场景（可选）" />
      </Field>
      <Field>
        <FieldLabel>分类</FieldLabel>
        <div role="group" aria-label="为记录选择分类" className="flex flex-wrap gap-3">
          {categories.filter((category) => category.isActive || inactiveSelected.has(category.id)).map((category) => {
            const checked = value.categoryIds.includes(category.id);
            return (
              <label key={category.id} className="flex items-center gap-2 text-sm select-none">
                <Checkbox checked={checked} disabled={!category.isActive && !checked} onCheckedChange={(nextChecked) => onChange({ ...value, categoryIds: toggleCategory(value.categoryIds, category.id, nextChecked) })} />
                <span className={category.isActive ? '' : 'text-foreground-muted'}>{category.name}{category.isActive ? '' : '（已停用）'}</span>
              </label>
            );
          })}
        </div>
      </Field>
      <Field>
        <FieldLabel>标签</FieldLabel>
        <Input value={value.tagsText} onChange={(event) => onChange({ ...value, tagsText: event.target.value })} placeholder="例如：CLI、React、组件库" />
        <FieldDescription>用顿号、逗号或换行分隔；标签用于检索，不替代分类。</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>备注</FieldLabel>
        <Textarea rows={3} value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="记录你的判断、使用经验或后续动作（可选）" />
      </Field>
    </div>
  );
}

function RecordActions({ record, onView, onEdit, onStatusChange, onDelete }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => onView(record)}>查看</Button>
      <a href={record.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        打开<ArrowUpRight data-icon="end" />
      </a>
      <Button size="sm" variant="outline" onClick={() => onEdit(record)}><Pencil data-icon="start" />编辑</Button>
      <Button size="sm" variant="outline" onClick={() => onStatusChange(record, record.status === 'active' ? 'archived' : 'active')}>
        {record.status === 'active' && <Archive data-icon="start" />}
        {record.status === 'active' ? '归档' : '恢复'}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button size="sm" variant="destructive"><Trash data-icon="start" />删除</Button>} />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除「{record.title}」？</AlertDialogTitle>
            <AlertDialogDescription>这会删除本地记录及其分类、标签关联，不能恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="soft">取消</Button>} />
            <AlertDialogClose render={<Button variant="destructive" onClick={() => onDelete(record.id)}>删除记录</Button>} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecordCards({ records, onView, onEdit, onStatusChange, onDelete }) {
  return (
    <div className="flex flex-col gap-3 lg:hidden">
      {records.map((record) => (
        <article key={record.id} className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 text-base font-semibold text-foreground-intense wrap-break-word">{record.title}</h2>
              <Badge variant={record.status === 'archived' ? 'secondary' : 'success'} size="sm">{record.status === 'archived' ? '已归档' : '有效'}</Badge>
            </div>
            {record.summary && <p className="text-sm leading-6 text-foreground-muted wrap-break-word">{record.summary}</p>}
            <a href={record.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline underline-offset-2 wrap-break-word">{record.url}</a>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {record.categories.map((category) => <Badge key={category.id} variant={category.isActive ? 'outline' : 'secondary'} size="sm">{category.name}{category.isActive ? '' : '（已停用）'}</Badge>)}
            {record.tags.map((tag) => <Badge key={tag} variant="soft" size="sm">{tag}</Badge>)}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-muted pt-3 text-xs text-foreground-muted">
            <span className="tabular-nums">更新于 {formatDateTime(record.updatedAt)}</span>
            {record.stars !== null && <span className="tabular-nums">Stars {record.stars.toLocaleString('zh-CN')}</span>}
          </div>
          <div className="mt-3"><RecordActions record={record} onView={onView} onEdit={onEdit} onStatusChange={onStatusChange} onDelete={onDelete} /></div>
        </article>
      ))}
    </div>
  );
}

function RecordDetails({ open, record, loading, error, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="h-138 max-h-[calc(100dvh-2rem)] sm:w-150">
        <DialogHeader>
          <DialogTitle>{record?.title || '编程记录详情'}</DialogTitle>
          <DialogDescription>查看已确认保存的来源与维护信息。</DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 px-6 pb-2">
            {loading && <p className="text-foreground-muted" aria-live="polite">正在加载记录详情…</p>}
            {error && <Alert variant="error"><AlertTitle>无法加载详情</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            {record && !loading && (
              <>
                <dl className="grid gap-3 rounded-[var(--radius-md)] border border-border p-4 sm:grid-cols-2">
                  <div className="min-w-0"><dt className="text-xs text-foreground-muted">状态</dt><dd className="m-0 mt-1"><Badge variant={record.status === 'archived' ? 'secondary' : 'success'} size="sm">{record.status === 'archived' ? '已归档' : '有效'}</Badge></dd></div>
                  <div className="min-w-0"><dt className="text-xs text-foreground-muted">来源</dt><dd className="m-0 mt-1 text-sm text-foreground-strong">{record.sourceType === 'manual' ? '手动维护' : record.sourceType}</dd></div>
                  <div className="min-w-0"><dt className="text-xs text-foreground-muted">创建时间</dt><dd className="m-0 mt-1 text-sm tabular-nums text-foreground-strong">{formatDateTime(record.createdAt)}</dd></div>
                  <div className="min-w-0"><dt className="text-xs text-foreground-muted">最近更新</dt><dd className="m-0 mt-1 text-sm tabular-nums text-foreground-strong">{formatDateTime(record.updatedAt)}</dd></div>
                </dl>
                <div className="min-w-0">
                  <h3 className="m-0 text-sm font-medium text-foreground-strong">原始 URL</h3>
                  <a href={record.url} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-primary underline underline-offset-2 wrap-break-word">{record.url}</a>
                </div>
                <div className="min-w-0">
                  <h3 className="m-0 text-sm font-medium text-foreground-strong">规范化 URL</h3>
                  <p className="m-0 mt-1 text-sm text-foreground-muted wrap-break-word">{record.normalizedUrl}</p>
                </div>
                {record.sourceSnapshot && (
                  <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-background-subtle p-3">
                    <h3 className="m-0 text-sm font-medium text-foreground-strong">已确认来源快照</h3>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div className="min-w-0"><dt className="text-xs text-foreground-muted">规范化地址</dt><dd className="m-0 mt-1 break-all text-foreground-strong">{record.sourceSnapshot.canonicalUrl || '未提供'}</dd></div>
                      <div><dt className="text-xs text-foreground-muted">抓取时间</dt><dd className="m-0 mt-1 tabular-nums text-foreground-strong">{formatDateTime(record.sourceSnapshot.fetchedAt)}</dd></div>
                      {record.sourceSnapshot.author && <div><dt className="text-xs text-foreground-muted">作者</dt><dd className="m-0 mt-1 text-foreground-strong">{record.sourceSnapshot.author}</dd></div>}
                      {record.sourceSnapshot.imageUrl && <div className="min-w-0"><dt className="text-xs text-foreground-muted">来源图片链接</dt><dd className="m-0 mt-1 break-all text-foreground-strong">{record.sourceSnapshot.imageUrl}</dd></div>}
                    </dl>
                  </div>
                )}
                <div>
                  <h3 className="m-0 text-sm font-medium text-foreground-strong">摘要</h3>
                  <p className="m-0 mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground-muted wrap-break-word">{record.summary || '未填写'}</p>
                </div>
                <div>
                  <h3 className="m-0 text-sm font-medium text-foreground-strong">分类</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">{record.categories.length ? record.categories.map((category) => <Badge key={category.id} variant={category.isActive ? 'outline' : 'secondary'} size="sm">{category.name}{category.isActive ? '' : '（已停用）'}</Badge>) : <span className="text-sm text-foreground-muted">未分类</span>}</div>
                </div>
                <div>
                  <h3 className="m-0 text-sm font-medium text-foreground-strong">标签</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">{record.tags.length ? record.tags.map((tag) => <Badge key={tag} variant="soft" size="sm">{tag}</Badge>) : <span className="text-sm text-foreground-muted">未填写</span>}</div>
                </div>
                <div>
                  <h3 className="m-0 text-sm font-medium text-foreground-strong">备注</h3>
                  <p className="m-0 mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground-muted wrap-break-word">{record.notes || '未填写'}</p>
                </div>
              </>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          {record && <a href={record.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline', size: 'md' })}>打开原始链接<ArrowUpRight data-icon="end" /></a>}
          <Button autoFocus variant="soft" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryManager({ open, onOpenChange, categories, onChanged }) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setNewName('');
    setEditing(null);
    setError('');
    onOpenChange(false);
  }

  async function createCategory(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api('/programming-records/categories', { method: 'POST', body: JSON.stringify({ name: newName }) });
      setNewName('');
      await onChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(category) {
    const name = editing?.name?.trim();
    if (!name) return;
    setSaving(true);
    setError('');
    try {
      await api(`/programming-records/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setEditing(null);
      await onChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeCategoryStatus(category) {
    setSaving(true);
    setError('');
    try {
      await api(`/programming-records/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !category.isActive }) });
      await onChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) onOpenChange(true); else close(); }}>
      <DialogContent className="h-138 max-h-[calc(100dvh-2rem)] sm:w-120">
        <DialogHeader>
          <DialogTitle>管理分类</DialogTitle>
          <DialogDescription>停用不会删除已有记录关联；重新启用后可继续分配给新记录。</DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 px-6 pb-2">
            {error && <Alert variant="error"><AlertTitle>分类操作失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={createCategory}>
              <Input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="新增分类名称" aria-label="新增分类名称" />
              <LoadingButton type="submit" loading={saving} disabled={!newName.trim()}>新增分类</LoadingButton>
            </form>
            <div className="flex flex-col divide-y divide-border-muted rounded-[var(--radius-md)] border border-border">
              {categories.map((category) => (
                <div key={category.id} className="flex flex-wrap items-center gap-2 p-3">
                  {editing?.id === category.id ? (
                    <Input className="min-w-0 flex-1" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} aria-label={`重命名分类：${category.name}`} />
                  ) : (
                    <span className="min-w-0 flex-1 font-medium text-foreground-strong wrap-break-word">{category.name}</span>
                  )}
                  <Badge variant={category.isActive ? 'success' : 'secondary'} size="sm">{category.isActive ? '活动' : '已停用'}</Badge>
                  {editing?.id === category.id ? (
                    <>
                      <Button size="sm" disabled={saving || !editing.name.trim()} onClick={() => saveCategory(category)}>保存</Button>
                      <Button size="sm" variant="soft" disabled={saving} onClick={() => setEditing(null)}>取消</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditing({ id: category.id, name: category.name })}>重命名</Button>
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => changeCategoryStatus(category)}>{category.isActive ? '停用' : '启用'}</Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter><Button variant="soft" onClick={close}>关闭</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgrammingRecordsPage() {
  const [records, setRecords] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({ query: '', categoryIds: [], unclassified: false, status: 'active', sort: 'updatedAt', page: 1 });
  const [queryDraft, setQueryDraft] = useState('');
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordInput, setRecordInput] = useState(emptyRecordInput);
  const [recordError, setRecordError] = useState('');
  const [recordSaving, setRecordSaving] = useState(false);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [captureNotice, setCaptureNotice] = useState('');
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const filtersRef = useRef(filters);
  const loadRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const mountedRef = useRef(false);
  const captureRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const activeFilters = filtersRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const params = new URLSearchParams({
        query: activeFilters.query,
        status: activeFilters.status,
        sort: activeFilters.sort,
        page: String(activeFilters.page),
        pageSize: String(PAGE_SIZE)
      });
      if (activeFilters.categoryIds.length) params.set('categoryIds', activeFilters.categoryIds.join(','));
      if (activeFilters.unclassified) params.set('unclassified', 'true');
      const [recordsResult, categoriesResult] = await Promise.all([
        api(`/programming-records?${params.toString()}`),
        api('/programming-records/categories')
      ]);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setRecords(recordsResult.records);
      setTotal(recordsResult.total);
      setCategories(categoriesResult.categories);
    } catch (requestError) {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setRecords([]);
      setTotal(0);
      setLoadError(requestError.message);
    } finally {
      if (mountedRef.current && requestId === loadRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
      detailRequestRef.current += 1;
      captureRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    filtersRef.current = filters;
    void load();
  }, [filters, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visiblePages = useMemo(() => {
    const start = Math.max(1, Math.min(filters.page - 1, totalPages - 2));
    return Array.from({ length: Math.min(3, totalPages) }, (_, index) => start + index);
  }, [filters.page, totalPages]);

  function updateFilters(next) {
    setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }));
  }

  function toggleFilterCategory(categoryId) {
    updateFilters({
      categoryIds: filters.categoryIds.includes(categoryId)
        ? filters.categoryIds.filter((id) => id !== categoryId)
        : [...filters.categoryIds, categoryId],
      unclassified: false
    });
  }

  function resetCaptureState() {
    captureRequestRef.current += 1;
    setCaptureLoading(false);
    setCaptureError('');
    setCaptureNotice('');
  }

  function changeRecordInput(next) {
    const urlChanged = next.url !== recordInput.url;
    const input = urlChanged ? { ...next, sourceSnapshot: null } : next;
    if (urlChanged) {
      captureRequestRef.current += 1;
      setCaptureError('');
      setCaptureNotice('');
    }
    setRecordInput(input);
    setRecordError('');
  }

  function openCreate() {
    resetCaptureState();
    setEditingRecord(null);
    setRecordInput(emptyRecordInput());
    setRecordError('');
    setRecordDialogOpen(true);
  }

  function openEdit(record) {
    resetCaptureState();
    setEditingRecord(record);
    setRecordInput(recordInputFrom(record));
    setRecordError('');
    setRecordDialogOpen(true);
  }

  function closeRecordDialog() {
    resetCaptureState();
    setRecordDialogOpen(false);
    setEditingRecord(null);
    setRecordInput(emptyRecordInput());
    setRecordError('');
  }

  function closeDetails() {
    detailRequestRef.current += 1;
    setDetailRecordId(null);
    setDetailRecord(null);
    setDetailError('');
    setDetailLoading(false);
  }

  async function openDetails(record) {
    const requestId = ++detailRequestRef.current;
    setDetailRecordId(record.id);
    setDetailRecord(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const result = await api(`/programming-records/${record.id}`);
      if (!mountedRef.current || requestId !== detailRequestRef.current) return;
      setDetailRecord(result.record);
    } catch (requestError) {
      if (!mountedRef.current || requestId !== detailRequestRef.current) return;
      setDetailError(requestError.message);
    } finally {
      if (mountedRef.current && requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }

  async function captureRecord() {
    const urlError = captureUrlValidationError(recordInput.url);
    if (urlError) {
      setCaptureError(urlError);
      return;
    }
    const requestId = ++captureRequestRef.current;
    const requestedUrl = recordInput.url;
    const recordId = editingRecord?.id;
    setCaptureLoading(true);
    setCaptureError('');
    setCaptureNotice('');
    try {
      const result = await api('/programming-records/capture', {
        method: 'POST',
        body: JSON.stringify({ url: requestedUrl, ...(recordId ? { recordId } : {}) })
      });
      if (!mountedRef.current || requestId !== captureRequestRef.current) return;
      const capture = result.capture;
      if (!capture) throw new Error('采集结果无效。');
      setRecordInput((current) => {
        if (current.url !== requestedUrl) return current;
        if (recordId) return { ...current, sourceSnapshot: capture.sourceSnapshot };
        return {
          ...current,
          url: capture.url,
          title: current.title.trim() ? current.title : capture.title,
          summary: current.summary.trim() ? current.summary : capture.summary,
          sourceSnapshot: capture.sourceSnapshot
        };
      });
      const missingFields = Array.isArray(capture.missingFields) ? capture.missingFields : [];
      const missingNotice = missingFields.length ? `未找到${missingFields.join('、')}，请手动补全；` : '';
      setCaptureNotice(recordId
        ? `${missingNotice}已取得新的来源快照；标题、摘要、备注和分类保持不变，点击保存修改后才会更新快照。`
        : `${missingNotice}已将可用元数据填入表单；你可以继续修改，点击保存记录后才会写入本地。`);
    } catch (requestError) {
      if (!mountedRef.current || requestId !== captureRequestRef.current) return;
      const existing = requestError.payload?.existingRecord;
      setCaptureError(existing ? `该地址已存在：${existing.title}` : requestError.message);
    } finally {
      if (mountedRef.current && requestId === captureRequestRef.current) setCaptureLoading(false);
    }
  }

  async function saveRecord() {
    setRecordSaving(true);
    setRecordError('');
    try {
      const input = {
        url: recordInput.url,
        title: recordInput.title,
        summary: recordInput.summary,
        categoryIds: recordInput.categoryIds,
        tags: parseTags(recordInput.tagsText),
        notes: recordInput.notes,
        sourceSnapshot: recordInput.sourceSnapshot
      };
      if (editingRecord) {
        await api(`/programming-records/${editingRecord.id}`, { method: 'PATCH', body: JSON.stringify(input) });
        setNotice('编程记录已更新。');
      } else {
        await api('/programming-records', { method: 'POST', body: JSON.stringify(input) });
        setNotice('编程记录已保存。');
      }
      closeRecordDialog();
      await load();
    } catch (requestError) {
      const existing = requestError.payload?.existingRecord;
      setRecordError(existing ? `该地址已存在：${existing.title}` : requestError.message);
    } finally {
      setRecordSaving(false);
    }
  }

  async function changeRecordStatus(record, status) {
    try {
      await api(`/programming-records/${record.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(status === 'archived' ? '记录已归档。' : '记录已恢复。');
      await load();
    } catch {
      // API 错误已由工作台 Shell 的全局 Toast 展示。
    }
  }

  async function deleteRecord(id) {
    try {
      await api(`/programming-records/${id}`, { method: 'DELETE' });
      setNotice('记录已删除。');
      if (records.length === 1 && filters.page > 1) updateFilters({ page: filters.page - 1 });
      else await load();
    } catch {
      // API 错误已由工作台 Shell 的全局 Toast 展示。
    }
  }

  return (
    <SectionCard title="编程记录">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="m-0 text-sm leading-6 text-foreground-muted">本地维护公开项目、工具和网站；分类、标签和备注只在确认保存后写入 SQLite。</p>
            <p className="m-0 mt-1 text-xs text-foreground-muted"><span className="tabular-nums">{total}</span> 条符合当前条件的记录</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCategoryManagerOpen(true)}>管理分类</Button>
            <Button onClick={openCreate}><Plus data-icon="start" />新增记录</Button>
          </div>
        </div>

        {notice && <Alert variant="success" role="status"><AlertTitle>操作完成</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
        {loadError && <Alert variant="error"><AlertTitle>无法加载记录</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert>}

        <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-background-subtle p-4">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); updateFilters({ query: queryDraft.trim() }); }}>
            <Input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="搜索标题、摘要、备注或标签" aria-label="搜索编程记录" />
            <Button type="submit" variant="outline"><Search data-icon="start" />搜索</Button>
          </form>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground-strong">分类筛选（命中任一分类）</span>
            <div className="flex flex-wrap gap-2">
              <Chip type="button" variant={filters.unclassified ? 'primary' : 'outline'} aria-pressed={filters.unclassified} onClick={() => updateFilters({ unclassified: !filters.unclassified, categoryIds: [] })}>未分类</Chip>
              {categories.map((category) => {
                const selected = filters.categoryIds.includes(category.id);
                return <Chip key={category.id} type="button" variant={selected ? 'primary' : 'outline'} aria-pressed={selected} onClick={() => toggleFilterCategory(category.id)}>{category.name}{category.isActive ? '' : '（已停用）'}</Chip>;
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>状态</FieldLabel>
              <Select items={STATUS_ITEMS} value={filters.status} onValueChange={(status) => updateFilters({ status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>排序</FieldLabel>
              <Select items={SORT_ITEMS} value={filters.sort} onValueChange={(sort) => updateFilters({ sort })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SORT_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        {loading ? <p className="text-foreground-muted" aria-live="polite">正在加载编程记录…</p> : records.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <Table hoverableRows className="min-w-220">
                <TableHeader>
                  <TableRow><TableHead>资料</TableHead><TableHead>分类与标签</TableHead><TableHead>状态</TableHead><TableHead>更新</TableHead><TableHead className="whitespace-nowrap text-center">操作</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="min-w-84 max-w-120 align-top">
                        <div className="font-medium text-foreground-intense wrap-break-word">{record.title}</div>
                        {record.summary && <div className="mt-1 text-sm leading-6 text-foreground-muted wrap-break-word">{record.summary}</div>}
                        <a href={record.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary underline underline-offset-2 wrap-break-word">{record.url}</a>
                      </TableCell>
                      <TableCell className="min-w-48 align-top"><div className="flex flex-wrap gap-1.5">{record.categories.map((category) => <Badge key={category.id} variant={category.isActive ? 'outline' : 'secondary'} size="sm">{category.name}{category.isActive ? '' : '（已停用）'}</Badge>)}{record.tags.map((tag) => <Badge key={tag} variant="soft" size="sm">{tag}</Badge>)}</div></TableCell>
                      <TableCell className="whitespace-nowrap align-top"><Badge variant={record.status === 'archived' ? 'secondary' : 'success'} size="sm">{record.status === 'archived' ? '已归档' : '有效'}</Badge>{record.stars !== null && <div className="mt-2 text-xs tabular-nums text-foreground-muted">Stars {record.stars.toLocaleString('zh-CN')}</div>}</TableCell>
                      <TableCell className="whitespace-nowrap align-top text-sm tabular-nums text-foreground-muted">{formatDateTime(record.updatedAt)}</TableCell>
                      <TableCell className="min-w-108 align-top"><RecordActions record={record} onView={openDetails} onEdit={openEdit} onStatusChange={changeRecordStatus} onDelete={deleteRecord} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <RecordCards records={records} onView={openDetails} onEdit={openEdit} onStatusChange={changeRecordStatus} onDelete={deleteRecord} />
            {totalPages > 1 && (
              <Pagination className="justify-end" aria-label="编程记录分页">
                <PaginationList>
                  <PaginationItem><PaginationLink href="#records" aria-label="上一页" className="px-0" disabled={filters.page === 1} onClick={(event) => { event.preventDefault(); updateFilters({ page: filters.page - 1 }); }}><ChevronLeft /></PaginationLink></PaginationItem>
                  {visiblePages.map((page) => <PaginationItem key={page}><PaginationLink href="#records" active={page === filters.page} aria-label={`第 ${page} 页`} onClick={(event) => { event.preventDefault(); updateFilters({ page }); }}>{page}</PaginationLink></PaginationItem>)}
                  <PaginationItem><PaginationLink href="#records" aria-label="下一页" className="px-0" disabled={filters.page === totalPages} onClick={(event) => { event.preventDefault(); updateFilters({ page: filters.page + 1 }); }}><ChevronRight /></PaginationLink></PaginationItem>
                </PaginationList>
              </Pagination>
            )}
          </>
        ) : <Empty description="没有符合条件的编程记录。新增一条公开链接开始整理。" />}
      </div>

      <Dialog open={recordDialogOpen} onOpenChange={(nextOpen) => { if (nextOpen) setRecordDialogOpen(true); else closeRecordDialog(); }}>
        <DialogContent className="h-150 max-h-[calc(100dvh-2rem)] sm:w-150">
          <DialogHeader>
            <DialogTitle>{editingRecord ? '编辑编程记录' : '新增编程记录'}</DialogTitle>
            <DialogDescription>{editingRecord ? '修改你维护的字段和分类；抓取会生成待确认来源快照，不会静默覆盖人工内容。' : '抓取信息只填入当前表单；关闭或取消不会留下本地草稿，保存后才会写入。'}</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-6 pb-2"><RecordEditor categories={categories} value={recordInput} onChange={changeRecordInput} error={recordError} captureLoading={captureLoading} captureError={captureError} captureNotice={captureNotice} onCapture={captureRecord} /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="soft" disabled={recordSaving} onClick={closeRecordDialog}>取消</Button>
            <LoadingButton loading={recordSaving} disabled={!recordInput.url.trim() || !recordInput.title.trim()} onClick={saveRecord}>{editingRecord ? '保存修改' : '保存记录'}</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecordDetails open={detailRecordId !== null} record={detailRecord} loading={detailLoading} error={detailError} onClose={closeDetails} />

      <CategoryManager open={categoryManagerOpen} onOpenChange={setCategoryManagerOpen} categories={categories} onChanged={load} />
    </SectionCard>
  );
}

export { ProgrammingRecordsPage };
