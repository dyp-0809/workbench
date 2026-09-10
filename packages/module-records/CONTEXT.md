# Programming Records

The local library for saving and maintaining useful public programming-related references such as open-source projects, tools, and websites.

## Language

**编程记录**:
A saved reference to a public URL with source metadata and user-maintained classification and notes.
_Avoid_: 收藏夹, 自动书签

**确认式采集**:
A URL capture session whose fetched values remain editable form state until the user explicitly saves the record; it is not a durable draft.
_Avoid_: 抓取即保存, 待确认记录

**来源快照**:
The selected metadata observed from a URL or GitHub at a fetch time, kept separate from fields maintained by the user.
_Avoid_: 整页副本, 永久网页存档

**分类**:
A user-maintained, multi-select classification for a programming record. Initial categories are 工具, AI, 汇总, UI 框架, 来源库, 前端, and 后端.
_Avoid_: 单一主分类

**标签**:
A lightweight cross-cutting value such as GitHub owner, language, or topic that supports search and narrower filtering without replacing classification.
_Avoid_: 猜测分类

**消化标记**:
A user-maintained boolean indicating whether the user has studied a saved programming record in depth. It defaults to not digested and is changed explicitly from the record list.
_Avoid_: 自动判断已学习, 阅读进度

**GitHub Star 导入**:
A user-authorized batch capture of repositories returned by GitHub's starred-repositories endpoint, shown in a confirmation view before new records are saved.
_Avoid_: 后台同步, 无授权导入

**重叠导入**:
An import result whose normalized URL already exists as a saved record; overlapping rows are excluded from the confirmation list and reported as a count, while only new rows remain available for confirmation.
_Avoid_: 静默覆盖, 重复落库
