# Workstation Shell

The user-facing workspace context: homepage, navigation, and the small set of actions that help a person decide what to do next.

## Language

**行动提示**:
A homepage prompt that turns current, real work-state information into one executable next step. It must identify why it is shown and point to a real action.
_Avoid_: AI 推荐, 鸡汤, 静态指标

**提示候选**:
The ordered set of valid action prompts available for the current workspace state. A candidate is eligible only when its source data and action are real.
_Avoid_: 随机推荐, 提示列表（when referring to the ordered candidate set）

**主提示**:
The one prompt currently highlighted as the homepage's primary next step. Other candidates remain available without competing for the same visual focus.
_Avoid_: 轮播广告, 通知流

**提示来源**:
The personal-workbench area that explains a prompt, such as a task, expiry reminder, calendar event, stock holding, health record, content item, or special day.
_Avoid_: 模型理由

**时间上下文**:
The current time period used to order valid prompt candidates: early day, daytime, or evening. It changes priority context, not the underlying facts.
_Avoid_: 随机轮播时间

**提示队列**:
The small, ordered set of prompt candidates available behind the primary prompt. Similar candidates may be summarized by source while their real details remain in the owning module.
_Avoid_: 通知中心

**候选合并**:
The presentation rule that groups similar valid candidates into one summary prompt when showing many candidates, without losing access to their individual records.
_Avoid_: 丢弃通知

**处理动作**:
The concrete navigation or domain operation attached to an action prompt, such as opening a task or reviewing an expiry reminder.
_Avoid_: 建议按钮

**经期信息**:
Real cycle details that may appear in the homepage when the source provides them. This project currently defaults the source to visible; missing or unreliable fields remain an explicit empty state rather than an inference.
_Avoid_: 推断性健康提示

**稳定提示游标**:
The persisted ID of the last valid primary prompt, used to avoid immediate repetition across homepage entry or refresh without changing the prompt while the page is open.
_Avoid_: 数组索引游标

**确认式采集**:
An unsaved URL capture session whose fetched values remain editable form state until the user explicitly saves the record.
_Avoid_: 自动落库, 抓取即保存

**重复地址**:
A normalized URL that already has a saved programming record; adding it reports the existing record instead of silently creating or overwriting another one.
_Avoid_: 自动覆盖, 静默重复
