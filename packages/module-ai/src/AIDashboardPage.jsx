import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@appica/ui-react/alert';
import { Badge } from '@appica/ui-react/badge';
import { Button, buttonVariants } from '@appica/ui-react/button';
import { Card } from '@appica/ui-react/card';
import { Skeleton } from '@appica/ui-react/skeleton';
import { useReducedMotion } from '@appica/ui-react/hooks/use-reduced-motion';
import { Bolt, Check, ChevronRight, Copy, FileText, LayoutDashboard, Plus, Refresh, Settings } from '@appica/icons-react';
import { motion } from 'motion/react';
import { api, copyToClipboard } from '@personal-workbench/core';

const ENTER_EASE = [0.22, 1, 0.36, 1];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
}

function sortByUpdated(items) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function errorMessage(result) {
  return result.status === 'rejected' ? result.reason?.message || '请求失败，请重试。' : '';
}

const AI_ROUTES = { prompts: '/ai/prompts', skills: '/ai/skills', settings: '/settings' };

function DashboardLink({ page, href, onNavigate, variant = 'ghost', size = 'sm', className = '', ariaLabel, children }) {
  function handleClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(page);
  }

  return (
    <a href={href} className={`${buttonVariants({ variant, size })} ${className}`.trim()} onClick={handleClick} aria-label={ariaLabel}>
      {children}
    </a>
  );
}

function OverviewMetric({ icon: Icon, label, value, description, index, reduced }) {
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.28, delay: Math.min(index * 0.035, 0.14), ease: ENTER_EASE }}
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.995 }}
      className="ai-overview-metric"
    >
      <span className="ai-overview-metric-icon" aria-hidden="true"><Icon /></span>
      <div className="min-w-0">
        <span className="ai-overview-metric-label">{label}</span>
        <strong className="ai-overview-metric-value tabular-nums">{value}</strong>
        <span className="ai-overview-metric-description">{description}</span>
      </div>
    </motion.article>
  );
}

function OverviewSection({ kicker, title, action, children, className = '' }) {
  return (
    <section className={`ai-overview-panel ${className}`}>
      <Card className="ai-overview-card">
        <div className="ai-overview-card-heading">
          <div>
            <span className="ai-panel-kicker">{kicker}</span>
            <h3>{title}</h3>
          </div>
          {action}
        </div>
        {children}
      </Card>
    </section>
  );
}

function OverviewError({ message, onRetry }) {
  return (
    <Alert variant="error" className="ai-overview-error">
      <AlertTitle>暂时无法加载</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}><Refresh data-icon="start" />重试</Button>
    </Alert>
  );
}

function QuickPromptCard({ prompt, copied, onCopy, index, reduced }) {
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.3, delay: Math.min(index * 0.04, 0.16), ease: ENTER_EASE }}
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.995 }}
      className="ai-overview-quick-item"
    >
      <button type="button" onClick={() => onCopy(prompt)} aria-label={`复制短提示词：${prompt.title}`}>
        <span className="ai-overview-quick-icon" aria-hidden="true">{copied ? <Check /> : <Bolt />}</span>
        <span className="ai-overview-quick-copy">
          <strong>{copied ? '已复制' : prompt.title}</strong>
          <span>{prompt.content || '快速改变当前思考方向。'}</span>
        </span>
        <ChevronRight className="ai-overview-quick-arrow" aria-hidden="true" />
      </button>
    </motion.article>
  );
}

