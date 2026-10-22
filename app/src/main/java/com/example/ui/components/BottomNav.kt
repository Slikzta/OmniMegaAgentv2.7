package com.example.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.sp
import com.example.ui.AppTab
import com.example.ui.theme.DarkSurfaceElevated
import com.example.ui.theme.PurpleNeon
import com.example.ui.theme.Zinc400
import com.example.ui.theme.Zinc950

@Composable
fun OmniBottomNav(
    activeTab: AppTab,
    onTabSelected: (AppTab) -> Unit
) {
    NavigationBar(
        containerColor = Zinc950,
        contentColor = Color.White
    ) {
        val tabs = listOf(
            Triple(AppTab.CHAT, Icons.Default.ChatBubble, "chat_tab"),
            Triple(AppTab.LIVE, Icons.Default.GraphicEq, "live_tab"),
            Triple(AppTab.MEDIA, Icons.Default.AutoAwesome, "media_tab"),
            Triple(AppTab.INTEGRATIONS, Icons.Default.Hub, "integrations_tab"),
            Triple(AppTab.SETTINGS, Icons.Default.Settings, "settings_tab")
        )

        tabs.forEach { (tab, icon, testTag) ->
            val isSelected = activeTab == tab
            NavigationBarItem(
                selected = isSelected,
                onClick = { onTabSelected(tab) },
                icon = {
                    Icon(
                        imageVector = icon,
                        contentDescription = tab.title
                    )
                },
                label = {
                    Text(
                        text = tab.title,
                        fontSize = 11.sp
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Color.White,
                    selectedTextColor = PurpleNeon,
                    indicatorColor = PurpleNeon.copy(alpha = 0.25f),
                    unselectedIconColor = Zinc400,
                    unselectedTextColor = Zinc400
                ),
                modifier = Modifier.testTag(testTag)
            )
        }
    }
}
