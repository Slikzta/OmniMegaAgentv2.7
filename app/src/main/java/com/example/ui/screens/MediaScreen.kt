package com.example.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.data.model.MediaPresets
import com.example.ui.OmniAgentViewModel
import com.example.ui.theme.CyanNeon
import com.example.ui.theme.DarkBorder
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.PurpleNeon
import com.example.ui.theme.Zinc400
import com.example.ui.theme.Zinc500
import com.example.ui.theme.Zinc950

@Composable
fun MediaScreen(
    viewModel: OmniAgentViewModel,
    modifier: Modifier = Modifier
) {
    var selectedMediaTab by remember { mutableIntStateOf(0) } // 0: Image, 1: Video
    val context = LocalContext.current

    // Image state
    val imagePrompt by viewModel.imagePrompt.collectAsState()
    val selectedStyle by viewModel.selectedStyle.collectAsState()
    val selectedAspectRatio by viewModel.selectedAspectRatio.collectAsState()
    val selectedImageSize by viewModel.selectedImageSize.collectAsState()
    val isGeneratingImage by viewModel.isGeneratingImage.collectAsState()
    val generatedImageUrl by viewModel.generatedImageUrl.collectAsState()
    val mediaHistory by viewModel.mediaHistory.collectAsState()

    // Video state
    val videoPrompt by viewModel.videoPrompt.collectAsState()
    val selectedVideoRes by viewModel.selectedVideoRes.collectAsState()
    val selectedVideoFps by viewModel.selectedVideoFps.collectAsState()
    val isVideoGenerating by viewModel.isVideoGenerating.collectAsState()
    val videoStatusMessage by viewModel.videoStatusMessage.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Zinc950)
    ) {
        // Tab Header (Image vs Video)
        TabRow(
            selectedTabIndex = selectedMediaTab,
            containerColor = Zinc950,
            contentColor = Color.White,
            indicator = { tabPositions ->
                TabRowDefaults.SecondaryIndicator(
                    modifier = Modifier.tabIndicatorOffset(tabPositions[selectedMediaTab]),
                    color = PurpleNeon
                )
            }
        ) {
            Tab(
                selected = selectedMediaTab == 0,
                onClick = { selectedMediaTab = 0 },
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Image, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Image Gen (Imagen 3)", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                },
                modifier = Modifier.testTag("tab_image_gen")
            )
            Tab(
                selected = selectedMediaTab == 1,
                onClick = { selectedMediaTab = 1 },
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Videocam, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Video Gen (Veo 3.1)", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                },
                modifier = Modifier.testTag("tab_video_gen")
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            if (selectedMediaTab == 0) {
                // Image Generation View
                Text(
                    text = "Prompt",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(6.dp))

                OutlinedTextField(
                    value = imagePrompt,
                    onValueChange = { viewModel.setImagePrompt(it) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("image_prompt_input"),
                    placeholder = {
                        Text(
                            "A hyperrealistic neon cyberpunk portrait of Sierra in rain...",
                            fontSize = 13.sp,
                            color = Zinc500
                        )
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PurpleNeon,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    ),
                    shape = RoundedCornerShape(12.dp),
                    minLines = 3,
                    maxLines = 5
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Style Presets
                Text(
                    text = "Style Preset",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Zinc400
                )
                Spacer(modifier = Modifier.height(6.dp))

                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(MediaPresets.STYLES) { style ->
                        val isSelected = selectedStyle.id == style.id
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = if (isSelected) PurpleNeon.copy(alpha = 0.2f) else DarkSurface,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (isSelected) PurpleNeon else DarkBorder
                            ),
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { viewModel.setStyle(style) }
                        ) {
                            Text(
                                text = style.name,
                                fontSize = 11.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) PurpleNeon else Color.White,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Aspect Ratio & Size Row
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    // Aspect ratio
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Aspect Ratio", fontSize = 12.sp, color = Zinc400)
                        Spacer(modifier = Modifier.height(6.dp))
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(MediaPresets.ASPECT_RATIOS) { ratio ->
                                val isSelected = selectedAspectRatio == ratio
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(if (isSelected) CyanNeon.copy(alpha = 0.2f) else DarkSurface)
                                        .border(1.dp, if (isSelected) CyanNeon else DarkBorder, RoundedCornerShape(8.dp))
                                        .clickable { viewModel.setAspectRatio(ratio) }
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Text(
                                        text = ratio,
                                        fontSize = 11.sp,
                                        color = if (isSelected) CyanNeon else Color.White
                                    )
                                }
                            }
                        }
                    }

                    // Image Size
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Resolution", fontSize = 12.sp, color = Zinc400)
                        Spacer(modifier = Modifier.height(6.dp))
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(MediaPresets.IMAGE_SIZES) { size ->
                                val isSelected = selectedImageSize == size
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(if (isSelected) PurpleNeon.copy(alpha = 0.2f) else DarkSurface)
                                        .border(1.dp, if (isSelected) PurpleNeon else DarkBorder, RoundedCornerShape(8.dp))
                                        .clickable { viewModel.setImageSize(size) }
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Text(
                                        text = size,
                                        fontSize = 11.sp,
                                        color = if (isSelected) PurpleNeon else Color.White
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                Button(
                    onClick = { viewModel.generateImage() },
                    enabled = imagePrompt.isNotBlank() && !isGeneratingImage,
                    colors = ButtonDefaults.buttonColors(containerColor = PurpleNeon),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("generate_image_button")
                ) {
                    if (isGeneratingImage) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Synthesizing Image with Imagen 3...", color = Color.White, fontSize = 13.sp)
                    } else {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = Color.White)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Generate Image", fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Generated Result Card
                if (generatedImageUrl != null) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        color = DarkSurface,
                        border = androidx.compose.foundation.BorderStroke(1.dp, PurpleNeon.copy(alpha = 0.4f))
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Generated Asset", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = PurpleNeon)
                                IconButton(
                                    onClick = {
                                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                        clipboard.setPrimaryClip(ClipData.newPlainText("Image Prompt", imagePrompt))
                                        Toast.makeText(context, "Prompt copied", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.size(24.dp)
                                ) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = "Copy prompt", tint = Zinc400, modifier = Modifier.size(14.dp))
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))

                            AsyncImage(
                                model = generatedImageUrl,
                                contentDescription = "Generated Image",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(240.dp)
                                    .clip(RoundedCornerShape(12.dp))
                            )
                        }
                    }
                }

            } else {
                // Video Generation View
                Text(
                    text = "Video Prompt",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(6.dp))

                OutlinedTextField(
                    value = videoPrompt,
                    onValueChange = { viewModel.setVideoPrompt(it) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("video_prompt_input"),
                    placeholder = {
                        Text(
                            "Cinematic drone shot soaring through a futuristic neon city at twilight...",
                            fontSize = 13.sp,
                            color = Zinc500
                        )
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = CyanNeon,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        focusedContainerColor = DarkSurface,
                        unfocusedContainerColor = DarkSurface
                    ),
                    shape = RoundedCornerShape(12.dp),
                    minLines = 3,
                    maxLines = 5
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Video Resolution & FPS
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Resolution", fontSize = 12.sp, color = Zinc400)
                        Spacer(modifier = Modifier.height(6.dp))
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(MediaPresets.VIDEO_RESOLUTIONS) { res ->
                                val isSelected = selectedVideoRes == res
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(if (isSelected) CyanNeon.copy(alpha = 0.2f) else DarkSurface)
                                        .border(1.dp, if (isSelected) CyanNeon else DarkBorder, RoundedCornerShape(8.dp))
                                        .clickable { viewModel.setVideoRes(res) }
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Text(text = res, fontSize = 11.sp, color = if (isSelected) CyanNeon else Color.White)
                                }
                            }
                        }
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text("Framerate (FPS)", fontSize = 12.sp, color = Zinc400)
                        Spacer(modifier = Modifier.height(6.dp))
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(MediaPresets.VIDEO_FPS) { fps ->
                                val isSelected = selectedVideoFps == fps
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(if (isSelected) PurpleNeon.copy(alpha = 0.2f) else DarkSurface)
                                        .border(1.dp, if (isSelected) PurpleNeon else DarkBorder, RoundedCornerShape(8.dp))
                                        .clickable { viewModel.setVideoFps(fps) }
                                        .padding(horizontal = 10.dp, vertical = 6.dp)
                                ) {
                                    Text(text = "${fps}fps", fontSize = 11.sp, color = if (isSelected) PurpleNeon else Color.White)
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                Button(
                    onClick = { viewModel.generateVideo() },
                    enabled = videoPrompt.isNotBlank() && !isVideoGenerating,
                    colors = ButtonDefaults.buttonColors(containerColor = CyanNeon),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("generate_video_button")
                ) {
                    if (isVideoGenerating) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.Black, strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Rendering with Veo 3.1...", color = Color.Black, fontSize = 13.sp)
                    } else {
                        Icon(Icons.Default.Videocam, contentDescription = null, tint = Color.Black)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Generate Video (Veo 3.1)", fontWeight = FontWeight.Bold, color = Color.Black)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (videoStatusMessage.isNotBlank()) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = DarkSurface,
                        border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Movie, contentDescription = null, tint = CyanNeon, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(text = videoStatusMessage, fontSize = 12.sp, color = Color.White)
                        }
                    }
                }
            }
        }
    }
}
