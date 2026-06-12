# Hermes Desktop 代码级对比（2026-06-13，owner 要求的"还有什么不一样"）

来源：`reference/hermes-agent/apps/desktop/`（React+Vite+TS，~393 源文件）对
`src/lunamoth/front/web/`（no-build vanilla JS）。补充 `docs/archive/
hermes-ui-notes.md`（截图研究）——本篇看的是**代码结构**。照搬 = 搬功能
结构/字段/措辞，不搬代码（栈不同）。

## 1. 总体形状对照

| | Hermes | 我们 | 判定 |
|---|---|---|---|
| 路由 | TS 常量表 + AppView（settings/messaging/artifacts/skills/cron/agents/profiles/command-center） | hash 路由（board/deck/settings/chara/:name/[works\|term]） | 结构同构；我们的主视图围绕 chara 而非 session——**这是有意的差异，保持** |
| 状态 | nanostores（$gatewayState/$notifications/$locale…） | 模块级 state 对象 + 显式 render 函数 | 各自合适，不动 |
| RPC 客户端 | hermes.ts（typed，per-endpoint 超时，profile 路由） | rpc.js（HubClient backoff 500→8k、CharaClient seq/rejoin） | 侦察结论：我们的已是同等成色；只差 per-endpoint 超时纪律（已有 timeoutMs 形参，沿用即可） |
| i18n | per-locale TS 模块 + useI18n + field-copy 注册表（schema key → 文案） | I18N 平面字典 zh/en | 平面字典够用；**field-copy 的"字段→label/help/placeholder 三件套"模式值得抄进 GW_PLATFORMS** |
| 设置持久化 | env-var 后端（EnvVarInfo：prompt/description/required/is_password/advanced/is_set/redacted_value/url） | desktop.json defaults + per-chara config.json | 哲学不同（env vs 文件），不搬机制，搬**字段元数据形状** |

## 2. 设置面板清单（Hermes src/app/settings/）

panes：model / appearance / config / sessions / providers / gateway / keys
（tools+settings 两个子页）/ mcp / about / uninstall。

- **model-settings.tsx**：主模型（provider+model 两级下拉 + Apply）+
  **auxiliary models**（per-task 槽位：vision/compression/title-gen/approval/
  MCP-routing/curator…，每行 "auto · use main model" + Change；API =
  `setModelAssignment({model, provider, scope: 'main'|'auxiliary', task})`）。
  还有 context-window override（0=自动检测）与 fallback models 列表。
  → 我们：主模型已对齐（默认作用域文案 + no-fallback 声明行）。
  **auxiliary 概念可借**：LunaMoth 的辅助任务=压缩摘要、卡片转写
  （cards.draft 已支持 model 参数！）、头像生成——后端有形状，UI 未暴露。
  登记为后续需求，不抢做。fallback：我们永久 SKIP（原则）。
- **providers-settings.tsx**：每 provider 一行声明 auth 机制（OAuth 开浏览器
  / API key / 终端登录），Connected pill 内联。→ 我们 setupPane 的 provider
  行补一行 auth 机制说明（纯文案，S）。
- **keys-settings.tsx + credential-key-ui**：凭据卡片（label/placeholder 由
  field-copy 派生；channel_managed 的凭据归 Messaging 页管）。→ 对应我们
  needs #10 多 key；**契约学它**：每条凭据带 is_set/redacted_value，永不回传
  原值——与我们 has_key 纪律一致。
- **gateway-settings.tsx**：Local vs Remote 两张 radio 卡 + Test / Save for
  restart / Save and reconnect + "Open logs" 诊断行。→ 远程 hub 我们还没有
  （serve --ws 在但 hub 无 connect 形态）；SKIP 本轮，形状记下。
- **appearance**：语言 / Color Mode / 主题卡片（mini 预览 + 一句 vibe）/
  Tool Call Display Product|Technical。→ Product|Technical 已抄；主题卡片
  LATER（我们只有 light/dark）。

## 3. Messaging/连接器（对照我们的 per-chara 网关）

Hermes：**后端下发 schema**（getMessagingPlatforms → MessagingPlatformInfo
{id,name,description,docs_url,configured,enabled,gateway_running,env_vars[],
state,error_message}），前端 PLATFORM_INTRO 映射开场白 + field-copy 提供
per-field label/help/placeholder；三枚 chip（state tone / Credentials set /
Gateway running）；保存 = updateMessagingPlatform(id, {env, clear_env})；
面板可见时 6s 轮询。

我们：GW_PLATFORMS 前端注册表 + messaging.get/save（掩码往返、字段级合并、
null 删除）+ 三 chip + per-chara（**有意差异：网关属于角色，保持**）。

差距→行动：
1. 注册表条目缺 per-field help/placeholder/docs_url —— 本轮补（PORT）。
2. **Telegram schema 预置**（后端 adapter 是下一个；字段抄 Hermes：
   bot_token 必填密 / allowed_users 建议（"不填则任何人都能 DM 你的 bot"）/
   proxy 高级），落地前 waiting-backend 横幅。
3. state tone 派生（connected/fatal/retrying）依赖后端 state 字段——我们的
   gateway.status 只有 running/stopped；后端补充 state 枚举登记需求单。

## 4. 壳层（app-shell）

| 部件 | Hermes | 我们 | 判定 |
|---|---|---|---|
| 错误边界 | error-boundary.tsx（fallback UI + Report/Reload） | 无 | **PORT（vanilla 版）**：window.onerror/unhandledrejection → toast + console，本轮 |
| 通知 | nanostores toast 栈（kind/title/message，haptic） | toast()/toast(err) | 够用，不动 |
| 更新浮层 | getStatus 的 version/latest_version/update_percent | 无更新通道（lunamoth update=CLI） | SKIP（无后端） |
| gateway-connecting 浮层 | 字符扰动动画 | conn-dot + 重连 toast | 我们的更克制，保持 |
| Artifacts 回溯 | 文件→session 消息跳转 | 登记 v2 | 维持 v2 |
| 主题 | mode×theme 正交 + 主题卡片 | light/dark | LATER |

## 5. 本轮采纳（webui 分支）

1. GW_PLATFORMS 升级：per-field help/placeholder + Telegram 预置（waiting-backend）。
2. provider 行补 auth 机制一句话；模型 pane 微调对齐 Hermes 措辞。
3. 全局错误兜底（vanilla error boundary）。
4. **mood layer v2（owner 直接反馈：流光/倒计时/背景色不满意）**：
   删流光 sweep、删呼吸 glow、删 engage 倒计时条——状态语义全部改由
   **事实文字**承载（header 状态词：「等你回复 · ~N 分钟后回去做自己的事」
   逐分钟更新；resting 静态降饱和 + placeholder；backoff 静态去饱和+错误词）。
   保留的唯一动效：状态点呼吸 + 工具 spinner。--chara-accent 只作静态身份色
   （tab 下划线/发送钮/超淡 composer 边框 tint ≤8%）。价值基线：优雅克制，
   生命感来自事实陈述，不来自动画。
5. 需求单追加：gateway state 枚举（#13）、auxiliary models（#14，cards.draft
   的 model 参数已是半个后端）。

## 6. 不采纳与理由

- fallback models（原则禁止，已渲染为否定声明）；
- 后端下发连接器 schema（3-4 个平台的前端注册表更简单；等平台数上两位数再说）；
- nanostores/虚拟列表/Tailwind（栈不换：no-build 是产品决定）；
- profiles/command-center/cron 页（LunaMoth 的对应物是 board/chara 本身）。
