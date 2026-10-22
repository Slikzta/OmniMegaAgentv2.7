package com.example.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.ui.theme.CyanNeon
import com.example.ui.theme.PurpleGlow
import com.example.ui.theme.PurpleNeon
import com.example.ui.theme.RoseNeon

@Composable
fun VoiceOrb(
    isActive: Boolean,
    isListening: Boolean,
    isSpeaking: Boolean,
    audioLevel: Float,
    size: Dp = 220.dp
) {
    val infiniteTransition = rememberInfiniteTransition(label = "orb_pulse")

    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_scale"
    )

    val wavePhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "wave_phase"
    )

    val primaryColor = when {
        isSpeaking -> PurpleNeon
        isListening -> CyanNeon
        isActive -> PurpleGlow
        else -> Color.DarkGray
    }

    val secondaryColor = when {
        isSpeaking -> RoseNeon
        isListening -> PurpleNeon
        isActive -> CyanNeon
        else -> Color.Gray
    }

    Box(
        modifier = Modifier.size(size),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset(this.size.width / 2f, this.size.height / 2f)
            val baseRadius = this.size.minDimension / 4f

            val dynamicMultiplier = if (isActive) {
                1f + (audioLevel * 0.8f)
            } else {
                0.9f
            }

            // Outer ripples
            if (isActive) {
                for (i in 3 downTo 1) {
                    val rippleRadius = (baseRadius + (i * 24f * dynamicMultiplier)) * pulseScale
                    val rippleAlpha = (0.25f / i) * (0.5f + audioLevel * 0.5f)

                    drawCircle(
                        color = secondaryColor.copy(alpha = rippleAlpha.coerceIn(0f, 0.4f)),
                        radius = rippleRadius,
                        center = center,
                        style = Stroke(width = 2.dp.toPx())
                    )
                }
            }

            // Inner radiant glow
            val orbRadius = baseRadius * pulseScale * dynamicMultiplier
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        primaryColor.copy(alpha = if (isActive) 0.9f else 0.3f),
                        secondaryColor.copy(alpha = if (isActive) 0.6f else 0.2f),
                        Color.Transparent
                    ),
                    center = center,
                    radius = orbRadius * 1.5f
                ),
                radius = orbRadius * 1.4f,
                center = center
            )

            // Core solid core
            drawCircle(
                brush = Brush.linearGradient(
                    colors = listOf(primaryColor, secondaryColor)
                ),
                radius = orbRadius * 0.7f,
                center = center
            )
        }
    }
}
