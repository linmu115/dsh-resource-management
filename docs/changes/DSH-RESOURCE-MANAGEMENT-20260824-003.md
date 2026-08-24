# Manager 内置参数面板构建 Skill

## 目标

让 `dsh-resource-management` 的 GitHub 仓库和 DSH 安装包同时携带一份可被 AI 发现的参数面板适配 Skill，并把此前确定的方案 A UI、Contract v1、运行值边界和验收流程固化为项目资产。

## 修改前

- Manager 能读取目标资源的 `dsh-management/panel.yaml`，但仓库没有指导 AI 正确生成该文件的 Skill。
- 从 GitHub 拉取 Manager 时不会获得可由 Codex 插件系统自动发现的面板适配能力。
- README 没有说明如何调用 AI 为指定插件适配参数面板。

## 修改后

- 新增 `skills/dsh-management-panel-builder`，包含 SKILL 入口、Contract v1 参考、方案 A 页面结构和可复制的 `panel.yaml` 模板。
- Skill 要求 AI 同时完成声明、运行配置接线、测试和目标资源自身的 Markdown 修改日志，禁止交付只能显示但不能实际生效的控件。
- 新增 `.codex-plugin/plugin.json`，从 GitHub 作为 Codex 插件安装时自动发现仓库内 Skill。
- npm 发布清单包含 `.codex-plugin` 与 `skills`；Manager 把随包 Skill 根加入自己的 Skill 来源，因此 DSH 安装后也能在 Skill 管理入口查看它。
- README 增加 Skill 用途、发现方式和建议调用提示。
- 版本从 `0.1.1` 提升到 `0.2.0`。

## 数据和安全边界

- Skill 与模板只进入 Manager 安装包，不复制或覆盖用户全局 Skill 目录。
- 面板结构进入目标资源 Git；实际参数值继续保存在当前 DSH profile，Secret 继续使用 DSH 凭据服务。
- bundled Skill 是只读来源；用户同名 Skill 仍由现有来源冲突规则处理。

## 验证

- `skill-creator` quick validation 通过。
- Codex plugin manifest validation 通过。
- `pnpm check` 通过：7 个测试文件、17 项测试、TypeScript 类型检查和 Host/客户端构建均成功。
- npm pack 内容检查通过，`.codex-plugin/plugin.json`、Skill、参考文档和模板均进入 `dsh-resource-management-0.2.0.tgz` 清单。

## 回退

回退到 Git tag `v0.1.1` 或重新激活 `dsh-resource-management@0.1.1`。本次没有迁移或删除用户分类、面板值、凭据和 Maintenance 数据。
