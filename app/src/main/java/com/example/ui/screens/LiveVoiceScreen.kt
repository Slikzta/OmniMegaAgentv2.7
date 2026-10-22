package com.example.ui.screens

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.ui.OmniAgentViewModel
import com.example.ui.components.VoiceOrb
import com.example.ui.theme.CyanNeon
import com.example.ui.theme.DarkBorder
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.PurpleNeon
import com.example.ui.theme.RoseNeon
import com.example.ui.theme.Zinc400
import com.example.ui.theme.Zinc500
import com.example.ui.theme.Zinc950

@Composable
fun LiveVoiceScreen(
    viewModel: OmniAgentViewModel,
    modifier: Modifier = Modifier
) {
    val isLiveActive by viewModel.isLiveActive.collectAsState()
    val isListening by viewModel.isListening.collectAsState()
    val isSpeaking by viewModel.isSpeaking.collectAsState()
    val audioLevel by viewModel.audioLevel.collectAsState()
    val transcripts by viewModel.liveTranscripts.collectAsState()
    val liveMode by viewModel.liveMode.collectAsState()
    val activePersona by viewModel.activePersona.collectAsState()

    val context = LocalContext.current
    val transcriptListState = rememberLazyListState()

    val audioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            viewModel.toggleLiveVoice()
        } else {
            Toast.makeText(context, "Microphone permission required for Live Voice", Toast.LENGTH_SHORT).show()
        }
    }

    LaunchedEffect(transcripts.size) {
        if (transcripts.isNotEmpty()) {
            transcriptListState.animateScrollToItem(transcripts.size - 1)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Zinc950)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Mode & Voice Header Bar
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Mode selector (Continuous vs Push)
            Surface(
                color = DarkSurface,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
            ) {
                Row(modifier = Modifier.padding(2.dp)) {
                    val isContinuous = liveMode == "continuous"
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (isContinuous) PurpleNeon else Color.Transparent)
                            .clickable { viewModel.setLiveMode("continuous") }
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                            .testTag("mode_continuous_button")
                    ) {
                        Text(
                            text = "Continuous",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isContinuous) Color.White else Zinc400
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (!isContinuous) PurpleNeon else Color.Transparent)
                            .clickable { viewModel.setLiveMode("push") }
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                            .testTag("mode_push_button")
                    ) {
                        Text(
                            text = "Push-to-Talk",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (!isContinuous) Color.White else Zinc400
                        )
                    }
                }
            }

            // Latency / Model Chip
            Surface(
                color = DarkSurfaceElevated,
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (isLiveActive) CyanNeon else Zinc500)
                    )
                    Text(
                        text = "Gemini 3.8 Live",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Center Pulsing Voice Orb
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                VoiceOrb(
                    isActive = isLiveActive,
                    isListening = isListening,
                    isSpeaking = isSpeaking,
                    audioLevel = audioLevel,
                    size = 230.dp
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Status message
                val statusText = when {
                    !isLiveActive -> "Tap Start Dialogue below to begin"
                    isSpeaking -> "Sierra speaking..."
                    isListening -> "Listening to your voice..."
                    else -> "Ready & attuned to ${activePersona.name}"
                }

                Text(
                    text = statusText,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = when {
                        isSpeaking -> PurpleNeon
                        isListening -> CyanNeon
                        isLiveActive -> Color.White
                        else -> Zinc500
                    }
                )

                Text(
                    text = if (isLiveActive) "Spoken conversation loop is running" else "Hands-free continuous dialogue with Sierra",
                    fontSize = 11.sp,
                    color = Zinc500
                )
            }
        }

        // Live Transcript Container
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp),
            shape = RoundedCornerShape(16.dp),
            color = DarkSurface,
            border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "LIVE TRANSCRIPT",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Zinc400,
                        letterSpacing = 1.sp
                    )

                    Row {
                        IconButton(
                            onClick = {
                                val allText = transcripts.joinToString("\n") { "${it.speaker}: ${it.text}" }
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("Live Transcripts", allText))
                                Toast.makeText(context, "Transcripts copied", Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.ContentCopy,
                                contentDescription = "Copy transcripts",
                                tint = Zinc400,
                                modifier = Modifier.size(13.dp)
                            )
                        }

                        IconButton(
                            onClick = { viewModel.clearLiveTranscripts() },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.DeleteSweep,
                                contentDescription = "Clear transcripts",
                                tint = Zinc400,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }

                LazyColumn(
                    state = transcriptListState,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 4.dp)
                ) {
                    if (transcripts.isEmpty()) {
                        item {
                            Text(
                                text = "Dialogue utterances will appear here in real time...",
                                fontSize = 12.sp,
                                color = Zinc500,
                                modifier = Modifier.padding(vertical = 8.dp)
                            )
                        }
                    } else {
                        items(transcripts, key = { it.id }) { item ->
                            val isUser = item.speaker == "user"
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 3.dp),
                                horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                            ) {
                                Surface(
                                    color = if (isUser) PurpleNeon.copy(alpha = 0.2f) else DarkSurfaceElevated,
                                    shape = RoundedCornerShape(8.dp),
                                    border = androidx.compose.foundation.BorderStroke(
                                        1.dp,
                                        if (isUser) PurpleNeon.copy(alpha = 0.4f) else DarkBorder
                                    )
                                ) {
                                    Text(
                                        text = "${if (isUser) "You" else "Sierra"}: ${item.text}",
                                        fontSize = 12.sp,
                                        color = if (isUser) Color.White else CyanNeon,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Main Live Voice Trigger Button
        Button(
            onClick = {
                val hasPermission = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED

                if (hasPermission) {
                    viewModel.toggleLiveVoice()
                } else {
                    audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            },
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isLiveActive) RoseNeon else PurpleNeon
            ),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
                .testTag("toggle_live_voice_button")
        ) {
            Icon(
                imageVector = if (isLiveActive) Icons.Default.MicOff else Icons.Default.GraphicEq,
                contentDescription = if (isLiveActive) "Stop Dialogue" else "Start Dialogue",
                tint = Color.White
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isLiveActive) "End Live Dialogue" else "Start Live Dialogue",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = Color.White
            )
        }
    }
}
