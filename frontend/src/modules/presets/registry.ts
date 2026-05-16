import type { PresetApiId } from '@/types/domain';

import type { AdvancedFormattingCatalogId, CompletionPresetCatalogId } from './helpers';
import { advancedFormattingCatalogOrder, completionPresetCatalogOrder } from './helpers';
import { DEFAULT_PROMPT_ORDER_LISTS, DEFAULT_PROMPTS } from './openai-prompt-manager';

export type PresetCatalogId = PresetApiId;
export type { AdvancedFormattingCatalogId, CompletionPresetCatalogId } from './helpers';
export type PresetSectionId = string;
export type PresetCatalogGroupId = 'completion' | 'advanced-formatting';
export type PresetCatalogKind = 'completion' | 'advanced-formatting';
export type PresetFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'string-array' | 'json' | 'logit-bias';
export type PresetFieldScope = 'preset' | 'companion' | 'global';

export type PresetFieldDefinition = {
  id: string;
  label: string;
  type: PresetFieldType;
  scope?: PresetFieldScope;
  presetKey?: string;
  settingKey?: string;
  settingPath?: string[];
  defaultValue: unknown;
  rows?: number;
  restoreDefault?: boolean;
};

export type PresetSectionDefinition = {
  id: PresetSectionId;
  label: string;
  description?: string;
  editor?: 'default' | 'prompt-manager';
  fields: PresetFieldDefinition[];
};

export type PresetCatalogDefinition = {
  id: PresetCatalogId;
  group: PresetCatalogGroupId;
  label: string;
  noun: 'preset' | 'template' | 'prompt';
  kind: PresetCatalogKind;
  supportsRestore: boolean;
  supportsPerItemImportExport: boolean;
  supportsMasterTools: boolean;
  supportsConnectionBinding: boolean;
  sections: PresetSectionDefinition[];
};

function textField(id: string, label: string, defaultValue = '', options: Partial<PresetFieldDefinition> = {}): PresetFieldDefinition {
  return { id, label, type: 'text', defaultValue, scope: 'preset', ...options };
}

function textareaField(id: string, label: string, defaultValue = '', options: Partial<PresetFieldDefinition> = {}): PresetFieldDefinition {
  return { id, label, type: 'textarea', rows: 6, defaultValue, scope: 'preset', ...options };
}

function numberField(id: string, label: string, defaultValue = 0, options: Partial<PresetFieldDefinition> = {}): PresetFieldDefinition {
  return { id, label, type: 'number', defaultValue, scope: 'preset', ...options };
}

function booleanField(id: string, label: string, defaultValue = false, options: Partial<PresetFieldDefinition> = {}): PresetFieldDefinition {
  return { id, label, type: 'boolean', defaultValue, scope: 'preset', ...options };
}

function jsonField(id: string, label: string, defaultValue: unknown, options: Partial<PresetFieldDefinition> = {}): PresetFieldDefinition {
  return { id, label, type: 'json', defaultValue, scope: 'preset', ...options };
}

const OPENAI_PROMPT_DEFAULTS = {
  impersonation_prompt: '[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don\'t write as {{char}} or system. Don\'t describe actions of {{char}}.]',
  new_chat_prompt: '[Start a new Chat]',
  new_group_chat_prompt: '[Start a new group chat. Group members: {{group}}]',
  new_example_chat_prompt: '[Example Chat]',
  continue_nudge_prompt: '[Continue your last message without repeating its original content.]',
  wi_format: '{0}',
  scenario_format: '{{scenario}}',
  personality_format: '{{personality}}',
  group_nudge_prompt: '[Write the next reply only as {{char}}.]',
};

