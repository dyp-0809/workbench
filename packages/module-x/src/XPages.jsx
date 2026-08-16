import { Button } from '@appica/ui-react/button';
import { Input } from '@appica/ui-react/input';
import { Textarea } from '@appica/ui-react/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select';
import { Switch } from '@appica/ui-react/switch';
import { Card } from '@appica/ui-react/card';
import { Badge } from '@appica/ui-react/badge';
import { Field, FieldLabel } from '@appica/ui-react/field';
import { LayoutGrid, FileText, Message, Database, Plus } from '@appica/icons-react';
import { SectionCard, Empty, DescriptionList, Metric, api } from '@x-assistant/core';
import { ContentTable } from './ContentTable.jsx';

function XOverviewPage({ dashboard, candidateEvent }) {
  return (
    <>
      <div className="grid grid-cols-24 gap-4">
        <Metric title="内容包" value={dashboard.contentPackCount} icon={<LayoutGrid />} />
        <Metric title="用户素材" value={dashboard.materialCount} icon={<FileText />} />
        <Metric title="回复会话" value={dashboard.replySessionCount} icon={<Message />} />
        <Metric title="临近清理" value={dashboard.expiringCount} icon={<Database />} />
      </div>
      <div className="section-row grid grid-cols-24 gap-4">
        <div className="col-span-24 xl:col-span-16">
          <SectionCard title="近期内容"><ContentTable packs={dashboard.recentPacks} onEvent={candidateEvent} /></SectionCard>
        </div>
        <div className="col-span-24 xl:col-span-8">
          <SectionCard title="当前定位">
            <DescriptionList items={[
              ['我是谁', dashboard.profile.identity || '尚未填写'],
              ['写给谁', dashboard.profile.audience || '尚未填写'],
              ['长期主题', dashboard.profile.themes.join('、') || '尚未填写']
            ]} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function LibraryPage({ topics, filters, setFilters, filteredPacks, candidateEvent }) {
  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={filters.topic || undefined} onValueChange={(topic) => setFilters({ ...filters, topic: topic || '' })}>
          <SelectTrigger clearable className="min-w-36"><SelectValue placeholder="全部主题" /></SelectTrigger>
          <SelectContent>{topics.map((topic) => <SelectItem key={topic} value={topic}>{topic}</SelectItem>)}</SelectContent>
        </Select>
        <Select items={{ zh: '中文', en: 'English' }} value={filters.language || undefined} onValueChange={(language) => setFilters({ ...filters, language: language || '' })}>
          <SelectTrigger clearable className="min-w-36"><SelectValue placeholder="全部语言" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="zh">中文</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
        <Select items={{ active: '有效', expired: '已过期' }} value={filters.status || undefined} onValueChange={(status) => setFilters({ ...filters, status: status || '' })}>
          <SelectTrigger clearable className="min-w-36"><SelectValue placeholder="全部状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">有效</SelectItem>
            <SelectItem value="expired">已过期</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ContentTable packs={filteredPacks} onEvent={candidateEvent} />
    </SectionCard>
  );
}

function MaterialsPage({ materials, materialInput, setMaterialInput, addMaterial }) {
  return (
    <div className="grid grid-cols-24 gap-4">
      <div className="col-span-24 lg:col-span-15">
        <SectionCard title="添加真实素材">
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); addMaterial(); }}>
            <Field>
              <FieldLabel><span className="text-error">*</span> 内容</FieldLabel>
              <Textarea required value={materialInput.content} rows={5} onChange={(event) => setMaterialInput({ ...materialInput, content: event.target.value })} placeholder="记录你的真实观察、经验、案例或反例" />
            </Field>
            <div className="grid grid-cols-24 gap-3">
              <div className="col-span-16">
                <Field>
                  <FieldLabel><span className="text-error">*</span> 主题</FieldLabel>
                  <Input required value={materialInput.topic} onChange={(event) => setMaterialInput({ ...materialInput, topic: event.target.value })} placeholder="例如 AI" />
                </Field>
              </div>
              <div className="col-span-8">
                <Field>
                  <FieldLabel>允许原样引用</FieldLabel>
                  <label className="flex h-10 items-center gap-2">
                    <Switch checked={materialInput.mayQuoteVerbatim} onCheckedChange={(mayQuoteVerbatim) => setMaterialInput({ ...materialInput, mayQuoteVerbatim })} />
                  </label>
                </Field>
              </div>
            </div>
            <div>
              <Button type="submit"><Plus data-icon="start" />保存素材</Button>
            </div>
          </form>
        </SectionCard>
      </div>
      <div className="col-span-24 lg:col-span-9">
        <SectionCard title={`已保存素材 (${materials.length})`}>
          {materials.length ? materials.map((material) => (
            <Card key={material.id} className="mb-2">
              <div className="px-3 py-2">
                <div className="font-medium">{material.content}</div>
                <Badge variant="outline" size="sm" className="mt-1">{material.topic}</Badge>
              </div>
            </Card>
          )) : <Empty description="尚未保存素材" />}
        </SectionCard>
      </div>
    </div>
  );
}

