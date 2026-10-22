# OmniAgent: The Frontier AI Companion & Super-Agent (Android)

OmniAgent is a native Android application built with Kotlin and Jetpack Compose. It combines multi-model conversational AI (Google Gemini, OpenAI GPT-4o, Anthropic Claude, Groq/DeepSeek, and local Ollama), high-speed Gemini Live voice interaction, Imagen 3 image generation, and Veo 3.1 video synthesis into an integrated mobile companion.

## Features

- **Multimodal Chat Studio**:
  - Persona switching:
    - **Sierra (Companion)**: Warm, empathetic, perceptive, and witty everyday confidante.
    - **Sierra (Romance & Intimacy)**: Emotionally vulnerable, candid, and passionate companion.
    - **Sierra (Creative & Roleplay)**: Rich storytelling and deep character nuance.
    - **Sierra (Architect & Code)**: Rigorous technical problem solving and clean architecture.
    - **OmniAgent (Classic)**: Versatile super-agent with direct insights.
  - **Content Modes**: Seamless toggle between **SFW Mode** (Everyday Conversational) and **Mature 18+ Mode** (Intimacy & Adult Banter) without preachy disclaimers.
  - **Real-Time Grounding**: Web search retrieval integration powered by Google Search.
  - **Speech-to-Text & Text-to-Speech**: Hands-free voice recognition input and read-aloud TTS playback.
  - **Syntax Highlighting & Code Blocks**: Clean dark-mode formatting with one-click copy.

- **Live Voice Dialogue (Gemini Live)**:
  - Duplex conversational voice loop powered by on-device SpeechRecognizer and neural TTS synthesis.
  - Animated pulsing audio visualizer orb reacting to speaking energy.
  - Continuous conversation vs Push-to-Talk modes.
  - Real-time spoken dialogue transcript feed with copy and clear tools.

- **Media Generation Studio**:
  - **Imagen 3 Image Generation**: Support for prompt styles (Photorealistic, Artistic, Cinematic, Raw), custom aspect ratios (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`), and resolutions (`512px`, `1K`, `2K`).
  - **Veo 3.1 Video Generation**: Prompt-guided synthesis with custom resolutions (`720p`, `1080p`, `4K`) and framerates (`24`, `30`, `60` FPS).

- **Multi-Provider AI & Engine Settings**:
  - Seamless switching across **Google Gemini**, **OpenAI**, **Anthropic Claude**, **Custom OpenAI-Compatible (Groq/DeepSeek/OpenRouter)**, and **Ollama**.
  - Built-in latency ping test verifying API endpoints and API keys.
  - Configurable TTS voice pitch and speed rate sliders.

- **Integrations**:
  - **Supabase PostgreSQL** real-time cloud database configuration & connectivity test.
  - **GitHub Developer Access** token configuration.
  - **Firebase Cloud Sync** integration.

## Technical Architecture

- **Language**: 100% Kotlin
- **UI Toolkit**: Jetpack Compose (Material 3) with custom cybernetic dark theming (`#09090B`)
- **State Architecture**: MVVM with Kotlin Coroutines and StateFlow
- **Networking**: OkHttp 4 with SSE streaming and JSON parsing
- **Image Rendering**: Coil Compose (`AsyncImage`)
- **Adaptive App Icon**: Custom adaptive launcher icon on deep obsidian navy (`#0B0F19`)
