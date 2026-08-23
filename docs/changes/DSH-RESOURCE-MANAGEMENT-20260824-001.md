---
changeId: "DSH-RESOURCE-MANAGEMENT-20260824-001"
plugin: "dsh-resource-management"
status: in-progress
baselineCommit: "initial"
branch: "main"
createdAt: "2026-08-24T01:43:00+08:00"
summary: "合并 Plugin Manager 与 Skill Manager 为一个双入口插件"
validationCommand: "pnpm check"
---

# DSH-RESOURCE-MANAGEMENT-20260824-001: 合并 Plugin Manager 与 Skill Manager

## 现象

原本的 Plugin Manager 与 Skill Manager 分别维护 Host、客户端入口、参数值和版本，无法作为一个项目统一升级，也无法保证两个入口显示同一套当前 DSH profile 资源。

## 根因

两套实现共享 UI 目标却有两个包身份和两套 API。README 读取、参数值持久化、资源分类和生命周期入口没有统一组合根。

## 修改内容

- 创建一个 `dsh-resource-management` 包、Host 和客户端构建产物。
- 保留两个侧栏 ID：`dsh-resource-management:plugins` 与 `dsh-resource-management:skills`。
- 合并当前安装 Plugin 目录、live Skill 来源、分类服务、参数运行时和 profile 控制。
- Plugin 与 Skill 参数值写入同一个 profile 文件的 `plugins` / `skills` 命名空间。
- Plugin 入口保留启用/禁用；Skill 入口不暴露该操作。
- API 采用严格方法白名单；README 图片走只读 asset 路由，客户端不接触本机路径。

## 验证结果

当前实现已通过统一插件的 API、客户端、服务命名空间、图片路由测试；完整 `pnpm check` 在 Host 组合和构建完成后更新。

## 回退方法

在正式 profile 激活前，只需删除候选 Generation 或恢复上一个 Checkpoint；本仓库保留完整 Git 历史。旧 Plugin/Skill Manager 仓库在统一插件通过冷启动和回退导出验证前不删除。

## 用户数据影响

当前阶段未修改正式 DSH profile、EAC、会话或旧 Manager 参数文件。新统一参数文件只在测试临时目录中创建。

