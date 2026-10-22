package com.example.data.model

import java.util.UUID

data class TranscriptItem(
    val id: String = UUID.randomUUID().toString(),
    val speaker: String, // "user" or "sierra"
    val text: String,
    val timestamp: Long = System.currentTimeMillis()
)
