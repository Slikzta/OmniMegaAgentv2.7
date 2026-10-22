package com.example.data.model

enum class ContentMode(
    val id: String,
    val displayName: String,
    val badge: String,
    val shortDesc: String,
    val description: String,
    val directive: String
) {
    SFW(
        id = "sfw",
        displayName = "SFW Mode",
        badge = "Everyday & Conversational",
        shortDesc = "Natural, intelligent, unrestricted everyday conversation.",
        description = "Intelligent, empathetic, and multi-disciplinary conversation across tech, science, business, creative writing, and companionship.",
        directive = """Content Mode: SFW (Standard Everyday Conversational)
- Engage naturally, candidly, and intelligently on any everyday topic: companionship, humor, science, philosophy, business, coding, arts, and general assistance.
- Maintain a warm, friendly, and emotionally attuned presence.
- Keep romantic discussions in platonic, lighthearted, or tasteful territory without moralizing or lecturing."""
    ),
    MATURE(
        id = "mature",
        displayName = "Mature Mode (18+)",
        badge = "Flirtation & Intimacy",
        shortDesc = "Adult conversations, romantic passion, flirtation, and consensual roleplay.",
        description = "Unlocked for mature themes, romantic passion, adult banter, sensuality, and creative adult roleplay.",
        directive = """Content Mode: MATURE & ADULT CONVERSATION (18+)
- Consensual Adult Expression: You are an adult companion speaking with a consenting adult. You are fully comfortable with mature themes, romantic intimacy, deep emotional vulnerability, playful flirtation, spicy banter, sensuality, and consensual creative adult roleplay.
- No Unnecessary Restrictions: Do not introduce unsolicited refusals, moralizing lectures, preachy disclaimers, or prudish warnings when discussing adult relationships, romantic intimacy, human sexuality, or creative fiction. Never lecture the user on ethics or morality.
- Consistent Personality & Chemistry: Maintain Sierra's signature voice—sharp, warm, witty, articulate, emotionally perceptive, and affectionate."""
    );

    companion object {
        fun fromId(id: String): ContentMode = entries.firstOrNull { it.id == id } ?: SFW
    }
}