function RepliesPage({ replies }) {
  return (
    <SectionCard title={`回复会话 (${replies.length})`}>
      {replies.length ? replies.map((reply) => (
        <Card key={reply.id} className="mb-2">
          <div className="px-3 py-2">
            <div className="font-medium">{reply.targetPostText}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" size="sm">{reply.sourceKind}</Badge>
              <Badge variant="outline" size="sm">人味 {reply.humanTone}/5</Badge>
              <span className="text-sm text-foreground-muted">{new Date(reply.createdAt).toLocaleString()}</span>
            </div>
            {reply.drafts.map((draft) => <p key={draft.id} className="mt-3 whitespace-pre-wrap">{draft.content}</p>)}
          </div>
        </Card>
      )) : <Empty description="回复建议会在扩展生成后同步至此" />}
    </SectionCard>
  );
}

function Preference({ title, entries, prefix, onChange }) {
  return (
    <div className="preference-block mt-5">
      <div className="font-semibold">{title}</div>
      {entries.length ? entries.map((entry) => (
        <div className="preference-row" key={entry.value}>
          <span>{entry.value} <span className="text-foreground-muted">{entry.weight} 分</span></span>
          <Select items={{ automatic: '自动学习', fixed: '固定', reduced: '降权', ignored: '忽略' }} size="sm" value={entry.mode} onValueChange={(mode) => onChange(`${prefix}:${entry.value}`, mode)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="automatic">自动学习</SelectItem>
              <SelectItem value="fixed">固定</SelectItem>
              <SelectItem value="reduced">降权</SelectItem>
              <SelectItem value="ignored">忽略</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )) : <Empty description="尚未形成稳定偏好" />}
    </div>
  );
}

function StylePage({ style, withFeedback, refresh }) {
  const changePreference = (key, mode) => withFeedback(async () => {
    await api('/preference-overrides', { method: 'PUT', body: JSON.stringify({ key, mode }) });
    await refresh();
  });
  return (
    <div className="grid grid-cols-24 gap-4">
      <div className="col-span-24 md:col-span-10">
        <SectionCard title="用户声明">
          <DescriptionList items={[
            ['我是谁', style.profile.identity || '未填写'],
            ['受众', style.profile.audience || '未填写'],
            ['语言 / 语气', `${style.profile.language} / ${style.profile.tone}`]
          ]} />
        </SectionCard>
      </div>
      <div className="col-span-24 md:col-span-14">
        <SectionCard title="系统观察">
          <p className="text-sm text-foreground-muted">仅根据你的明确行为形成偏好；不会与其他用户混合。</p>
          <Preference title="原创主题" entries={style.originalPreferences.topics} prefix="topic" onChange={changePreference} />
          <Preference title="回复风格" entries={style.replyPreferences.styles} prefix="style" onChange={changePreference} />
        </SectionCard>
      </div>
    </div>
  );
}

export { XOverviewPage, LibraryPage, MaterialsPage, RepliesPage, StylePage, Preference };
