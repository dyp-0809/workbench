import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Appica UI
import { Button } from '@appica/ui-react/button';
import { Card } from '@appica/ui-react/card';
import { Badge } from '@appica/ui-react/badge';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { Switch } from '@appica/ui-react/switch';
import { TimeField } from '@appica/ui-react/time-field';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Navigation, NavigationList, NavigationItem, NavigationLink } from '@appica/ui-react/navigation';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@appica/ui-react/collapsible';
import { ToastProvider, Toaster, useToastManager } from '@appica/ui-react/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';

// Appica Icons
import { LayoutGrid, LayoutDashboard, Book, FileText, Database, Settings, Bolt, ChevronRight, CircleCheckFilled, CircleXFilled, Copy, ChartBar } from '@appica/icons-react';

// Core 共享能力
import { api, formatBytes, Chart, donutOption, Empty, SectionCard, DescriptionList, Metric, PasswordInput, LoadingButton } from '@personal-workbench/core';

// 业务模块
import { TaskPage } from '@personal-workbench/module-tasks';
import { ExpiringItemsPage } from '@personal-workbench/module-expiring';
import { XOverviewPage, LibraryPage, MaterialsPage, RepliesPage, StylePage, AnalyticsPage } from '@personal-workbench/module-x';
import { StockStatsPage, StockPositionsPage } from '@personal-workbench/module-stock';

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const navigationGroups = [
  { items: [
    { key: 'dashboard-v2', label: '首页', Icon: LayoutDashboard },
    { key: 'tasks', label: '待办事项', Icon: FileText },
    { key: 'expiring', label: '到期与提醒', Icon: Database }
  ] },
  { id: 'x', label: 'X ASSISTANT', icon: LayoutGrid, items: [
    { key: 'x-overview', label: 'X 概览', Icon: LayoutDashboard },
    { key: 'library', label: '内容库', Icon: Book },
    { key: 'materials', label: '素材库', Icon: FileText },
    { key: 'replies', label: '回复历史', Icon: FileText },
    { key: 'style', label: '个人风格', Icon: LayoutGrid },
    { key: 'analytics-v2', label: '数据统计', Icon: LayoutDashboard }
  ] },
  { id: 'stock', label: '股票', icon: ChartBar, items: [
    { key: 'stock-stats', label: '统计', Icon: ChartBar },
    { key: 'stock-positions', label: '仓位管理', Icon: Database }
  ] },
  { items: [
    { key: 'settings', label: '设置', Icon: Settings }
  ] }
];
const settingsSections = [
  { key: 'model', label: '模型与内容', Icon: Settings },
  { key: 'automation', label: '排期与推送', Icon: Bolt },
  { key: 'data', label: '数据与备份', Icon: Database },
  { key: 'pairing', label: '扩展配对', Icon: LayoutGrid }
];
const X_ASSISTANT_KEYS = ['x-overview', 'library', 'materials', 'replies', 'style', 'analytics-v2'];
const STOCK_KEYS = ['stock-stats', 'stock-positions'];
const GROUP_KEYS = { x: X_ASSISTANT_KEYS, stock: STOCK_KEYS };
const pageLabels = new Map([
  ['dashboard-v2', '首页'], ['tasks', '待办事项'], ['expiring', '到期与提醒'], ['x-overview', 'X 概览'], ['library', '内容库'], ['materials', '素材库'],
  ['replies', '回复历史'], ['style', '个人风格'], ['analytics-v2', '数据统计'], ['stock-stats', '统计'], ['stock-positions', '仓位管理'], ['settings', '设置']
]);
const PAGE_PATHS = { 'dashboard-v2': '/', 'tasks': '/tasks', 'expiring': '/expiring', 'x-overview': '/x-overview', 'library': '/library', 'materials': '/materials', 'replies': '/replies', 'style': '/style', 'analytics-v2': '/analytics', 'stock-stats': '/stock/stats', 'stock-positions': '/stock/positions', 'settings': '/settings' };
function pageFromPath(pathname) {
  const entry = Object.entries(PAGE_PATHS).find(([, path]) => path === pathname);
  return entry ? entry[0] : 'dashboard-v2';
}

