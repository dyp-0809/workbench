import { useRef, useState } from 'react';
import { Badge } from '@appica/ui-react/badge';
import { Button, buttonVariants } from '@appica/ui-react/button';
import { Card, CardHeader, CardTitle } from '@appica/ui-react/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Input } from '@appica/ui-react/input';
import { CircleCheckFilled, CircleXFilled, BookDownload, Books, FolderOpen } from '@appica/icons-react';
import { api, Empty, formatBytes, LoadingButton } from '@personal-workbench/core';
import { useToastManager } from '@appica/ui-react/toast';

const BOOK_DOWNLOAD_URL = 'https://zh.z-library.sk/';
const KOREADER_PLUGIN_URL = 'https://github.com/search?q=koplugin&type=repositories&p=1';
const KOREADER_GUIDE_URL = 'https://koreader.rocks/user_guide/zh_Hans.html';
const KINDLE_TRANSFER_FORMATS = ['EPUB', 'PDF', 'DOC', 'DOCX', 'TXT', 'RTF', 'HTM', 'HTML', 'PNG', 'GIF', 'JPG', 'JPEG', 'BMP'];
const KINDLE_DEVICE_FORMATS = ['AZW', 'AZW3', 'KFX', 'MOBI'];
const KOREADER_FORMATS = ['PDF', 'DjVu', 'XPS', 'CBZ', 'CBT', 'FB2', 'PDB', 'TXT', 'HTML', 'RTF', 'CHM', 'EPUB', 'DOC', 'MOBI', 'ZIP'];
const IMAGE_FORMATS = new Set(['png', 'gif', 'jpg', 'jpeg', 'bmp']);
const IMPORT_FORMATS = [...new Set([...KINDLE_TRANSFER_FORMATS, ...KINDLE_DEVICE_FORMATS, ...KOREADER_FORMATS])]
  .filter((format) => !IMAGE_FORMATS.has(format.toLowerCase()));
const IMPORT_FORMAT_SET = new Set(IMPORT_FORMATS.map((format) => format.toLowerCase()));
const IMPORT_ACCEPT = IMPORT_FORMATS.map((format) => `.${format.toLowerCase()}`).join(',');
const DEFAULT_SYNC_CONFIG = Object.freeze({
  sourceDir: '/Users/duanyipeng/Desktop/电子书',
  destDir: '/mnt/us/documents/Books',
  keyFile: '$HOME/.ssh/kindle_koreader',
  kindleHost: '192.168.0.106',
  port: '2222'
});

function extensionOf(fileName) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < fileName.length - 1 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
}

function bookTitle(fileName, extension) {
  return extension ? fileName.slice(0, -(extension.length + 1)) : fileName;
}

function toBookEntry(file) {
  const extension = extensionOf(file.name);
  return {
    id: file.webkitRelativePath || `${file.name}-${file.lastModified}-${file.size}`,
    title: bookTitle(file.name, extension),
    relativePath: file.webkitRelativePath || file.name,
    extension: extension.toUpperCase(),
    size: file.size,
    lastModified: file.lastModified
  };
}

