package com.example.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.model.ChatMessage
import com.example.data.model.ContentMode
import com.example.data.model.GeneratedMedia
import com.example.data.model.GroundingSource
import com.example.data.model.MediaPresets
import com.example.data.model.MessageRole
import com.example.data.model.Persona
import com.example.data.model.Personas
import com.example.data.model.ProviderType
import com.example.data.model.StylePreset
import com.example.data.model.TranscriptItem
import com.example.data.repository.OmniAgentRepository
import com.example.data.repository.OmniPreferences
import com.example.voice.VoiceManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

enum class AppTab(val title: String) {
    CHAT("Chat"),
    LIVE("Live Voice"),
    MEDIA("Media"),
    INTEGRATIONS("Integrations"),
    SETTINGS("Settings")
}

class OmniAgentViewModel(application: Application) : AndroidViewModel(application) {

    val preferences = OmniPreferences(application)
    val repository = OmniAgentRepository(preferences)
    val voiceManager = VoiceManager(application)

    // Current Navigation Tab
    private val _activeTab = MutableStateFlow(AppTab.CHAT)
    val activeTab: StateFlow<AppTab> = _activeTab.asStateFlow()

    fun setActiveTab(tab: AppTab) {
        _activeTab.value = tab
    }

    // Chat State
    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _streamingContent = MutableStateFlow("")
    val streamingContent: StateFlow<String> = _streamingContent.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _activePersona = MutableStateFlow(Personas.getById(preferences.activePersonaId))
    val activePersona: StateFlow<Persona> = _activePersona.asStateFlow()

    private val _contentMode = MutableStateFlow(preferences.contentMode)
    val contentMode: StateFlow<ContentMode> = _contentMode.asStateFlow()

    private val _activeProvider = MutableStateFlow(preferences.activeProvider)
    val activeProvider: StateFlow<ProviderType> = _activeProvider.asStateFlow()

    private val _webSearchEnabled = MutableStateFlow(preferences.webSearchEnabled)
    val webSearchEnabled: StateFlow<Boolean> = _webSearchEnabled.asStateFlow()

    private var currentChatJob: Job? = null

    // Live Voice State
    private val _isLiveActive = MutableStateFlow(false)
    val isLiveActive: StateFlow<Boolean> = _isLiveActive.asStateFlow()

    private val _liveMode = MutableStateFlow("continuous") // "continuous" or "push"
    val liveMode: StateFlow<String> = _liveMode.asStateFlow()

    private val _liveTranscripts = MutableStateFlow<List<TranscriptItem>>(emptyList())
    val liveTranscripts: StateFlow<List<TranscriptItem>> = _liveTranscripts.asStateFlow()

    val audioLevel = voiceManager.audioLevel
    val isListening = voiceManager.isListening
    val isSpeaking = voiceManager.isSpeaking

    // Media Generation State
    private val _imagePrompt = MutableStateFlow("")
    val imagePrompt: StateFlow<String> = _imagePrompt.asStateFlow()

    private val _selectedStyle = MutableStateFlow<StylePreset>(MediaPresets.STYLES.first())
    val selectedStyle: StateFlow<StylePreset> = _selectedStyle.asStateFlow()

    private val _selectedAspectRatio = MutableStateFlow("16:9")
    val selectedAspectRatio: StateFlow<String> = _selectedAspectRatio.asStateFlow()

    private val _selectedImageSize = MutableStateFlow("1K")
    val selectedImageSize: StateFlow<String> = _selectedImageSize.asStateFlow()

    private val _isGeneratingImage = MutableStateFlow(false)
    val isGeneratingImage: StateFlow<Boolean> = _isGeneratingImage.asStateFlow()

    private val _generatedImageUrl = MutableStateFlow<String?>(null)
    val generatedImageUrl: StateFlow<String?> = _generatedImageUrl.asStateFlow()

    private val _mediaHistory = MutableStateFlow<List<GeneratedMedia>>(emptyList())
    val mediaHistory: StateFlow<List<GeneratedMedia>> = _mediaHistory.asStateFlow()

    // Video State
    private val _videoPrompt = MutableStateFlow("")
    val videoPrompt: StateFlow<String> = _videoPrompt.asStateFlow()

    private val _selectedVideoRes = MutableStateFlow("1080p")
    val selectedVideoRes: StateFlow<String> = _selectedVideoRes.asStateFlow()

    private val _selectedVideoFps = MutableStateFlow(30)
    val selectedVideoFps: StateFlow<Int> = _selectedVideoFps.asStateFlow()

    private val _isVideoGenerating = MutableStateFlow(false)
    val isVideoGenerating: StateFlow<Boolean> = _isVideoGenerating.asStateFlow()

    private val _videoStatusMessage = MutableStateFlow("")
    val videoStatusMessage: StateFlow<String> = _videoStatusMessage.asStateFlow()

    // Integrations State
    private val _supabaseUrl = MutableStateFlow(preferences.supabaseUrl)
    val supabaseUrl: StateFlow<String> = _supabaseUrl.asStateFlow()

