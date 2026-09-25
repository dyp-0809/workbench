import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@appica/ui-react/alert';
import { Badge } from '@appica/ui-react/badge';
import { Button, buttonVariants } from '@appica/ui-react/button';
import { Card } from '@appica/ui-react/card';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@appica/ui-react/select';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@appica/ui-react/dialog';
import { Tabs, TabsList, TabsTrigger } from '@appica/ui-react/tabs';
import { Textarea } from '@appica/ui-react/textarea';
import { BrandX, Check, Copy, FileText, Refresh } from '@appica/icons-react';
import { api, copyToClipboard, Empty, LoadingButton } from '@personal-workbench/core';

const LANGUAGE_MODES = Object.freeze({
  zh: { label: '中文', languages: ['zh'] },
  en: { label: 'English', languages: ['en'] },
  both: { label: '中英组合', languages: ['zh', 'en'] }
});
const LANGUAGE_LABELS = Object.freeze({ zh: '中文', en: 'English' });
const COUNT_ITEMS = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), `${index + 1} 条`]));


function groupTweets(tweets, languageMode) {
  const languages = LANGUAGE_MODES[languageMode]?.languages || ['zh'];
  if (languages.length === 2) {
    const byLanguage = Object.fromEntries(languages.map((language) => [language, tweets.filter((tweet) => tweet.language === language)]));
    const total = Math.max(...languages.map((language) => byLanguage[language].length), 0);
    return Array.from({ length: total }, (_, index) => ({
      id: `bilingual-${index}`,
      index,
      zh: byLanguage.zh[index] || null,
      en: byLanguage.en[index] || null
    }));
  }
  return tweets.map((tweet, index) => ({ id: `${tweet.language}-${index}`, index, [tweet.language]: tweet }));
}

