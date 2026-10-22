package com.example.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.ContentMode
import com.example.data.model.Persona
import com.example.data.model.Personas
import com.example.data.model.ProviderType
import com.example.ui.OmniAgentViewModel
import com.example.ui.theme.CyanNeon
import com.example.ui.theme.DarkBorder
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.EmeraldNeon
import com.example.ui.theme.PurpleNeon
import com.example.ui.theme.RoseNeon
import com.example.ui.theme.Zinc400
import com.example.ui.theme.Zinc500
import com.example.ui.theme.Zinc950

@Composable
fun SettingsScreen(
    viewModel: OmniAgentViewModel,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    val activeProvider by viewModel.activeProvider.collectAsState()
    val activePersona by viewModel.activePersona.collectAsState()
    val contentMode by viewModel.contentMode.collectAsState()
    val isTestingConnection by viewModel.isTestingConnection.collectAsState()
    val connectionTestResult by viewModel.connectionTestResult.collectAsState()

    var currentApiKey by remember(activeProvider) {
        mutableStateOf(viewModel.preferences.getApiKey(activeProvider))
    }
    var currentBaseUrl by remember(activeProvider) {
        mutableStateOf(viewModel.preferences.getBaseUrl(activeProvider))
    }
    var currentModel by remember(activeProvider) {
        mutableStateOf(viewModel.preferences.getSelectedModel(activeProvider))
    }
    var isKeyVisible by remember { mutableStateOf(false) }

    var speechRate by remember { mutableFloatStateOf(viewModel.preferences.speechRate) }
    var speechPitch by remember { mutableFloatStateOf(viewModel.preferences.speechPitch) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Zinc950)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Settings & AI Configuration",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )

        // 1. Provider Selection
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = DarkSurface,
            border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "ACTIVE AI PROVIDER",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = PurpleNeon,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(10.dp))

                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(ProviderType.entries) { provider ->
                        val isSelected = activeProvider == provider
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) PurpleNeon.copy(alpha = 0.2f) else DarkSurfaceElevated,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (isSelected) PurpleNeon else DarkBorder
                            ),
                            modifier = Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    viewModel.setProvider(provider)
                                }
                                .testTag("provider_chip_${provider.id}")
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text(
                                    text = provider.displayName,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isSelected) PurpleNeon else Color.White
                                )
                                Text(
                                    text = provider.badge,
                                    fontSize = 10.sp,
                                    color = Zinc400
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Model Selection
                Text("Model Selection", fontSize = 11.sp, color = Zinc400)
                Spacer(modifier = Modifier.height(6.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(activeProvider.availableModels) { modelName ->
                        val isSelected = currentModel == modelName
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSelected) CyanNeon.copy(alpha = 0.2f) else DarkSurfaceElevated)
                                .border(1.dp, if (isSelected) CyanNeon else DarkBorder, RoundedCornerShape(8.dp))
                                .clickable {
                                    currentModel = modelName
                                    viewModel.preferences.setSelectedModel(activeProvider, modelName)
                                }
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text(
                                text = modelName,
                                fontSize = 11.sp,
                                color = if (isSelected) CyanNeon else Color.White
                            )
                        }
                    }
                }

                if (activeProvider.requiresKey) {
                    Spacer(modifier = Modifier.height(14.dp))
                    Text("API Key", fontSize = 11.sp, color = Zinc400)
                    Spacer(modifier = Modifier.height(4.dp))
                    OutlinedTextField(
                        value = currentApiKey,
                        onValueChange = {
                            currentApiKey = it
                            viewModel.preferences.setApiKey(activeProvider, it)
                        },
                        placeholder = {
                            Text(
                                if (activeProvider == ProviderType.GEMINI) "Enter key (or uses default BuildConfig key)" else "Enter ${activeProvider.displayName} API Key",
                                fontSize = 12.sp,
                                color = Zinc500
                            )
                        },
                        visualTransformation = if (isKeyVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        trailingIcon = {
                            IconButton(onClick = { isKeyVisible = !isKeyVisible }) {
                                Icon(
                                    imageVector = if (isKeyVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = "Toggle key visibility",
                                    tint = Zinc400
                                )
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("api_key_input"),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PurpleNeon,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedContainerColor = DarkSurfaceElevated,
                            unfocusedContainerColor = DarkSurfaceElevated
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )
                }

                if (activeProvider.defaultBaseUrl != null) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text("Custom Base URL", fontSize = 11.sp, color = Zinc400)
                    Spacer(modifier = Modifier.height(4.dp))
                    OutlinedTextField(
                        value = currentBaseUrl,
                        onValueChange = {
                            currentBaseUrl = it
                            viewModel.preferences.setBaseUrl(activeProvider, it)
                        },
                        placeholder = { Text(activeProvider.defaultBaseUrl ?: "https://...", fontSize = 12.sp, color = Zinc500) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = CyanNeon,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            focusedContainerColor = DarkSurfaceElevated,
                            unfocusedContainerColor = DarkSurfaceElevated
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Test Connection Button
                Button(
                    onClick = {
                        viewModel.testProviderConnection(activeProvider, currentApiKey, currentBaseUrl, currentModel)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated),
                    border = androidx.compose.foundation.BorderStroke(1.dp, PurpleNeon),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("test_connection_button")
                ) {
                    if (isTestingConnection) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = PurpleNeon, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Testing Ping...", fontSize = 12.sp, color = Color.White)
                    } else {
                        Icon(Icons.Default.Refresh, contentDescription = null, tint = PurpleNeon, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Test Connection", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color.White)
                    }
                }

                if (connectionTestResult != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = connectionTestResult ?: "",
                        fontSize = 11.sp,
                        color = if (connectionTestResult?.startsWith("Success") == true) EmeraldNeon else RoseNeon
                    )
                }
            }
        }

        // 2. Persona & Content Mode Card
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = DarkSurface,
            border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "PERSONA & CONTENT MODE",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = PurpleNeon,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(12.dp))

                // Content Mode Switcher
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(contentMode.displayName, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color.White)
                        Text(contentMode.shortDesc, fontSize = 11.sp, color = Zinc400)
                    }

                    Surface(
                        color = DarkSurfaceElevated,
                        shape = RoundedCornerShape(10.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
                    ) {
                        Row(modifier = Modifier.padding(2.dp)) {
                            val isSfw = contentMode == ContentMode.SFW
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (isSfw) CyanNeon.copy(alpha = 0.3f) else Color.Transparent)
                                    .clickable { viewModel.setContentMode(ContentMode.SFW) }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Text("SFW", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = if (isSfw) CyanNeon else Zinc400)
                            }

                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (!isSfw) RoseNeon.copy(alpha = 0.3f) else Color.Transparent)
                                    .clickable { viewModel.setContentMode(ContentMode.MATURE) }
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Text("18+ Adult", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = if (!isSfw) RoseNeon else Zinc400)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Personas List
                Text("Select Sierra Persona", fontSize = 11.sp, color = Zinc400)
                Spacer(modifier = Modifier.height(8.dp))

                Personas.ALL.forEach { persona ->
                    val isSelected = activePersona.id == persona.id
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (isSelected) PurpleNeon.copy(alpha = 0.15f) else DarkSurfaceElevated,
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            if (isSelected) PurpleNeon else DarkBorder
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { viewModel.setPersona(persona) }
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(if (isSelected) PurpleNeon else DarkSurface),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.Default.Psychology,
                                    contentDescription = null,
                                    tint = if (isSelected) Color.White else Zinc400,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(persona.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                Text(persona.roleEmphasis, fontSize = 11.sp, color = Zinc400, maxLines = 2)
                            }
                        }
                    }
                }
            }
        }

        // 3. Sierra Voice & Speech Settings
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = DarkSurface,
            border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "SIERRA VOICE (TTS) SETTINGS",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = PurpleNeon,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(12.dp))

                Text("Speech Pitch: ${(speechPitch * 100).toInt()}%", fontSize = 12.sp, color = Color.White)
                Slider(
                    value = speechPitch,
                    onValueChange = {
                        speechPitch = it
                        viewModel.preferences.speechPitch = it
                    },
                    valueRange = 0.6f..1.4f,
                    colors = SliderDefaults.colors(
                        thumbColor = PurpleNeon,
                        activeTrackColor = PurpleNeon,
                        inactiveTrackColor = DarkSurfaceElevated
                    )
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text("Speech Rate: ${(speechRate * 100).toInt()}%", fontSize = 12.sp, color = Color.White)
                Slider(
                    value = speechRate,
                    onValueChange = {
                        speechRate = it
                        viewModel.preferences.speechRate = it
                    },
                    valueRange = 0.6f..1.4f,
                    colors = SliderDefaults.colors(
                        thumbColor = CyanNeon,
                        activeTrackColor = CyanNeon,
                        inactiveTrackColor = DarkSurfaceElevated
                    )
                )

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = {
                        viewModel.voiceManager.speak("Hello! This is a voice test for Sierra.", speechPitch, speechRate)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated),
                    border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.VolumeUp, contentDescription = null, tint = PurpleNeon, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Test Voice Synthesis", fontSize = 12.sp, color = Color.White)
                }
            }
        }

        // 4. Reset Data
        Button(
            onClick = {
                viewModel.preferences.clearAll()
                viewModel.clearChat()
                Toast.makeText(context, "All local configurations reset", Toast.LENGTH_SHORT).show()
            },
            colors = ButtonDefaults.buttonColors(containerColor = DarkSurfaceElevated),
            border = androidx.compose.foundation.BorderStroke(1.dp, RoseNeon.copy(alpha = 0.4f)),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("reset_data_button")
        ) {
            Icon(Icons.Default.RestartAlt, contentDescription = null, tint = RoseNeon, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Reset All Configurations", fontSize = 12.sp, color = RoseNeon)
        }
    }
}
