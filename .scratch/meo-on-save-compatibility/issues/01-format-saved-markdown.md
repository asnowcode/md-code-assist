# 01: 保存 Markdown 时正确格式化并静默跳过无工作文档

**What to build:** 当 Markdown Code Assistant 配置为 `onSave` 时，插件只处理本次保存的 Markdown 文档。文档没有可格式化代码块时静默结束；有受支持代码块时，仅把实际格式化结果写回该文档。普通 Markdown 文本编辑器继续正常工作，自定义编辑器无需提供活动文本编辑器。

**Blocked by:** None (can start immediately).

**Status:** approved; implemented, verification in progress

- [ ] 保存纯正文、只有 `text` 或无语言代码块的 Markdown 时，无提示、无编辑；未启用语言和没有已注册格式化器的语言也静默跳过。
- [ ] 有符合条件但已经符合格式的代码块时，无提示、无写回；格式化器运行失败或不可用时，保留真实错误处理。
- [ ] 保存含受支持语言代码块的 Markdown 时，只更新被保存文档的代码块内容，保留正文、围栏、语言别名及忽略指令的现有行为。
- [ ] 活动文本编辑器不存在或指向另一文档时，不出现“打开 Markdown 文件”误报，也不修改另一文档。
- [ ] 非 Markdown 保存和非 `onSave` 配置不触发本功能；保存时诊断与手动格式化命令维持原有行为。
- [ ] 在保存事件入口进行行为测试，覆盖上述情形；通过现有类型检查、lint、测试和构建。

验证记录：新增保存入口行为测试并通过，构建通过。全套测试待最终运行。类型检查和 lint 仍被开发前已有的 Ruff/ESLint 类型错误及 `no-var-requires` 报错阻断。
