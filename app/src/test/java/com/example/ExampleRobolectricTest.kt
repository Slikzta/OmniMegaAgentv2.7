package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

  @Test
  fun `read string from context`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val appName = context.getString(R.string.app_name)
    assertEquals("OmniAgent", appName)
  }

  @Test
  fun `verify personas loaded correctly`() {
    val personas = com.example.data.model.Personas.ALL
    assertTrue(personas.isNotEmpty())
    val companion = com.example.data.model.Personas.getById("sierra-companion")
    assertEquals("Sierra (Companion)", companion.name)
  }
}
