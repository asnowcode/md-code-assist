# 02: 验证 MEO Enhanced 保存流程并交付可本地安装版本

**What to build:** 用户能在普通 Markdown 编辑器和 MEO Enhanced 中验证修复后的保存体验，并把修复版打包为可在自己的 VS Code 中安装的 VSIX。用户文档准确说明 `onSave` 的行为及已验证的自定义编辑器支持边界。

**Blocked by:** 01: 保存 Markdown 时正确格式化并静默跳过无工作文档。

**Status:** approved; implementation verification in progress

- [ ] 在扩展开发宿主中确认普通 Markdown 编辑器保存纯文本时静默、保存受支持代码块时正确格式化。
- [ ] 在 MEO Enhanced 中确认保存纯正文或只有 `text` 代码块时无弹窗，并记录它是否提供标准 `TextDocument` 保存事件。
- [ ] 若 MEO Enhanced 提供标准保存事件，验证受支持代码块能否写回、是否出现重复保存、意外脏状态或修改丢失；若不提供，明确记录限制并提出后续需求，不擅自引入专用适配。
- [ ] 更新用户说明和架构说明，使保存触发、静默跳过条件与已验证的自定义编辑器支持范围一致。
- [ ] 构建并打包 VSIX，确认它可以在本地 VS Code 安装和启动；无需发布 Marketplace，也不改变插件身份。

验证记录：VSIX 已构建、打包，并成功安装到隔离扩展目录。MEO Enhanced 中纯文本修改和保存后未看到插件弹窗；但开发宿主随后两次以渲染进程 code 5 崩溃，受支持代码块的实际写回、保存后脏状态及循环尚未完成验证。隔离窗口启动也未能稳定打开，故不把 VSIX 的实际启动记为通过。
