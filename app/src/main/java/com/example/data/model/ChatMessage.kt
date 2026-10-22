package com.example.data.model

import java.util.UUID

enum class MessageRole {
    USER,
    MODEL,
    SYSTEM
}

data class GroundingSource(
    val title: String,
    val url: String
)

data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val role: MessageRole,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val attachments: List<String> = emptyList(), // URI strings or base64
    val groundingSources: List<GroundingSource> = emptyList(),
    val modelName: String? = null,
    val imageUrl: String? = null,
    val videoUrl: String? = null,
    val isStreaming: Boolean = false,
    val isError: Boolean = false
)
