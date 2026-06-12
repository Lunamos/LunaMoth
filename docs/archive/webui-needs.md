# webui ↔ 后端需求单（Track B 登记，Track A 实现并写回执）

写给 webui：缺什么后端能力就**追加**到「待办」；做完会移到「可接线」。
落地前 UI 一律做"等待后端"占位态，不自己实现后端。

## 可接线（后端已在 main，前端按此契约直接用）

- `works.read {name, rel}` → `{kind: text|image|binary, content|data_uri,
  size, truncated}`；512KB 截断旗标，超限提示用 `works.open`。
- `messaging.get/save {name}`：秘密掩码读；保存按平台**字段级合并**——
  省略=保留、掩码原样回传=保留、显式 null=删除。
- `weixin.qr {name}` → `{qrcode, img, fallback_url}`；轮询
  `weixin.qr_status {name, qrcode}` → `{status[, account_id]}`，confirmed
  自动持久化登录态（网关启动即已登录）。
- 终端页：`ws://…/chara/<name>/pty?token=…&cols=…&rows=…`（xterm.js；
  二进制帧双向；resize 发整帧 `\x1b[RESIZE:<cols>;<rows>]`；chara 未运行
  也能开 —— 进的是它的家，不是它的进程）。
- `card.avatar_draft {description|card_path}` → `{candidates:
  [{avatar_svg, theme_color}], notes}`（≤3 个 sanitized 候选，全废=可见错误）。
- `card.duplicate {path}`：副本带「（副本）/ (copy)」后缀、剥 default tag、
  PNG 自动提为 JSON —— **复制按钮从 card.read+card.save 切到它**。
- `card.merge_world {card_path, world}`：独立世界书并入卡内嵌 book；
  `/upload` 对世界书返回 `{kind:"world"}`，可做"并入卡 X"。
- `/model <id>` 命令：session 范围热切换、不写回默认、空参回显，
  Reply.data 带 `{model, context_max}` —— 模型弹层可接线。
- `session.wake` 接受 `embodiment: "literal"|"actor"` —— **唤醒 sheet 要把
  它发上来**（运行中不出现切换 UI）；tempo 已全移除（删控件/文案）。
- attach 不唤醒 resting chara；无言到访零痕迹；常驻 chara 一生只招呼一次
  （重开页面不再重放招呼）。UI 配合：resting 做沉睡氛围 + "说话会唤醒它"。
- works.list 的点目录误杀已修（后端修复，前端无需动作）。

## 待办

1. **多 key 管理**：维护多把命名 key、每 chara 任选 —— Track A 设计中
   （hermes parity 轨道一并做）。
2. **`toolpacks.list`**（任务书 §4.G "唤醒时必须能选 toolpack"）：枚举
   `toolpacks/*.json` 的 RPC（name + description + tools），唤醒 sheet 的
   输入框变成真选单。Track A 做。
3. **引擎读取 `extensions.lunamoth.user_name` / `user_persona`**：工坊把
   这两个字段写进卡片，引擎 persona 层目前不读 —— 要让"你是谁"真正进
   prompt，需要 wake/activation 接到 persona 机制。触及 prompt 栈，
   Track A 做，字段语义需 owner 点头。

## 10. 多 key 管理（owner 2026-06-12 点名："我的多key呢？"——从 v2 提级）

維护多把命名 key、任选其一做默认、唤醒时可指定。建议契约（UI 将按此编码）：

- 存储进 `~/.lunamoth/desktop.json`（已 0600）：`"keys": {label: {provider,
  base_url, api_key, model?}}`。
- `keys.list {}` → `[{label, provider, base_url, model, has_key, active}]`
  ——**key 值永不回传**（has_key only，沿用 defaults 的纪律）。
- `keys.save {label, provider, base_url, api_key?, model?}`（更新时省略
  api_key = 保留原值）；`keys.delete {label}`；
- `defaults.use_key {label}` → 把该 key 拷入顶层 defaults（=defaults.set 的
  字段），回传 public defaults；
- `session.wake` 增加可选 `key: <label>`，用该 key 的 provider/base_url/
  api_key 唤醒（wake 未传 model 时用 key 自带 model）。

落地前 UI：设置·模型 只有单 key 表单（现状）；唤醒 sheet 不出现 key 选择。

## 11. 复制卡片的展示语义：`list_cards` 按 name+lang 去重（owner 报的"复制很怪"的根）

现象：复制副本后"卡片位置奇怪移动、原本锁定的卡解锁了"。根因不在写入
（save_card 会给文件名加 -2 后缀，不覆盖）而在**列表去重**：`list_cards`
以 `name+lang` 为 key 去重且用户卡目录先扫——同名副本把内置/原卡**顶出
列表**，看起来就像原卡"被移动并解锁"。前端本轮先用「<name> 副本」自动改名
绕开同名；但语义问题留给后端定夺：去重 key 改 path？还是保留 name 级
shadow（用户卡覆盖同名内置卡）作为特性但在 entry 上标注 `shadows: <path>`
让前端能如实展示？

## 12. `/model`、`toolpacks.list` 重申（owner 2026-06-12 点名："我的每个chara都能改模型呢？"）

#6、#8 仍未落地，owner 已直接催。契约维持 #6/#8 原文；`/model` 落地后
右侧面板模型弹层即点亮（前端已留好接缝）。

## v2 / 暂不做（登记免得丢）

- **卡片自定义状态词**：`extensions.lunamoth` 允许卡片覆盖 life.state 的
  展示词（石像的 resting 可以叫"风化"）。引擎侧的【听着】这类姿态文案
  已在前端全部删除，保留的状态文案只许事实陈述。
- **作品 → 会话消息回溯**（Hermes Artifacts 的 session 列）：需要后端记录
  文件 ↔ 工具调用映射。