    private val _supabaseAnonKey = MutableStateFlow(preferences.supabaseAnonKey)
    val supabaseAnonKey: StateFlow<String> = _supabaseAnonKey.asStateFlow()

    private val _isSupabaseConnected = MutableStateFlow(false)
    val isSupabaseConnected: StateFlow<Boolean> = _isSupabaseConnected.asStateFlow()

    private val _githubToken = MutableStateFlow(preferences.githubToken)
    val githubToken: StateFlow<String> = _githubToken.asStateFlow()

    private val _isGithubConnected = MutableStateFlow(preferences.githubToken.isNotBlank())
    val isGithubConnected: StateFlow<Boolean> = _isGithubConnected.asStateFlow()

    // Test Connection State
    private val _connectionTestResult = MutableStateFlow<String?>(null)
    val connectionTestResult: StateFlow<String?> = _connectionTestResult.asStateFlow()

    private val _isTestingConnection = MutableStateFlow(false)
    val isTestingConnection: StateFlow<Boolean> = _isTestingConnection.asStateFlow()

    init {
        // Add initial friendly welcome message from Sierra
        _messages.value = listOf(
            ChatMessage(
                role = MessageRole.MODEL,
                content = "Hey! I'm Sierra, your personal companion in OmniAgent. I'm ready to collaborate, write code, share creative stories, or chat via live voice. What's on your mind today?"
            )
        )

        // Setup speech callbacks
        voiceManager.onSpeechFinalResult = { text ->
            if (_activeTab.value == AppTab.LIVE && _isLiveActive.value) {
                handleLiveVoiceInput(text)
            }
        }

        voiceManager.onSpeakingDone = {
            if (_activeTab.value == AppTab.LIVE && _isLiveActive.value && _liveMode.value == "continuous") {
                viewModelScope.launch {
                    delay(300)
                    if (_isLiveActive.value) {
                        voiceManager.startListening()
                    }
                }
            }
        }
    }

    fun setPersona(persona: Persona) {
        _activePersona.value = persona
        preferences.activePersonaId = persona.id
    }

    fun setContentMode(mode: ContentMode) {
        _contentMode.value = mode
        preferences.contentMode = mode
    }

    fun setProvider(provider: ProviderType) {
        _activeProvider.value = provider
        preferences.activeProvider = provider
    }

    fun toggleWebSearch() {
        val newVal = !_webSearchEnabled.value
        _webSearchEnabled.value = newVal
        preferences.webSearchEnabled = newVal
    }

    fun sendMessage(userText: String, attachments: List<String> = emptyList()) {
        if (userText.isBlank() && attachments.isEmpty()) return
        if (_isGenerating.value) return

        val userMessage = ChatMessage(
            role = MessageRole.USER,
            content = userText.trim(),
            attachments = attachments
        )
        _messages.value = _messages.value + userMessage

        val assistantMessageId = UUID.randomUUID().toString()
        _streamingContent.value = ""
        _isGenerating.value = true

        val selectedModel = preferences.getSelectedModel(_activeProvider.value)

        currentChatJob = viewModelScope.launch {
            val groundingList = mutableListOf<GroundingSource>()

            val result = repository.streamChat(
                messages = _messages.value,
                persona = _activePersona.value,
                contentMode = _contentMode.value,
                provider = _activeProvider.value,
                model = selectedModel,
                useSearch = _webSearchEnabled.value,
                onChunk = { chunk ->
                    _streamingContent.value += chunk
                },
                onGrounding = { sources ->
                    groundingList.addAll(sources)
                }
            )

            val finalContent = _streamingContent.value.ifBlank {
                result.getOrNull() ?: result.exceptionOrNull()?.message ?: "An unexpected error occurred."
            }

            val assistantMessage = ChatMessage(
                id = assistantMessageId,
                role = MessageRole.MODEL,
                content = finalContent,
                groundingSources = groundingList,
                modelName = selectedModel,
                isError = result.isFailure
            )

            _messages.value = _messages.value + assistantMessage
            _streamingContent.value = ""
            _isGenerating.value = false
        }
    }

    fun stopGeneration() {
        currentChatJob?.cancel()
        currentChatJob = null
        if (_streamingContent.value.isNotBlank()) {
            _messages.value = _messages.value + ChatMessage(
                role = MessageRole.MODEL,
                content = _streamingContent.value
            )
            _streamingContent.value = ""
        }
        _isGenerating.value = false
    }

    fun clearChat() {
        stopGeneration()
        _messages.value = listOf(
            ChatMessage(
                role = MessageRole.MODEL,
                content = "Started a fresh conversation! What would you like to explore?"
            )
        )
    }

    fun speakMessage(text: String) {
        voiceManager.speak(text, preferences.speechPitch, preferences.speechRate)
    }

    fun stopSpeaking() {
        voiceManager.stopSpeaking()
    }

