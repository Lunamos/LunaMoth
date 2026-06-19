"""providers.max_output_tokens + llm._max_tokens_param — the write_file/patch
truncation fix (owner 2026-06-19). The request "follows the model" (OpenRouter's
reported max_completion_tokens), defaults to 8192 when unknown, and honors an
explicit LLM_MAX_TOKENS override. Replaces the flat 4096 that cut large tool-call
arguments mid-argument (~12KB).
"""
from __future__ import annotations

from lunamoth.core import providers


def test_default_when_offline_or_non_openrouter():
    # mock/offline and non-openrouter routes have no catalogue → the 8192 default.
    assert providers.max_output_tokens("mock", "", "whatever") == providers.DEFAULT_MAX_OUTPUT
    assert providers.max_output_tokens("local", "http://localhost:1234/v1", "m") == 8192


def test_operator_override_wins():
    assert providers.max_output_tokens("openrouter", "", "any/model", override=20000) == 20000
    # override<=0 is ignored (falls through to resolution/default)
    assert providers.max_output_tokens("mock", "", "m", override=0) == providers.DEFAULT_MAX_OUTPUT


def test_resolves_from_openrouter_catalogue(monkeypatch):
    # Seed the in-process output memo as if the catalogue had been fetched.
    monkeypatch.setitem(providers._memo, "openrouter", {"acme/big": 200000})
    monkeypatch.setitem(providers._memo, "openrouter_out", {"acme/big": 64000})
    assert providers.max_output_tokens("openrouter", "", "acme/big") == 64000
    # A model absent from the output map → the default.
    assert providers.max_output_tokens("openrouter", "", "acme/unknown") == 8192


def test_max_tokens_param_routing(monkeypatch):
    from lunamoth.core.llm import LLMClient
    from lunamoth.config import LLMConfig

    # OpenAI-direct route → max_completion_tokens; everything else → max_tokens.
    monkeypatch.setattr(providers, "max_output_tokens", lambda *a, **k: 12345)
    direct = LLMClient(LLMConfig(provider="openai", base_url="https://api.openai.com/v1",
                                 model="gpt-x", api_key="k", max_tokens=0))
    assert direct._max_tokens_param() == {"max_completion_tokens": 12345}
    other = LLMClient(LLMConfig(provider="openrouter", base_url="https://openrouter.ai/api/v1",
                                model="m", api_key="k", max_tokens=0))
    assert other._max_tokens_param() == {"max_tokens": 12345}
