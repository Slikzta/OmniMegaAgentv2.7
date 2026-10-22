package com.example.data.repository

import android.content.Context
import android.content.SharedPreferences
import com.example.data.model.ContentMode
import com.example.data.model.ProviderType

class OmniPreferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("omniagent_prefs", Context.MODE_PRIVATE)

    var activeProvider: ProviderType
        get() = ProviderType.fromId(prefs.getString("active_provider", ProviderType.GEMINI.id) ?: ProviderType.GEMINI.id)
        set(value) = prefs.edit().putString("active_provider", value.id).apply()

    var activePersonaId: String
        get() = prefs.getString("active_persona", "sierra-companion") ?: "sierra-companion"
        set(value) = prefs.edit().putString("active_persona", value).apply()

    var contentMode: ContentMode
        get() = ContentMode.fromId(prefs.getString("content_mode", ContentMode.SFW.id) ?: ContentMode.SFW.id)
        set(value) = prefs.edit().putString("content_mode", value.id).apply()

    var webSearchEnabled: Boolean
        get() = prefs.getBoolean("web_search_enabled", false)
        set(value) = prefs.edit().putBoolean("web_search_enabled", value).apply()

    var speechRate: Float
        get() = prefs.getFloat("speech_rate", 1.0f)
        set(value) = prefs.edit().putFloat("speech_rate", value).apply()

    var speechPitch: Float
        get() = prefs.getFloat("speech_pitch", 1.0f)
        set(value) = prefs.edit().putFloat("speech_pitch", value).apply()

    var selectedVoiceName: String
        get() = prefs.getString("selected_voice", "Aoede") ?: "Aoede"
        set(value) = prefs.edit().putString("selected_voice", value).apply()

    // API Keys
    fun getApiKey(provider: ProviderType): String {
        return prefs.getString("key_${provider.id}", "") ?: ""
    }

    fun setApiKey(provider: ProviderType, key: String) {
        prefs.edit().putString("key_${provider.id}", key).apply()
    }

    // Custom Base URLs
    fun getBaseUrl(provider: ProviderType): String {
        return prefs.getString("url_${provider.id}", provider.defaultBaseUrl ?: "") ?: (provider.defaultBaseUrl ?: "")
    }

    fun setBaseUrl(provider: ProviderType, url: String) {
        prefs.edit().putString("url_${provider.id}", url).apply()
    }

    // Selected Model per provider
    fun getSelectedModel(provider: ProviderType): String {
        return prefs.getString("model_${provider.id}", provider.defaultModel) ?: provider.defaultModel
    }

    fun setSelectedModel(provider: ProviderType, model: String) {
        prefs.edit().putString("model_${provider.id}", model).apply()
    }

    // Supabase config
    var supabaseUrl: String
        get() = prefs.getString("supabase_url", "") ?: ""
        set(value) = prefs.edit().putString("supabase_url", value).apply()

    var supabaseAnonKey: String
        get() = prefs.getString("supabase_anon_key", "") ?: ""
        set(value) = prefs.edit().putString("supabase_anon_key", value).apply()

    // GitHub token
    var githubToken: String
        get() = prefs.getString("github_token", "") ?: ""
        set(value) = prefs.edit().putString("github_token", value).apply()

    fun clearAll() {
        prefs.edit().clear().apply()
    }
}
