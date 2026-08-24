# Contract v1 与方案 A 模板

## 方案 A 的固定页面结构

目标资源不自行实现页面。Manager 统一渲染：

1. 资源标题、说明、当前安装版本或 Skill 来源；
2. 局部 `README` / `参数设置` Tab；
3. 参数设置中的分组卡片，每个字段一行，左侧是名称和说明，右侧是控件；
4. 独立的“操作”卡片；
5. 页面底部“恢复默认”与“保存更改”栏；
6. `restart-required` 保存成功后的统一重启提示。

声明文件只决定分组、行、控件和文字，不声明颜色、间距、CSS、任意 HTML 或脚本。视觉由 Manager 的 DSH 语义 Token 和共享组件控制。

## 文件位置和发布

```text
<目标资源根>/
└─ dsh-management/
   └─ panel.yaml
```

文件上限为 256 KiB。Plugin 的 `package.json.files` 必须包含 `dsh-management`；用 `npm pack --dry-run` 或等价命令核对最终 tarball。Skill 的 `panel.yaml` 与 `SKILL.md` 位于同一 Skill 根。

## 顶层结构

```yaml
contractVersion: 1
sections: []
actions: []
```

Schema 是严格的：未知键、重复 section/field/action ID、无效默认值或未声明版本都会使该资源的参数页标记为无效。ID 长度 1–128，只能使用字母、数字、点、下划线、冒号和连字符，并以字母或数字开头。

## 字段公共属性

每个字段都需要：

- `id`：跨版本稳定的迁移身份；
- `type`：控件类型；
- `label`：用户可见名称；
- `description`：可选说明；
- `default`：除 `secret` 外必需；
- `apply`：`immediate`、`save` 或 `restart-required`；
- `binding`：Host 校验和持久化使用的逻辑绑定。

`immediate` 在控件变化后立即提交；`save` 进入页面草稿，由保存栏提交；`restart-required` 也由保存栏提交并显示重启提示。

## 字段类型

| type | 必需或常用属性 | 用途 |
| --- | --- | --- |
| `switch` | `default: boolean` | 开关 |
| `text` | 字符串 `default`，可选 `placeholder`、`minLength`、`maxLength` | 单行文本 |
| `number` | 数字 `default`，可选 `min`、`max`、`step`、`unit` | 数字输入 |
| `slider` | 数字 `default`、`min`、`max`，可选 `step`、`unit` | 范围滑块 |
| `select` | 字符串 `default`、非空 `options` | 单选 |
| `multiselect` | 字符串数组 `default`、非空 `options` | 多选 |
| `path` | 字符串 `default`，可选 `pathKind: file/directory/either` | 路径值，不授予浏览器文件访问权 |
| `secret` | 无 `default`，可选 `placeholder` | 凭据单向写入 |

`select` / `multiselect` 的每个 option 包含 `value`、`label` 和可选 `description`；默认值必须出现在 options 中。数字默认值必须在范围内。`secret` 必须绑定 credential；其他字段不能绑定 credential。

## Binding

```yaml
binding:
  kind: profile
  namespace: target-plugin
  key: feature.enabled
```

```yaml
binding:
  kind: plugin-data
  adapterId: target-plugin-runtime
  key: render.mode
```

```yaml
binding:
  kind: credential
  key: TARGET_PLUGIN_TOKEN
```

- `profile.namespace` 必须为小写 kebab-case。
- `key` 是逻辑键，不是文件路径。
- Manager 当前把非 Secret 的 profile/plugin-data 值按 profile 和资源 ID 隔离保存在自身 `panel-values.json`；binding 不会自动改写任意第三方插件的私有配置文件。
- 因此 AI 必须逐字段指出真实运行消费者，并通过已有公开适配接口、扩展后的受测试公开配置桥或目标插件的文档化 adapter 让配置真正生效。没有可靠接口时应报告兼容缺口，而不是读取 Manager 私有文件、只保存面板值或伪报完成。
- credential 由 DSH 凭据服务管理，只向客户端返回“已配置/未配置”。

## 操作按钮

```yaml
actions:
  - id: cache.clear
    label: 清理缓存
    description: 删除可重建的本地缓存
    style: danger
    confirmation: 确认清理该插件的本地缓存？
```

`style` 支持 `primary`、`secondary`、`danger`；danger 必须提供 confirmation。声明不能包含命令、脚本或文件路径。Plugin 代码使用相同 packageName/actionId 登记处理器：

```ts
ctx.effect(() => ctx.resourceManagementActions.register(
  "target-plugin-package",
  "cache.clear",
  async () => ({ message: "缓存已清理" }),
));
```

处理器返回短消息、可选 `restartRequired: true`，以及可选 `ok: false` 表示已安全处理但执行失败；Manager 会把失败消息作为按钮下方的小行错误反馈。同一操作由 Manager 防止并发重复执行；处理器仍应限制作用域、可重试，并避免把敏感错误详情返回给浏览器。处理器必须复用真实业务入口，不能另写一套与现有命令漂移的实现。Skill Contract v1 不执行 actions。

## 适配决策

- 能直接证明生效的现有配置：创建字段并完成接线。
- 只能启动时读取的配置：使用 `restart-required`。
- 一次性行为：使用 action，不要伪装成持久字段。
- 凭据：使用 secret + credential。
- 没有安全、稳定的运行接线：先记录兼容缺口，不创建误导性控件。
- 目标资源没有任何适合暴露的参数：允许 `sections: []`、`actions: []`，Manager 显示空状态。
