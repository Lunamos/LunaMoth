# 交接 · 2026-06-11 晚

> 写给下一个会话的你/任何 agent。当前 main 已推送 GitHub（`0335248`），
> **122 个测试全绿、ruff 干净**。今天完成了大重构 + 两条 codex 流水线的成果合并。

## 今天发生了什么（按序）

1. **大重构 P0–P3 + simplify**（Claude 主刀，提交 `501737f`…`865d0a2`）：
   obs/ 日志系统 → protocol/ 类型化事件（删除 \x01-\x04 控制字符）→ 域子包
   （core/protocol/content/tools/obs/session/front，`tests/test_architecture.py`
   强制依赖方向）→ CharaHandle 门面 + core/commands.py 统一命令注册表 +
   front/tui/ 包拆分。设计文档：`docs/refactor-plan.md`。
2. **F1 "活在电脑里"**（`f85bc60`）：speak 工具（say/muse 信道）、rest 自定闹钟、
   /quiet 聊天优先、时间戳搭空闲 tick 便车、长沉默注记、env 日期。
3. **Codex 舰队**（GPT-5.5 xhigh ×3，nohup 后台，全部 EXIT=0）：
   - **T1 `ctx-design`**：实现 `docs/context-design.md` —— 三区提示词
     （稳定前缀/历史/易变尾巴）、世界书卡片化两层激活（constant→稳定区、
     关键词→尾巴，浅扫描+sticky+25% cap）、PHI 位置修复、compaction
     摘要落盘（重启免重算）+ 预剪枝、卡片 goals 种子。报告：`docs/tasks/T1-REPORT.md`。
   - **T2 `server-gateway`**：`lunamoth serve <name>` —— JSON-RPC over
     stdio + WebSocket（`uv sync --extra server` 装 websockets），一份 dispatch
     包住 CharaHandle，token 鉴权。报告：`docs/tasks/T2-REPORT.md`。
   - **T3 整合**：两分支已合并进 main，无实质冲突。报告：
     `docs/tasks/INTEGRATION-REPORT.md`。

## ⚠ 需要 owner 知晓/决策的事

1. **stash@{0} 有一份未决变更**：T3 合并前发现 main 工作区有"删除根
   CLAUDE.md + 新增 docs/CLAUDE.md"的未提交改动（疑似 owner 想把 CLAUDE.md
   挪到 docs/），被 stash 保护了。要恢复：`git stash pop`；不想要：`git stash drop`。
   注意根目录 CLAUDE.md 是 Claude Code 的项目规则入口，挪走会影响后续会话。
2. **T3 报告提到 3 个 locale 敏感测试**在 `LC_ALL=C.UTF-8` 下失败（默认卡语言
   检测依赖 locale）。正常 shell 下 122 全绿；要根治可让卡语言检测不依赖环境 locale。
3. codex worktree 还在：`../LunaMoss-ctx`、`../LunaMoss-server`（分支已合并+推送，
   确认无误后可 `git worktree remove` 清理）。
4. `.codex-fleet/` 里有三个 codex 的完整工作日志（gitignored），可审计。

## 剩余工作（按优先级）

| # | 任务 | 状态/入口 |
|---|---|---|
| 1 | **验收 codex 成果**：通读三份 REPORT + 抽查 `core/agent.py` 三区装配、`core/compaction.py`、`server/dispatch.py`；实跑 `uv run lunamoth serve home --stdio` 冒烟 | 未做人工审查，只有测试绿 |
| 2 | **P5 工具注册表**：hermes 式 `tools/registry.py`，内置工具拆 `tools/builtin/`，gateway 只做调度 | 设计在 `docs/refactor-plan.md` §6.2 |
| 3 | **chara pack + 市场**：`lunamoth-pack.json` 清单、`market add/install`（git 仓库索引，Claude Code marketplace 模式） | 同上 §6.1，依赖 #2 |
| 4 | **Telegram 适配器**：AstrBot Platform 模式，只投递 say 信道（speak 工具已就位） | 依赖 server 网关（已完成） |
| 5 | **TUI 远程模式**：TUI 作为 serve 的客户端（`--connect`），之后才轮到网页/桌面端 | CLAUDE.md 路线图 |
| 6 | **TUI 重构 + fixbug** | owner 说不急 |
| 7 | hermes 残余差距：流卡死检测（90/120s 超时）、tool-call 参数修复、并行工具执行 | `core/llm.py` |

## 常用命令

```bash
uv sync --extra dev --extra server   # 注意：要带 extras，纯 uv sync 会卸掉 pytest
uv run python -m pytest -q           # 122 passed
uvx ruff check --select F src/lunamoth tests
uv run lunamoth                      # roster
uv run lunamoth serve home --stdio   # 新网关冒烟
```

持久记忆（跨会话）：`~/.claude/projects/...LunaMoss/memory/lunamoth-architecture.md`
已记录到 F1 为止；codex 三项成果尚未写入（下个会话验收后补）。
