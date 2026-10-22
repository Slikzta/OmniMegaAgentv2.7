package com.example.data.model

enum class ProviderType(
    val id: String,
    val displayName: String,
    val badge: String,
    val defaultModel: String,
    val availableModels: List<String>,
    val defaultBaseUrl: String? = null,
    val requiresKey: Boolean = true
) {
    GEMINI(
        id = "gemini",
        displayName = "Google Gemini",
        badge = "Multimodal • Live Voice • Grounding",
        defaultModel = "gemini-2.5-flash",
        availableModels = listOf(
            "gemini-2.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-3-flash-preview",
            "gemini-3.1-pro-preview",
            "gemini-3.8-live"
        )
    ),
    OPENAI(
        id = "openai",
        displayName = "OpenAI",
        badge = "GPT-4o Reasoning",
        defaultModel = "gpt-4o",
        availableModels = listOf("gpt-4o", "gpt-4o-mini", "o3-mini"),
        defaultBaseUrl = "https://api.openai.com/v1"
    ),
    ANTHROPIC(
        id = "anthropic",
        displayName = "Anthropic Claude",
        badge = "Emotional Attunement",
        defaultModel = "claude-3-7-sonnet-latest",
        availableModels = listOf("claude-3-7-sonnet-latest", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"),
        defaultBaseUrl = "https://api.anthropic.com/v1"
    ),
    CUSTOM(
        id = "custom",
        displayName = "Custom OpenAI-Compatible",
        badge = "Groq • DeepSeek • OpenRouter",
        defaultModel = "llama-3.3-70b-versatile",
        availableModels = listOf("llama-3.3-70b-versatile", "deepseek-chat", "mistral-large"),
        defaultBaseUrl = "https://api.groq.com/openai/v1"
    ),
    OLLAMA(
        id = "ollama",
        displayName = "Ollama (Local/Host)",
        badge = "Private & Uncensored (Local)",
        defaultModel = "llama3.2",
        availableModels = listOf("llama3.2", "mistral", "qwen2.5"),
        defaultBaseUrl = "http://10.0.2.2:11434",
        requiresKey = false
    );

    companion object {
        fun fromId(id: String): ProviderType = entries.firstOrNull { it.id == id } ?: GEMINI
    }
}