function RecentPromptRow({ prompt, copied, onCopy, onNavigate, reduced }) {
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.25, ease: ENTER_EASE }}
      className="ai-overview-list-row"
    >
      <div className="ai-overview-list-icon" aria-hidden="true"><FileText /></div>
      <div className="ai-overview-list-copy">
        <strong>{prompt.title}</strong>
        <span><Badge variant="outline" size="sm">{prompt.category || '未分类'}</Badge>更新于 {formatDate(prompt.updatedAt)}</span>
      </div>
      <div className="ai-overview-list-actions">
        <Button type="button" size="sm" variant={copied ? 'soft' : 'ghost'} onClick={() => onCopy(prompt)} aria-label={`${copied ? '已复制' : '复制'} ${prompt.title}`}>
          {copied ? <Check data-icon="start" /> : <Copy data-icon="start" />}{copied ? '已复制' : '复制'}
        </Button>
        <DashboardLink page="ai-prompts" href={AI_ROUTES.prompts} onNavigate={onNavigate} ariaLabel="查看全部提示词"><ChevronRight aria-hidden="true" /></DashboardLink>
      </div>
    </motion.li>
  );
}

function SkillSummaryRow({ skill, onNavigate, reduced }) {
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.25, ease: ENTER_EASE }}
      className="ai-overview-list-row"
    >
      <div className="ai-overview-list-icon ai-overview-list-icon-skill" aria-hidden="true"><Bolt /></div>
      <div className="ai-overview-list-copy">
        <strong>{skill.name}</strong>
        <span><Badge variant="outline" size="sm">{skill.agentType || '未分类'}</Badge>{skill.description || skill.id}</span>
      </div>
      <DashboardLink page="ai-skills" href={AI_ROUTES.skills} onNavigate={onNavigate} ariaLabel={`查看 ${skill.name} 详情`}><ChevronRight aria-hidden="true" /></DashboardLink>
    </motion.li>
  );
}

function OverviewSkeleton() {
  return (
    <div className="ai-overview-skeleton" aria-live="polite" aria-busy="true">
      <span className="sr-only">正在加载 AI 工作台…</span>
      <div className="ai-overview-grid" aria-hidden="true">
        <Skeleton effect="shimmer" className="ai-overview-skeleton-quick" />
      </div>
      <div className="ai-overview-metrics ai-overview-skeleton-metrics" aria-hidden="true">
        {[1, 2, 3].map((item) => <Skeleton key={item} effect="shimmer" />)}
      </div>
      <div className="ai-overview-grid" aria-hidden="true">
        <Skeleton effect="shimmer" className="ai-overview-skeleton-panel" />
        <Skeleton effect="shimmer" className="ai-overview-skeleton-panel" />
        <Skeleton effect="shimmer" className="ai-overview-skeleton-model" />
      </div>
    </div>
  );
}

