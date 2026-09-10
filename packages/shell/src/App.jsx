import * as LucideIcons from 'lucide-react';
import { createElement, memo, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { useToastManager, ToastProvider, Toaster } from '@appica/ui-react/toast';
import { dashboardViewModel, localDateKey, calendarDateKey, sortUpcomingItems, promptIdentity, promptIndexForId } from './dashboardViewModel.js';

// shadcn/ui local primitives
import { Button } from '@appica/ui-react/button';
import { Card } from '@appica/ui-react/card';
import { Badge } from '@appica/ui-react/badge';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { Tabs, TabsList, TabsTrigger } from '@appica/ui-react/tabs';
import { ScrollArea } from '@appica/ui-react/scroll-area';
import { Switch } from '@appica/ui-react/switch';
import { TimeField } from '@appica/ui-react/time-field';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Navigation, NavigationList, NavigationItem, NavigationLink } from '@appica/ui-react/navigation';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@appica/ui-react/collapsible';
import { TextAnimate } from '@appica/ui-react/text-animate';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from '@appica/ui-react/dialog';

import { LayoutGrid, LayoutDashboard, Book, FileText, Database, Settings, Bolt, ChevronRight, CircleCheckFilled, CircleXFilled, Copy, ChartBar, Home, Checklist, Alarm, BrandX, Box, History, Palette, ChartPie, ChartCandle, ChartLine, Target, Wallet, Archive, Books } from '@appica/icons-react';

// Core 共享能力
import { api, reportApiError, API_REQUEST_START_EVENT, API_REQUEST_END_EVENT, API_REQUEST_ERROR_EVENT, formatBytes, Chart, donutOption, Empty, SectionCard, DescriptionList, Metric, NumberRoller, PasswordInput, LoadingButton } from '@personal-workbench/core';

// 业务模块
import { TaskPage } from '@personal-workbench/module-tasks';
import { ExpiringItemsPage } from '@personal-workbench/module-expiring';
import { ContentArchivePage, XOverviewPage, LibraryPage, MaterialsPage, RepliesPage, StylePage, AnalyticsPage } from '@personal-workbench/module-x';
import { StockPositionsPage, StockEntryPlansPage, StockMarketPage } from '@personal-workbench/module-stock';
import { MenstrualCyclePage } from '@personal-workbench/module-cycle';
import { KindlePage } from '@personal-workbench/module-kindle';
import { ProgrammingRecordsPage } from '@personal-workbench/module-records';

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const MENU_STORAGE_KEY = 'x-assistant-navigation';
const menuIconOptions = { LayoutGrid, Home, Checklist, Alarm, ChartCandle, Target, ChartLine, Wallet, BrandX, LayoutDashboard, Book, Archive, Box, History, Palette, ChartPie, Settings, Books };
const defaultNavigationGroups = [
  { id: 'general', items: [
    { key: 'dashboard-v2', label: '首页', iconName: 'Home' },
    { key: 'tasks', label: '待办事项', iconName: 'Checklist' },
    { key: 'expiring', label: '到期与提醒', iconName: 'Alarm' },
    { key: 'kindle', label: 'Kindle', iconName: 'Books' }
  ] },
  { id: 'stock', label: '股票', iconName: 'ChartCandle', items: [
    { key: 'stock-entry-plans', label: '待开仓股票', iconName: 'Target' },
    { key: 'stock-market', label: '市场', iconName: 'ChartLine' },
    { key: 'stock-positions', label: '仓位管理', iconName: 'Wallet' }
  ] },
  { id: 'programming', label: '编程', iconName: 'Books', items: [
    { key: 'programming-records', label: '记录', iconName: 'Book' }
  ] },
  { id: 'x', label: 'X ASSISTANT', iconName: 'BrandX', items: [
    { key: 'x-overview', label: 'X 概览', iconName: 'LayoutDashboard' },
    { key: 'library', label: '内容库', iconName: 'Book' },
    { key: 'archive', label: '内容归档', iconName: 'Archive' },
    { key: 'materials', label: '素材库', iconName: 'Box' },
    { key: 'replies', label: '回复历史', iconName: 'History' },
    { key: 'style', label: '个人风格', iconName: 'Palette' },
    { key: 'analytics-v2', label: '数据统计', iconName: 'ChartPie' }
  ] },
  { id: 'health', label: '健康', iconName: 'ChartLine', items: [
    { key: 'menstrual-cycle', label: '经期', iconName: 'ChartLine' }
  ] },
  { id: 'system', items: [
    { key: 'settings', label: '设置', iconName: 'Settings' }
  ] }
];
function normalizeNavigationGroups(groups) {
  return groups.flatMap((group) => {
    const items = Array.isArray(group.items) ? group.items.map((item) => ({ ...item })) : [];
    if (group.label || items.length === 0) return [{ ...group, items }];
    return items.map((item) => ({ id: item.key, items: [item] }));
  });
}
function navigationModuleKey(group) {
  return group.label ? group.id : group.items[0]?.key || group.id;
}
function readNavigationGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem(MENU_STORAGE_KEY));
    if (!Array.isArray(saved)) return normalizeNavigationGroups(defaultNavigationGroups);
    const savedGroups = new Map(saved.map((group) => [group.id, group]));
    const savedItems = new Map(saved.flatMap((group) => Array.isArray(group.items) ? group.items : []).map((item) => [item.key, item]));
    const savedOrder = new Map();
    let nextOrder = 0;
    for (const group of saved) {
      if (group.label) savedOrder.set(group.id, nextOrder++);
      else for (const item of Array.isArray(group.items) ? group.items : []) savedOrder.set(item.key, nextOrder++);
    }
    const groups = defaultNavigationGroups.flatMap((group) => {
      const savedGroup = savedGroups.get(group.id);
      const items = group.items.map((item) => ({ ...item, ...(savedItems.get(item.key) || {}) }));
      if (group.label || savedGroup?.label) return [{ ...group, ...savedGroup, items }];
      return items.map((item) => ({ id: item.key, items: [item] }));
    });
    groups.sort((left, right) => (savedOrder.get(navigationModuleKey(left)) ?? Number.MAX_SAFE_INTEGER) - (savedOrder.get(navigationModuleKey(right)) ?? Number.MAX_SAFE_INTEGER));
    return groups;
  } catch { return normalizeNavigationGroups(defaultNavigationGroups); }
}
function serializableNavigationGroups(groups) {
  return groups.map(({ id, label, iconName, items }) => ({ id, label, iconName, items: items.map(({ key, label: itemLabel, iconName: itemIconName }) => ({ key, label: itemLabel, iconName: itemIconName })) }));
}
const settingsSections = [
  { key: 'model', label: '模型与内容', Icon: Settings },
  { key: 'market', label: '行情数据', Icon: ChartBar },
  { key: 'automation', label: '排期与推送', Icon: Bolt },
  { key: 'data', label: '数据与备份', Icon: Database },
  { key: 'pairing', label: '扩展配对', Icon: LayoutGrid },
  { key: 'navigation', label: '菜单维护', Icon: Settings }
];
const X_ASSISTANT_KEYS = ['x-overview', 'library', 'archive', 'materials', 'replies', 'style', 'analytics-v2'];
const STOCK_KEYS = ['stock-entry-plans', 'stock-market', 'stock-positions'];
const HEALTH_KEYS = ['menstrual-cycle'];
const PROGRAMMING_KEYS = ['programming-records'];
const GROUP_KEYS = { x: X_ASSISTANT_KEYS, stock: STOCK_KEYS, health: HEALTH_KEYS, programming: PROGRAMMING_KEYS };
const pageLabels = new Map([
  ['dashboard-v2', '首页'], ['tasks', '待办事项'], ['expiring', '到期与提醒'], ['x-overview', 'X 概览'], ['library', '内容库'], ['archive', '内容归档'], ['materials', '素材库'],
  ['kindle', 'Kindle'],
  ['replies', '回复历史'], ['style', '个人风格'], ['analytics-v2', '数据统计'], ['stock-entry-plans', '待开仓股票'], ['stock-market', '市场'], ['stock-positions', '仓位管理'], ['menstrual-cycle', '经期'], ['programming-records', '记录'], ['settings', '设置']
]);
const PAGE_PATHS = { 'dashboard-v2': '/', 'tasks': '/tasks', 'expiring': '/expiring', 'kindle': '/kindle', 'x-overview': '/x-overview', 'library': '/library', 'archive': '/archive', 'materials': '/materials', 'replies': '/replies', 'style': '/style', 'analytics-v2': '/analytics', 'stock-entry-plans': '/stock/entry-plans', 'stock-market': '/stock/market', 'stock-positions': '/stock/positions', 'menstrual-cycle': '/health/menstrual-cycle', 'programming-records': '/programming/records', 'settings': '/settings' };
function pageFromPath(pathname) {
  if (pathname === '/stock/stats') return 'stock-positions';
  const entry = Object.entries(PAGE_PATHS).find(([, path]) => path === pathname);
  return entry ? entry[0] : 'dashboard-v2';
}


