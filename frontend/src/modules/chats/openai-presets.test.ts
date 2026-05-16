import { describe, expect, it } from 'vitest';

import { createAssistantChatMessage, createUserChatMessage } from '@/lib/api/core-client';
import { sanitizePromptManagerPayload } from '@/modules/presets/openai-prompt-manager';
import type { ChatPayload, ChatProviderDraft, CharacterDetail } from '@/types/domain';

import { buildOpenAiRequestOptions, composeOpenAiMessages } from './openai-presets';

function samplePayload(): ChatPayload {
  return [
    {
      user_name: 'You',
      character_name: 'Alice',
      create_date: '2026-03-10@10h00m00s',
      chat_metadata: {},
    },
    createUserChatMessage('You', 'hello'),
    createAssistantChatMessage('Alice', 'hi there'),
  ];
}

describe('openai preset helpers', () => {
  it('composes messages in prompt order with chat history marker', () => {
    const prompts = [
      { identifier: 'main', role: 'system', content: 'Main Prompt' },
      { identifier: 'worldInfoBefore', marker: true },
      { identifier: 'chatHistory', marker: true },
    ];
    const promptOrder = [
      {
        character_id: 100001,
        order: [
          { identifier: 'main', enabled: true },
          { identifier: 'worldInfoBefore', enabled: true },
          { identifier: 'chatHistory', enabled: true },
        ],
      },
    ];

    const promptPayload = sanitizePromptManagerPayload({
      prompts,
      promptOrder,
      fallbackPrompts: prompts,
      fallbackOrder: promptOrder,
    });

    const character = {
      name: 'Alice',
      avatar: '',
      description: 'A helpful assistant.',
      personality: 'Kind',
      scenario: 'Test scenario',
      first_mes: '',
    } as CharacterDetail;

    const messages = composeOpenAiMessages({
      payload: samplePayload(),
      mode: 'reply',
      promptPayload,
      worldInfoBlock: 'World info',
      oaiSettings: {
        wi_format: '{0}',
        scenario_format: '{{scenario}}',
        personality_format: '{{personality}}',
      },
      settings: {},
      userName: 'You',
      assistantName: 'Alice',
      character,
      group: null,
    });

    expect(messages[0].content).toBe('Main Prompt');
    expect(messages[1].content).toBe('World info');
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toBe('hello');
  });

  it('expands ST addvar/getvar macros and angle placeholders', () => {
    const prompts = [
      { identifier: 'main', role: 'system', content: '{{addvar::style::Hello <user>}}' },
      { identifier: 'style', role: 'user', content: '<literary-styles>{{addvar::style::\n</literary-styles>}}{{getvar::style}}' },
    ];
    const promptOrder = [
      {
        character_id: 100001,
        order: [
          { identifier: 'main', enabled: true },
          { identifier: 'style', enabled: true },
        ],
      },
    ];

    const promptPayload = sanitizePromptManagerPayload({
      prompts,
      promptOrder,
      fallbackPrompts: prompts,
      fallbackOrder: promptOrder,
    });

    const messages = composeOpenAiMessages({
      payload: samplePayload(),
      mode: 'reply',
      promptPayload,
      worldInfoBlock: '',
      oaiSettings: {},
      settings: {},
      userName: 'You',
      assistantName: 'Alice',
      character: null,
      group: null,
    });

    const rendered = messages.find((message) => message.content.includes('<literary-styles>'));
    expect(rendered).toBeTruthy();
    expect(rendered?.content).toContain('Hello You');
    expect(rendered?.content).toContain('</literary-styles>');
  });

  it('removes trim macros from rendered prompts', () => {
    const prompts = [
      { identifier: 'main', role: 'system', content: '{{trim}}***' },
    ];
    const promptOrder = [
      {
        character_id: 100001,
        order: [{ identifier: 'main', enabled: true }],
      },
    ];

    const promptPayload = sanitizePromptManagerPayload({
      prompts,
      promptOrder,
      fallbackPrompts: prompts,
      fallbackOrder: promptOrder,
    });

    const messages = composeOpenAiMessages({
      payload: samplePayload(),
      mode: 'reply',
      promptPayload,
      worldInfoBlock: '',
      oaiSettings: {},
      settings: {},
      userName: 'You',
      assistantName: 'Alice',
      character: null,
      group: null,
    });

    const trimmed = messages.find((message) => message.content.trim() === '***');
    expect(trimmed).toBeTruthy();
  });

  it('injects now-player-input and keeps latest in history', () => {
    const prompts = [
      { identifier: 'main', role: 'system', content: 'Main Prompt' },
      { identifier: 'now', role: 'user', content: '<now-player-input>\n</now-player-input>' },
      { identifier: 'chatHistory', marker: true },
    ];
    const promptOrder = [
      {
        character_id: 100001,
        order: [
          { identifier: 'main', enabled: true },
          { identifier: 'now', enabled: true },
          { identifier: 'chatHistory', enabled: true },
        ],
      },
    ];

    const promptPayload = sanitizePromptManagerPayload({
      prompts,
      promptOrder,
      fallbackPrompts: prompts,
      fallbackOrder: promptOrder,
    });

    const payload: ChatPayload = [
      {
        user_name: 'You',
        character_name: 'Alice',
        create_date: '2026-03-10@10h00m00s',
        chat_metadata: {},
      },
      createUserChatMessage('You', 'first'),
      createAssistantChatMessage('Alice', 'ok'),
      createUserChatMessage('You', 'latest'),
    ];

    const messages = composeOpenAiMessages({
      payload,
      mode: 'reply',
      promptPayload,
      worldInfoBlock: '',
      oaiSettings: {},
      settings: {},
      userName: 'You',
      assistantName: 'Alice',
      character: null,
      group: null,
    });

    const userContents = messages.filter((message) => message.role === 'user').map((message) => message.content);
    expect(userContents.some((content) => content.includes('<now-player-input>'))).toBe(true);
    expect(userContents.filter((content) => content.includes('latest')).length).toBe(2);
    expect(userContents.some((content) => content === 'first')).toBe(true);
  });

  it('inserts absolute injection prompts into chat history', () => {
    const prompts = [
      { identifier: 'inject', role: 'system', content: 'Injected', injection_position: 1, injection_depth: 0, injection_order: 100 },
      { identifier: 'chatHistory', marker: true },
    ];
    const promptOrder = [
      {
        character_id: 100001,
        order: [
          { identifier: 'inject', enabled: true },
          { identifier: 'chatHistory', enabled: true },
        ],
      },
    ];

    const promptPayload = sanitizePromptManagerPayload({
      prompts,
      promptOrder,
      fallbackPrompts: prompts,
      fallbackOrder: promptOrder,
    });

    const messages = composeOpenAiMessages({
      payload: samplePayload(),
      mode: 'reply',
      promptPayload,
      worldInfoBlock: '',
      oaiSettings: {},
      settings: {},
      userName: 'You',
      assistantName: 'Alice',
      character: null,
      group: null,
    });

    const injected = messages.filter((message) => message.content === 'Injected');
    expect(injected).toHaveLength(1);
  });

  it('appends user_prompt_bias as assistant prefill', () => {
    const prompts = [
      { identifier: 'main', role: 'system', content: 'Main Prompt' },
    ];
    const promptOrder = [
      {
        character_id: 100001,
        order: [{ identifier: 'main', enabled: true }],
      },
    ];

    const promptPayload = sanitizePromptManagerPayload({
      prompts,
      promptOrder,
      fallbackPrompts: prompts,
      fallbackOrder: promptOrder,
    });

    const messages = composeOpenAiMessages({
      payload: samplePayload(),
      mode: 'reply',
      promptPayload,
      worldInfoBlock: '',
      oaiSettings: {},
      settings: { power_user: { user_prompt_bias: '***' } },
      userName: 'You',
      assistantName: 'Alice',
      character: null,
      group: null,
    });

    const last = messages[messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.content).toBe('***');
  });

  it('applies preset regex prompt projection to assistant history', () => {
    const prompts = [
      { identifier: 'chatHistory', marker: true },
    ];
    const promptOrder = [
      {
        character_id: 100001,
        order: [{ identifier: 'chatHistory', enabled: true }],
      },
    ];

    const promptPayload = sanitizePromptManagerPayload({
      prompts,
      promptOrder,
      fallbackPrompts: prompts,
      fallbackOrder: promptOrder,
    });

    const payload: ChatPayload = [
      {
        user_name: 'You',
        character_name: 'Alice',
        create_date: '2026-03-10@10h00m00s',
        chat_metadata: {},
      },
      createUserChatMessage('You', 'hello'),
      createAssistantChatMessage('Alice', '<scene>Body</scene><po>hidden</po>'),
    ];

    const messages = composeOpenAiMessages({
      payload,
      mode: 'reply',
      promptPayload,
      worldInfoBlock: '',
      oaiSettings: {},
      settings: {},
      userName: 'You',
      assistantName: 'Alice',
      character: null,
      group: null,
      presetDraft: {
        regex_scripts: [
          {
            id: 'prompt-only',
            findRegex: '/<po>[\\s\\S]*?<\\/po>/g',
            replaceString: '',
            placement: [2],
            promptOnly: true,
          },
        ],
      },
      historyStartIndex: 0,
      totalMessages: 2,
    });

    const assistant = messages.find((message) => message.role === 'assistant');
    expect(assistant?.content).toBe('<scene>Body</scene>');
  });

  it('maps OpenAI settings into request payload fields', () => {
    const provider: ChatProviderDraft = {
      chat_completion_source: 'openai',
      model: 'gpt-4',
      openai_model: 'gpt-4',
      openrouter_model: '',
      claude_model: '',
      google_model: '',
      deepseek_model: '',
      moonshot_model: '',
      siliconflow_model: '',
      zai_model: '',
      custom_model: '',
      reverse_proxy: '',
      proxy_password: '',
      custom_url: 'https://example.com/v1',
      custom_include_headers: '',
      custom_include_body: '',
      custom_exclude_body: '',
      openai_max_context: '',
      bypass_status_check: false,
    };

    const request = buildOpenAiRequestOptions({
      provider,
      oaiSettings: {
        temp_openai: 0.7,
        freq_pen_openai: 0.2,
        pres_pen_openai: 0.1,
        top_p_openai: 0.9,
        openai_max_tokens: 250,
        stream_openai: false,
      },
      generationType: 'normal',
      userName: 'You',
      assistantName: 'Alice',
      groupNames: [],
    });

    expect(request.temperature).toBe(0.7);
    expect(request.frequency_penalty).toBe(0.2);
    expect(request.presence_penalty).toBe(0.1);
    expect(request.top_p).toBe(0.9);
    expect(request.max_tokens).toBe(250);
    expect(request.stream).toBe(false);
    expect(request.chat_completion_source).toBe('custom');
    expect(request.type).toBe('normal');
    expect(request.custom_prompt_post_processing).toBe('');
    expect(request.request_image_resolution).toBe('');
    expect(request.request_image_aspect_ratio).toBe('');
    expect(request.n).toBeUndefined();
    expect(request.logit_bias).toBe('[Undefined]');
    expect(request.verbosity).toBe('[Undefined]');
  });

  it('reuses proxy_password for custom_url when provided', () => {
    const provider: ChatProviderDraft = {
      chat_completion_source: 'openai',
      model: 'gpt-4',
      openai_model: 'gpt-4',
      openrouter_model: '',
      claude_model: '',
      google_model: '',
      deepseek_model: '',
      moonshot_model: '',
      siliconflow_model: '',
      zai_model: '',
      custom_model: '',
      reverse_proxy: '',
      proxy_password: 'secret-token',
      custom_url: 'https://example.com/v1',
      custom_include_headers: '',
      custom_include_body: '',
      custom_exclude_body: '',
      openai_max_context: '',
      bypass_status_check: false,
    };

    const request = buildOpenAiRequestOptions({
      provider,
      oaiSettings: {},
      generationType: 'normal',
      userName: 'You',
      assistantName: 'Alice',
      groupNames: [],
    });

    expect(request.reverse_proxy).toBe('https://example.com/v1');
    expect(request.proxy_password).toBe('secret-token');
  });
});