function AppInner() {
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('x-assistant-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    localStorage.setItem('x-assistant-theme', themeMode);
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    document.documentElement.classList.toggle('light', themeMode === 'light');
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);
  const toast = useToastManager();
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  const [openGroups, setOpenGroups] = useState(() => new Set(Object.entries(GROUP_KEYS).filter(([, keys]) => keys.includes(page)).map(([key]) => key)));
  useEffect(() => { setOpenGroups((current) => { const next = new Set(current); for (const [key, keys] of Object.entries(GROUP_KEYS)) if (keys.includes(page)) next.add(key); return next; }); }, [page]);
  const [dashboard, setDashboard] = useState(null);
  const [packs, setPacks] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [replies, setReplies] = useState([]);
  const [style, setStyle] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [modelSettings, setModelSettings] = useState({ configured: false, provider: 'openai-compatible', endpoint: '', model: '' });
  const [modelInput, setModelInput] = useState({ provider: 'openai-compatible', endpoint: 'https://api.openai.com/v1/chat/completions', model: '', apiKey: '' });
  const [availableModels, setAvailableModels] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);
  const [profileInput, setProfileInput] = useState({ identity: '', audience: '', themes: '', perspective: '', boundaries: '', language: 'zh', tone: 'direct', length: 'short' });
  const [filters, setFilters] = useState({ topic: '', language: '', status: '' });
  const [materialInput, setMaterialInput] = useState({ content: '', topic: '', mayQuoteVerbatim: false });
  const [notice, setNotice] = useState('');
  const [backupInput, setBackupInput] = useState({ password: '', archive: '', confirmation: '' });
  const [settingsSection, setSettingsSection] = useState('model');
  const [backupOpen, setBackupOpen] = useState(false);

  const refresh = async () => {
    try {
      const [nextDashboard, nextPacks, nextMaterials, nextReplies, nextStyle, nextSchedules, nextModelSettings, nextPairing] = await Promise.all([api('/dashboard'), api('/content-packs'), api('/materials'), api('/reply-sessions'), api('/style'), api('/schedules'), api('/model-settings'), api('/pairing-code')]);
      setDashboard(nextDashboard); setPacks(nextPacks.packs); setMaterials(nextMaterials.materials); setReplies(nextReplies.sessions); setStyle(nextStyle); setSchedules(nextSchedules.schedules); setModelSettings(nextModelSettings); setPairingCode(nextPairing); setProfileInput((current) => current.identity ? current : { ...nextDashboard.profile, themes: nextDashboard.profile.themes.join('、') }); setModelInput((current) => ({ ...current, provider: nextModelSettings.provider || current.provider, endpoint: nextModelSettings.endpoint || current.endpoint, model: nextModelSettings.model || current.model, apiKey: nextModelSettings.apiKey || current.apiKey })); setNotice('');
    } catch (error) { setNotice(error.message); }
  };
  function navigate(nextPage) {
    const path = PAGE_PATHS[nextPage];
    if (!path) return;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setPage(nextPage);
  }
  useEffect(() => {
    const onPop = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { refresh(); }, []);
  const topics = useMemo(() => [...new Set(packs.flatMap((pack) => pack.candidates.map((candidate) => candidate.topic)))], [packs]);
  const filteredPacks = useMemo(() => packs.filter((pack) => (!filters.status || pack.retentionStatus === filters.status) && (!filters.topic || pack.candidates.some((candidate) => candidate.topic === filters.topic)) && (!filters.language || pack.candidates.some((candidate) => candidate.language === filters.language))), [filters, packs]);

  async function withFeedback(action, successMessage) {
    try {
      await action();
      if (successMessage) toast.add({ title: successMessage, data: { icon: <CircleCheckFilled className="text-success-emphasis" /> } });
    } catch (error) {
      setNotice(error.message);
      toast.add({ title: error.message, data: { icon: <CircleXFilled className="text-error-emphasis" /> } });
    }
  }
  async function copyPath(text) {
    try { await navigator.clipboard.writeText(text); toast.add({ title: '已复制', data: { icon: <CircleCheckFilled className="text-success-emphasis" /> } }); }
    catch { toast.add({ title: '复制失败', data: { icon: <CircleXFilled className="text-error-emphasis" /> } }); }
  }
  async function candidateEvent(id, type) { await withFeedback(async () => { await api(`/content-candidates/${id}/events`, { method: 'POST', body: JSON.stringify({ type }) }); await refresh(); }, type === 'copied' ? '已复制' : '已加入发布计划'); }
  async function addMaterial() { await withFeedback(async () => { await api('/materials', { method: 'POST', body: JSON.stringify(materialInput) }); setMaterialInput({ content: '', topic: '', mayQuoteVerbatim: false }); await refresh(); }, '素材已保存'); }
  async function saveSchedule(weekday, values) { await withFeedback(async () => { await api(`/schedules/${weekday}`, { method: 'PUT', body: JSON.stringify(values) }); await refresh(); }); }
  async function generateNow() { await withFeedback(async () => { await api('/generation-runs', { method: 'POST', body: '{}' }); await refresh(); navigate('library'); }, '已生成 10 条内容'); }
  async function discoverModels() { await withFeedback(async () => { setDiscovering(true); const result = await api('/model-settings/discover', { method: 'POST', body: JSON.stringify(modelInput) }); setAvailableModels(result.models); setModelInput((current) => ({ ...current, model: result.models.includes(current.model) ? current.model : result.models[0] })); }, '模型服务已连通，已拉取可用模型'); setDiscovering(false); }
  async function saveModel() { await withFeedback(async () => { await api('/model-settings', { method: 'PUT', body: JSON.stringify(modelInput) }); await refresh(); }, '模型配置已保存至 macOS Keychain'); }
  async function saveProfile() { await withFeedback(async () => { await api('/profile', { method: 'PUT', body: JSON.stringify({ ...profileInput, themes: profileInput.themes.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) }) }); await refresh(); }, '内容定位已保存'); }
  async function exportBackup() { await withFeedback(async () => { const result = await api('/backups/export', { method: 'POST', body: JSON.stringify({ password: backupInput.password }) }); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([result.archive], { type: 'application/json' })); link.download = `x-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); }, '加密备份已下载'); }
  async function restoreBackup() { await withFeedback(async () => { await api('/backups/restore', { method: 'POST', body: JSON.stringify(backupInput) }); await refresh(); setBackupInput({ password: '', archive: '', confirmation: '' }); }, '备份已恢复；恢复前快照已保留在本机'); }

  const pageTitle = pageLabels.get(page) || '首页';

  return (
    <div className="workspace flex">
      <aside className="workspace-sider shrink-0">
        <div className="brand">
          <span className="brand-logo"><Bolt /></span>
          X Assistant
        </div>
        <Navigation aria-label="主导航" orientation="vertical" activeLink={page}>
          {navigationGroups.map((group, groupIndex) => {
            if (group.label) {
              const GroupIcon = group.icon;
              return (
                <Collapsible key={groupIndex} open={openGroups.has(group.id)} onOpenChange={(open) => setOpenGroups((current) => { const next = new Set(current); if (open) next.add(group.id); else next.delete(group.id); return next; })}>
                  <CollapsibleTrigger className="group relative inline-flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-2 text-start text-sm font-medium text-foreground-strong outline-none transition-colors hover:bg-background-muted hover:text-foreground-intense">
                    <GroupIcon className="size-4.5 shrink-0" />
                    <span className="flex-1">{group.label}</span>
                    <ChevronRight className="size-4 shrink-0 transition-transform duration-200 group-data-panel-open:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <NavigationList className="ps-2">
                      {group.items.map(({ key, label, Icon }) => (
                        <NavigationItem key={key}>
                          <NavigationLink href={PAGE_PATHS[key]} value={key} className="w-full" onClick={(event) => { event.preventDefault(); navigate(key); }}>
                            <Icon data-icon="start" />
                            {label}
                          </NavigationLink>
                        </NavigationItem>
                      ))}
                    </NavigationList>
                  </CollapsibleContent>
                </Collapsible>
              );
            }
            return (
              <NavigationList key={groupIndex}>
                {group.items.map(({ key, label, Icon }) => (
                  <NavigationItem key={key}>
                    <NavigationLink href={PAGE_PATHS[key]} value={key} className="w-full" onClick={(event) => { event.preventDefault(); navigate(key); }}>
                      <Icon data-icon="start" />
                      {label}
                    </NavigationLink>
                  </NavigationItem>
                ))}
              </NavigationList>
            );
          })}
        </Navigation>
        <div className="service-state">
          <Badge variant={notice ? 'error' : 'success'}>{notice ? '服务连接失败' : '本地服务已连接'}</Badge>
        </div>
      </aside>
      <main className="min-w-0 flex-1 flex flex-col px-14 py-11">
        <header className="page-header shrink-0">
          <div>
            <h1>{pageTitle}</h1>
            <p className="text-foreground-muted">内容、素材与互动记录仅保留在本机；模型密钥由 macOS Keychain 管理</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={themeMode === 'dark'} onCheckedChange={(checked) => setThemeMode(checked ? 'dark' : 'light')} />
              {themeMode === 'dark' ? '暗' : '明'}
            </label>
            <Button variant="outline" onClick={() => setBackupOpen(true)}>备份</Button>
          </div>
        </header>
        {notice && (
          <Card className="mb-4 shrink-0 border-error/40 bg-error/10">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-error">{notice}</span>
              <Button size="sm" variant="outline" onClick={refresh}>重试</Button>
            </div>
          </Card>
        )}

        {page !== 'settings' && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {page === 'dashboard-v2' && dashboard && <DashboardPage dashboard={dashboard} onGenerate={generateNow} onRefresh={refresh} onNavigate={navigate} />}
            {page === 'x-overview' && dashboard && <XOverviewPage dashboard={dashboard} candidateEvent={candidateEvent} />}
            {page === 'expiring' && <ExpiringItemsPage />}
            {page === 'tasks' && <TaskPage />}
            {page === 'library' && <LibraryPage topics={topics} filters={filters} setFilters={setFilters} filteredPacks={filteredPacks} candidateEvent={candidateEvent} />}
            {page === 'materials' && <MaterialsPage materials={materials} materialInput={materialInput} setMaterialInput={setMaterialInput} addMaterial={addMaterial} />}
            {page === 'replies' && <RepliesPage replies={replies} />}
            {page === 'style' && style && <StylePage style={style} withFeedback={withFeedback} refresh={refresh} />}
            {page === 'analytics-v2' && <AnalyticsPage packs={packs} tasks={dashboard?.tasks || []} expiringItems={dashboard?.expiringItems || []} />}
            {page === 'stock-stats' && <StockStatsPage />}
            {page === 'stock-positions' && <StockPositionsPage />}
          </div>
        )}
        {page === 'settings' && (
          <div className="grid min-h-0 flex-1 grid-cols-24 gap-6">
            <div className="col-span-24 lg:col-span-4 overflow-y-auto">
              <Navigation aria-label="设置分类" orientation="vertical" activeLink={settingsSection}>
                <NavigationList>
                  {settingsSections.map(({ key, label, Icon }) => (
                    <NavigationItem key={key}>
                      <NavigationLink href="#!" value={key} className="w-full" onClick={(event) => { event.preventDefault(); setSettingsSection(key); }}>
                        <Icon data-icon="start" />
                        {label}
                      </NavigationLink>
                    </NavigationItem>
                  ))}
                </NavigationList>
              </Navigation>
            </div>
            <div className="col-span-24 lg:col-span-20 overflow-y-auto">
              {settingsSection === 'model' && (
                <>
                  <SectionCard title="模型连接">
                    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); saveModel(); }}>
                      <div className="grid grid-cols-24 gap-3">
                        <div className="col-span-12">
                          <Field>
                            <FieldLabel>提供方</FieldLabel>
                            <Select items={{ 'openai-compatible': 'OpenAI 兼容服务', deepseek: 'DeepSeek' }} value={modelInput.provider} onValueChange={(provider) => setModelInput({ ...modelInput, provider })}>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="openai-compatible">OpenAI 兼容服务</SelectItem>
                                <SelectItem value="deepseek">DeepSeek</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        </div>
                        <div className="col-span-12">
                          <Field>
                            <FieldLabel>模型</FieldLabel>
                            <Select value={modelInput.model || undefined} onValueChange={(model) => setModelInput({ ...modelInput, model })}>
                              <SelectTrigger className="w-full"><SelectValue placeholder="先在线拉取模型" /></SelectTrigger>
                              <SelectContent>{availableModels.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent>
                            </Select>
                          </Field>
                        </div>
                      </div>
                      <Field>
                        <FieldLabel>Chat Completions 地址</FieldLabel>
                        <Input value={modelInput.endpoint} onChange={(event) => setModelInput({ ...modelInput, endpoint: event.target.value })} />
                      </Field>
                      <Field>
                        <FieldLabel>API Key</FieldLabel>
                        <PasswordInput value={modelInput.apiKey} placeholder="请输入 API Key" onChange={(event) => setModelInput({ ...modelInput, apiKey: event.target.value })} />
                      </Field>
                      <div className="flex gap-2">
                        <LoadingButton variant="outline" loading={discovering} onClick={discoverModels}>联网测试并拉取模型</LoadingButton>
                        <Button type="submit" disabled={!modelInput.model}>保存至 macOS Keychain</Button>
                      </div>
                    </form>
                  </SectionCard>
                  <SectionCard title="内容定位" className="section-row">
                    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); saveProfile(); }}>
                      <div className="grid grid-cols-24 gap-3">
                        <div className="col-span-12">
                          <Field>
                            <FieldLabel>我是谁</FieldLabel>
                            <Input value={profileInput.identity} onChange={(event) => setProfileInput({ ...profileInput, identity: event.target.value })} />
                          </Field>
                        </div>
                        <div className="col-span-12">
                          <Field>
                            <FieldLabel>写给谁</FieldLabel>
                            <Input value={profileInput.audience} onChange={(event) => setProfileInput({ ...profileInput, audience: event.target.value })} />
                          </Field>
                        </div>
                      </div>
                      <Field>
                        <FieldLabel>长期主题</FieldLabel>
                        <Input value={profileInput.themes} onChange={(event) => setProfileInput({ ...profileInput, themes: event.target.value })} />
                      </Field>
                      <Field>
                        <FieldLabel>真实判断与经历</FieldLabel>
                        <Textarea rows={3} value={profileInput.perspective} onChange={(event) => setProfileInput({ ...profileInput, perspective: event.target.value })} />
                      </Field>
                      <Field>
                        <FieldLabel>禁区</FieldLabel>
                        <Textarea rows={2} value={profileInput.boundaries} onChange={(event) => setProfileInput({ ...profileInput, boundaries: event.target.value })} />
                      </Field>
                      <div><Button type="submit">保存定位</Button></div>
                    </form>
                  </SectionCard>
                </>
              )}
              {settingsSection === 'automation' && (
                <>
                  <SectionCard title="每周生成排期">
                    <p className="text-sm text-foreground-muted">服务运行时，到点生成；遗漏任务会在恢复时补一次。</p>
                    <div className="schedule-list">
                      {weekdays.map((day, weekday) => {
                        const schedule = schedules.find((item) => item.weekday === weekday) || { weekday, time: '08:00', enabled: false, timeZone: 'Asia/Shanghai' };
                        return (
                          <div key={day} className="schedule-item">
                            <Switch checked={schedule.enabled} onCheckedChange={(enabled) => saveSchedule(weekday, { ...schedule, enabled })} />
                            <span>{day}</span>
                            <TimeField value={schedule.time} onValueChange={(time) => saveSchedule(weekday, { ...schedule, time })} />
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                  <BarkSettingsCard onChanged={refresh} />
                </>
              )}
              {settingsSection === 'data' && (
                <>
                  {dashboard && (
                    <SectionCard title="数据与保留策略">
                      <div className="grid grid-cols-24 gap-4">
                        <div className="col-span-24 xl:col-span-13">
                          <DescriptionList items={[
                            ['SQLite 文件', <span key="db" className="inline-flex items-center">{dashboard.dataLocations.database}<Copy className="copy-icon" onClick={() => copyPath(dashboard.dataLocations.database)} /></span>],
                            ['加密备份目录', <span key="bk" className="inline-flex items-center">{dashboard.dataLocations.backups}<Copy className="copy-icon" onClick={() => copyPath(dashboard.dataLocations.backups)} /></span>],
                            ['工作台前端', dashboard.dataLocations.frontend || '尚未构建'],
                            ['模型密钥', `${dashboard.dataLocations.keychain} · ${modelSettings.configured ? '已配置' : '未配置'}`],
                            ['X 内容与回复', '可编辑 180 天，只读 30 天后清理'],
                            ['待办与到期项', '保留至用户完成、停用或删除']
                          ]} />
                        </div>
                        <div className="col-span-24 xl:col-span-11">
                          <div className="font-medium">占用空间</div>
                          <Chart option={{ grid: { top: 8, right: 56, bottom: 8, left: 88 }, xAxis: { type: 'value', axisLabel: { formatter: (value) => formatBytes(value) }, splitLine: { lineStyle: { color: 'rgba(130,140,190,.16)' } } }, yAxis: { type: 'category', data: dashboard.storageBreakdown.map((item) => item.label), axisLine: { show: false }, axisTick: { show: false } }, series: [{ type: 'bar', data: dashboard.storageBreakdown.map((item) => item.bytes), barWidth: 16, itemStyle: { borderRadius: [0, 8, 8, 0], color: '#7567ff' }, label: { show: true, position: 'right', formatter: (params) => formatBytes(params.value) } }] }} height={150} />
                        </div>
                      </div>
                    </SectionCard>
                  )}
                  <ArchiveProfileCard onChanged={refresh} />
                </>
              )}
              {settingsSection === 'pairing' && (
                <SectionCard title="Chrome 扩展配对">
                  <p>在扩展设置页输入以下一次性代码：</p>
                  <div className="pairing-code">{pairingCode?.pairingCode || '------'}</div>
                  <p className="text-sm text-foreground-muted">{pairingCode?.expiresAt ? `有效至 ${new Date(pairingCode.expiresAt).toLocaleTimeString()}` : ''}</p>
                </SectionCard>
              )}
            </div>
          </div>
        )}
      </main>
        <Dialog open={backupOpen} onOpenChange={setBackupOpen}>
          <DialogContent className="sm:w-110">
            <DialogHeader>
              <DialogTitle>数据备份与恢复</DialogTitle>
              <DialogDescription>备份不包含模型 API Key 和扩展访问令牌。恢复会覆盖当前数据，并先在本机保留一份加密快照。</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>备份密码（至少 12 字符）</FieldLabel>
                <PasswordInput value={backupInput.password} onChange={(event) => setBackupInput({ ...backupInput, password: event.target.value })} />
              </Field>
              <div><Button disabled={backupInput.password.length < 12} onClick={exportBackup}>下载加密备份</Button></div>
              <Field>
                <FieldLabel>要恢复的备份内容</FieldLabel>
                <Textarea rows={4} value={backupInput.archive} placeholder="打开备份文件并粘贴全部内容" onChange={(event) => setBackupInput({ ...backupInput, archive: event.target.value })} />
              </Field>
              <Field>
                <FieldLabel>输入 RESTORE 确认覆盖</FieldLabel>
                <Input value={backupInput.confirmation} onChange={(event) => setBackupInput({ ...backupInput, confirmation: event.target.value })} />
              </Field>
              <div><Button variant="destructive" disabled={!backupInput.archive || backupInput.confirmation !== 'RESTORE' || backupInput.password.length < 12} onClick={restoreBackup}>恢复此备份</Button></div>
            </DialogBody>
            <DialogFooter>
              <DialogClose render={<Button variant="soft">关闭</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
      <Toaster />
    </ToastProvider>
  );
}

function DashboardPage({ dashboard, onGenerate, onRefresh, onNavigate }) {
  const urgentItems = dashboard.expiringItems.filter((item) => item.reminderStatus === 'overdue' || item.reminderStatus === 'due');
  const expiringOverdue = dashboard.expiringItems.filter((item) => item.reminderStatus === 'overdue').length;
  const expiringDue = dashboard.expiringItems.filter((item) => item.reminderStatus === 'due').length;
  const expiringUpcoming = dashboard.expiringItems.filter((item) => item.reminderStatus === 'upcoming').length;
  const charts = [
    { title: '待办', data: [{ name: '未完成', value: dashboard.taskStats.open }, { name: '已完成', value: dashboard.taskStats.completed }], palette: ['#42d5ff', '#7567ff'] },
    { title: '到期', data: [{ name: '已逾期', value: expiringOverdue }, { name: '待处理', value: expiringDue }, { name: '未到提醒', value: expiringUpcoming }], palette: ['#ff6b81', '#ff9c6e', '#42d5ff'] },
    { title: '候选', data: [{ name: '待处理', value: dashboard.candidateStats.active }, { name: '已过期', value: dashboard.candidateStats.expired }], palette: ['#7567ff', '#b46bff'] },
    { title: '素材', data: [{ name: '有效', value: dashboard.materialStats.active }, { name: '归档', value: dashboard.materialStats.archived }], palette: ['#42d5ff', '#b46bff'] }
  ];
  return (
    <>
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-6 px-4 py-5">
            <div>
              <div className="eyebrow">TODAY'S COMMAND CENTER</div>
              <h2 className="m-0 mt-1 text-3xl font-bold">把今天的判断，变成可发布的内容</h2>
              <p className="mt-1 text-foreground-muted">先处理阻塞事项，再生成可选择的创作候选。</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onRefresh}>刷新</Button>
              <Button size="lg" onClick={onGenerate}>开始今日创作</Button>
            </div>
          </div>
        </Card>
      <div className="section-row grid grid-cols-24 gap-4">
        {charts.map((chart) => (
          <div key={chart.title} className="col-span-24 sm:col-span-12 xl:col-span-6">
            <SectionCard title={chart.title}>
              {chart.data.some((item) => item.value > 0) ? <Chart option={donutOption(chart.data, chart.palette)} height={170} /> : <Empty description="暂无数据" />}
            </SectionCard>
          </div>
        ))}
      </div>
      <div className="section-row grid grid-cols-24 gap-4">
        <div className="col-span-24 xl:col-span-14">
          <SectionCard title="现在要处理">
            {dashboard.tasks.length || urgentItems.length ? (
              <div className="command-list">
                {dashboard.tasks.slice(0, 4).map((task) => (
                  <Button key={task.id} variant="ghost" className="justify-start" onClick={() => onNavigate('tasks')}>
                    <Badge variant={task.dueDate ? 'warning' : 'info'} size="sm">{task.dueDate || '收集箱'}</Badge>
                    <span className="ml-2">{task.title}</span>
                  </Button>
                ))}
                {urgentItems.slice(0, 3).map((item) => (
                  <Button key={item.id} variant="ghost" className="justify-start" onClick={() => onNavigate('expiring')}>
                    <Badge variant={item.reminderStatus === 'overdue' ? 'error' : 'warning'} size="sm">{item.reminderStatus === 'overdue' ? '已逾期' : '待处理'}</Badge>
                    <span className="ml-2">{item.name}</span>
                  </Button>
                ))}
              </div>
            ) : <Empty description="今天没有阻塞事项" />}
          </SectionCard>
        </div>
        <div className="col-span-24 xl:col-span-10">
          <SectionCard title="创作收件箱">
            <div className="text-3xl font-bold">{dashboard.pendingCandidateCount}<span className="text-base font-normal text-foreground-muted"> 条待选择候选</span></div>
            <p className="mt-2 text-sm text-foreground-muted">内容候选会在保留期内留在本机，按你的动作逐步形成个人偏好。</p>
            <div className="mt-3"><Button variant="outline" onClick={() => onNavigate('library')}>查看内容库</Button></div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function BarkSettingsCard({ onChanged }) {
  const [settings, setSettings] = useState(null);
  const [input, setInput] = useState({ deviceKey: '', serverUrl: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = async () => { try { setSettings(await api('/bark-settings')); setError(''); } catch (e) { setError(e.message); } };
  useEffect(() => { load(); }, []);
  const save = async () => { setSaving(true); setError(''); try { await api('/bark-settings', { method: 'PUT', body: JSON.stringify({ deviceKey: input.deviceKey, serverUrl: input.serverUrl }) }); setInput({ deviceKey: '', serverUrl: '' }); await load(); onChanged?.(); } catch (e) { setError(e.message); } finally { setSaving(false); } };
  return (
    <SectionCard title="Bark 手机推送" className="section-row">
      <p className="text-sm text-foreground-muted">安装 Bark App 后复制 device key 填入，到期提醒将推送到手机；服务地址留空使用官方 api.day.app。</p>
      <form className="mt-4 grid gap-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <Field>
          <FieldLabel>Device Key</FieldLabel>
          <PasswordInput value={input.deviceKey} placeholder={settings?.configured ? '已配置；输入新值才会更新' : ''} onChange={(event) => setInput({ ...input, deviceKey: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel>服务地址</FieldLabel>
          <Input value={input.serverUrl} placeholder="https://api.day.app" onChange={(event) => setInput({ ...input, serverUrl: event.target.value })} />
        </Field>
        {error && <span className="text-error">{error}</span>}
        <div className="flex items-center gap-2">
          <LoadingButton loading={saving} disabled={!input.deviceKey} onClick={save}>保存 Bark 配置</LoadingButton>
          {settings?.configured && <span className="text-sm text-foreground-muted">已配置推送</span>}
        </div>
      </form>
    </SectionCard>
  );
}

const SEMANTIC_FIELDS = [
  { key: 'identity', label: '我是谁' },
  { key: 'audience', label: '受众' },
  { key: 'tone', label: '口吻' },
  { key: 'perspective', label: '反复观点' }
];
function ArchiveProfileCard({ onChanged }) {
  const fileInput = useRef(null);
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState({});
  const [ignored, setIgnored] = useState({});

  const load = async () => {
    try { setProfile(await api('/archive-profile')); setError(''); } catch (e) { setError(e.message); } finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, []);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true); setError('');
    try {
      const response = await fetch('/v1/archive/import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '导入失败。');
      setEdits({}); setIgnored({});
      await load();
    } catch (e) { setError(e.message); } finally { setUploading(false); }
  };

  const confirm = async (field) => {
    setConfirming(true); setError('');
    try {
      await api('/archive-profile/confirm', { method: 'POST', body: JSON.stringify({ [field]: edits[field] ?? profile.semantic[field] }) });
      await load(); onChanged?.();
    } catch (e) { setError(e.message); } finally { setConfirming(false); }
  };

  const ignore = (field) => setIgnored((current) => ({ ...current, [field]: true }));
  const objective = profile?.objective;
  const semantic = profile?.semantic;

  return (
    <SectionCard title="X 归档画像" className="section-row">
      <p className="text-sm text-foreground-muted">导入 X 官方归档，从真实历史提炼个人画像。仅本机处理，私信、点赞与收藏不读取；原 ZIP 不落盘。</p>
      <div className="section-row flex items-center gap-2">
        <input ref={fileInput} type="file" accept=".zip" onChange={onFile} className="hidden" />
        <LoadingButton variant="outline" loading={uploading} onClick={() => fileInput.current?.click()}>上传 X 归档 ZIP</LoadingButton>
        {loaded && !profile?.objective && !error && <span className="text-sm text-foreground-muted">尚未导入归档。</span>}
      </div>
      {error && (
        <Card className="notice-card mt-4">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-error">{error}</span>
            <Button size="sm" variant="outline" onClick={load}>重试</Button>
          </div>
        </Card>
      )}
      {objective && (
        <>
          <SectionCard title="客观画像（已直接生效）" className="section-row">
            <DescriptionList items={[
              ['主要语言', objective.language],
              ['形态比例', `原创 ${objective.contentMix.original} · 回复 ${objective.contentMix.reply} · 转推 ${objective.contentMix.repost}`],
              ['主题偏好', objective.topics.length ? (
                <span className="flex flex-wrap gap-1">{objective.topics.map((item) => <Badge key={item.topic} variant="info" size="sm">{item.topic} · {item.count}</Badge>)}</span>
              ) : '暂无']
            ]} />
          </SectionCard>
          <SectionCard title="活跃时段建议（仅展示，不自动改排期）" className="section-row">
            {objective.activeHours.length ? (
              <span className="flex flex-wrap gap-1">{objective.activeHours.slice(0, 5).map((item) => <Badge key={item.hour} variant="outline" size="sm">{item.hour} 点 · {item.count} 次</Badge>)}</span>
            ) : <span className="text-sm text-foreground-muted">暂无</span>}
          </SectionCard>
        </>
      )}
      {semantic && SEMANTIC_FIELDS.filter(({ key }) => semantic[key]).length > 0 && (
        <SectionCard title="语义画像（逐项确认后写回定位）" className="section-row">
          {SEMANTIC_FIELDS.map(({ key, label }) => {
            if (!semantic[key]) return null;
            const isIgnored = ignored[key];
            return (
              <div key={key} className="preference-row">
                <div>
                  <div className="font-semibold">{label}</div>
                  <p className="text-sm text-foreground-muted">{semantic[key]}</p>
                </div>
                {isIgnored ? <Badge variant="outline">已忽略</Badge> : (
                  <div className="flex items-center gap-2">
                    <Input value={edits[key] ?? semantic[key]} onChange={(event) => setEdits({ ...edits, [key]: event.target.value })} />
                    <LoadingButton size="sm" loading={confirming} onClick={() => confirm(key)}>写回定位</LoadingButton>
                    <Button size="sm" variant="outline" onClick={() => ignore(key)}>忽略</Button>
                  </div>
                )}
              </div>
            );
          })}
        </SectionCard>
      )}
    </SectionCard>
  );
}

createRoot(document.getElementById('root')).render(<App />);