function AppInner() {
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setClockNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('x-assistant-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    localStorage.setItem('x-assistant-theme', themeMode);
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    document.documentElement.classList.toggle('light', themeMode === 'light');
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);
  const toast = useToastManager();
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  const [navigationTarget, setNavigationTarget] = useState(null);
  const previousPageRef = useRef(page);
  const [openGroups, setOpenGroups] = useState(() => new Set(Object.entries(GROUP_KEYS).filter(([, keys]) => keys.includes(page)).map(([key]) => key)));
  useEffect(() => { setOpenGroups((current) => { const next = new Set(current); for (const [key, keys] of Object.entries(GROUP_KEYS)) if (keys.includes(page)) next.add(key); return next; }); }, [page]);
  const [dashboard, setDashboard] = useState(null);
  const [stockPositions, setStockPositions] = useState([]);
  const [packs, setPacks] = useState([]);
  const [contentArchive, setContentArchive] = useState([]);
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
  const [pendingRequestIds, setPendingRequestIds] = useState(() => new Set());
  const [backupInput, setBackupInput] = useState({ password: '', archive: '', confirmation: '' });
  const [settingsSection, setSettingsSection] = useState('model');
  const [navigationGroups, setNavigationGroups] = useState(readNavigationGroups);
  const [backupOpen, setBackupOpen] = useState(false);
  useEffect(() => { localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(serializableNavigationGroups(navigationGroups))); }, [navigationGroups]);

  useEffect(() => {
    const start = (event) => setPendingRequestIds((current) => new Set(current).add(event.detail.requestId));
    const end = (event) => setPendingRequestIds((current) => {
      const next = new Set(current);
      next.delete(event.detail.requestId);
      return next;
    });
    const error = (event) => {
      const message = event.detail.message;
      toast.add({
        title: '请求失败',
        description: message,
        type: 'error',
        priority: 'high',
        data: { icon: <CircleXFilled className="text-error-emphasis" /> },
      });
    };
    window.addEventListener(API_REQUEST_START_EVENT, start);
    window.addEventListener(API_REQUEST_END_EVENT, end);
    window.addEventListener(API_REQUEST_ERROR_EVENT, error);
    return () => {
      window.removeEventListener(API_REQUEST_START_EVENT, start);
      window.removeEventListener(API_REQUEST_END_EVENT, end);
      window.removeEventListener(API_REQUEST_ERROR_EVENT, error);
    };
  }, [toast]);

  const refresh = async () => {
    try {
      const [nextDashboard, nextPacks, nextMaterials, nextReplies, nextStyle, nextSchedules, nextModelSettings, nextPairing, nextContentArchive, nextStocks] = await Promise.all([
        api('/dashboard'), api('/content-packs'), api('/materials'), api('/reply-sessions'), api('/style'), api('/schedules'), api('/model-settings'), api('/pairing-code'), api('/content-feedback-archive'), api('/stock-positions')
      ]);
      setDashboard(nextDashboard);
      setPacks(nextPacks.packs);
      setMaterials(nextMaterials.materials);
      setReplies(nextReplies.sessions);
      setStyle(nextStyle);
      setSchedules(nextSchedules.schedules);
      setModelSettings(nextModelSettings);
      setPairingCode(nextPairing);
      setContentArchive(nextContentArchive.entries);
      setStockPositions(nextStocks.positions || []);
      setProfileInput((current) => current.identity ? current : { ...nextDashboard.profile, themes: nextDashboard.profile.themes.join('、') });
      setModelInput((current) => ({ ...current, provider: nextModelSettings.provider || current.provider, endpoint: nextModelSettings.endpoint || current.endpoint, model: nextModelSettings.model || current.model, apiKey: nextModelSettings.apiKey || current.apiKey }));
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    }
  };
  function navigate(nextPage, entityId) {
    const resolvedPage = nextPage === 'calendar' ? 'dashboard-v2' : nextPage;
    const path = PAGE_PATHS[resolvedPage];
    if (!path) return;
    if (resolvedPage === 'library' && entityId) setFilters({ topic: '', language: '', status: '' });
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setPage(resolvedPage);
    setNavigationTarget(entityId ? { page: resolvedPage, entityId: String(entityId) } : null);
  }
  useEffect(() => {
    const onPop = () => {
      setPage(pageFromPath(window.location.pathname));
      setNavigationTarget(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (page === 'dashboard-v2' && previousPageRef.current !== page) refresh();
    previousPageRef.current = page;
  }, [page]);
  const topics = useMemo(() => [...new Set(packs.flatMap((pack) => pack.candidates.map((candidate) => candidate.topic)))], [packs]);
  const filteredPacks = useMemo(() => packs.filter((pack) => (!filters.status || pack.retentionStatus === filters.status) && (!filters.topic || pack.candidates.some((candidate) => candidate.topic === filters.topic)) && (!filters.language || pack.candidates.some((candidate) => candidate.language === filters.language))), [filters, packs]);

  async function withFeedback(action, successMessage) {
    try {
      await action();
      if (successMessage) toast.add({ title: successMessage, data: { icon: <CircleCheckFilled className="text-success-emphasis" /> } });
    } catch (error) {
      if (!error?.isApiError) {
        toast.add({
          title: '操作失败',
          description: error.message,
          type: 'error',
          priority: 'high',
          data: { icon: <CircleXFilled className="text-error-emphasis" /> },
        });
      }
    }
  }
  async function toggleTask(id, status) { await withFeedback(async () => { await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await refresh(); }, status === 'completed' ? '待办已完成' : '待办已重新打开'); }
  async function copyPath(text) {
    try { await navigator.clipboard.writeText(text); toast.add({ title: '已复制', data: { icon: <CircleCheckFilled className="text-success-emphasis" /> } }); }
    catch { toast.add({ title: '复制失败', data: { icon: <CircleXFilled className="text-error-emphasis" /> } }); }
  }
  async function candidateEvent(id, type) { await withFeedback(async () => { await api(`/content-candidates/${id}/events`, { method: 'POST', body: JSON.stringify({ type }) }); await refresh(); }, type === 'copied' ? '已复制' : '已加入发布计划'); }
  async function candidatePlan(id, plannedPublishTime) { await withFeedback(async () => { await api(`/content-candidates/${id}/publication-plan`, { method: 'PUT', body: JSON.stringify({ plannedPublishTime }) }); await refresh(); }, plannedPublishTime ? `已安排在 ${plannedPublishTime} 发布` : '已移出发布计划'); }
  async function archiveCandidateCopy(id, content) { await withFeedback(async () => { await navigator.clipboard.writeText(content); await api(`/content-candidates/${id}/archive`, { method: 'POST' }); await refresh(); }, '已复制并移入内容归档'); }
  async function setArchivePerformance(id, performance) { await withFeedback(async () => { await api(`/content-feedback-archive/${id}`, { method: 'PUT', body: JSON.stringify({ performance }) }); await refresh(); }, performance === 'good' ? '已标记流量表现好' : '已标记流量表现一般'); }
  async function addMaterial() { await withFeedback(async () => { await api('/materials', { method: 'POST', body: JSON.stringify(materialInput) }); setMaterialInput({ content: '', topic: '', mayQuoteVerbatim: false }); await refresh(); }, '素材已保存'); }
  async function saveSchedule(weekday, values) { await withFeedback(async () => { await api(`/schedules/${weekday}`, { method: 'PUT', body: JSON.stringify(values) }); await refresh(); }); }
  async function discoverModels() { await withFeedback(async () => { setDiscovering(true); const result = await api('/model-settings/discover', { method: 'POST', body: JSON.stringify(modelInput) }); setAvailableModels(result.models); setModelInput((current) => ({ ...current, model: result.models.includes(current.model) ? current.model : result.models[0] })); }, '模型服务已连通，已拉取可用模型'); setDiscovering(false); }
  async function saveModel() { await withFeedback(async () => { await api('/model-settings', { method: 'PUT', body: JSON.stringify(modelInput) }); await refresh(); }, '模型配置已保存至 macOS Keychain'); }
  async function saveProfile() { await withFeedback(async () => { await api('/profile', { method: 'PUT', body: JSON.stringify({ ...profileInput, themes: profileInput.themes.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) }) }); await refresh(); }, '内容定位已保存'); }
  async function exportBackup() { await withFeedback(async () => { const result = await api('/backups/export', { method: 'POST', body: JSON.stringify({ password: backupInput.password }) }); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([result.archive], { type: 'application/json' })); link.download = `x-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); }, '加密备份已下载'); }
  async function restoreBackup() { await withFeedback(async () => { await api('/backups/restore', { method: 'POST', body: JSON.stringify(backupInput) }); await refresh(); setBackupInput({ password: '', archive: '', confirmation: '' }); }, '备份已恢复；恢复前快照已保留在本机'); }

  const customPageLabel = navigationGroups.flatMap((group) => group.items).find((item) => item.key === page)?.label;
  const pageTitle = customPageLabel || pageLabels.get(page) || '首页';
  const now = clockNow;
  const lunarToday = page === 'dashboard-v2' ? dashboard?.calendar?.days?.find((day) => day.date === localDateKey(now))?.lunarLabel : null;
  const greeting = now.getHours() < 12 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好';
  const todayLabel = `${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
  const headerTitle = page === 'dashboard-v2' ? `${greeting}，${todayLabel}` : pageTitle;

  return (
    <div className="workspace flex">
      <aside className="workspace-sider shrink-0">
        <div className="brand">
          <span className="brand-logo"><Bolt /></span>
          工作台
        </div>
        <Navigation aria-label="主导航" orientation="vertical" activeLink={page}>
          {navigationGroups.map((group, groupIndex) => {
            if (group.label) {
              const GroupIcon = menuIconOptions[group.iconName] || LayoutGrid;
              return (
                <Collapsible key={groupIndex} open={openGroups.has(group.id)} onOpenChange={(open) => setOpenGroups((current) => { const next = new Set(current); if (open) next.add(group.id); else next.delete(group.id); return next; })}>
                  <CollapsibleTrigger aria-label={group.label} title={group.label} className="group relative inline-flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-2 text-start text-sm font-medium text-foreground-strong outline-none transition-colors hover:bg-background-muted hover:text-foreground-intense">
                    <GroupIcon className="size-4.5 shrink-0" />
                    <span className="flex-1">{group.label}</span>
                    <ChevronRight className="size-4 shrink-0 transition-transform duration-200 group-data-panel-open:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <NavigationList className="ps-2">
                      {group.items.map(({ key, label, iconName }) => {
                        const Icon = menuIconOptions[iconName] || LayoutGrid;
                        return (
                        <NavigationItem key={key}>
                          <NavigationLink href={PAGE_PATHS[key]} value={key} aria-label={label} title={label} className="w-full" onClick={(event) => { event.preventDefault(); navigate(key); }}>
                            <Icon data-icon="start" />
                            {label}
                          </NavigationLink>
                        </NavigationItem>
                        );
                      })}
                    </NavigationList>
                  </CollapsibleContent>
                </Collapsible>
              );
            }
            return (
              <NavigationList key={groupIndex}>
                {group.items.map(({ key, label, iconName }) => {
                  const Icon = menuIconOptions[iconName] || LayoutGrid;
                  return (
                  <NavigationItem key={key}>
                    <NavigationLink href={PAGE_PATHS[key]} value={key} aria-label={label} title={label} className="w-full" onClick={(event) => { event.preventDefault(); navigate(key); }}>
                      <Icon data-icon="start" />
                      {label}
                    </NavigationLink>
                  </NavigationItem>
                  );
                })}
              </NavigationList>
            );
          })}
        </Navigation>
        <div className="service-state">
          <Badge variant="success">本地服务已连接</Badge>
        </div>
      </aside>
      <main className="relative min-w-0 flex-1 flex flex-col px-14 py-11">
        <div className="page-theme-toggle flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm" title="切换明暗主题">
            <Switch aria-label="切换明暗主题" checked={themeMode === 'dark'} onCheckedChange={(checked) => setThemeMode(checked ? 'dark' : 'light')} />
            <span>{themeMode === 'dark' ? '暗' : '明'}</span>
          </label>
          <Button variant="outline" size="icon-sm" aria-label="备份" title="备份" onClick={() => setBackupOpen(true)}>
            <Archive aria-hidden="true" />
          </Button>
        </div>
        <header className="page-header shrink-0">
          <div>
            <h1>{headerTitle} <time className="dashboard-clock" dateTime={now.toISOString()}><NumberRoller value={now.getHours() * 60 + now.getMinutes()} format={formatClockValue} ariaLabel={now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })} /></time></h1>
            <p className="text-foreground-muted">{page === 'dashboard-v2' ? `今天的重点、时间线与下一步行动都在这里${lunarToday ? ` · ${lunarToday}` : ''}` : '内容、素材与互动记录仅保留在本机；模型密钥由 macOS Keychain 管理'}</p>
          </div>
          {pendingRequestIds.size > 0 && (
            <div className="page-header-actions flex items-center gap-2">
              <Badge aria-live="polite" variant="warning">正在处理数据…</Badge>
            </div>
          )}
        </header>

        {page !== 'settings' && (
          <div className="dashboard-scroll min-h-0 flex-1 overflow-y-auto">
            {page === 'dashboard-v2' && dashboard && <DashboardPage dashboard={dashboard} stockPositions={stockPositions} onRefresh={refresh} onNavigate={navigate} onTaskToggle={toggleTask} />}
            {page === 'x-overview' && dashboard && <XOverviewPage dashboard={dashboard} candidateEvent={candidateEvent} candidatePlan={candidatePlan} />}
            {page === 'expiring' && <ExpiringItemsPage focusId={navigationTarget?.page === 'expiring' ? navigationTarget.entityId : null} />}
            {page === 'tasks' && <TaskPage focusId={navigationTarget?.page === 'tasks' ? navigationTarget.entityId : null} />}
            {page === 'library' && <LibraryPage topics={topics} filters={filters} setFilters={setFilters} packs={packs} filteredPacks={filteredPacks} candidateArchive={archiveCandidateCopy} candidateEvent={candidateEvent} candidatePlan={candidatePlan} focusId={navigationTarget?.page === 'library' ? navigationTarget.entityId : null} />}
            {page === 'archive' && <ContentArchivePage entries={contentArchive} onPerformance={setArchivePerformance} />}
            {page === 'materials' && <MaterialsPage materials={materials} materialInput={materialInput} setMaterialInput={setMaterialInput} addMaterial={addMaterial} />}
            {page === 'replies' && <RepliesPage replies={replies} />}
            {page === 'style' && style && <StylePage style={style} withFeedback={withFeedback} refresh={refresh} />}
            {page === 'analytics-v2' && <AnalyticsPage packs={packs} tasks={dashboard?.tasks || []} expiringItems={dashboard?.expiringItems || []} />}

            {page === 'stock-entry-plans' && <StockEntryPlansPage />}
            {page === 'stock-market' && <StockMarketPage />}
            {page === 'stock-positions' && <StockPositionsPage />}
            {page === 'menstrual-cycle' && <MenstrualCyclePage />}
            {page === 'kindle' && <KindlePage />}
            {page === 'programming-records' && <ProgrammingRecordsPage />}
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
              {settingsSection === 'market' && <FinnhubSettingsCard />}
              {settingsSection === 'automation' && (
                <>
                  <SectionCard title="每周晚间生成排期">
                    <p className="text-sm text-foreground-muted">默认每晚 22:00 生成次日候选；服务恢复后会补一次遗漏任务。</p>
                    <div className="schedule-list">
                      {weekdays.map((day, weekday) => {
                        const schedule = schedules.find((item) => item.weekday === weekday) || { weekday, time: '22:00', enabled: true, timeZone: 'Asia/Shanghai' };
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
              {settingsSection === 'navigation' && <NavigationSettingsPage groups={navigationGroups} onChange={setNavigationGroups} />}
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

function cloneNavigationGroups(groups) {
  return groups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) }));
}

function reorder(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const RECENT_ICON_STORAGE_KEY = 'x-assistant-recent-icons';
const iconAliases = { Home: '首页主页', Checklist: '待办清单任务', Alarm: '提醒闹钟到期', ChartCandle: '股票行情蜡烛图', Target: '目标定位', ChartLine: '趋势数据', Wallet: '钱包仓位', BrandX: '品牌社交', LayoutDashboard: '仪表盘概览', Book: '书籍内容', Archive: '归档', Box: '素材盒子', History: '历史记录', Palette: '风格颜色', ChartPie: '统计分析', Settings: '设置系统' };

function IconPicker({ value, onChange, label }) {
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const iconRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('recent');
  const [recent, setRecent] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(RECENT_ICON_STORAGE_KEY)); return Array.isArray(saved) ? saved.filter((name) => menuIconOptions[name]).slice(0, 8) : []; } catch { return []; }
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [iconCatalog, setIconCatalog] = useState(() => Object.entries(menuIconOptions));
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const allIcons = iconCatalog;
  const source = scope === 'recent' && !query ? [...new Set([value, ...recent])].filter((name) => menuIconOptions[name]).map((name) => [name, menuIconOptions[name]]) : allIcons;
  const results = source.filter(([name]) => !query || `${name} ${iconAliases[name] || ''}`.toLowerCase().includes(query.toLowerCase()));
  const CurrentIcon = menuIconOptions[value] || LayoutGrid;

  useEffect(() => {
    if (!open || catalogLoaded) return undefined;
    let cancelled = false;
    Promise.resolve(LucideIcons).then((module) => {
      if (cancelled) return;
      const completeCatalog = Object.entries(module).filter(([name, Icon]) => !name.endsWith('Icon') && typeof Icon === 'function');
      Object.assign(menuIconOptions, Object.fromEntries(completeCatalog));
      setIconCatalog(completeCatalog);
      setCatalogLoaded(true);
    });
    return () => { cancelled = true; };
  }, [open, catalogLoaded]);
  useEffect(() => { if (open) requestAnimationFrame(() => searchRef.current?.focus()); }, [open]);
  useEffect(() => setActiveIndex(0), [query, scope]);
  const close = () => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); };
  const choose = (name) => {
    const nextRecent = [name, ...recent.filter((item) => item !== name)].slice(0, 8);
    setRecent(nextRecent);
    localStorage.setItem(RECENT_ICON_STORAGE_KEY, JSON.stringify(nextRecent));
    onChange(name);
    close();
  };
  const onGridKeyDown = (event) => {
    if (!results.length) return;
    const columns = window.matchMedia('(max-width: 620px)').matches ? 6 : 8;
    let next = activeIndex;
    if (event.key === 'ArrowRight') next = Math.min(activeIndex + 1, results.length - 1);
    if (event.key === 'ArrowLeft') next = Math.max(activeIndex - 1, 0);
    if (event.key === 'ArrowDown') next = Math.min(activeIndex + columns, results.length - 1);
    if (event.key === 'ArrowUp') next = Math.max(activeIndex - columns, 0);
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(results[activeIndex][0]); return; }
    if (next !== activeIndex) { event.preventDefault(); setActiveIndex(next); requestAnimationFrame(() => iconRefs.current[next]?.focus()); }
  };
  return <div className="icon-picker"><Button ref={triggerRef} type="button" variant="outline" size="sm" className="icon-picker-trigger" aria-label={label} aria-haspopup="dialog" title={label} onClick={() => setOpen(true)}><CurrentIcon className="size-5" /></Button><Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); else close(); }}><DialogContent className="icon-picker-dialog" closeLabel="关闭图标选择"><DialogHeader className="px-6 pt-6 pe-14"><DialogTitle>{label}</DialogTitle><DialogDescription>搜索或从最近使用的图标中选择，选择后会立即应用。</DialogDescription></DialogHeader><DialogBody className="icon-picker-dialog-body px-6 py-5"><Input ref={searchRef} autoFocus value={query} placeholder="搜索图标名称或别名" aria-label="搜索图标" onChange={(event) => setQuery(event.target.value)} /><Tabs value={scope} onValueChange={setScope} variant="pill" size="sm"><TabsList><TabsTrigger value="recent">最近使用</TabsTrigger><TabsTrigger value="all">全部</TabsTrigger></TabsList></Tabs><ScrollArea className="icon-picker-scroll" orientation="vertical" scrollbarVisibility="auto"><div className="icon-picker-results" role="grid" aria-label="图标结果" onKeyDown={onGridKeyDown}>{results.length ? results.map(([name, Icon], index) => <Button key={name} type="button" variant="ghost" size="icon-sm" role="gridcell" tabIndex={index === activeIndex ? 0 : -1} className={`icon-choice ${name === value ? 'is-selected' : ''} ${index === activeIndex ? 'is-focused' : ''}`} aria-label={name} title={`${name}：${iconAliases[name] || ''}`} ref={(element) => { iconRefs.current[index] = element; }} onFocus={() => setActiveIndex(index)} onClick={() => choose(name)}><Icon className="size-5" /></Button>) : <div className="icon-picker-empty">没有匹配的图标</div>}</div></ScrollArea></DialogBody><DialogFooter className="px-6 pb-6"><span className="text-xs text-foreground-muted">方向键移动，Enter 选择</span><Button variant="outline" onClick={close}>取消</Button></DialogFooter></DialogContent></Dialog></div>;
}

