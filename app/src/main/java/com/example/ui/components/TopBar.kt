package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.ContentMode
import com.example.data.model.Persona
import com.example.ui.theme.CyanNeon
import com.example.ui.theme.DarkBorder
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.PurpleNeon
import com.example.ui.theme.RoseNeon
import com.example.ui.theme.Zinc400
import com.example.ui.theme.Zinc950

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OmniTopBar(
    activePersona: Persona,
    contentMode: ContentMode,
    onPersonaClick: () -> Unit,
    onModeClick: () -> Unit
) {
    TopAppBar(
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Zinc950
        ),
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Glow logo mark
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(PurpleNeon.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = "OmniAgent Logo",
                        tint = PurpleNeon,
                        modifier = Modifier.size(20.dp)
                    )
                }

                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "OmniAgent",
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            color = Color.White
                        )
                        Box(
                            modifier = Modifier
                                .padding(start = 6.dp)
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(CyanNeon)
                        )
                    }
                    Text(
                        text = "Super-Agent & Sierra Companion",
                        fontSize = 11.sp,
                        color = Zinc400
                    )
                }
            }
        },
        actions = {
            // Persona selector pill
            Surface(
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { onPersonaClick() }
                    .testTag("top_bar_persona_chip"),
                color = DarkSurface,
                shape = RoundedCornerShape(14.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Psychology,
                        contentDescription = "Active Persona",
                        tint = PurpleNeon,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = activePersona.badge,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White
                    )
                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = "Change Persona",
                        tint = Zinc400,
                        modifier = Modifier.size(12.dp)
                    )
                }
            }

            // Content mode toggle chip
            Surface(
                modifier = Modifier
                    .padding(start = 6.dp, end = 8.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { onModeClick() }
                    .testTag("top_bar_mode_chip"),
                color = if (contentMode == ContentMode.MATURE) RoseNeon.copy(alpha = 0.15f) else DarkSurface,
                shape = RoundedCornerShape(14.dp),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    if (contentMode == ContentMode.MATURE) RoseNeon.copy(alpha = 0.5f) else DarkBorder
                )
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = if (contentMode == ContentMode.MATURE) Icons.Default.Favorite else Icons.Default.Security,
                        contentDescription = "Content Mode",
                        tint = if (contentMode == ContentMode.MATURE) RoseNeon else CyanNeon,
                        modifier = Modifier.size(13.dp)
                    )
                    Text(
                        text = if (contentMode == ContentMode.MATURE) "18+" else "SFW",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (contentMode == ContentMode.MATURE) RoseNeon else CyanNeon
                    )
                }
            }
        }
    )
}
