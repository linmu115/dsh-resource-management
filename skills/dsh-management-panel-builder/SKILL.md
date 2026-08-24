---
name: dsh-management-panel-builder
description: 为现有 DSH Plugin 或 Skill 设计、实现并验证 dsh-resource-management 参数面板，包括 panel.yaml、运行配置接线和操作按钮。用于把指定资源适配到 Manager 的统一参数设置框架；不用于重做 Manager UI、Git/Generation 管理或凭空增加目标资源没有的功能。
---

# DSH Management Panel Builder

为指定 DSH Plugin 或 Skill 构建 Manager 能读取、能保存且与实际运行能力一致的参数面板。面板采用 Manager 内置的方案 A 视觉框架；目标资源只声明内容，不复制或修改 Manager 的 React/CSS。

## 开始前

先确认目标资源仓库、资源类型、包名或 Skill 名称，以及当前实际安装版本。检查目标资源的 README、配置模型、持久化代码、现有操作入口、测试和修改日志。只暴露已经存在且用户确实需要控制的能力；不要借适配面板之名新增无关业务功能。

在编写声明前必须阅读 [Contract v1 与方案 A 模板](references/panel-contract-v1.md)。需要创建文件时，从 [panel.yaml 模板](assets/dsh-management/panel.yaml) 复制并删改不适用的示例，不要让占位字段进入发布产物。

## 实施要求

1. 在目标资源自己的仓库创建或更新 `dsh-management/panel.yaml`。Plugin 必须把该目录加入 npm/DSH 发布产物；Skill 直接把它保存在 Skill 来源目录。
2. 使用稳定字段 ID。布局、字段顺序、默认值、校验和 action 声明进入目标资源 Git；用户当前值、开关状态和 Secret 不进入 Git。
3. 按真实生效方式选择 `immediate`、`save` 或 `restart-required`。不要为了减少重启把只能启动时读取的配置标成即时生效。
4. 每个字段在接受声明前都必须指出它的真实运行消费者，并证明参数已经接到目标资源的真实配置读取路径。仅看到 Manager 控件、仅写入 Manager 的 `panel-values.json`，不能证明目标插件已经使用该值。如果 Manager 缺少公开配置桥接，就先扩展受测试的公开桥接或让目标资源实现文档化 adapter；不得从目标资源读取 Manager 私有数据文件，也不得把静态 YAML 当作完成功能。纯 action 面板不需要字段配置桥，但每个 action 仍必须登记真实处理器。
5. Secret 只使用 `secret` 字段和 `credential` binding；不得读取回显、写入普通 JSON、日志、测试快照或错误详情。
6. 操作按钮必须由目标 Plugin 通过 `ctx.resourceManagementActions.register(packageName, actionId, handler)` 显式登记，且处理器必须调用目标资源已有或此次明确获准新增的真实业务入口。只有 YAML 声明、虚假成功返回或与实际命令并行维护的第二套逻辑都不算完成。Skill Contract v1 不支持操作按钮。危险操作使用 `danger`，并在声明中提供明确的 `confirmation`。
7. 不在资源面板暴露安装、卸载、更新、Git、Generation、Checkpoint、诊断或回退；这些仍属于 DSH Maintenance。
8. 不允许目标插件禁用 `dsh-resource-management` 自身，也不要绕过 Manager 的当前 profile 边界。

## 版本与迁移

同一含义的字段在后续版本保持同一 `id` 和兼容类型。升级时，同名且仍有效的旧值继续使用；新增字段使用新默认值；删除字段不再展示；只有用户主动点击“恢复默认”才整体重置。改变字段含义或不兼容类型时使用新 ID，并在目标仓库修改日志中说明旧值的处理方式。

Manager 展示的是当前 profile 实际安装版本随包带来的 README 和 `panel.yaml`。修改工作树后必须构建并激活目标资源的新版本，不能用未安装的仓库内容冒充已验证结果。

## 完成标准

- Contract v1 严格解析通过，目标安装包确实包含 `dsh-management/panel.yaml`。
- README 与参数设置 Tab 均可用；无效面板不会破坏 README 或其他资源。
- 每种控件验证默认值、保存、恢复默认、校验错误和正确的生效时机。
- 目标插件通过运行行为测试证明参数生效；操作按钮验证登记、并发保护、确认和错误路径。
- 冷重启 DSH 后值仍存在，Secret 未泄露，旧字段迁移符合规则。
- 源码、面板声明、测试和 Markdown 修改/排错文档在目标资源同一 Git 历史中提交。
