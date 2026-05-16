import type { PresetCatalogGroupId } from './registry';

export type PresetNoun = 'preset' | 'template' | 'prompt';

const nounLabels: Record<PresetNoun, string> = {
  preset: '预设',
  template: '模板',
  prompt: '提示词',
};

const groupLabels: Record<PresetCatalogGroupId, string> = {
  completion: '补全预设',
  'advanced-formatting': '高级格式',
};

export const PRESET_COPY = {
  title: '对话补全预设',
  subtitle: '管理当前补全引擎下的命名预设（模型与连接在 API 设置中管理），高级格式通过二级工作区继续提供。',
  advancedFormattingTitle: '高级格式',
  advancedFormattingSubtitle: '承接旧前端的上下文、指令模板、系统提示、推理与相关工具项。',
  completionEngines: '补全引擎',
  completionFormatLabel: '补全格式',
  advancedTemplateTypes: '高级格式分类',
  advancedTemplateLabel: '模板类型',
  openAdvancedFormatting: '高级格式…',
  searchPresetPlaceholder: '搜索{noun}',
  activePreset: '当前项',
  activeCatalog: '分类',
  statusSynced: '已同步',
  statusDirty: '未保存',
  statusSaving: '正在保存设置',
  statusError: '保存失败',
  choosePresetFirst: '请先选择一个预设。',
  loadFailed: '加载预设失败',
  saveSettingsFailed: '保存当前设置失败',
  updateCurrent: '更新当前',
  saveAs: '另存为',
  rename: '重命名',
  restore: '恢复',
  delete: '删除',
  deleteConfirm: '确定删除当前预设？',
  export: '导出',
  import: '导入',
  masterImport: 'Master 导入',
  masterExport: 'Master 导出',
  startReplyWith: '起始回复',
  customStoppingStrings: '自定义停止字符串',
  tokenizer: '分词器 / Token Padding',
  markdownEscapes: 'Markdown 转义字符串',
  bindModelTemplates: '模型绑定模板',
  completionGroup: groupLabels.completion,
  advancedFormattingGroup: groupLabels['advanced-formatting'],
  createFirst: '创建首个预设',
  createNew: '新建预设',
  createNameLabel: '名称',
  createNamePlaceholder: '输入名称',
  createConfirm: '创建',
  saveAsConfirm: '保存',
  renameConfirm: '重命名',
  cancel: '取消',
  discard: '放弃更改',
  saveAndContinue: '保存后继续',
  dirtyTitle: '当前预设有未保存更改',
  dirtyBody: '当前实时设置与已保存的命名预设不一致。请先保存当前预设，或放弃当前改动后继续切换。',
  emptyCatalogTitle: '当前引擎下还没有任何预设',
  emptyCatalogDescription: '创建第一项或导入 JSON 文件。这里不再以整页 JSON 编辑器作为主工作流。',
  workspaceSections: '分区卡片',
  utilityTools: '高级格式工具',
  importSucceeded: '导入完成',
  exportSucceeded: '导出完成',
  updateSucceeded: '已更新当前预设',
  saveAsSucceeded: '已另存为新预设',
  renameSucceeded: '重命名完成',
  restoreSucceeded: '已恢复到服务器保存状态',
  deleteSucceeded: '已删除当前项',
  createSucceeded: '已创建新预设',
  masterImportSucceeded: 'Master 导入完成',
  masterExportSucceeded: 'Master 导出完成',
  noMasterSections: '导入文件中没有检测到有效的 Master 分区。',
  noMasterSelection: '请至少选择一个分区。',
  importSensitiveOpenAI: '这个 OpenAI 预设包含连接或敏感字段。是否一并导入？',
  exportSensitiveOpenAI: '这个 OpenAI 预设包含连接或敏感字段。是否一并导出？',
  migrateSystemPrompt: '检测到旧版 instruct system_prompt，已迁移到 sysprompt。',
  unsupportedCompletion: '此工作区仅支持 OpenAI 聊天补全预设，已切回默认引擎。',
  importFileError: '导入文件无法解析',
  bindPresetToConnection: '绑定预设到连接',
  utilityMasterImportDescription: '导入旧前端高级格式包或单分区文件。',
  utilityMasterExportDescription: '将指令模板、上下文、系统提示、推理、SRW 等导出为 Master 包。',
  utilityStartReplyWithDescription: '编辑 user_prompt_bias 与 show_user_prompt_bias。',
  utilityCustomStoppingDescription: '管理 custom_stopping_strings 及对应宏设置。',
  utilityTokenizerDescription: '编辑 tokenizer、token_padding 等工作区伴随字段。',
  utilityMarkdownDescription: '管理 markdown_escape_strings。',
  utilityBindingsDescription: '查看并更新当前 model_templates_mappings。',
  promptManager: '词条管理',
  promptManagerDescription: '管理词条启用、顺序与内容。',
  promptManagerInvalid: '词条数据结构异常',
  promptManagerInvalidBody: '当前预设的词条数据不完整或格式不正确。请修复或重置为默认。',
  promptManagerRepair: '修复结构',
  promptManagerReset: '重置为默认',
  promptManagerImport: '导入词条',
  promptManagerExport: '导出词条',
  promptManagerQuickEdit: '快速编辑',
  promptManagerEdit: '编辑词条',
  promptManagerNew: '新建词条',
  promptManagerDelete: '删除词条',
  promptManagerDeleteConfirm: '确定删除该词条？',
  promptManagerEnabled: '启用',
  promptManagerDisabled: '禁用',
  promptManagerTagSystem: '系统',
  promptManagerTagMarker: '标记',
  promptManagerEditHint: '选择词条或新建后开始编辑。',
  promptManagerFieldIdentifier: '标识符',
  promptManagerFieldName: '名称',
  promptManagerFieldRole: '角色',
  promptManagerFieldContent: '内容',
  promptManagerFieldSystem: '系统词条',
  promptManagerFieldMarker: '标记',
  promptManagerFieldPosition: '位置',
  promptManagerFieldInjectionPosition: '注入位置',
  promptManagerFieldInjectionDepth: '注入深度',
  promptManagerFieldInjectionOrder: '注入顺序',
  promptManagerFieldForbidOverrides: '禁止覆盖',
  promptManagerFieldExtension: '扩展词条',
  promptManagerFieldInjectionTrigger: '注入触发词（每行一个）',
  promptManagerSectionEnabled: '启用 {enabled}/{total}',
  promptManagerSectionInvalid: '结构异常',
  promptManagerSectionHint: '点击进入词条管理工作区。',
  promptManagerRestoreDefault: '恢复默认',
  promptManagerIssueMissingPrompts: '缺少 prompts 列表',
  promptManagerIssueMissingOrder: '缺少 prompt_order 列表',
  promptManagerIssueMissingActiveOrder: '未找到 100001 的词条顺序集',
  promptManagerIssueInvalidPrompt: '词条对象缺少 identifier',
  promptManagerIssueDuplicatePrompt: '存在重复的 identifier',
  promptManagerIssueInvalidOrderEntry: '顺序条目格式无效',
  promptManagerIssueOrderMissingPrompt: '顺序中包含不存在的词条',
  promptManagerIssuePromptMissingOrder: '存在未被顺序覆盖的词条',
  promptManagerImportFailed: '词条导入失败',
  promptManagerExportFailed: '词条导出失败',
  promptManagerRepaired: '词条结构已修复',
  promptManagerRepairedDetail: '修复完成：补齐 {renamed} 项标识，新增 {addedOrder} 项顺序，移除 {removedOrder} 项无效顺序。',
  promptManagerAutoRepaired: '检测到词条结构问题，已自动修复。',
  promptManagerAutoRepairedDetail: '修复完成：补齐 {renamed} 项标识，新增 {addedOrder} 项顺序，移除 {removedOrder} 项无效顺序。',
  promptManagerResetDone: '已重置为默认词条',
  promptManagerInherited: '预设缺少词条，已沿用当前词条数据保存。',
  promptManagerMigrated: '检测到旧格式词条数据，已完成迁移。',
  promptManagerMigratedMap: '检测到旧格式词条字典，已迁移。',
  restoreDefaults: '恢复默认',
  jsonFieldInvalid: 'JSON 格式无效',
  selectedBadge: '当前',
  currentBinding: '当前绑定',
  noBinding: '未绑定',
  bindCurrentModel: '绑定当前模型',
  clearCurrentBinding: '清除当前绑定',
  biasPresetName: '偏置预设名称',
  newBiasPreset: '新建偏置预设',
  deleteBiasPreset: '删除偏置预设',
  biasText: '文本',
  biasValue: '偏置值',
  addBiasEntry: '添加偏置条目',
};

export function formatNounLabel(noun: PresetNoun): string {
  return nounLabels[noun];
}

export function formatSearchPlaceholder(noun: PresetNoun): string {
  return PRESET_COPY.searchPresetPlaceholder.replace('{noun}', formatNounLabel(noun));
}

export function formatCreateTitle(noun: PresetNoun): string {
  return `新建${formatNounLabel(noun)}`;
}

export function formatSaveAsTitle(noun: PresetNoun): string {
  return `另存为${formatNounLabel(noun)}`;
}

export function formatRenameTitle(noun: PresetNoun): string {
  return `重命名${formatNounLabel(noun)}`;
}

export function formatCatalogGroupLabel(group: PresetCatalogGroupId): string {
  return groupLabels[group];
}

export function formatCatalogSubtitle(group: PresetCatalogGroupId, catalogLabel: string): string {
  return `${formatCatalogGroupLabel(group)} · ${catalogLabel}`;
}
