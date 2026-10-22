package com.example.data.model

data class StylePreset(
    val id: String,
    val name: String,
    val promptSuffix: String
)

object MediaPresets {
    val STYLES = listOf(
        StylePreset("none", "Raw Prompt", ""),
        StylePreset("photorealistic", "Photorealistic", ", hyperrealistic, 8k resolution, cinematic lighting, highly detailed, masterpiece, sharp focus"),
        StylePreset("artistic", "Artistic", ", digital art, vibrant colors, stylized, creative composition, trending on artstation"),
        StylePreset("cinematic", "Cinematic", ", cinematic shot, movie still, dramatic lighting, anamorphic lens, high contrast, atmospheric")
    )

    val ASPECT_RATIOS = listOf("1:1", "16:9", "9:16", "4:3", "3:4")
    val IMAGE_SIZES = listOf("512px", "1K", "2K")
    val VIDEO_RESOLUTIONS = listOf("720p", "1080p", "4K")
    val VIDEO_FPS = listOf(24, 30, 60)
}

data class GeneratedMedia(
    val id: String,
    val prompt: String,
    val type: String, // "image" or "video"
    val mediaUrl: String,
    val timestamp: Long = System.currentTimeMillis()
)