function sortBooks(books) {
  return [...books].sort((left, right) => (
    left.title.localeCompare(right.title, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    || left.relativePath.localeCompare(right.relativePath, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
  ));
}

function FormatBadges({ formats }) {
  return (
    <div className="flex flex-wrap gap-2">
      {formats.map((format) => <Badge key={format} variant="outline">{format}</Badge>)}
    </div>
  );
}

function formatModifiedAt(timestamp) {
  if (!timestamp) return '修改时间未知';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
}

function KindlePage() {
  const toast = useToastManager();
  const directoryInputRef = useRef(null);
  const [books, setBooks] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [notice, setNotice] = useState('');

  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncConfig, setSyncConfig] = useState({ ...DEFAULT_SYNC_CONFIG });
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState('');
  const syncReady = Object.values(syncConfig).every((value) => String(value).trim());
  const updateSyncConfig = (field) => (event) => setSyncConfig((current) => ({ ...current, [field]: event.target.value }));
  const openSyncDialog = () => {
    setSyncConfig({ ...DEFAULT_SYNC_CONFIG });
    setSyncResult(null);
    setSyncError('');
    setSyncOpen(true);
  };
  const submitSync = async () => {
    setSyncing(true);
    setSyncError('');
    try {
      const result = await api('/kindle/sync', { method: 'POST', body: JSON.stringify(syncConfig) });
      const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
      setSyncResult(result);
      setSyncOpen(false);
      toast.add({
        title: result.completed ? 'Kindle 同步完成' : 'Kindle 同步完成，但有文件失败',
        description: `共扫描 ${result.total} 个文件，上传 ${result.uploaded} 个，跳过 ${result.skipped} 个，失败 ${failedCount} 个。`,
        ...(result.completed ? {} : { type: 'error', priority: 'high' }),
        data: { icon: result.completed ? <CircleCheckFilled className="text-success-emphasis" /> : <CircleXFilled className="text-error-emphasis" /> }
      });
    } catch (error) {
      setSyncError(error.message);
      // API 错误由应用壳的全局 Toast 统一展示。
      if (!error?.isApiError) {
        toast.add({
          title: 'Kindle 同步失败',
          description: error.message,
          type: 'error',
          priority: 'high',
          data: { icon: <CircleXFilled className="text-error-emphasis" /> }
        });
      }
    } finally {
      setSyncing(false);
    }
  };
  const readDirectory = (event) => {
    const selectedFiles = Array.from(event.currentTarget.files || []);
    if (!selectedFiles.length) return;

    const rootFolder = selectedFiles.find((file) => file.webkitRelativePath)?.webkitRelativePath.split('/')[0] || '';
    const supportedFiles = selectedFiles.filter((file) => IMPORT_FORMAT_SET.has(extensionOf(file.name)));
    const nextBooks = sortBooks(supportedFiles.map(toBookEntry));
    const nextIgnoredCount = selectedFiles.length - supportedFiles.length;

    setBooks(nextBooks);
    setFolderName(rootFolder || '所选目录');
    setIgnoredCount(nextIgnoredCount);
    setNotice(nextBooks.length
      ? `已读入 ${nextBooks.length} 本电子书${nextIgnoredCount ? `，忽略 ${nextIgnoredCount} 个不支持的文件` : ''}。`
      : '该目录没有可展示的电子书文件。');
    event.currentTarget.value = '';
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kindle 支持格式</CardTitle>
            <p className="m-0 text-sm text-foreground-muted">Amazon Send to Kindle 个人文档支持的格式；本地书库额外识别常见 Kindle 设备文件。</p>
          </CardHeader>
          <div className="px-4 pb-4">
            <FormatBadges formats={KINDLE_TRANSFER_FORMATS} />
            <div className="mt-4 flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground-strong">本地 Kindle 设备文件</span>
              <FormatBadges formats={KINDLE_DEVICE_FORMATS} />
            </div>
            <p className="m-0 mt-3 text-xs text-foreground-muted">图片格式仅作 Kindle 传输参考，读入目录时不会作为电子书展示。</p>
            <a className="mt-4 inline-flex text-sm text-primary underline underline-offset-4" href="https://digprjsurvey.amazon.com/csad/help/node/TCUBEdEkbIhK07ysFu" target="_blank" rel="noopener noreferrer">查看 Amazon 格式说明</a>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KOReader 支持格式</CardTitle>
            <p className="m-0 text-sm text-foreground-muted">KOReader 官方列出的固定版式、可重排电子书及部分压缩格式。</p>
          </CardHeader>
          <div className="px-4 pb-4">
            <FormatBadges formats={KOREADER_FORMATS} />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              <a className="text-sm text-primary underline underline-offset-4" href={KOREADER_GUIDE_URL} target="_blank" rel="noopener noreferrer">查看 KOReader 官方使用说明</a>
              <a className="text-sm text-primary underline underline-offset-4" href={KOREADER_PLUGIN_URL} target="_blank" rel="noopener noreferrer">浏览 KOReader 插件</a>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>Kindle 书库</CardTitle>
            <p className="m-0 mt-1 text-sm text-foreground-muted">从本机选择一个目录，读取其中支持的电子书文件并按文件名展示。</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" onClick={openSyncDialog}><Books aria-hidden="true" data-icon="start" />将书籍同步至 Kindle</Button>
            <a className={`${buttonVariants({ variant: 'outline' })} gap-2`} href={BOOK_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer"><BookDownload aria-hidden="true" />图书下载</a>
            <Button type="button" variant="outline" onClick={() => directoryInputRef.current?.click()}><FolderOpen aria-hidden="true" data-icon="start" />读入</Button>
          </div>
        </CardHeader>
        <div className="px-4 pb-4">
          <input ref={directoryInputRef} className="hidden" type="file" accept={IMPORT_ACCEPT} multiple webkitdirectory="" directory="" aria-label="选择电子书目录" onChange={readDirectory} />
          {syncResult && (
            <div className="mb-4 border border-border p-3 text-sm" role="status" aria-live="polite">
              <p className="m-0 font-medium text-foreground-intense">{syncResult.completed ? '同步完成。' : '同步结束，但有文件失败。'}</p>
              <p className="m-0 mt-1 text-foreground-muted">共扫描 {syncResult.total} 个文件，上传 {syncResult.uploaded} 个，跳过 {syncResult.skipped} 个，失败 {syncResult.failed.length} 个。</p>
              {syncResult.failed.length > 0 && (
                <ul className="m-0 mt-2 list-disc ps-5 text-error-emphasis">
                  {syncResult.failed.slice(0, 5).map((failure) => <li key={failure.relativePath}>{failure.relativePath}：{failure.reason}</li>)}
                  {syncResult.failed.length > 5 && <li>其余 {syncResult.failed.length - 5} 个失败文件未展开。</li>}
                </ul>
              )}
            </div>
          )}
          {notice && <p className="m-0 mb-4 text-sm text-foreground-muted" role="status" aria-live="polite">{notice}</p>}
          {books.length ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-foreground-muted">
                <span>{folderName}</span>
                <span className="tabular-nums">{books.length} 本 · 已忽略 {ignoredCount} 个文件</span>
              </div>
              <ul className="m-0 grid list-none gap-2 p-0">
                {books.map((book) => (
                  <li key={book.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <Books className="size-5 shrink-0 text-primary" aria-hidden="true" />
                        <p className="m-0 min-w-0 truncate font-medium text-foreground-intense" title={book.title}>{book.title}</p>
                      </div>
                      <p className="m-0 mt-1 truncate text-sm text-foreground-muted" title={book.relativePath}>{book.relativePath}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm text-foreground-muted">
                      <Badge variant="outline">{book.extension}</Badge>
                      <span className="tabular-nums">{formatBytes(book.size)}</span>
                      <span>{formatModifiedAt(book.lastModified)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : <Empty description="点击“读入”选择包含电子书的本地目录。文件只在当前页面内读取，不会上传到后端。" />}
        </div>
      </Card>
      <Dialog open={syncOpen} onOpenChange={(open) => { if (!syncing) setSyncOpen(open); }}>
        <DialogContent className="sm:w-130">
          <DialogHeader>
            <DialogTitle>将书籍同步至 Kindle</DialogTitle>
            <DialogDescription>确认后会递归扫描源目录；Kindle 中已存在的文件跳过，新文件按目录结构上传。</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel>源目录</FieldLabel>
                <Input value={syncConfig.sourceDir} onChange={updateSyncConfig('sourceDir')} spellCheck={false} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Kindle 目标目录</FieldLabel>
                <Input value={syncConfig.destDir} onChange={updateSyncConfig('destDir')} spellCheck={false} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>SSH 私钥</FieldLabel>
                <Input value={syncConfig.keyFile} onChange={updateSyncConfig('keyFile')} spellCheck={false} />
              </Field>
              <Field>
                <FieldLabel>Kindle 地址</FieldLabel>
                <Input value={syncConfig.kindleHost} onChange={updateSyncConfig('kindleHost')} spellCheck={false} />
              </Field>
              <Field>
                <FieldLabel>SSH 端口</FieldLabel>
                <Input inputMode="numeric" value={syncConfig.port} onChange={updateSyncConfig('port')} />
              </Field>
            </div>
            <p className="m-0 text-sm text-foreground-muted">远端用户固定为 root；同步命令使用 BatchMode 和 IdentitiesOnly，不会弹出密码输入。</p>
            {syncError && <p className="m-0 text-sm text-error-emphasis" role="alert">{syncError}</p>}
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="soft" disabled={syncing}>取消</Button>} />
            <LoadingButton loading={syncing} disabled={!syncReady} onClick={submitSync}>确认同步</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { KindlePage };