function AIDashboardPage({ modelSettings, onNavigate }) {
  const reduced = useReducedMotion();
  const requestIdRef = useRef(0);
  const copyTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [data, setData] = useState({ fullPrompts: [], shortPrompts: [], categories: [], skills: [], warnings: [], errors: {} });

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setNotice('');
    const results = await Promise.allSettled([
      api('/prompts?kind=full&status=all'),
      api('/prompts?kind=short&status=all'),
      api('/skills')
    ]);
    if (requestId !== requestIdRef.current) return;
    const [fullResult, shortResult, skillsResult] = results;
    setData({
      fullPrompts: fullResult.status === 'fulfilled' ? fullResult.value.prompts || [] : [],
      shortPrompts: shortResult.status === 'fulfilled' ? shortResult.value.prompts || [] : [],
      categories: fullResult.status === 'fulfilled' ? fullResult.value.categories || [] : [],
      skills: skillsResult.status === 'fulfilled' ? skillsResult.value.skills || [] : [],
      warnings: skillsResult.status === 'fulfilled' ? skillsResult.value.warnings || [] : [],
      errors: {
        full: errorMessage(fullResult),
        short: errorMessage(shortResult),
        skills: errorMessage(skillsResult)
      }
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, [load]);

  const recentPrompts = useMemo(() => sortByUpdated(data.fullPrompts.filter((prompt) => prompt.enabled)).slice(0, 3), [data.fullPrompts]);
  const quickPrompts = useMemo(() => sortByUpdated(data.shortPrompts.filter((prompt) => prompt.enabled)).slice(0, 4), [data.shortPrompts]);
  const recentSkills = useMemo(() => sortByUpdated(data.skills).slice(0, 3), [data.skills]);
  const activePromptCount = data.fullPrompts.filter((prompt) => prompt.enabled).length + data.shortPrompts.filter((prompt) => prompt.enabled).length;
  const modelReady = Boolean(modelSettings?.configured);

  async function copyPrompt(prompt, short = false) {
    try {
      if (!await copyToClipboard(short ? prompt.title : prompt.content)) throw new Error('复制失败');
      setCopiedId(prompt.id);
      setNotice(`「${prompt.title}」已复制。`);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(''), 1600);
    } catch {
      setNotice('复制失败，请检查浏览器剪贴板权限。');
    }
  }

  return (
    <div className="ai-page-shell ai-overview-page">
      <header className="ai-page-hero ai-overview-hero">
        <div className="ai-page-hero-copy">
          <div className="ai-eyebrow"><Bolt aria-hidden="true" /> AI / 本地工作台</div>
          <h1 className="ai-page-title">AI 工作台</h1>
          <p className="ai-page-lede">把本地提示词和技能变成可以立即使用的能力库，从一个短提示词开始今天的工作。</p>
        </div>
        <div className="ai-overview-local-state"><Badge variant="success">本机数据</Badge><span>仅保存在这台设备</span><span className="ai-technical-note" translate="no">存储：SQLite</span></div>
        <div className="ai-overview-hero-actions">
          <DashboardLink page="ai-prompts" href={AI_ROUTES.prompts} onNavigate={onNavigate} variant="default" size="md"><Plus data-icon="start" />新建提示词</DashboardLink>
          <DashboardLink page="ai-skills" href={AI_ROUTES.skills} onNavigate={onNavigate} variant="outline" size="md"><LayoutDashboard data-icon="start" />浏览技能</DashboardLink>
        </div>
      </header>

      {notice && <p className="ai-live-notice" role="status" aria-live="polite">{notice}</p>}

      {loading ? <OverviewSkeleton /> : (
        <>
          <div className="ai-overview-grid ai-overview-primary-grid">
            <OverviewSection
              kicker="快速开始"
              title="快速启动"
              className="ai-overview-quick-panel"
              action={<DashboardLink page="ai-prompts" href={AI_ROUTES.prompts} onNavigate={onNavigate} variant="outline">管理短提示词<ChevronRight data-icon="end" /></DashboardLink>}
            >
              {data.errors.short ? <OverviewError message={data.errors.short} onRetry={() => void load()} /> : quickPrompts.length ? (
                <div className="ai-overview-quick-grid">
                  {quickPrompts.map((prompt, index) => <QuickPromptCard key={prompt.id} prompt={prompt} copied={copiedId === prompt.id} onCopy={(item) => void copyPrompt(item, true)} index={index} reduced={reduced} />)}
                </div>
              ) : (
                <div className="ai-overview-empty">
                  <p>还没有短提示词，先保存一个高频思考提醒。</p>
                  <DashboardLink page="ai-prompts" href={AI_ROUTES.prompts} onNavigate={onNavigate} variant="default"><Plus data-icon="start" />新增短提示词</DashboardLink>
                </div>
              )}
            </OverviewSection>
          </div>

          <div className="ai-overview-metrics" aria-label="AI 工作状态">
            <OverviewMetric icon={FileText} label="可用提示词" value={activePromptCount} description={`${data.fullPrompts.length + data.shortPrompts.length} 条已保存`} index={0} reduced={reduced} />
            <OverviewMetric icon={Bolt} label="可立即启动" value={quickPrompts.length} description="短提示词可直接复制" index={1} reduced={reduced} />
            <OverviewMetric icon={Settings} label="模型状态" value={modelReady ? '已配置' : '未配置'} description={modelReady ? modelSettings.model || '可开始使用' : '前往设置连接'} index={2} reduced={reduced} />
          </div>

          <div className="ai-overview-grid ai-overview-secondary-grid">
            <OverviewSection
              kicker="提示词库"
              title="最近更新的提示词"
              className="ai-overview-prompts-panel"
              action={<DashboardLink page="ai-prompts" href={AI_ROUTES.prompts} onNavigate={onNavigate}>查看全部<ChevronRight data-icon="end" /></DashboardLink>}
            >
              {data.errors.full ? <OverviewError message={data.errors.full} onRetry={() => void load()} /> : recentPrompts.length ? (
                <ul className="ai-overview-list">
                  {recentPrompts.map((prompt) => <RecentPromptRow key={prompt.id} prompt={prompt} copied={copiedId === prompt.id} onCopy={(item) => void copyPrompt(item)} onNavigate={onNavigate} reduced={reduced} />)}
                </ul>
              ) : (
                <div className="ai-overview-empty"><p>还没有完整提示词。</p><DashboardLink page="ai-prompts" href={AI_ROUTES.prompts} onNavigate={onNavigate} variant="default"><Plus data-icon="start" />新建提示词</DashboardLink></div>
              )}
            </OverviewSection>

            <OverviewSection
              kicker="本机能力"
              title="本机技能"
              className="ai-overview-skills-panel"
              action={<DashboardLink page="ai-skills" href={AI_ROUTES.skills} onNavigate={onNavigate}>查看全部<ChevronRight data-icon="end" /></DashboardLink>}
            >
              {data.errors.skills ? <OverviewError message={data.errors.skills} onRetry={() => void load()} /> : recentSkills.length ? (
                <ul className="ai-overview-list">
                  {recentSkills.map((skill) => <SkillSummaryRow key={skill.id} skill={skill} onNavigate={onNavigate} reduced={reduced} />)}
                </ul>
              ) : (
                <div className="ai-overview-empty"><p>没有发现可用的本机能力。</p><DashboardLink page="ai-skills" href={AI_ROUTES.skills} onNavigate={onNavigate} variant="outline"><Refresh data-icon="start" />刷新索引</DashboardLink></div>
              )}
              {data.warnings.length > 0 && <Alert variant="warning" className="ai-overview-warning"><AlertTitle>扫描已部分完成</AlertTitle><AlertDescription>有 {data.warnings.length} 个文件或目录无法读取。</AlertDescription></Alert>}
            </OverviewSection>

            <OverviewSection kicker="模型与本机状态" title="模型与本机状态" className="ai-overview-model-panel">
              <div className={`ai-overview-model-state ${modelReady ? 'is-ready' : 'is-unready'}`}>
                <span className="ai-overview-model-icon" aria-hidden="true">{modelReady ? <Check /> : <Settings />}</span>
                <div>
                  <strong>{modelReady ? '模型服务已配置，可以开始工作' : '尚未配置模型服务'}</strong>
                  <p>{modelReady ? `${modelSettings.provider || 'openai-compatible'} · ${modelSettings.model || '当前模型'}` : '配置模型后，内容生成和语义分析功能才可使用。'}</p>
                </div>
                <DashboardLink page="settings" href={AI_ROUTES.settings} onNavigate={onNavigate} variant={modelReady ? 'outline' : 'default'} size="md"><Settings data-icon="start" />{modelReady ? '管理配置' : '前往设置'}</DashboardLink>
              </div>
              <div className="ai-overview-model-note"><span>本机数据</span><span>提示词和本机能力仅保留在这台设备。<span className="ai-technical-note" translate="no">API Key：SQLite</span></span></div>
            </OverviewSection>
          </div>
        </>
      )}
      {!loading && activePromptCount === 0 && data.skills.length === 0 && !data.errors.full && !data.errors.skills && (
        <p className="ai-overview-first-use" role="status">从新建一条提示词或刷新本机 Skills 开始。</p>
      )}
    </div>
  );
}

export { AIDashboardPage };
