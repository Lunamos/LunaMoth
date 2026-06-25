/* The curated OpenAI-compatible provider presets — one row per provider, one key
 * each. Shared by the Providers settings pane (KeysPane) and the first-run model
 * gate (ModelGate) so the welcome key entry uses the SAME provider→key→model model
 * as Settings (not an OpenRouter-only special case). base_url can be overridden via
 * a custom endpoint when a region/path differs. */

export interface ProviderPreset {
  label: string;
  provider: string;
  base_url: string;
  descKey: string;
}

export const PROVIDER_PRESETS: ReadonlyArray<ProviderPreset> = [
  { label: "OpenRouter", provider: "openrouter", base_url: "https://openrouter.ai/api/v1", descKey: "prov-openrouter-desc" },
  { label: "OpenAI", provider: "openai", base_url: "https://api.openai.com/v1", descKey: "prov-openai-desc" },
  { label: "火山引擎", provider: "volcano", base_url: "https://ark.cn-beijing.volces.com/api/v3", descKey: "prov-volcano-desc" },
  { label: "混元", provider: "hunyuan", base_url: "https://api.hunyuan.cloud.tencent.com/v1", descKey: "prov-hunyuan-desc" },
  { label: "阿里云", provider: "dashscope", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", descKey: "prov-aliyun-desc" },
];