function NavigationMenuItemEditor({ item, groupIndex, itemIndex, dragged, updateItem, startDrag, dropItem, moveByKeyboard }) {
  const Icon = menuIconOptions[item.iconName] || LayoutGrid;
  return (
    <div
      className={`menu-item-editor ${dragged?.type === 'item' && dragged.itemKey === item.key ? 'is-dragging' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => dropItem(groupIndex, itemIndex)}
    >
      <Button type="button" variant="ghost" size="icon-sm" className="drag-handle item-drag-handle" draggable aria-label={`拖动菜单项：${item.label}`} onDragStart={() => startDrag({ type: 'item', groupIndex, itemIndex, itemKey: item.key })} title="拖动排序">⠿</Button>
      <span className="item-icon-preview"><Icon className="size-5" /></span>
      <Input className="min-w-0 flex-1" value={item.label} aria-label={`${item.key} 菜单名`} title={item.label} onChange={(event) => updateItem(groupIndex, item.key, { label: event.target.value })} onKeyDown={(event) => moveByKeyboard(event, groupIndex, itemIndex)} />
      <IconPicker value={item.iconName} onChange={(iconName) => updateItem(groupIndex, item.key, { iconName })} label={`${item.label}图标`} />
      <span className="keyboard-hint" aria-label="可使用 Alt 或 Command 加方向键排序">⌥/⌘ ↑↓</span>
    </div>
  );
}

function NavigationGroupEditor({ group, groupIndex, dragged, startDrag, dropGroup, dropItem, moveGroupByKeyboard, moveByKeyboard, updateGroup, updateItem }) {
  return (
    <details className={`navigation-group ${dragged?.type === 'group' && dragged.groupIndex === groupIndex ? 'is-dragging' : ''}`} open onDragOver={(event) => event.preventDefault()} onDrop={() => dropGroup(groupIndex)}>
      <summary className="navigation-group-summary">
        <Button type="button" variant="ghost" size="icon-sm" className="drag-handle" draggable aria-label={`拖动分组：${group.label || '无标题分组'}`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => moveGroupByKeyboard(event, groupIndex)} onDragStart={() => startDrag({ type: 'group', groupIndex })} title="拖动排序">⠿</Button>
        <span className="group-summary-icon">{createElement(menuIconOptions[group.iconName] || LayoutGrid, { className: 'size-4' })}</span>
        <span className="min-w-0 flex-1 truncate">{group.label || '无标题分组'}</span>
        <span className="text-xs text-foreground-muted">{group.items.length} 项</span>
      </summary>
      <div className="navigation-group-body">
        <div className="group-fields">
          <Field>
            <FieldLabel>分组名称</FieldLabel>
            <Input value={group.label || ''} placeholder="无标题分组" onChange={(event) => updateGroup(groupIndex, { label: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>分组图标</FieldLabel>
            <IconPicker value={group.iconName || 'LayoutGrid'} onChange={(iconName) => updateGroup(groupIndex, { iconName })} label={`${group.label || '分组'}图标`} />
          </Field>
        </div>
        <div className="menu-items-list">
          {group.items.map((item, itemIndex) => (
            <NavigationMenuItemEditor key={item.key} item={item} groupIndex={groupIndex} itemIndex={itemIndex} dragged={dragged} updateItem={updateItem} startDrag={startDrag} dropItem={dropItem} moveByKeyboard={moveByKeyboard} />
          ))}
        </div>
      </div>
    </details>
  );
}

function StandaloneMenuEditor({ group, groupIndex, dragged, startDrag, dropGroup, moveGroupByKeyboard, updateItem }) {
  const item = group.items[0];
  if (!item) return null;
  const Icon = menuIconOptions[item.iconName] || LayoutGrid;
  return (
    <div className={`navigation-group navigation-standalone ${dragged?.type === 'group' && dragged.groupIndex === groupIndex ? 'is-dragging' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={() => dropGroup(groupIndex)}>
      <div className="navigation-standalone-summary">
        <Button type="button" variant="ghost" size="icon-sm" className="drag-handle" draggable aria-label={`拖动菜单：${item.label}`} onKeyDown={(event) => moveGroupByKeyboard(event, groupIndex)} onDragStart={() => startDrag({ type: 'group', groupIndex })} title="拖动排序">⠿</Button>
        <span className="group-summary-icon"><Icon className="size-4" /></span>
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="text-xs text-foreground-muted">独立菜单</span>
      </div>
      <div className="navigation-standalone-body">
        <div className="standalone-fields">
          <Field>
            <FieldLabel>菜单名称</FieldLabel>
            <Input value={item.label} aria-label={`${item.key} 菜单名`} title={item.label} onChange={(event) => updateItem(groupIndex, item.key, { label: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel>菜单图标</FieldLabel>
            <IconPicker value={item.iconName || 'LayoutGrid'} onChange={(iconName) => updateItem(groupIndex, item.key, { iconName })} label={`${item.label}图标`} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function NavigationSettingsPage({ groups, onChange }) {
  const initialGroups = useRef(cloneNavigationGroups(groups));
  const [dragged, setDragged] = useState(null);
  const updateGroup = (groupIndex, patch) => onChange(groups.map((group, index) => index === groupIndex ? { ...group, ...patch } : group));
  const updateItem = (groupIndex, itemKey, patch) => onChange(groups.map((group, index) => index === groupIndex ? { ...group, items: group.items.map((item) => item.key === itemKey ? { ...item, ...patch } : item) } : group));
  const moveItem = (groupIndex, itemIndex, direction) => onChange(groups.map((group, index) => index === groupIndex ? { ...group, items: reorder(group.items, itemIndex, itemIndex + direction) } : group));
  const moveGroup = (groupIndex, direction) => onChange(reorder(groups, groupIndex, groupIndex + direction));
  const moveByKeyboard = (event, groupIndex, itemIndex) => {
    if (!(event.altKey || event.metaKey) || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    moveItem(groupIndex, itemIndex, event.key === 'ArrowUp' ? -1 : 1);
  };
  const moveGroupByKeyboard = (event, groupIndex) => {
    if (!(event.altKey || event.metaKey) || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    moveGroup(groupIndex, event.key === 'ArrowUp' ? -1 : 1);
  };
  const startDrag = (nextDragged) => setDragged(nextDragged);
  const dropGroup = (groupIndex) => {
    if (!dragged || dragged.type !== 'group') return;
    onChange(reorder(groups, dragged.groupIndex, groupIndex));
    setDragged(null);
  };
  const dropItem = (groupIndex, itemIndex) => {
    if (!dragged || dragged.type !== 'item') return;
    const sourceGroup = groups[dragged.groupIndex];
    const sourceItem = sourceGroup?.items[dragged.itemIndex];
    if (!sourceItem || dragged.groupIndex !== groupIndex) return setDragged(null);
    onChange(groups.map((group, index) => index === groupIndex ? { ...group, items: reorder(group.items, dragged.itemIndex, itemIndex) } : group));
    setDragged(null);
  };
  const reset = () => onChange(normalizeNavigationGroups(defaultNavigationGroups));
  return (
    <div className="navigation-editor">
      <div className="navigation-editor-toolbar">
        <div><div className="eyebrow">NAVIGATION STUDIO</div><h2 className="m-0 mt-1 text-2xl font-bold">菜单维护</h2><p className="mt-1 text-sm text-foreground-muted">编辑结果会即时反映在左侧导航；无子菜单的菜单会作为独立模块，可与分组一起拖动排序，并自动保存到当前浏览器。</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className="autosave-status"><span className="autosave-dot" />已自动保存</span><Button variant="ghost" onClick={() => onChange(cloneNavigationGroups(initialGroups.current))}>撤销本次修改</Button><Button variant="outline" onClick={reset}>恢复默认</Button></div>
      </div>
      <div className="navigation-editor-layout">
        <Card className="navigation-preview-card"><div className="preview-heading"><div><span className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">PREVIEW</span><h3 className="m-0 mt-1 text-lg font-semibold">实时导航预览</h3></div><Badge variant="info">同步中</Badge></div><Navigation aria-label="菜单预览" orientation="vertical" activeLink="dashboard-v2"><div className="preview-nav-inner">{groups.map((group) => { const GroupIcon = menuIconOptions[group.iconName] || LayoutGrid; return <div key={group.id} className="preview-group">{group.label && <div className="preview-group-title"><GroupIcon className="size-4" /><span title={group.label}>{group.label}</span></div>}<NavigationList className={group.label ? 'ps-2' : ''}>{group.items.map((item) => { const Icon = menuIconOptions[item.iconName] || LayoutGrid; return <NavigationItem key={item.key}><NavigationLink href="#" value={item.key} onClick={(event) => event.preventDefault()}><Icon data-icon="start" />{item.label}</NavigationLink></NavigationItem>; })}</NavigationList></div>; })}</div></Navigation></Card>
        <div className="navigation-edit-list">
          {groups.map((group, groupIndex) => group.label ? (
            <NavigationGroupEditor key={group.id} group={group} groupIndex={groupIndex} dragged={dragged} startDrag={startDrag} dropGroup={dropGroup} dropItem={dropItem} moveGroupByKeyboard={moveGroupByKeyboard} moveByKeyboard={moveByKeyboard} updateGroup={updateGroup} updateItem={updateItem} />
          ) : (
            <StandaloneMenuEditor key={group.id} group={group} groupIndex={groupIndex} dragged={dragged} startDrag={startDrag} dropGroup={dropGroup} moveGroupByKeyboard={moveGroupByKeyboard} updateItem={updateItem} />
          ))}
        </div>
      </div>
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

function formatClockValue(totalMinutes) {
  const minutes = Math.max(0, Math.round(totalMinutes)) % 1440;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours, remainder].map((part) => String(part).padStart(2, '0')).join(':');
}

const AnimatedPromptTitle = memo(function AnimatedPromptTitle({ title }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame;
    const startedAt = performance.now();
    const tick = (now) => {
      const value = Math.min(1, (now - startedAt) / 450);
      setProgress(value);
      if (value < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const settle = window.setTimeout(() => setProgress(1), 500);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(settle); };
  }, [title]);
  return <TextAnimate className="dashboard-prompt-title" effect="rise" by="word" progress={progress} autoPlay={false} duration={0.45}>{title}</TextAnimate>;
});

function DashboardWeekStrip({ days, selectedDate, onSelect }) {
  const requestedKey = selectedDate ? localDateKey(selectedDate) : null;
  const selectedKey = days.some((day) => day.date === requestedKey) ? requestedKey : days[0]?.date;
  const selectedIndex = Math.max(0, days.findIndex((day) => day.date === selectedKey));
  const start = Math.floor(selectedIndex / 7) * 7;
  const week = days.slice(start, start + 7);
  return <div className="dashboard-week-strip" aria-label="本周日期">
    {week.map((day) => {
      const date = new Date(`${day.date}T12:00:00`);
      const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date);
      const active = day.date === selectedKey;
      return <Button key={day.date} className={`dashboard-week-day ${active ? 'is-selected' : ''}`} variant="ghost" aria-pressed={active} onClick={() => onSelect(date)}>
        <span className="dashboard-week-weekday">{weekday}</span><strong><NumberRoller value={date.getDate()} /></strong>{day.hasEvents && <span className="dashboard-week-event" aria-label="有安排" />}
      </Button>;
    })}
  </div>;
}

function DashboardCalendar({ days, selectedDate, onSelect }) {
  const [mode, setMode] = useState('week');
  const [cursor, setCursor] = useState(() => new Date(selectedDate));
  const eventDates = useMemo(() => new Set(days.filter((day) => day.hasEvents).map((day) => day.date)), [days]);
  const moveCursor = (delta) => setCursor((current) => {
    const next = new Date(current);
    if (mode === 'year') next.setFullYear(next.getFullYear() + delta);
    else if (mode === 'month') next.setMonth(next.getMonth() + delta);
    else next.setDate(next.getDate() + delta * 7);
    return next;
  });
  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [cursor]);
  const monthLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(cursor);
  const yearMonths = Array.from({ length: 12 }, (_, month) => new Date(cursor.getFullYear(), month, 1));
  return <div className="dashboard-calendar-widget">
    <div className="dashboard-calendar-toolbar">
      <div className="dashboard-calendar-modes" role="tablist" aria-label="日历视图">
        {['year', 'month', 'week'].map((item) => <Button key={item} size="sm" variant={mode === item ? 'primary' : 'ghost'} role="tab" aria-selected={mode === item} onClick={() => setMode(item)}>{item === 'year' ? '年' : item === 'month' ? '月' : '周'}</Button>)}
      </div>
      <div className="dashboard-calendar-nav"><Button size="sm" variant="ghost" aria-label="上一个时间段" onClick={() => moveCursor(-1)}>‹</Button><strong>{mode === 'year' ? `${cursor.getFullYear()} 年` : mode === 'month' ? monthLabel : `${monthLabel} · 第 ${Math.ceil(cursor.getDate() / 7)} 周`}</strong><Button size="sm" variant="ghost" aria-label="下一个时间段" onClick={() => moveCursor(1)}>›</Button></div>
    </div>
    {mode === 'week' && <DashboardWeekStrip days={days} selectedDate={selectedDate} onSelect={(date) => { setCursor(date); onSelect(date); }} />}
    {mode === 'month' && <div className="dashboard-month-grid" role="grid" aria-label={monthLabel}>{['日', '一', '二', '三', '四', '五', '六'].map((label) => <span key={label} className="dashboard-month-weekday">{label}</span>)}{monthDays.map((date) => { const key = calendarDateKey(date); const outside = date.getMonth() !== cursor.getMonth(); const active = key === calendarDateKey(selectedDate); return <Button key={key} size="sm" variant={active ? 'primary' : 'ghost'} className={`dashboard-month-day ${outside ? 'is-outside' : ''}`} aria-pressed={active} onClick={() => { setCursor(date); onSelect(date); }}>{date.getDate()}{eventDates.has(key) && <i aria-label="有安排" />}</Button>; })}</div>}
    {mode === 'year' && <div className="dashboard-year-grid">{yearMonths.map((date) => { const month = date.getMonth(); const prefix = `${date.getFullYear()}-${String(month + 1).padStart(2, '0')}`; const count = [...eventDates].filter((key) => key.startsWith(prefix)).length; return <Button key={prefix} variant="ghost" className="dashboard-year-month" onClick={() => { setCursor(date); setMode('month'); }}><strong>{date.getMonth() + 1} 月</strong><span>{count ? `${count} 天有安排` : '暂无安排'}</span></Button>; })}</div>}
  </div>;
}

function DashboardPage({ dashboard, stockPositions = [], onRefresh, onNavigate, onTaskToggle }) {
  const view = dashboardViewModel(dashboard);
  const promptIds = useMemo(() => view.promptList.map((prompt, index) => promptIdentity(prompt, index)), [view.promptList]);
  const promptKey = promptIds.join('|');
  const [activePromptId, setActivePromptId] = useState(() => {
    const previous = window.localStorage.getItem('dashboard-prompt-id');
    return previous && promptIds.includes(previous) ? previous : promptIds[0] || null;
  });
  useEffect(() => {
    setActivePromptId((current) => current && promptIds.includes(current) ? current : promptIds[0] || null);
  }, [promptKey]);
  useEffect(() => {
    if (activePromptId) window.localStorage.setItem('dashboard-prompt-id', activePromptId);
    else window.localStorage.removeItem('dashboard-prompt-id');
  }, [activePromptId]);
  const activePromptIndex = promptIndexForId(view.promptList, activePromptId);
  const activePrompt = view.promptList[activePromptIndex] || null;
  const setPromptAt = (index) => setActivePromptId(promptIds[index] || null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const selectedDateKey = calendarDateKey(selectedDate);
  const selectedCalendarEvents = view.calendarEvents.filter((event) => event.date === selectedDateKey);
  const selectedDay = view.calendarDays.find((day) => day.date === selectedDateKey);
  const selectedTasks = view.openTasks.filter((task) => task.dueDate && localDateKey(task.dueDate) === selectedDateKey);
  const selectedExpiring = dashboard.expiringItems.filter((item) => item.dueDate && localDateKey(item.dueDate) === selectedDateKey);
  const menstrualCycles = dashboard.menstrualCycles || [];
  const menstrualMoodLogs = dashboard.menstrualMoodLogs || [];
  const menstrualPrediction = dashboard.menstrualPrediction;
  const menstrualPrivacyEnabled = dashboard.privacy?.menstrualEnabled === true;
  const upcomingItems = sortUpcomingItems(dashboard.expiringItems.filter((item) => item.reminderStatus !== 'overdue'));
  const stockSummary = stockPositions.reduce((summary, position) => {
    const cost = Number(position.costPrice) * Number(position.quantity);
    const value = Number(position.currentPrice) * Number(position.quantity);
    if (!Number.isFinite(cost) || !Number.isFinite(value)) return summary;
    return { value: summary.value + value, cost: summary.cost + cost, pnl: summary.pnl + value - cost };
  }, { value: 0, cost: 0, pnl: 0 });
  const stockPnlRatio = stockSummary.cost ? (stockSummary.pnl / stockSummary.cost) * 100 : null;
  const stockPnl = stockSummary.pnl;
  const stockChartOption = useMemo(() => ({
    animation: false,
    series: [{
      type: 'gauge', min: -100, max: 100, startAngle: 210, endAngle: -30, center: ['50%', '58%'], radius: '92%',
      pointer: { show: true, length: '62%', width: 5, itemStyle: { color: stockPnl >= 0 ? '#16a34a' : '#dc2626' } },
      progress: { show: true, width: 12, itemStyle: { color: stockPnl >= 0 ? '#16a34a' : '#dc2626' } },
      axisLine: { lineStyle: { width: 12, color: [[0.5, '#fee2e2'], [1, '#dcfce7']] } },
      axisTick: { distance: -17, splitNumber: 2, lineStyle: { color: '#94a3b8', width: 1 } },
      splitLine: { distance: -17, length: 7, lineStyle: { color: '#64748b', width: 2 } },
      axisLabel: { distance: -30, color: '#64748b', fontSize: 10, formatter: (value) => value === -100 ? '亏损' : value === 100 ? '盈利' : '' },
      detail: { offsetCenter: [0, '24%'], valueAnimation: false, color: stockPnl >= 0 ? '#16a34a' : '#dc2626', fontSize: 22, fontWeight: 700, formatter: (value) => `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%` },
      data: [{ value: Math.max(-100, Math.min(100, stockPnlRatio || 0)) }]
    }]
  }), [stockPnl, stockPnlRatio]);
  const menstrualChartOption = useMemo(() => {
    const cycles = menstrualCycles.slice().filter((cycle) => cycle.endDate).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(-8);
    return { animation: false, grid: { top: 12, right: 18, bottom: 28, left: 44 }, tooltip: { trigger: 'axis', formatter: (items) => { const item = items[0]; return `${item?.axisValue || ''}<br/>经期开始：当月第 ${item?.value || 0} 天`; } }, xAxis: { type: 'category', data: cycles.map((cycle) => cycle.startDate.slice(0, 7)), axisLabel: { color: '#64748b' }, axisLine: { lineStyle: { color: '#cbd5e1' } } }, yAxis: { type: 'value', min: 1, max: 31, interval: 5, axisLabel: { color: '#64748b', formatter: (value) => `${value}日` }, splitLine: { lineStyle: { color: '#e2e8f0' } } }, series: [{ name: '经期开始日', type: 'line', smooth: false, symbol: 'circle', symbolSize: 9, data: cycles.map((cycle) => Number(cycle.startDate.slice(-2))), lineStyle: { width: 3, color: '#6366f1' }, itemStyle: { color: '#6366f1' }, areaStyle: { color: 'rgba(99, 102, 241, .12)' } }] };
  }, [menstrualCycles]);
  const calendarEvents = view.calendarDays.filter((day) => day.hasEvents).map((day) => new Date(`${day.date}T12:00:00`));
  return <div className="dashboard-home">
    <div className="dashboard-layout">
      <div className="dashboard-layout-row dashboard-layout-row-prompt">
        <SectionCard title="智能提示" className="dashboard-prompt-panel"><div className="dashboard-smart-prompt"><span className="dashboard-prompt-icon">✦</span>{view.promptFailed ? <div><strong>个性化提示暂时不可用</strong><p>请稍后重试，或检查数据服务连接。</p><Button size="sm" variant="outline" onClick={onRefresh}>重试</Button></div> : activePrompt ? <div className="dashboard-prompt-content" key={activePromptId}><AnimatedPromptTitle title={activePrompt.title} /><p>{activePrompt.reason}</p><div className="flex flex-wrap items-center gap-2"><Badge size="sm" variant="info">{activePrompt.source?.label || ({ tasks: '待办', expiring: '到期提醒', calendar: '日历', menstrual: '经期', stocks: '股票', content: '内容', specialDays: '特殊日子' }[activePrompt.kind] || activePrompt.kind)}</Badge><Button size="sm" variant="outline" onClick={() => onNavigate(activePrompt.action?.page, activePrompt.action?.entityId)}>{activePrompt.action?.label || '去处理'}</Button></div></div> : view.hasAvailableSource ? <p>今天没有需要优先处理的事项。</p> : <p>个性化提示尚未设置，请先配置数据来源。</p>}</div>{view.promptList.length > 1 && <div className="dashboard-prompt-controls"><Button size="sm" variant="ghost" disabled={activePromptIndex === 0} aria-label="上一条提示" onClick={() => setPromptAt(activePromptIndex - 1)}>上一条</Button><span aria-live="polite">{activePromptIndex + 1} / {view.promptList.length}</span><Button size="sm" variant="ghost" disabled={activePromptIndex === view.promptList.length - 1} aria-label="下一条提示" onClick={() => setPromptAt(activePromptIndex + 1)}>下一条</Button></div>}<details className="dashboard-data-status"><summary>数据状态</summary><div className="dashboard-data-status-list">{view.sourceEntries.map((source) => <div key={source.key}><span>{source.label}</span><span className="text-foreground-muted">{source.key === 'menstrual' && !source.configured ? '经期提醒未启用' : source.status === 'error' || source.status === 'unavailable' ? '暂不可用' : !source.configured ? '尚未设置' : source.available ? '可用' : '暂无数据'}</span></div>)}</div></details><div className="dashboard-status-row">{[['逾期', view.overdueItems.length, 'error'], ['今日到期', view.todayItems.length, 'warning'], ['待办', view.openTasks.length, 'info'], ['待处理候选', view.pendingCandidates, 'primary']].map(([label, value, variant]) => <span key={label} className={`dashboard-status-item is-${variant}`}><b><NumberRoller value={value} /></b><span>{label}</span></span>)}</div></SectionCard>
        <SectionCard title="日历" className="dashboard-calendar-panel"><DashboardCalendar days={view.calendarDays} selectedDate={selectedDate} onSelect={setSelectedDate} /></SectionCard>
      </div>
      <div className="dashboard-layout-row dashboard-layout-row-actions">
        <SectionCard title="现在要处理"><div className="action-list">{view.actionItems.length ? view.actionItems.slice(0, 8).map((item) => <div key={item.id} className="action-row"><Badge variant={item.variant} size="sm">{item.label}</Badge><div className="action-row-copy"><span className="action-row-title" title={item.title}>{item.title}</span><span className="action-row-source">{item.type === 'task' ? '待办' : '到期提醒'}</span></div>{item.type === 'task' ? <Button size="sm" variant="outline" onClick={() => onTaskToggle(item.taskId, 'completed')}>完成</Button> : <Button size="sm" variant="ghost" onClick={() => onNavigate(item.on)}>查看</Button>}</div>) : <div className="dashboard-empty-action"><Empty description="今天没有需要优先处理的事项" /><Button size="sm" variant="outline" onClick={() => onNavigate('tasks')}>去待办</Button></div>}</div>{view.actionItems.length > 8 && <Button variant="ghost" className="mt-3" onClick={() => onNavigate('tasks')}>查看全部行动</Button>}</SectionCard>
        <SectionCard title="即将到期"><div className="action-list">{upcomingItems.slice(0, 5).map((item) => <div key={item.id} className="action-row"><Badge variant={item.reminderStatus === 'due' ? 'warning' : 'info'} size="sm">{item.reminderStatus === 'due' ? '今日' : '即将'}</Badge><div className="action-row-copy"><span className="action-row-title" title={item.name}>{item.name}</span><span className="action-row-source">{item.dueDate ? localDateKey(item.dueDate) : '未设置日期'}</span></div><Button size="sm" variant="ghost" onClick={() => onNavigate('expiring')}>查看</Button></div>)}{!upcomingItems.length && <Empty description="暂无到期提醒" />}</div></SectionCard>
      </div>
      <div className="dashboard-layout-row dashboard-layout-row-secondary">
        <SectionCard title="股票盈亏"><div className="stock-summary-line"><div><span className="text-sm text-foreground-muted">当前市值 </span><strong>{stockSummary.value ? <><span className="dashboard-currency-symbol">$</span><NumberRoller value={stockSummary.value} format={(number) => number.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} /></> : '暂无报价'}</strong></div><div><span className="text-sm text-foreground-muted">持仓盈亏 </span><strong className={stockSummary.pnl >= 0 ? 'text-success-emphasis' : 'text-error-emphasis'}>{stockPositions.length && stockSummary.value ? <>{stockSummary.pnl >= 0 ? '+' : '-'}<span className="dashboard-currency-symbol">$</span><NumberRoller value={Math.abs(stockSummary.pnl)} format={(number) => number.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} /></> : '暂无报价'}</strong></div></div>{stockPositions.length && stockSummary.value ? <Chart option={stockChartOption} height={170} /> : <Empty description="暂无可绘制的持仓行情" />}<Button className="mt-3" size="sm" variant="outline" onClick={() => onNavigate('stock-positions')}>查看仓位</Button></SectionCard>
        <SectionCard title="经期预测">
          <div className="dashboard-menstrual-summary">
            {menstrualPrivacyEnabled && (menstrualCycles.length || menstrualMoodLogs.length || menstrualPrediction) ? (
              <>
                <div className="dashboard-menstrual-next">
                  {menstrualPrediction ? (
                    <>
                      <div><span>下一次经期预计</span><strong>{menstrualPrediction.date || menstrualPrediction.predictedDate || '日期待确认'}</strong></div>
                      {Number.isFinite(Number(menstrualPrediction.remainingDays)) && <div><span>距今剩余</span><strong>{menstrualPrediction.remainingDays} 天</strong></div>}
                      {Number.isFinite(Number(menstrualPrediction.average)) && <div><span>平均周期</span><strong>{menstrualPrediction.average} 天</strong></div>}
                      {Number.isFinite(Number(menstrualPrediction.intervalCount)) && <div><span>计算样本</span><strong>{menstrualPrediction.intervalCount} 个间隔</strong></div>}
                      {menstrualPrediction.stage && <div><span>当前阶段</span><strong>{menstrualPrediction.stage}</strong></div>}
                    </>
                  ) : <p className="m-0 text-sm text-foreground-muted">暂无后端预测数据；已记录的周期与情绪仍可在下方查看。</p>}
                </div>
                <div className="dashboard-menstrual-history">
                  <span className="text-sm text-foreground-muted">历史经期开始日</span>
                  {menstrualCycles.filter((cycle) => cycle.endDate).length ? <Chart option={menstrualChartOption} height={260} /> : <p className="m-0 mt-2 text-sm text-foreground-muted">完成一次经期记录后，这里会显示历史折线图。</p>}
                </div>
                {menstrualMoodLogs.length > 0 && <div className="dashboard-menstrual-records"><span className="text-sm text-foreground-muted">情绪记录</span>{menstrualMoodLogs.slice(0, 8).map((log) => <div key={log.id} className="dashboard-menstrual-record"><strong>{log.loggedOn}</strong><span>情绪：{{ 1: '低落', 2: '偏低', 3: '平稳', 4: '愉悦', 5: '很好' }[log.mood] || log.mood || '未记录'}</span>{log.notes && <span>备注：{log.notes}</span>}</div>)}</div>}
              </>
            ) : (
              <>
                <p className="m-0 text-sm text-foreground-muted">{dashboard.privacy?.menstrualEnabled === false ? '经期提醒未启用' : '健康-经期暂无可用数据'}</p>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => onNavigate(dashboard.privacy?.menstrualEnabled === false ? 'settings' : 'menstrual-cycle')}>{dashboard.privacy?.menstrualEnabled === false ? '去设置' : '去健康-经期记录'}</Button>
              </>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  </div>;
}

function FinnhubSettingsCard() {
  const [settings, setSettings] = useState(null);
  const [input, setInput] = useState({ apiKey: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const load = async () => { try { const next = await api('/finnhub-settings'); setSettings(next); setInput({ apiKey: next.apiKey || '' }); } catch { /* 全局 Toast 负责展示 API 错误。 */ } };
  useEffect(() => { load(); }, []);
  const test = async () => { setTesting(true); setResult(null); try { setResult(await api('/finnhub-settings/test', { method: 'POST', body: JSON.stringify(input) })); } catch { /* 全局 Toast 负责展示 API 错误。 */ } finally { setTesting(false); } };
  const save = async () => { setSaving(true); try { await api('/finnhub-settings', { method: 'PUT', body: JSON.stringify(input) }); setInput({ apiKey: '' }); await load(); } catch { /* 全局 Toast 负责展示 API 错误。 */ } finally { setSaving(false); } };

  return (
    <SectionCard title="Finnhub 美股行情">
      <p className="text-sm text-foreground-muted">用于手动刷新仓位中的美股现价。API Key 保存在 macOS Keychain，并仅在本地设置页回显；不会写入备份文件。Finnhub Free 仅限个人、非商业使用。</p>
      <form className="mt-4 grid gap-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <Field>
          <FieldLabel>Finnhub API Key</FieldLabel>
          <PasswordInput value={input.apiKey} placeholder={settings?.configured ? '输入新值才会替换已保存的 Key' : '请输入 Finnhub API Key'} onChange={(event) => setInput({ apiKey: event.target.value })} />
        </Field>
        {result?.connected && <span className="text-sm text-success-emphasis">连接成功：AAPL 当前报价 ${result.quote.currentPrice}</span>}
        <div className="flex flex-wrap items-center gap-2">
          <LoadingButton variant="outline" loading={testing} disabled={!input.apiKey && !settings?.configured} onClick={test}>检测连接</LoadingButton>
          <LoadingButton loading={saving} disabled={!input.apiKey && !settings?.configured} onClick={save}>保存至 macOS Keychain</LoadingButton>
          {settings?.configured && <span className="text-sm text-foreground-muted">已配置，可在仓位管理中刷新美股现价。</span>}
        </div>
      </form>
    </SectionCard>
  );
}

function BarkSettingsCard({ onChanged }) {
  const [settings, setSettings] = useState(null);
  const [input, setInput] = useState({ deviceKey: '', serverUrl: '' });
  const [saving, setSaving] = useState(false);
  const load = async () => { try { setSettings(await api('/bark-settings')); } catch { /* 全局 Toast 负责展示 API 错误。 */ } };
  useEffect(() => { load(); }, []);
  const save = async () => { setSaving(true); try { await api('/bark-settings', { method: 'PUT', body: JSON.stringify({ deviceKey: input.deviceKey, serverUrl: input.serverUrl }) }); setInput({ deviceKey: '', serverUrl: '' }); await load(); onChanged?.(); } catch { /* 全局 Toast 负责展示 API 错误。 */ } finally { setSaving(false); } };
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
  const toast = useToastManager();
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [edits, setEdits] = useState({});
  const [ignored, setIgnored] = useState({});

  const load = async () => {
    try { setProfile(await api('/archive-profile')); } catch { /* 全局 Toast 负责展示 API 错误。 */ } finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, []);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const response = await fetch('/v1/archive/import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '导入失败。');
      setEdits({}); setIgnored({});
      await load();
      toast.add({ title: `归档已导入：${payload.import.tweetCount} 条推文 · 关注 ${payload.import.followingCount} 人`, data: { icon: <CircleCheckFilled className="text-success-emphasis" /> } });
    } catch (error) {
      if (!error?.isApiError) reportApiError(error);
    } finally { setUploading(false); }
  };

  const confirm = async (field) => {
    setConfirming(true);
    try {
      await api('/archive-profile/confirm', { method: 'POST', body: JSON.stringify({ [field]: edits[field] ?? profile.semantic[field] }) });
      await load(); onChanged?.();
    } catch {
      // API 错误由应用壳的全局 Toast 统一展示。
    } finally { setConfirming(false); }
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
        {loaded && profile?.importedAt && <span className="text-sm text-foreground-muted">上次导入：{new Date(profile.importedAt).toLocaleString('zh-CN')} · {profile.tweetCount} 条推文 · 关注 {profile.followingCount} 人</span>}
        {loaded && profile && !profile?.objective && <span className="text-sm text-foreground-muted">尚未导入归档。</span>}
      </div>
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