const KOBOLD_SECTIONS: PresetSectionDefinition[] = [
  {
    id: 'sampling',
    label: '采样',
    fields: [
      numberField('temp', '温度', 1),
      numberField('top_p', 'Top P', 1),
      numberField('min_p', 'Min P', 0),
      numberField('top_a', 'Top A', 1),
      numberField('top_k', 'Top K', 0),
      numberField('typical', 'Typical', 1),
      numberField('tfs', 'TFS', 1),
    ],
  },
  {
    id: 'penalties',
    label: '惩罚',
    fields: [
      numberField('rep_pen', '重复惩罚', 1),
      numberField('rep_pen_range', '惩罚范围', 0),
      numberField('rep_pen_slope', '惩罚斜率', 0.9),
    ],
  },
  {
    id: 'generation',
    label: '生成',
    fields: [
      numberField('genamt', '生成长度', 300, { settingKey: 'amount_gen' }),
      numberField('max_length', '最大上下文', 2048, { settingKey: 'max_context' }),
      jsonField('sampler_order', '采样器顺序', [0, 1, 2, 3, 4, 5, 6]),
    ],
  },
  {
    id: 'advanced',
    label: '高级',
    fields: [
      numberField('mirostat', 'Mirostat', 0),
      numberField('mirostat_tau', 'Mirostat Tau', 5),
      numberField('mirostat_eta', 'Mirostat Eta', 0.1),
      booleanField('use_default_badwordsids', '使用默认禁词', false),
      textareaField('grammar', '语法', '', { rows: 4 }),
      numberField('seed', '随机种子', -1),
      jsonField('extensions', '扩展字段', {}),
      jsonField('__extras', '额外字段', {}),
    ],
  },
];

const NOVEL_SECTIONS: PresetSectionDefinition[] = [
  {
    id: 'sampling',
    label: '采样',
    fields: [
      numberField('temperature', '温度', 1.5),
      numberField('top_k', 'Top K', 10),
      numberField('top_p', 'Top P', 0.75),
      numberField('top_a', 'Top A', 0.08),
      numberField('typical_p', 'Typical P', 0.975),
      numberField('tail_free_sampling', 'Tail Free Sampling', 0.975),
      numberField('min_p', 'Min P', 0),
      numberField('genamt', '生成长度', 150, { settingKey: 'amount_gen' }),
      numberField('max_length', '最大上下文', 8192, { settingKey: 'max_context' }),
    ],
  },
  {
    id: 'penalties',
    label: '惩罚',
    fields: [
      numberField('repetition_penalty', '重复惩罚', 2.25),
      numberField('repetition_penalty_range', '惩罚范围', 2048),
      numberField('repetition_penalty_slope', '惩罚斜率', 0.09),
      numberField('repetition_penalty_frequency', '频率惩罚', 0),
      numberField('repetition_penalty_presence', '存在惩罚', 0.005),
      numberField('min_length', '最小长度', 1),
    ],
  },
  {
    id: 'prompting',
    label: '提示词',
    fields: [
      textareaField('preamble', '前置', '[ Style: chat, complex, sensory, visceral ]'),
      textField('prefix', '前缀', ''),
      textareaField('banned_tokens', '禁用词元', ''),
    ],
  },
  {
    id: 'ordering-and-bias',
    label: '顺序与偏置',
    fields: [
      jsonField('order', '顺序', [1, 5, 0, 2, 3, 4]),
      jsonField('logit_bias', 'Logit Bias', []),
      numberField('math1_temp', 'Math1 温度', 1),
      numberField('math1_quad', 'Math1 Quad', 0),
      numberField('math1_quad_entropy_scale', 'Math1 Quad Entropy Scale', 0),
      jsonField('extensions', '扩展字段', {}),
      jsonField('__extras', '额外字段', {}),
    ],
  },
];

