# X 评论建议（iPhone 快捷指令）

## 目标

主动复制 X 帖子正文后运行快捷指令，生成 3 条评论建议。快捷指令不自动读取 X 页面、不自动填写回复框、不自动发布。

## 快捷指令信息

- 名称：`X 评论建议`
- 输入：剪贴板中的帖子正文
- 模型接口：`POST https://api.deepseek.com/chat/completions`
- 默认模型：`deepseek-chat`

已生成可导入文件：

- `X评论建议.shortcut`：未签名原始文件，仅供调试；
- `X评论建议-signed.shortcut`：使用 macOS `shortcuts sign --mode anyone` 生成，优先导入此文件。

签名文件会在每次运行时询问 API Key、读取剪贴板、询问语言和风格；导入后可直接测试。若剪贴板为空，请先复制帖子正文。

## 创建步骤

按以下顺序添加动作：

1. **获取剪贴板**
2. **如果**剪贴板没有内容：
   - **询问输入**，问题为「请粘贴 X 帖子正文」；
   - 将回答保存为 `帖子正文`。
3. 否则将剪贴板保存为 `帖子正文`。
4. **从菜单中选取**回复语言：
   - 中文
   - English
   - Tiếng Việt
5. **从菜单中选取**回复风格：
   - 补充观点
   - 实操建议
   - 提问式
   - 极简回应
   - 专业分析
   - 友好支持
- 轻松幽默
6. 实际生成文件会用「询问输入」在每次运行时询问 API Key；如果手工编排，可用「文本」动作保存 Key，但不应分享包含密钥的快捷指令。
7. **词典**动作创建请求体：

```json
{
  "model": "deepseek-chat",
  "temperature": 0.7,
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "system",
      "content": "你是 X 评论草稿助手，只生成草稿，绝不决定发布。不要虚构事实、数据、客户或个人经历；不要把无关帖子变成广告；不要对医疗、法律、投资、政治事件给出确定性判断；上下文不足时建议不回复；默认不放链接；评论必须直接回应原帖。请使用指定语言和风格。只输出 JSON：{\"shouldReply\":boolean,\"reason\":string,\"risk\":string,\"angle\":string,\"drafts\":string[],\"translations\":string[]}"
    },
    {
      "role": "user",
      "content": "帖子正文：{{帖子正文}}\n回复语言：{{回复语言}}\n回复风格：{{回复风格}}"
    }
  ]
}
```

在快捷指令中，`{{帖子正文}}`、`{{回复语言}}`、`{{回复风格}}` 使用对应的魔法变量替换。建议用「词典」动作逐层创建字段，不要手写带引号的 JSON 字符串。

8. **获取 URL 内容**：
   - URL：`https://api.deepseek.com/chat/completions`
   - 方法：`POST`
   - 请求体：`JSON`
   - 请求头：
     - `Content-Type: application/json`
     - `Authorization: Bearer [API Key 文本动作]`
   - 请求体使用上一步的词典。
9. 从返回词典读取：
   - `choices` → 第一个项目 → `message` → `content`。
10. 对 `content` 使用 **从输入获取词典**或 **获取词典值**解析 JSON。
11. **文本**动作整理输出：

```text
是否建议回复：{{shouldReply}}

理由：{{reason}}

推荐角度：{{angle}}

风险提示：{{risk}}

评论草稿：
1. {{drafts[0]}}
2. {{drafts[1]}}
3. {{drafts[2]}}
```

12. 使用 **快速查看**显示结果，并提供 **复制到剪贴板**动作。

## 使用方式

1. 在 X 中复制帖子正文。
2. 运行「X 评论建议」。
3. 选择语言和风格。
4. 检查建议和风险提示。
5. 复制一条草稿，回到 X 手动修改并发布。

## 安全边界

- API Key 写在快捷指令中时，不要把快捷指令分享给别人。
- Key 会随快捷指令同步到同一 Apple 账号的设备。
- 不要把帖子中的私密或未公开信息发送给第三方模型。
- `shouldReply` 只是模型建议，不是自动发布许可。
