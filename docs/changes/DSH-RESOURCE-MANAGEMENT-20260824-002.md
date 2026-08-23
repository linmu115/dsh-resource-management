# Manager 右键分类菜单定位修复

## 现象

在 DSH 侧栏内右键 Plugin 或 Skill 卡片时，“加入分类”菜单没有出现在鼠标附近，而是产生明显的位置偏移。分类标签的管理菜单使用相同定位方式，也存在相同风险。

## 根因

右键事件保存的是浏览器视口坐标 `clientX/clientY`，菜单也使用 `position: fixed`。但是菜单节点仍渲染在 Manager 的侧栏组件树内；DSH 侧栏祖先存在 `transform`、缩放或独立 containing block 时，fixed 元素会改为相对该祖先定位，于是菜单坐标系与鼠标坐标系不一致。

## 修改前

- `ResourceCategoryMenu` 直接渲染在 `ResourceGrid` 内。
- 分类标签管理菜单也直接渲染在 `ResourceGrid` 内。
- 菜单只设置 `left/top`，没有根据实际菜单尺寸处理视口右边缘和下边缘。

## 修改后

- 共享 kit 新增 `ViewportContextMenu`，通过 React Portal 将菜单渲染到触发事件所属文档的 `document.body`。
- 资源右键菜单与分类标签管理菜单统一使用该组件。
- 保持 `clientX/clientY + position: fixed` 的同一视口坐标系。
- 菜单完成布局后读取实际尺寸，并在距离视口边缘 8px 处钳制位置；窗口尺寸变化时重新定位。
- 无 `document` 的服务端渲染测试环境仍直接返回普通 React 节点。

## 修改位置

- `@linmu/dsh-management-kit@0.1.5`
  - `src/client/ViewportContextMenu.tsx`
  - `src/client/ResourceCategoryMenu.tsx`
  - `src/client/ResourceGrid.tsx`
  - `src/client.ts`
  - `tests/client-ui.test.tsx`
- `dsh-resource-management@0.1.1`
  - `package.json`
  - `vendor/linmu-dsh-management-kit-0.1.5.tgz`

## 验证

- 共享 kit：74 项测试通过。
- 共享 kit：TypeScript 构建通过。
- Manager：`pnpm check` 通过。
- 正式 DSH profile 冷启动后，在 `http://127.0.0.1:3080/` 验证卡片右键菜单与鼠标位置一致，并验证视口边缘不会溢出。

## 回退

重新激活 `dsh-resource-management@0.1.0` 即可恢复修改前行为。旧插件 artifact 与 `@linmu/dsh-management-kit@0.1.4` vendored 包均保留；分类数据和参数值格式没有变化，无需迁移或删除。