const TEXTGEN_SECTIONS: PresetSectionDefinition[] = [
  {
    id: 'sampling-core',
    label: '采样核心',
    fields: [
      numberField('temp', '温度', 0.7),
      booleanField('temperature_last', '温度后置', true),
      numberField('top_p', 'Top P', 0.5),
      numberField('top_k', 'Top K', 40),
      numberField('top_a', 'Top A', 0),
      numberField('tfs', 'TFS', 1),
      numberField('epsilon_cutoff', 'Epsilon 截断', 0),
      numberField('eta_cutoff', 'Eta 截断', 0),
      numberField('typical_p', 'Typical P', 1),
      numberField('min_p', 'Min P', 0),
      numberField('genamt', '生成长度', 300, { settingKey: 'amount_gen' }),
      numberField('max_length', '最大上下文', 2048, { settingKey: 'max_context' }),
    ],
  },
  {
    id: 'penalties',
    label: '惩罚',
    fields: [
      numberField('rep_pen', '重复惩罚', 1.2),
      numberField('rep_pen_range', '惩罚范围', 0),
      numberField('rep_pen_decay', '惩罚衰减', 0),
      numberField('rep_pen_slope', '惩罚斜率', 1),
      numberField('no_repeat_ngram_size', '禁止重复 Ngram', 0),
      numberField('encoder_rep_pen', 'Encoder 重复惩罚', 1),
      numberField('freq_pen', '频率惩罚', 0),
      numberField('presence_pen', '存在惩罚', 0),
      numberField('skew', '偏斜', 0),
      numberField('penalty_alpha', '惩罚系数', 0),
    ],
  },
  {
    id: 'search-and-output',
    label: '搜索与输出',
    fields: [
      numberField('num_beams', '束搜索数', 1),
      numberField('length_penalty', '长度惩罚', 1),
      numberField('min_length', '最小长度', 0),
      booleanField('do_sample', '启用采样', true),
      booleanField('early_stopping', '提前停止', false),
      numberField('max_tokens_second', '每秒最大 Tokens', 0),
      numberField('seed', '随机种子', -1),
      numberField('n', 'N', 1),
    ],
  },
  {
    id: 'dynamic-and-dry',
    label: '动态与 DRY',
    fields: [
      booleanField('dynatemp', '动态温度', false),
      numberField('min_temp', '最小温度', 0),
      numberField('max_temp', '最大温度', 2),
      numberField('dynatemp_exponent', '动态温度指数', 1),
      numberField('smoothing_factor', '平滑系数', 0),
      numberField('smoothing_curve', '平滑曲线', 1),
      numberField('dry_allowed_length', 'DRY 允许长度', 2),
      numberField('dry_multiplier', 'DRY 倍率', 0),
      numberField('dry_base', 'DRY 基准', 1.75),
      textareaField('dry_sequence_breakers', 'DRY 断句', '["\\n", ":", "\\"", "*"]'),
      numberField('dry_penalty_last_n', 'DRY 惩罚窗口', 0),
      numberField('adaptive_target', '自适应目标', -0.01),
      numberField('adaptive_decay', '自适应衰减', 0.9),
    ],
  },
  {
    id: 'reasoning-grammar-schema',
    label: '推理 / 语法 / Schema',
    fields: [
      booleanField('include_reasoning', '包含推理', true),
      numberField('guidance_scale', '引导强度', 1),
      textareaField('negative_prompt', '负面提示词', ''),
      textareaField('grammar_string', '语法', ''),
      jsonField('json_schema', 'JSON Schema', null),
      booleanField('json_schema_allow_empty', '允许空 Schema', false),
      textareaField('banned_tokens', '禁用词元', ''),
      textareaField('global_banned_tokens', '全局禁用词元', '', { settingPath: ['global_banned_tokens'] }),
      booleanField('send_banned_tokens', '发送禁用词元', true),
    ],
  },
  {
    id: 'sampler-ordering',
    label: '采样器排序',
    fields: [
      jsonField('sampler_priority', '采样器优先级', ['repetition_penalty', 'presence_penalty']),
      jsonField('samplers', '采样器', ['penalties', 'dry']),
      jsonField('samplers_priorities', '采样器优先级', ['dry', 'penalties']),
      jsonField('sampler_order', '采样器顺序', [6, 0, 1, 3, 4, 2, 5]),
      numberField('mirostat_mode', 'Mirostat 模式', 0),
      numberField('mirostat_tau', 'Mirostat Tau', 5),
      numberField('mirostat_eta', 'Mirostat Eta', 0.1),
      booleanField('ignore_eos_token', '忽略 EOS', false),
      booleanField('ban_eos_token', '禁用 EOS', false),
      booleanField('skip_special_tokens', '跳过特殊词元', true),
      booleanField('spaces_between_special_tokens', '特殊词元间空格', true),
      booleanField('speculative_ngram', '推测 Ngram', false),
      numberField('xtc_threshold', 'XTC 阈值', 0.1),
      numberField('xtc_probability', 'XTC 概率', 0),
      numberField('nsigma', 'N Sigma', 0),
      numberField('min_keep', '最小保留', 0),
      jsonField('logit_bias', 'Logit Bias', []),
      jsonField('extensions', '扩展字段', {}),
      jsonField('__extras', '额外字段', {}),
    ],
  },
];

