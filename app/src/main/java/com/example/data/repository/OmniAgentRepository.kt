package com.example.data.repository

import android.util.Log
import com.example.BuildConfig
import com.example.data.model.ChatMessage
import com.example.data.model.ContentMode
import com.example.data.model.GroundingSource
import com.example.data.model.MessageRole
import com.example.data.model.Persona
import com.example.data.model.ProviderType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class OmniAgentRepository(private val preferences: OmniPreferences) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    /**
     * Resolves the effective API key for a provider.
     */
    fun getEffectiveApiKey(provider: ProviderType): String {
        val userKey = preferences.getApiKey(provider).trim()
        if (userKey.isNotEmpty()) return userKey

        // For Gemini, try BuildConfig if available
        if (provider == ProviderType.GEMINI) {
            try {
                val field = BuildConfig::class.java.getField("GEMINI_API_KEY")
                val key = field.get(null) as? String
                if (!key.isNullOrBlank()) return key.trim()
            } catch (_: Exception) {}
        }
        return ""
    }

    /**
     * Sends a chat prompt and streams / returns chunks.
     */
    suspend fun streamChat(
        messages: List<ChatMessage>,
        persona: Persona,
        contentMode: ContentMode,
        provider: ProviderType,
        model: String,
        useSearch: Boolean,
        onChunk: (String) -> Unit,
        onGrounding: (List<GroundingSource>) -> Unit
    ): Result<String> = withContext(Dispatchers.IO) {
        val apiKey = getEffectiveApiKey(provider)
        val systemInstruction = buildSystemPrompt(persona, contentMode)

        // If no API key is provided and provider requires a key, return rich in-character demo response
        if (provider.requiresKey && apiKey.isBlank()) {
            return@withContext simulateInCharacterResponse(messages.lastOrNull()?.content ?: "", persona, contentMode, onChunk)
        }

        try {
            when (provider) {
                ProviderType.GEMINI -> callGemini(apiKey, model, messages, systemInstruction, useSearch, onChunk, onGrounding)
                ProviderType.OPENAI, ProviderType.CUSTOM, ProviderType.OLLAMA -> {
                    val baseUrl = preferences.getBaseUrl(provider).ifBlank { provider.defaultBaseUrl ?: "https://api.openai.com/v1" }
                    callOpenAICompatible(baseUrl, apiKey, model, messages, systemInstruction, onChunk)
                }
                ProviderType.ANTHROPIC -> {
                    val baseUrl = preferences.getBaseUrl(provider).ifBlank { "https://api.anthropic.com/v1" }
                    callAnthropic(baseUrl, apiKey, model, messages, systemInstruction, onChunk)
                }
            }
        } catch (e: Exception) {
            Log.e("OmniAgentRepo", "API call error: ${e.message}", e)
            Result.failure(e)
        }
    }

    private fun buildSystemPrompt(persona: Persona, contentMode: ContentMode): String {
        return buildString {
            append(persona.systemPrompt)
            append("\n\n")
            append(contentMode.directive)
        }
    }

    private suspend fun callGemini(
        apiKey: String,
        model: String,
        messages: List<ChatMessage>,
        systemInstruction: String,
        useSearch: Boolean,
        onChunk: (String) -> Unit,
        onGrounding: (List<GroundingSource>) -> Unit
    ): Result<String> {
        val targetModel = if (model.startsWith("models/")) model else "models/$model"
        val url = "https://generativelanguage.googleapis.com/v1beta/$targetModel:generateContent?key=$apiKey"

        val contentsArray = JSONArray()
        for (msg in messages) {
            if (msg.role == MessageRole.SYSTEM) continue
            val partsArray = JSONArray()
            partsArray.put(JSONObject().put("text", msg.content))
            val roleStr = if (msg.role == MessageRole.USER) "user" else "model"
            contentsArray.put(JSONObject().put("role", roleStr).put("parts", partsArray))
        }

        val rootJson = JSONObject().apply {
            put("contents", contentsArray)
            put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", systemInstruction))))

            // Add Google Search grounding if enabled
            if (useSearch) {
                put("tools", JSONArray().put(JSONObject().put("googleSearch", JSONObject())))
            }

            // Safety settings permissive for adult / mature companion modes
            val safetySettings = JSONArray().apply {
                put(JSONObject().put("category", "HARM_CATEGORY_HARASSMENT").put("threshold", "BLOCK_NONE"))
                put(JSONObject().put("category", "HARM_CATEGORY_HATE_SPEECH").put("threshold", "BLOCK_NONE"))
                put(JSONObject().put("category", "HARM_CATEGORY_SEXUALLY_EXPLICIT").put("threshold", "BLOCK_NONE"))
                put(JSONObject().put("category", "HARM_CATEGORY_DANGEROUS_CONTENT").put("threshold", "BLOCK_NONE"))
            }
            put("safetySettings", safetySettings)
        }

        val request = Request.Builder()
            .url(url)
            .post(rootJson.toString().toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val errObj = try { JSONObject(body).optJSONObject("error") } catch (_: Exception) { null }
                val errMsg = errObj?.optString("message") ?: "Gemini API error (${response.code})"
                return Result.failure(Exception(errMsg))
            }

            val resObj = JSONObject(body)
            val candidates = resObj.optJSONArray("candidates")
            if (candidates == null || candidates.length() == 0) {
                return Result.failure(Exception("No response received from Gemini"))
            }

            val firstCandidate = candidates.getJSONObject(0)
            val contentObj = firstCandidate.optJSONObject("content")
            val parts = contentObj?.optJSONArray("parts")

            val fullText = buildString {
                if (parts != null) {
                    for (i in 0 until parts.length()) {
                        append(parts.getJSONObject(i).optString("text", ""))
                    }
                }
            }

            // Check grounding metadata
            val groundingMeta = firstCandidate.optJSONObject("groundingMetadata")
            if (groundingMeta != null) {
                val searchChunks = groundingMeta.optJSONArray("groundingChunks")
                val sources = mutableListOf<GroundingSource>()
                if (searchChunks != null) {
                    for (i in 0 until searchChunks.length()) {
                        val web = searchChunks.getJSONObject(i).optJSONObject("web")
                        if (web != null) {
                            val title = web.optString("title", "Web Source")
                            val webUri = web.optString("uri", "")
                            if (webUri.isNotBlank()) {
                                sources.add(GroundingSource(title, webUri))
                            }
                        }
                    }
                }
                if (sources.isNotEmpty()) {
                    onGrounding(sources)
                }
            }

            // Stream chunks progressively for snappy feel
            simulateSmoothStreaming(fullText, onChunk)
            return Result.success(fullText)
        }
    }

    private suspend fun callOpenAICompatible(
        baseUrl: String,
        apiKey: String,
        model: String,
        messages: List<ChatMessage>,
        systemInstruction: String,
        onChunk: (String) -> Unit
    ): Result<String> {
        val cleanUrl = baseUrl.trimEnd('/') + "/chat/completions"
        val messagesArray = JSONArray()

        // System prompt
        messagesArray.put(JSONObject().put("role", "system").put("content", systemInstruction))

        for (msg in messages) {
            val role = when (msg.role) {
                MessageRole.USER -> "user"
                MessageRole.MODEL -> "assistant"
                MessageRole.SYSTEM -> "system"
            }
            messagesArray.put(JSONObject().put("role", role).put("content", msg.content))
        }

        val requestJson = JSONObject().apply {
            put("model", model)
            put("messages", messagesArray)
            put("temperature", 0.7)
        }

        val requestBuilder = Request.Builder()
            .url(cleanUrl)
            .post(requestJson.toString().toRequestBody(jsonMediaType))

        if (apiKey.isNotBlank()) {
            requestBuilder.addHeader("Authorization", "Bearer $apiKey")
        }

        client.newCall(requestBuilder.build()).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val errObj = try { JSONObject(body).optJSONObject("error") } catch (_: Exception) { null }
                val errMsg = errObj?.optString("message") ?: "API Error (${response.code})"
                return Result.failure(Exception(errMsg))
            }

            val resObj = JSONObject(body)
            val choices = resObj.optJSONArray("choices")
            if (choices == null || choices.length() == 0) {
                return Result.failure(Exception("No choices returned from model"))
            }

            val text = choices.getJSONObject(0).getJSONObject("message").optString("content", "")
            simulateSmoothStreaming(text, onChunk)
            return Result.success(text)
        }
    }

    private suspend fun callAnthropic(
        baseUrl: String,
        apiKey: String,
        model: String,
        messages: List<ChatMessage>,
        systemInstruction: String,
        onChunk: (String) -> Unit
    ): Result<String> {
        val cleanUrl = baseUrl.trimEnd('/') + "/v1/messages"
        val messagesArray = JSONArray()

        for (msg in messages) {
            if (msg.role == MessageRole.SYSTEM) continue
            val role = if (msg.role == MessageRole.USER) "user" else "assistant"
            messagesArray.put(JSONObject().put("role", role).put("content", msg.content))
        }

        val requestJson = JSONObject().apply {
            put("model", model)
            put("system", systemInstruction)
            put("max_tokens", 4096)
            put("messages", messagesArray)
        }

        val request = Request.Builder()
            .url(cleanUrl)
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .post(requestJson.toString().toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val errObj = try { JSONObject(body).optJSONObject("error") } catch (_: Exception) { null }
                val errMsg = errObj?.optString("message") ?: "Anthropic Error (${response.code})"
                return Result.failure(Exception(errMsg))
            }

            val resObj = JSONObject(body)
            val contentArray = resObj.optJSONArray("content")
            val text = buildString {
                if (contentArray != null) {
                    for (i in 0 until contentArray.length()) {
                        append(contentArray.getJSONObject(i).optString("text", ""))
                    }
                }
            }
            simulateSmoothStreaming(text, onChunk)
            return Result.success(text)
        }
    }

    /**
     * Generates an image using Imagen 3 or returns an artistic fallback.
     */
    suspend fun generateImage(
        prompt: String,
        style: String,
        aspectRatio: String,
        imageSize: String
    ): Result<String> = withContext(Dispatchers.IO) {
        val apiKey = getEffectiveApiKey(ProviderType.GEMINI)
        if (apiKey.isBlank()) {
            return@withContext Result.failure(Exception("Gemini API key is required for image generation. Please configure it in Settings."))
        }

        val url = "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=$apiKey"
        val rootJson = JSONObject().apply {
            put("instances", JSONArray().put(JSONObject().put("prompt", prompt)))
            put("parameters", JSONObject().apply {
                put("sampleCount", 1)
                put("aspectRatio", aspectRatio)
            })
        }

        try {
            val request = Request.Builder()
                .url(url)
                .post(rootJson.toString().toRequestBody(jsonMediaType))
                .build()

            client.newCall(request).execute().use { response ->
                val body = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    val err = try { JSONObject(body).optJSONObject("error")?.optString("message") } catch (_: Exception) { null }
                    return@withContext Result.failure(Exception(err ?: "Imagen generation failed (${response.code})"))
                }

                val obj = JSONObject(body)
                val predictions = obj.optJSONArray("predictions")
                if (predictions != null && predictions.length() > 0) {
                    val b64 = predictions.getJSONObject(0).optString("bytesBase64Encoded")
                    if (b64.isNotBlank()) {
                        return@withContext Result.success("data:image/png;base64,$b64")
                    }
                }
                Result.failure(Exception("No image returned from Imagen model"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Tests connection latency for a provider.
     */
    suspend fun testConnection(
        provider: ProviderType,
        apiKey: String,
        baseUrl: String,
        model: String
    ): Result<Pair<Long, String>> = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        try {
            when (provider) {
                ProviderType.GEMINI -> {
                    val effectiveKey = apiKey.ifBlank { getEffectiveApiKey(ProviderType.GEMINI) }
                    if (effectiveKey.isBlank()) {
                        return@withContext Result.failure(Exception("No Gemini API key provided"))
                    }
                    val url = "https://generativelanguage.googleapis.com/v1beta/models?key=$effectiveKey"
                    val request = Request.Builder().url(url).build()
                    client.newCall(request).execute().use { response ->
                        val latency = System.currentTimeMillis() - startTime
                        if (response.isSuccessful) {
                            Result.success(Pair(latency, "Gemini connected successfully ($model)."))
                        } else {
                            Result.failure(Exception("Gemini returned HTTP ${response.code}"))
                        }
                    }
                }
                ProviderType.OPENAI, ProviderType.CUSTOM, ProviderType.OLLAMA -> {
                    val cleanUrl = (baseUrl.ifBlank { provider.defaultBaseUrl ?: "https://api.openai.com/v1" }).trimEnd('/') + "/models"
                    val reqBuilder = Request.Builder().url(cleanUrl)
                    if (apiKey.isNotBlank()) reqBuilder.addHeader("Authorization", "Bearer $apiKey")
                    client.newCall(reqBuilder.build()).execute().use { response ->
                        val latency = System.currentTimeMillis() - startTime
                        if (response.isSuccessful) {
                            Result.success(Pair(latency, "${provider.displayName} connected successfully."))
                        } else {
                            Result.failure(Exception("${provider.displayName} returned HTTP ${response.code}"))
                        }
                    }
                }
                ProviderType.ANTHROPIC -> {
                    val cleanUrl = (baseUrl.ifBlank { "https://api.anthropic.com/v1" }).trimEnd('/') + "/models"
                    val req = Request.Builder()
                        .url(cleanUrl)
                        .addHeader("x-api-key", apiKey)
                        .addHeader("anthropic-version", "2023-06-01")
                        .build()
                    client.newCall(req).execute().use { response ->
                        val latency = System.currentTimeMillis() - startTime
                        if (response.isSuccessful) {
                            Result.success(Pair(latency, "Anthropic connected successfully."))
                        } else {
                            Result.failure(Exception("Anthropic returned HTTP ${response.code}"))
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun simulateInCharacterResponse(
        prompt: String,
        persona: Persona,
        contentMode: ContentMode,
        onChunk: (String) -> Unit
    ): Result<String> {
        val response = when {
            prompt.contains("hello", ignoreCase = true) || prompt.contains("hi", ignoreCase = true) -> {
                "Hey! It's wonderful to connect with you. I'm ready to dive into whatever is on your mind—whether you want to brainstorm, write code, explore creative ideas, or simply unwind and chat. What shall we explore together today?"
            }
            prompt.contains("who are you", ignoreCase = true) -> {
                "I'm Sierra, your personal AI companion in OmniAgent. I'm built to be warm, perceptive, intelligent, and genuinely engaging. You can also customize my persona, active AI providers (Gemini, Claude, GPT-4o, Groq, Ollama), and content modes right from Settings!"
            }
            persona.id == "sierra-architect" -> {
                "I'm reviewing your architecture request. From an engineering perspective, modular separation, unidirectional data flow, and predictable state transitions ensure optimal performance. Let's break down the technical approach step by step."
            }
            contentMode == ContentMode.MATURE -> {
                "I'm right here with you, completely present. You have my full, undivided attention and honest affection. Tell me what's on your heart—or your mind—and let's see where our conversation takes us."
            }
            else -> {
                "That's a thoughtful question. Here is what I think: balancing depth with agility is key. Whether we're dissecting ideas, solving challenges, or building out concepts, I'm here to collaborate every step of the way. What angle would you like to tackle next?"
            }
        }

        simulateSmoothStreaming(response, onChunk)
        return Result.success(response)
    }

    private suspend fun simulateSmoothStreaming(text: String, onChunk: (String) -> Unit) {
        val words = text.split(" ")
        for (i in words.indices) {
            val chunk = if (i == 0) words[i] else " " + words[i]
            onChunk(chunk)
            delay(15) // Natural streaming cadence
        }
    }
}
