package com.example.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val OmniAgentDarkColorScheme = darkColorScheme(
    primary = PurpleNeon,
    onPrimary = Color.White,
    primaryContainer = PurpleDark,
    onPrimaryContainer = Zinc100,
    secondary = CyanNeon,
    onSecondary = Color.Black,
    secondaryContainer = CyanDark,
    onSecondaryContainer = CyanNeon,
    tertiary = RoseNeon,
    onTertiary = Color.White,
    tertiaryContainer = RoseDark,
    onTertiaryContainer = RoseNeon,
    background = Zinc950,
    onBackground = Zinc50,
    surface = DarkSurface,
    onSurface = Zinc100,
    surfaceVariant = DarkSurfaceElevated,
    onSurfaceVariant = Zinc300,
    outline = DarkBorder,
    outlineVariant = Zinc700,
    error = RoseNeon,
    onError = Color.White
)

@Composable
fun OmniAgentTheme(
    darkTheme: Boolean = true, // Default to sleek futuristic dark mode
    dynamicColor: Boolean = false, // Keep consistent cybernetic branding
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        else -> OmniAgentDarkColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

// Keep alias for backwards compatibility
@Composable
fun MyApplicationTheme(
    darkTheme: Boolean = true,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) = OmniAgentTheme(darkTheme, dynamicColor, content)