const OPENAI_PARAMETER_FIELDS: PresetFieldDefinition[] = [
  numberField('temperature', '温度', 1, { settingKey: 'temp_openai' }),
  numberField('frequency_penalty', '频率惩罚', 0, { settingKey: 'freq_pen_openai' }),
  numberField('presence_penalty', '存在惩罚', 0, { settingKey: 'pres_pen_openai' }),
  numberField('top_p', 'Top P', 1),
  numberField('openai_max_context', '最大上下文', 4095),
  booleanField('max_context_unlocked', '解锁最大上下文', false),
  numberField('openai_max_tokens', '最大生成 Tokens', 300),
  numberField('seed', '随机种子', -1),
  numberField('n', '生成数量', 1),
  booleanField('stream_openai', '流式传输', false),
  textareaField('send_if_empty', '空提示时发送', ''),
  textareaField('impersonation_prompt', '代入提示词', OPENAI_PROMPT_DEFAULTS.impersonation_prompt, { restoreDefault: true }),
  textareaField('new_chat_prompt', '新对话提示词', OPENAI_PROMPT_DEFAULTS.new_chat_prompt, { restoreDefault: true }),
  textareaField('new_group_chat_prompt', '新群聊提示词', OPENAI_PROMPT_DEFAULTS.new_group_chat_prompt, { restoreDefault: true }),
  textareaField('new_example_chat_prompt', '示例对话提示词', OPENAI_PROMPT_DEFAULTS.new_example_chat_prompt, { restoreDefault: true }),
  textareaField('continue_nudge_prompt', '续写提示词', OPENAI_PROMPT_DEFAULTS.continue_nudge_prompt, { restoreDefault: true }),
  textareaField('wi_format', '世界书格式', OPENAI_PROMPT_DEFAULTS.wi_format, { restoreDefault: true }),
  textareaField('scenario_format', '场景格式', OPENAI_PROMPT_DEFAULTS.scenario_format, { restoreDefault: true }),
  textareaField('personality_format', '性格格式', OPENAI_PROMPT_DEFAULTS.personality_format, { restoreDefault: true }),
  textareaField('group_nudge_prompt', '群聊推进提示词', OPENAI_PROMPT_DEFAULTS.group_nudge_prompt, { restoreDefault: true }),
  numberField('names_behavior', '名称行为', 0),
  booleanField('continue_prefill', '继续预填', false),
  textField('continue_postfix', '续写后缀', ' '),
  booleanField('use_sysprompt', '使用系统提示', false),
  booleanField('squash_system_messages', '合并系统消息', false),
  booleanField('function_calling', '函数调用', false),
  booleanField('show_thoughts', '显示思考', true),
  textField('reasoning_effort', '推理强度', 'auto'),
  textField('verbosity', '详细程度', 'auto'),
  booleanField('enable_web_search', '启用网络搜索', false),
  booleanField('media_inlining', '媒体内联', true),
  textField('inline_image_quality', '内联图片质量', 'auto'),
  booleanField('request_images', '请求图片', false),
  textField('request_image_aspect_ratio', '请求图片比例', ''),
  textField('request_image_resolution', '请求图片分辨率', ''),
  textField('bias_preset_selected', '当前偏置预设', 'Default (none)'),
  { id: 'bias_presets', label: '偏置预设', type: 'logit-bias', defaultValue: { 'Default (none)': [] }, scope: 'preset' },
  jsonField('extensions', '扩展字段', {}),
  jsonField('__extras', '额外字段', {}),
];

