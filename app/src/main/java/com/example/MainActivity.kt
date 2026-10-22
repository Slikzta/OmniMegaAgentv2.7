package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.model.ContentMode
import com.example.data.model.Personas
import com.example.ui.AppTab
import com.example.ui.OmniAgentViewModel
import com.example.ui.components.OmniBottomNav
import com.example.ui.components.OmniTopBar
import com.example.ui.screens.ChatScreen
import com.example.ui.screens.IntegrationsScreen
import com.example.ui.screens.LiveVoiceScreen
import com.example.ui.screens.MediaScreen
import com.example.ui.screens.SettingsScreen
import com.example.ui.theme.CyanNeon
import com.example.ui.theme.DarkBorder
import com.example.ui.theme.DarkSurface
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.OmniAgentTheme
import com.example.ui.theme.PurpleNeon
import com.example.ui.theme.RoseNeon
import com.example.ui.theme.Zinc400
import com.example.ui.theme.Zinc950

class MainActivity : ComponentActivity() {
    private val viewModel: OmniAgentViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OmniAgentTheme {
                OmniAgentApp(viewModel)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OmniAgentApp(viewModel: OmniAgentViewModel) {
    val activeTab by viewModel.activeTab.collectAsState()
    val activePersona by viewModel.activePersona.collectAsState()
    val contentMode by viewModel.contentMode.collectAsState()

    var showPersonaDialog by remember { mutableStateOf(false) }
    var showModeDialog by remember { mutableStateOf(false) }

    // Android back button handling: return to chat if on other tabs
    BackHandler(enabled = activeTab != AppTab.CHAT) {
        viewModel.setActiveTab(AppTab.CHAT)
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Zinc950,
        topBar = {
            OmniTopBar(
                activePersona = activePersona,
                contentMode = contentMode,
                onPersonaClick = { showPersonaDialog = true },
                onModeClick = { showModeDialog = true }
            )
        },
        bottomBar = {
            OmniBottomNav(
                activeTab = activeTab,
                onTabSelected = { tab -> viewModel.setActiveTab(tab) }
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (activeTab) {
                AppTab.CHAT -> ChatScreen(viewModel)
                AppTab.LIVE -> LiveVoiceScreen(viewModel)
                AppTab.MEDIA -> MediaScreen(viewModel)
                AppTab.INTEGRATIONS -> IntegrationsScreen(viewModel)
                AppTab.SETTINGS -> SettingsScreen(viewModel)
            }
        }
    }

    // Persona Selector Dialog
    if (showPersonaDialog) {
        BasicAlertDialog(
            onDismissRequest = { showPersonaDialog = false }
        ) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = DarkSurface,
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Select Persona", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        IconButton(onClick = { showPersonaDialog = false }) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Zinc400)
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Personas.ALL.forEach { persona ->
                        val isSelected = activePersona.id == persona.id
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) PurpleNeon.copy(alpha = 0.2f) else DarkSurfaceElevated,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (isSelected) PurpleNeon else DarkBorder
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    viewModel.setPersona(persona)
                                    showPersonaDialog = false
                                }
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
                                Column {
                                    Text(persona.name, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color.White)
                                    Text(persona.roleEmphasis, fontSize = 11.sp, color = Zinc400, maxLines = 2)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Content Mode Selector Dialog
    if (showModeDialog) {
        BasicAlertDialog(
            onDismissRequest = { showModeDialog = false }
        ) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = DarkSurface,
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Content Mode", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        IconButton(onClick = { showModeDialog = false }) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Zinc400)
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    ContentMode.entries.forEach { mode ->
                        val isSelected = contentMode == mode
                        val accentColor = if (mode == ContentMode.MATURE) RoseNeon else CyanNeon
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) accentColor.copy(alpha = 0.2f) else DarkSurfaceElevated,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (isSelected) accentColor else DarkBorder
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    viewModel.setContentMode(mode)
                                    showModeDialog = false
                                }
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(CircleShape)
                                        .background(if (isSelected) accentColor else DarkSurface),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = if (mode == ContentMode.MATURE) Icons.Default.Favorite else Icons.Default.Security,
                                        contentDescription = null,
                                        tint = if (isSelected) Color.White else Zinc400,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(mode.displayName, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color.White)
                                    Text(mode.shortDesc, fontSize = 11.sp, color = Zinc400)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