function DailyTweetsPage({ onNavigate, onDirtyChange, modelSettings }) {
  const [prompts, setPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [savedPromptContent, setSavedPromptContent] = useState('');
  const [count, setCount] = useState('3');
  const [languageMode, setLanguageMode] = useState('zh');
  const [tweets, setTweets] = useState([]);
  const [generatedLanguageMode, setGeneratedLanguageMode] = useState('zh');
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [tweetDetailOpen, setTweetDetailOpen] = useState(false);
  const [remixOpen, setRemixOpen] = useState(false);
  const [remixSource, setRemixSource] = useState('');
  const [remixInstruction, setRemixInstruction] = useState('');
  const [remixCount, setRemixCount] = useState('3');
  const [remixLanguageMode, setRemixLanguageMode] = useState('both');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const mountedRef = useRef(false);
  const selectedPromptIdRef = useRef('');

  const copyTimerRef = useRef(null);

  const selectedPrompt = useMemo(() => prompts.find((prompt) => prompt.id === selectedPromptId) || null, [prompts, selectedPromptId]);
  const isDirty = Boolean(selectedPrompt && promptDraft !== savedPromptContent);
  const expectedCount = Number(count) * LANGUAGE_MODES[languageMode].languages.length;
  const remixExpectedCount = Number(remixCount) * LANGUAGE_MODES[remixLanguageMode].languages.length;
  const tweetGroups = useMemo(() => groupTweets(tweets, generatedLanguageMode), [tweets, generatedLanguageMode]);
  const detailTweets = useMemo(() => tweetGroups.flatMap((group, index) => (
    [['zh', group.zh], ['en', group.en]]
      .filter(([, tweet]) => tweet)
      .map(([language, tweet]) => ({ id: `${group.id}-${language}`, index, language, tweet }))
  )), [tweetGroups]);
  const loadPrompts = useCallback(async () => {
    setLoadingPrompts(true);
    setError('');
    try {
      const result = await api('/prompts?kind=full&status=active');
      if (!mountedRef.current) return;
      const nextPrompts = result.prompts || [];
      setPrompts(nextPrompts);
      const nextSelected = nextPrompts.find((prompt) => prompt.id === selectedPromptIdRef.current) || nextPrompts[0] || null;
      selectedPromptIdRef.current = nextSelected?.id || '';
      setSelectedPromptId(nextSelected?.id || '');
      setPromptDraft(nextSelected?.content || '');
      setSavedPromptContent(nextSelected?.content || '');
    } catch (loadError) {
      if (mountedRef.current) setError(loadError.message);
    } finally {
      if (mountedRef.current) setLoadingPrompts(false);
    }
  }, []);


  useEffect(() => {
    mountedRef.current = true;
    void loadPrompts();
    return () => {
      mountedRef.current = false;
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, [loadPrompts]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  function openPromptEditor() {
    if (!selectedPrompt || generating) return;
    setPromptEditorOpen(true);
  }

  function selectPrompt(id) {
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return;
    selectedPromptIdRef.current = id;
    setSelectedPromptId(id);
    setPromptDraft(prompt.content);
    setSavedPromptContent(prompt.content);
    setError('');
    setNotice('');
  }

  async function persistPrompt() {
    if (!selectedPrompt) throw new Error('请选择一条已启用的完整提示词。');
    const result = await api(`/prompts/${selectedPrompt.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: promptDraft })
    });
    const updatedPrompt = result.prompt;
    setPrompts((current) => current.map((prompt) => prompt.id === updatedPrompt.id ? updatedPrompt : prompt));
    setPromptDraft(updatedPrompt.content);
    setSavedPromptContent(updatedPrompt.content);
    return updatedPrompt;
  }

  async function savePrompt() {
    setSavingPrompt(true);
    setError('');
    setNotice('');
    try {
      await persistPrompt();
      setNotice('提示词已保存。');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingPrompt(false);
    }
  }

  async function generateTweets() {
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      let prompt = selectedPrompt;
      if (isDirty) prompt = await persistPrompt();
      const result = await api('/daily-tweets/generate', {
        method: 'POST',
        body: JSON.stringify({ promptId: prompt.id, count: Number(count), languages: LANGUAGE_MODES[languageMode].languages })
      });
      const nextTweets = result.result?.tweets || [];
      setTweets(nextTweets);
      setGeneratedLanguageMode(languageMode);
      const nextGroups = groupTweets(nextTweets, languageMode);
      setNotice(`已生成 ${nextTweets.length} 条语言稿，组成 ${nextGroups.length} 个${languageMode === 'both' ? '双语' : ''}版本。`);
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setGenerating(false);
    }
  }

  async function generateRemix() {
    if (!remixSource.trim()) return;
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const result = await api('/daily-tweets/remix', {
        method: 'POST',
        body: JSON.stringify({ sourceTweet: remixSource, instruction: remixInstruction, count: Number(remixCount), languages: LANGUAGE_MODES[remixLanguageMode].languages })
      });
      const nextTweets = result.result?.tweets || [];
      setTweets(nextTweets);
      setGeneratedLanguageMode(remixLanguageMode);
      setRemixOpen(false);
      setNotice(`已基于参考推文生成 ${nextTweets.length} 条语言稿。`);
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(text, id) {
    try {
      if (!await copyToClipboard(text)) throw new Error('复制失败');
      setCopiedId(id);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(''), 1600);
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限。');
    }
  }


  function handlePromptLibraryNavigation(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate('ai-prompts');
  }

  const copyAll = () => copyText(
    tweetGroups.flatMap((group) => [group.zh, group.en].filter(Boolean).map((tweet) => tweet.content)).join('\n\n'),
    'all'
  );

  return (
    <div className="x-daily-tweets-page">
      <header className="x-daily-tweets-hero">
        <div className="x-daily-tweets-hero-copy">
          <span className="x-daily-tweets-eyebrow">X / DAILY PIPELINE</span>
          <h1>每日推文</h1>
          <p>把提示词、生成参数和可编辑草稿串成一条生产线。</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setRemixOpen(true)} disabled={generating}><FileText aria-hidden="true" data-icon="start" />推文二创</Button>
          <div className="x-daily-tweets-hero-stat" aria-label={`本次已生成 ${tweetGroups.length} 个推文版本`}>
            <strong className="tabular-nums">{tweetGroups.length}</strong>
            <span>{generatedLanguageMode === 'both' ? '双语版本' : '本次版本'}</span>
          </div>
        </div>
      </header>

      {notice && <p className="x-daily-tweets-notice" role="status" aria-live="polite">{notice}</p>}
      {error && <Alert variant="error"><AlertTitle>每日推文暂时不可用</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}


      <div className="x-daily-tweets-layout">
        <Card id="daily-tweets-source" className="x-daily-tweets-compose">
          <div className="x-daily-tweets-section-heading">
            <div>
              <span className="x-daily-tweets-kicker">SOURCE / 01</span>
              <h2>选择内容引擎</h2>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="刷新提示词" title="刷新提示词" onClick={() => void loadPrompts()} disabled={loadingPrompts || savingPrompt || generating}>
              <Refresh aria-hidden="true" />
            </Button>
          </div>

          {loadingPrompts ? <p className="x-daily-tweets-muted">正在加载提示词…</p> : prompts.length ? (
            <div className="x-daily-tweets-prompt-fields">
              <div className="x-daily-tweets-prompt-select">
                <Field>
                  <FieldLabel>已维护的完整提示词</FieldLabel>
                  <Select items={Object.fromEntries(prompts.map((prompt) => [prompt.id, `${prompt.title} · ${prompt.category}`]))} value={selectedPromptId} onValueChange={selectPrompt}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="选择提示词" /></SelectTrigger>
                    <SelectContent>{prompts.map((prompt) => <SelectItem key={prompt.id} value={prompt.id}>{prompt.title} · {prompt.category}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="x-daily-tweets-prompt-body">
                <Field>
                  <FieldLabel>本次使用的提示词正文</FieldLabel>
                  <button type="button" className="x-daily-tweets-prompt-preview" onClick={openPromptEditor} disabled={!selectedPrompt || generating} aria-label="打开提示词详情并编辑">
                    <span className="x-daily-tweets-prompt-preview-label">点击查看并编辑完整提示词</span>
                    <span className="x-daily-tweets-prompt-preview-text">{promptDraft || '暂无提示词内容'}</span>
                  </button>
                </Field>
              </div>
              <div className="x-daily-tweets-prompt-footer">
                <span className={isDirty ? 'x-daily-tweets-dirty' : 'x-daily-tweets-muted'}>{isDirty ? '有未保存修改，生成前会自动保存' : `来自提示词库 · ${selectedPrompt?.title || ''}`}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void savePrompt()} disabled={!isDirty || savingPrompt || generating}>保存提示词</Button>
              </div>
            </div>
          ) : (
            <div className="x-daily-tweets-no-prompts">
              <Empty description="还没有已启用的完整提示词。" />
              <a href="/ai/prompts" className={buttonVariants({ variant: 'outline' })} onClick={handlePromptLibraryNavigation}>去维护提示词</a>
            </div>
          )}

        </Card>

        <Card id="daily-tweets-settings" className="x-daily-tweets-settings-card">
          <div className="x-daily-tweets-section-heading x-daily-tweets-settings-heading">
            <div>
              <span className="x-daily-tweets-kicker">SETTINGS / 02</span>
              <h2>设定这次生成</h2>
            </div>
            <Badge variant="outline">预计 {expectedCount} 条</Badge>
          </div>
          <div className="x-daily-tweets-settings">
            <Field>
              <FieldLabel>每种语言生成</FieldLabel>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(COUNT_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>生成语言</FieldLabel>
              <Tabs value={languageMode} onValueChange={setLanguageMode}>
                <TabsList className="x-daily-tweets-language-list" aria-label="选择生成语言">
                  {Object.entries(LANGUAGE_MODES).map(([value, mode]) => <TabsTrigger key={value} value={value}>{mode.label}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </Field>
          </div>
          <div className="x-daily-tweets-model-row">
            <div className="x-daily-tweets-model-copy">
              <span className="x-daily-tweets-model-label">当前使用模型</span>
              <strong translate="no">{modelSettings?.model || '尚未配置'}</strong>
              <span>{modelSettings?.configured ? `${modelSettings.provider || 'openai-compatible'} · 已连接` : '前往模型维护完成配置'}</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onNavigate('settings')}>切换模型</Button>
          </div>
          <div className="x-daily-tweets-action">
            <LoadingButton type="button" aria-busy={generating} onClick={() => void generateTweets()} loading={generating} disabled={!selectedPrompt || loadingPrompts || savingPrompt}>
              <FileText aria-hidden="true" data-icon="start" />{generating ? '生成中…' : isDirty ? '保存并生成' : '生成推文'}
            </LoadingButton>
            {generating ? (
              <span className="x-daily-tweets-loading-note" role="status" aria-live="polite">正在生成 {expectedCount} 条{languageMode === 'both' ? '双语' : ''}内容，请稍候…</span>
            ) : (
              <span>双语模式会把同一序号的中文与 English 收进同一张卡片，可分别复制。</span>
            )}
          </div>
        </Card>

        <section id="daily-tweets-drafts" className={`x-daily-tweets-results${generating ? ' is-generating' : ''}`} aria-busy={generating} aria-labelledby="daily-tweets-results-title">
          <div className="x-daily-tweets-section-heading">
            <div>
              <span className="x-daily-tweets-kicker">OUTPUT / 03</span>
              <h2 id="daily-tweets-results-title">可编辑草稿</h2>
            </div>
            <div className="x-daily-tweets-output-actions">
              <Button type="button" variant="outline" size="sm" onClick={() => setTweetDetailOpen(true)} disabled={!tweets.length}>详情</Button>
              <Button type="button" variant="outline" size="sm" onClick={copyAll} disabled={!tweets.length}>
                {copiedId === 'all' ? <Check aria-hidden="true" data-icon="start" /> : <Copy aria-hidden="true" data-icon="start" />}{copiedId === 'all' ? '已复制全部' : '复制全部'}
              </Button>
            </div>
          </div>
          {generating && (
            <div className="x-daily-tweets-generation-signal" aria-hidden="true">
              <div className="x-daily-tweets-generation-rail">
                <span className="x-daily-tweets-generation-beam" />
                {Array.from({ length: 7 }, (_, index) => <span className="x-daily-tweets-generation-node" key={index} />)}
              </div>
              <div className="x-daily-tweets-generation-copy">
                <span>LIVE DRAFT FEED</span>
                <strong>正在整理 {expectedCount} 条草稿</strong>
              </div>
            </div>
          )}
          {tweets.length ? (
            <>
              <div className="x-daily-tweets-output-meta">
                <Badge variant="soft">{tweetGroups.length} 个版本</Badge>
                <span>{tweets.length} 条语言稿 · 可以分别复制或全部带走</span>
              </div>
              <div className="x-daily-tweets-list">
                {tweetGroups.map((group, index) => {
                  const entries = [['zh', group.zh], ['en', group.en]].filter(([, tweet]) => tweet);
                  const bilingual = Boolean(group.zh && group.en);
                  return (
                    <Card key={group.id} className={`x-daily-tweet-card${bilingual ? ' is-bilingual' : ''}`}>
                      <div className="x-daily-tweet-card-header">
                        <div className="x-daily-tweet-card-heading">
                          <span className="x-daily-tweet-sequence tabular-nums">{String(index + 1).padStart(2, '0')}</span>
                          <div>
                            <strong>{bilingual ? '双语版本' : '单语版本'}</strong>
                            <span>{bilingual ? '同一条推文的两种语言' : '可直接继续编辑'}</span>
                          </div>
                        </div>
                        <Badge variant="soft">{bilingual ? '中英' : LANGUAGE_LABELS[entries[0]?.[0]] || entries[0]?.[0]}</Badge>
                      </div>
                      <div className={`x-daily-tweet-pair${bilingual ? ' is-bilingual' : ''}`}>
                        {entries.map(([language, tweet]) => {
                          const id = `${group.id}-${language}`;
                          const label = LANGUAGE_LABELS[language] || language;
                          return (
                            <article className="x-daily-tweet-language" key={id} lang={language === 'zh' ? 'zh-CN' : 'en'}>
                              <div className="x-daily-tweet-language-meta">
                                <span>{label}</span>
                                <span className="tabular-nums">{[...tweet.content].length} 字符</span>
                              </div>
                              <p>{tweet.content}</p>
                              <Button type="button" size="sm" variant={copiedId === id ? 'soft' : 'outline'} onClick={() => void copyText(tweet.content, id)}>
                                {copiedId === id ? <Check aria-hidden="true" data-icon="start" /> : <Copy aria-hidden="true" data-icon="start" />}{copiedId === id ? '已复制' : `复制${label}`}
                              </Button>
                            </article>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="x-daily-tweets-empty">
              <span className="x-daily-tweets-empty-mark" aria-hidden="true"><BrandX /></span>
              <strong>草稿会沿着输出轨道落在这里</strong>
              <p>选择提示词、语言和数量后，生成一批可以继续编辑的版本。</p>
            </div>
          )}
        </section>
      </div>
      <Dialog open={remixOpen} onOpenChange={(open) => { if (!generating) setRemixOpen(open); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>推文二创</DialogTitle>
            <DialogDescription>粘贴参考推文，补充改写要求后生成独立草稿；参考内容只作为素材，不会被照抄。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-5">
              <Field>
                <FieldLabel>参考推文</FieldLabel>
                <Textarea name="tweet-remix-source" autoComplete="off" rows={8} value={remixSource} onChange={(event) => setRemixSource(event.target.value)} placeholder="粘贴要二创的推文…" disabled={generating} />
              </Field>
              <Field>
                <FieldLabel>二创要求</FieldLabel>
                <Textarea name="tweet-remix-instruction" autoComplete="off" rows={3} value={remixInstruction} onChange={(event) => setRemixInstruction(event.target.value)} placeholder="可选：如改为更直接的观点、补充行动建议或换一个切入角度…" disabled={generating} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>每种语言生成</FieldLabel>
                  <Select value={remixCount} onValueChange={setRemixCount} disabled={generating}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(COUNT_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>生成语言</FieldLabel>
                  <Tabs value={remixLanguageMode} onValueChange={setRemixLanguageMode}>
                    <TabsList aria-label="选择二创生成语言">
                      {Object.entries(LANGUAGE_MODES).map(([value, mode]) => <TabsTrigger key={value} value={value}>{mode.label}</TabsTrigger>)}
                    </TabsList>
                  </Tabs>
                </Field>
              </div>
              <p className="text-sm text-foreground-muted">会把参考推文、二创要求、语言与数量组装为提示词，预计生成 {remixExpectedCount} 条语言稿。</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="soft" disabled={generating} onClick={() => setRemixOpen(false)}>取消</Button>
            <LoadingButton type="button" loading={generating} disabled={!remixSource.trim()} onClick={() => void generateRemix()}><FileText aria-hidden="true" data-icon="start" />生成二创推文</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={promptEditorOpen} onOpenChange={setPromptEditorOpen}>
        <DialogContent className="x-daily-tweets-prompt-dialog">
          <DialogHeader>
            <DialogTitle>{selectedPrompt ? `编辑提示词：${selectedPrompt.title}` : '编辑提示词'}</DialogTitle>
            <DialogDescription>{selectedPrompt ? `${selectedPrompt.category} · 修改后返回页面保存提示词。` : '修改当前使用的提示词。'}</DialogDescription>
          </DialogHeader>
          <DialogBody className="x-daily-tweets-prompt-dialog-body">
            <Field>
              <FieldLabel>提示词正文</FieldLabel>
              <Textarea name="daily-tweet-prompt-dialog" autoComplete="off" rows={18} value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="soft" disabled={savingPrompt} onClick={() => setPromptEditorOpen(false)}>完成编辑</Button>
            <LoadingButton loading={savingPrompt} disabled={!isDirty || generating} onClick={() => void savePrompt()}>保存提示词</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={tweetDetailOpen} onOpenChange={setTweetDetailOpen}>
        <DialogContent className="x-daily-tweets-detail-dialog">
          <DialogHeader>
            <DialogTitle>生成推文详情</DialogTitle>
            <DialogDescription>{detailTweets.length} 条语言稿以瀑布流展示，可单独复制。</DialogDescription>
          </DialogHeader>
          <DialogBody className="x-daily-tweets-detail-dialog-body">
            <div className="x-daily-tweets-detail-masonry">
              {detailTweets.map(({ id, index, language, tweet }) => {
                const label = LANGUAGE_LABELS[language] || language;
                return (
                  <article className="x-daily-tweets-detail-item" key={id} lang={language === 'zh' ? 'zh-CN' : 'en'}>
                    <div className="x-daily-tweets-detail-meta">
                      <span className="x-daily-tweet-sequence tabular-nums">{String(index + 1).padStart(2, '0')}</span>
                      <span>{label}</span>
                      <span className="tabular-nums">{[...tweet.content].length} 字符</span>
                    </div>
                    <p>{tweet.content}</p>
                    <Button type="button" size="sm" variant={copiedId === id ? 'soft' : 'outline'} onClick={() => void copyText(tweet.content, id)}>
                      {copiedId === id ? <Check aria-hidden="true" data-icon="start" /> : <Copy aria-hidden="true" data-icon="start" />}{copiedId === id ? '已复制' : `复制${label}`}
                    </Button>
                  </article>
                );
              })}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { DailyTweetsPage };