const OPENAI_SECTIONS: PresetSectionDefinition[] = [
  {
    id: 'parameters',
    label: '参数',
    fields: OPENAI_PARAMETER_FIELDS,
  },
  {
    id: 'prompt-manager',
    label: '词条管理',
    description: '管理词条启用、顺序与内容。',
    editor: 'prompt-manager',
    fields: [
      jsonField('prompts', '词条', DEFAULT_PROMPTS),
      jsonField('prompt_order', '词条顺序', DEFAULT_PROMPT_ORDER_LISTS),
    ],
  },
];

const CONTEXT_SECTIONS: PresetSectionDefinition[] = [
  {
    id: 'template-content',
    label: '模板内容',
    fields: [
      textareaField('story_string', '故事串', '{{#if system}}{{system}}\n{{/if}}{{#if description}}{{description}}\n{{/if}}{{#if personality}}{{char}}\'s personality: {{personality}}\n{{/if}}{{#if scenario}}Scenario: {{scenario}}\n{{/if}}{{#if persona}}{{persona}}\n{{/if}}'),
      textareaField('example_separator', '示例分隔符', '***'),
      textareaField('chat_start', '对话开始', '***'),
    ],
  },
  {
    id: 'injection',
    label: '注入',
    fields: [
      booleanField('use_stop_strings', '使用停止字符串', true),
      booleanField('names_as_stop_strings', '名称作为停止字符串', true),
      numberField('story_string_position', '故事串位置', 0),
      numberField('story_string_depth', '故事串深度', 1),
      numberField('story_string_role', '故事串角色', 0),
    ],
  },
  {
    id: 'workspace-controls',
    label: '工作区控制',
    fields: [
      booleanField('context_derived', '派生上下文', false, { scope: 'global', settingPath: ['power_user', 'context_derived'] }),
      booleanField('always_force_name2', '总是强制 Name2', false, { scope: 'global', settingPath: ['power_user', 'always_force_name2'] }),
      booleanField('trim_sentences', '修剪句子', false, { scope: 'global', settingPath: ['power_user', 'trim_sentences'] }),
      booleanField('single_line', '单行', false, { scope: 'global', settingPath: ['power_user', 'single_line'] }),
    ],
  },
];

const INSTRUCT_SECTIONS: PresetSectionDefinition[] = [
  {
    id: 'workspace-controls',
    label: '工作区控制',
    fields: [
      booleanField('enabled', '启用', false, { scope: 'companion' }),
      booleanField('instruct_derived', '派生 Instruct', false, { scope: 'global', settingPath: ['power_user', 'instruct_derived'] }),
      booleanField('wrap', '自动包裹', true),
      booleanField('macro', '宏展开', true),
      booleanField('bind_to_context', '绑定到 Context', false, { scope: 'companion' }),
      textField('activation_regex', '激活正则', ''),
      booleanField('sequences_as_stop_strings', '序列作为停止字符串', true),
      booleanField('skip_examples', '跳过示例', false),
      numberField('names_behavior', '名称行为', 1),
      booleanField('system_same_as_user', 'System 同 User', false),
    ],
  },
  {
    id: 'story-string-sequences',
    label: '故事串序列',
    fields: [
      textField('story_string_prefix', '故事串前缀', ''),
      textField('story_string_suffix', '故事串后缀', ''),
    ],
  },
  {
    id: 'user-sequences',
    label: '用户序列',
    fields: [
      textField('input_sequence', '输入序列', '### Instruction:'),
      textField('input_suffix', '输入后缀', ''),
      textField('first_input_sequence', '首段输入序列', ''),
      textField('last_input_sequence', '末段输入序列', ''),
    ],
  },
  {
    id: 'assistant-sequences',
    label: '助手序列',
    fields: [
      textField('output_sequence', '输出序列', '### Response:'),
      textField('output_suffix', '输出后缀', ''),
      textField('first_output_sequence', '首段输出序列', ''),
      textField('last_output_sequence', '末段输出序列', ''),
    ],
  },
  {
    id: 'system-and-misc-sequences',
    label: 'System 与杂项序列',
    fields: [
      textField('system_sequence', 'System 序列', ''),
      textField('system_suffix', 'System 后缀', ''),
      textField('last_system_sequence', '末段 System 序列', ''),
      textField('stop_sequence', '停止序列', ''),
      textareaField('user_alignment_message', '对齐提示', ''),
      textareaField('system_prompt', '旧版系统提示', '', { rows: 4 }),
    ],
  },
];