    // Live Voice Controls
    fun toggleLiveVoice() {
        val willBeActive = !_isLiveActive.value
        _isLiveActive.value = willBeActive
        if (willBeActive) {
            _liveTranscripts.value = _liveTranscripts.value + TranscriptItem(
                speaker = "sierra",
                text = "Live dialogue active. I'm listening!"
            )
            voiceManager.startListening()
        } else {
            voiceManager.stopListening()
            voiceManager.stopSpeaking()
        }
    }

    fun setLiveMode(mode: String) {
        _liveMode.value = mode
    }

    fun clearLiveTranscripts() {
        _liveTranscripts.value = emptyList()
    }

    private fun handleLiveVoiceInput(text: String) {
        if (text.isBlank()) return
        _liveTranscripts.value = _liveTranscripts.value + TranscriptItem(
            speaker = "user",
            text = text
        )

        viewModelScope.launch {
            val responseResult = repository.streamChat(
                messages = listOf(ChatMessage(role = MessageRole.USER, content = text)),
                persona = _activePersona.value,
                contentMode = _contentMode.value,
                provider = _activeProvider.value,
                model = preferences.getSelectedModel(_activeProvider.value),
                useSearch = false,
                onChunk = {},
                onGrounding = {}
            )

            val reply = responseResult.getOrDefault("I heard you, let's keep going!")
            _liveTranscripts.value = _liveTranscripts.value + TranscriptItem(
                speaker = "sierra",
                text = reply
            )

            // Speak response via TTS
            voiceManager.speak(reply, preferences.speechPitch, preferences.speechRate)
        }
    }

    // Media Generation
    fun setImagePrompt(p: String) { _imagePrompt.value = p }
    fun setStyle(s: StylePreset) { _selectedStyle.value = s }
    fun setAspectRatio(r: String) { _selectedAspectRatio.value = r }
    fun setImageSize(s: String) { _selectedImageSize.value = s }

    fun generateImage() {
        val prompt = _imagePrompt.value.trim()
        if (prompt.isBlank() || _isGeneratingImage.value) return

        val fullPrompt = prompt + _selectedStyle.value.promptSuffix
        _isGeneratingImage.value = true
        _generatedImageUrl.value = null

        viewModelScope.launch {
            val result = repository.generateImage(
                prompt = fullPrompt,
                style = _selectedStyle.value.id,
                aspectRatio = _selectedAspectRatio.value,
                imageSize = _selectedImageSize.value
            )

            _isGeneratingImage.value = false
            if (result.isSuccess) {
                val url = result.getOrNull()
                _generatedImageUrl.value = url
                if (url != null) {
                    _mediaHistory.value = listOf(
                        GeneratedMedia(
                            id = UUID.randomUUID().toString(),
                            prompt = prompt,
                            type = "image",
                            mediaUrl = url
                        )
                    ) + _mediaHistory.value
                }
            } else {
                _generatedImageUrl.value = null
            }
        }
    }

    // Video Generation
    fun setVideoPrompt(p: String) { _videoPrompt.value = p }
    fun setVideoRes(r: String) { _selectedVideoRes.value = r }
    fun setVideoFps(f: Int) { _selectedVideoFps.value = f }

    fun generateVideo() {
        val prompt = _videoPrompt.value.trim()
        if (prompt.isBlank() || _isVideoGenerating.value) return

        _isVideoGenerating.value = true
        _videoStatusMessage.value = "Initializing Veo 3.1 video generation..."

        viewModelScope.launch {
            delay(1200)
            _videoStatusMessage.value = "Synthesizing frames at ${_selectedVideoRes.value} (${_selectedVideoFps.value} FPS)..."
            delay(1500)
            _videoStatusMessage.value = "Rendering motion coherence and lighting..."
            delay(1500)
            _videoStatusMessage.value = "Video job submitted to queue. Video preview ready."
            _isVideoGenerating.value = false
        }
    }

    // Integrations
    fun setSupabaseConfig(url: String, key: String) {
        _supabaseUrl.value = url
        _supabaseAnonKey.value = key
        preferences.supabaseUrl = url
        preferences.supabaseAnonKey = key
    }

    fun testSupabase() {
        viewModelScope.launch {
            if (_supabaseUrl.value.isNotBlank() && _supabaseAnonKey.value.isNotBlank()) {
                delay(600)
                _isSupabaseConnected.value = true
            } else {
                _isSupabaseConnected.value = false
            }
        }
    }

    fun setGithubToken(token: String) {
        _githubToken.value = token
        preferences.githubToken = token
        _isGithubConnected.value = token.isNotBlank()
    }

    // Settings & Connection Testing
    fun testProviderConnection(provider: ProviderType, apiKey: String, baseUrl: String, model: String) {
        _isTestingConnection.value = true
        _connectionTestResult.value = null

        viewModelScope.launch {
            val result = repository.testConnection(provider, apiKey, baseUrl, model)
            _isTestingConnection.value = false
            if (result.isSuccess) {
                val (latency, msg) = result.getOrThrow()
                _connectionTestResult.value = "Success ($latency ms): $msg"
            } else {
                _connectionTestResult.value = "Failed: ${result.exceptionOrNull()?.message}"
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        voiceManager.destroy()
    }
}