const SYSPROMPT_SECTIONS: PresetSectionDefinition[] = [
  {
    id: 'workspace-controls',
    label: '工作区控制',
    fields: [
      booleanField('enabled', '启用', true, { scope: 'companion' }),
    ],
  },
  {
    id: 'content',
    label: '内容',
    fields: [
      textareaField('content', '内容', 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.', { rows: 10 }),
    ],
  },
  {
    id: 'post-history',
    label: '后置历史',
    fields: [
      textareaField('post_history', '后置历史', '', { rows: 6 }),
    ],
  },
];

const REASONING_SECTIONS: PresetSectionDefinition[] = [
  {
    id: 'template',
    label: '模板',
    fields: [
      textareaField('prefix', '前缀', '<think>\n', { rows: 4 }),
      textareaField('suffix', '后缀', '\n</think>', { rows: 4 }),
      textareaField('separator', '分隔符', '\n\n', { rows: 4 }),
    ],
  },
  {
    id: 'workspace-controls',
    label: '工作区控制',
    fields: [
      booleanField('auto_parse', '自动解析', false, { scope: 'companion' }),
      booleanField('add_to_prompts', '加入提示词', false, { scope: 'companion' }),
      booleanField('auto_expand', '自动展开', false, { scope: 'companion' }),
      booleanField('show_hidden', '显示隐藏', false, { scope: 'companion' }),
      numberField('max_additions', '最大追加数', 1, { scope: 'companion' }),
    ],
  },
];

export const advancedFormattingUtilitySections: PresetSectionDefinition[] = [
  {
    id: 'start-reply-with',
    label: '起始回复',
    fields: [
      textareaField('user_prompt_bias', '起始回复', '', { scope: 'global', settingPath: ['power_user', 'user_prompt_bias'], rows: 6 }),
      booleanField('show_user_prompt_bias', '在 UI 显示前缀', true, { scope: 'global', settingPath: ['power_user', 'show_user_prompt_bias'] }),
    ],
  },
  {
    id: 'custom-stopping-strings',
    label: '自定义停止字符串',
    fields: [
      textareaField('custom_stopping_strings', '停止字符串', '', { scope: 'global', settingPath: ['power_user', 'custom_stopping_strings'], rows: 8 }),
      booleanField('custom_stopping_strings_macro', '启用宏展开', true, { scope: 'global', settingPath: ['power_user', 'custom_stopping_strings_macro'] }),
    ],
  },
  {
    id: 'tokenizer',
    label: '分词器 / Token Padding',
    fields: [
      textField('tokenizer', '分词器', 'best_match', { scope: 'global', settingPath: ['power_user', 'tokenizer'] }),
      numberField('token_padding', 'Token Padding', 64, { scope: 'global', settingPath: ['power_user', 'token_padding'] }),
    ],
  },
  {
    id: 'markdown-escapes',
    label: 'Markdown 转义字符串',
    fields: [
      textareaField('markdown_escape_strings', 'Markdown 转义字符串', '', { scope: 'global', settingPath: ['power_user', 'markdown_escape_strings'], rows: 8 }),
    ],
  },
  {
    id: 'bind-model-templates',
    label: '模型绑定模板',
    fields: [
      jsonField('model_templates_mappings', '模型模板绑定', {}, { scope: 'global', settingPath: ['power_user', 'model_templates_mappings'] }),
    ],
  },
];

export const presetCatalogDefinitions: PresetCatalogDefinition[] = [
  {
    id: 'openai',
    group: 'completion',
    label: 'OpenAI',
    noun: 'preset',
    kind: 'completion',
    supportsRestore: false,
    supportsPerItemImportExport: true,
    supportsMasterTools: false,
    supportsConnectionBinding: false,
    sections: OPENAI_SECTIONS,
  },
  {
    id: 'kobold',
    group: 'completion',
    label: 'Kobold / Horde',
    noun: 'preset',
    kind: 'completion',
    supportsRestore: true,
    supportsPerItemImportExport: true,
    supportsMasterTools: false,
    supportsConnectionBinding: false,
    sections: KOBOLD_SECTIONS,
  },
  {
    id: 'novel',
    group: 'completion',
    label: 'NovelAI',
    noun: 'preset',
    kind: 'completion',
    supportsRestore: true,
    supportsPerItemImportExport: true,
    supportsMasterTools: false,
    supportsConnectionBinding: false,
    sections: NOVEL_SECTIONS,
  },
  {
    id: 'textgenerationwebui',
    group: 'completion',
    label: 'Text Generation WebUI',
    noun: 'preset',
    kind: 'completion',
    supportsRestore: true,
    supportsPerItemImportExport: true,
    supportsMasterTools: false,
    supportsConnectionBinding: false,
    sections: TEXTGEN_SECTIONS,
  },
  {
    id: 'context',
    group: 'advanced-formatting',
    label: '上下文',
    noun: 'template',
    kind: 'advanced-formatting',
    supportsRestore: true,
    supportsPerItemImportExport: false,
    supportsMasterTools: true,
    supportsConnectionBinding: false,
    sections: CONTEXT_SECTIONS,
  },
  {
    id: 'instruct',
    group: 'advanced-formatting',
    label: '指令模板',
    noun: 'template',
    kind: 'advanced-formatting',
    supportsRestore: true,
    supportsPerItemImportExport: false,
    supportsMasterTools: true,
    supportsConnectionBinding: false,
    sections: INSTRUCT_SECTIONS,
  },
  {
    id: 'sysprompt',
    group: 'advanced-formatting',
    label: '系统提示',
    noun: 'prompt',
    kind: 'advanced-formatting',
    supportsRestore: true,
    supportsPerItemImportExport: false,
    supportsMasterTools: true,
    supportsConnectionBinding: false,
    sections: SYSPROMPT_SECTIONS,
  },
  {
    id: 'reasoning',
    group: 'advanced-formatting',
    label: '推理',
    noun: 'template',
    kind: 'advanced-formatting',
    supportsRestore: true,
    supportsPerItemImportExport: false,
    supportsMasterTools: true,
    supportsConnectionBinding: false,
    sections: REASONING_SECTIONS,
  },
];

export const presetCatalogGroupOrder: PresetCatalogGroupId[] = ['completion', 'advanced-formatting'];

export function getPresetCatalogDefinitionsByGroup(group: PresetCatalogGroupId): PresetCatalogDefinition[] {
  return presetCatalogDefinitions.filter((definition) => definition.group === group);
}

export const presetCatalogDefinitionMap = Object.fromEntries(
  presetCatalogDefinitions.map((definition) => [definition.id, definition]),
) as Record<PresetCatalogId, PresetCatalogDefinition>;

export function getPresetCatalogDefinition(apiId: PresetCatalogId): PresetCatalogDefinition {
  return presetCatalogDefinitionMap[apiId];
}

export function getPresetSectionDefinition(apiId: PresetCatalogId, sectionId: PresetSectionId): PresetSectionDefinition | undefined {
  return getPresetCatalogDefinition(apiId).sections.find((section) => section.id === sectionId);
}

export function getPresetFieldDefinitions(definition: PresetCatalogDefinition): PresetFieldDefinition[] {
  const fields = definition.sections.flatMap((section) => section.fields);
  return definition.supportsMasterTools ? [...fields, ...advancedFormattingUtilitySections.flatMap((section) => section.fields)] : fields;
}

export const completionPresetCatalogDefinitions = completionPresetCatalogOrder.map(
  (catalogId) => getPresetCatalogDefinition(catalogId),
) as Array<PresetCatalogDefinition & { id: CompletionPresetCatalogId }>;

export const advancedFormattingCatalogDefinitions = advancedFormattingCatalogOrder.map(
  (catalogId) => getPresetCatalogDefinition(catalogId),
) as Array<PresetCatalogDefinition & { id: AdvancedFormattingCatalogId }>;
