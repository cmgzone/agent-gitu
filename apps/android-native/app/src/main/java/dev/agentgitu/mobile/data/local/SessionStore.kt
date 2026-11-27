package dev.agentgitu.mobile.data.local

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dev.agentgitu.mobile.data.model.CachedRunSnapshot
import dev.agentgitu.mobile.data.model.CachedTeamSnapshot
import dev.agentgitu.mobile.data.model.Run
import dev.agentgitu.mobile.data.model.RunEvent
import dev.agentgitu.mobile.data.model.TeamView
import dev.agentgitu.mobile.data.network.ConnectionMode
import kotlinx.coroutines.flow.first
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

private val Context.gituDataStore by preferencesDataStore(name = "agent_gitu_prefs")

enum class ThemePreference {
    SYSTEM,
    LIGHT,
    DARK,
}

data class SavedServerConfig(
    val serverUrl: String = "http://10.0.2.2:8321",
    val mode: ConnectionMode = ConnectionMode.LOCAL,
    val lastEmail: String = "",
    val theme: ThemePreference = ThemePreference.DARK,
    val deviceId: String = "",
    val liveActivityEnabled: Boolean = false,
    val liveActivityShowPreview: Boolean = true,
)

class SessionStore(private val context: Context) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    companion object {
        private const val SYNC_PREFS_NAME = "agent_gitu_live_activity_sync"
        private const val SYNC_LIVE_ENABLED = "live_activity_enabled"
        private const val SYNC_LIVE_PREVIEW = "live_activity_show_preview"

        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val KEY_MODE = stringPreferencesKey("connection_mode")
        private val KEY_EMAIL = stringPreferencesKey("last_email")
        private val KEY_THEME = stringPreferencesKey("theme_preference")
        private val KEY_DEVICE_ID = stringPreferencesKey("push_device_id")
        private val KEY_LIVE_ACTIVITY = booleanPreferencesKey("live_activity_enabled")
        private val KEY_LIVE_ACTIVITY_PREVIEW = booleanPreferencesKey("live_activity_show_preview")
        private val KEY_CACHED_RUN = stringPreferencesKey("cached_run_snapshot")
        private val KEY_CACHED_TEAM = stringPreferencesKey("cached_team_snapshot")

        fun isLiveActivityEnabledSync(context: Context): Boolean =
            context.getSharedPreferences(SYNC_PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(SYNC_LIVE_ENABLED, false)

        fun isLiveActivityPreviewEnabledSync(context: Context): Boolean =
            context.getSharedPreferences(SYNC_PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(SYNC_LIVE_PREVIEW, true)
    }

    suspend fun loadConfig(): SavedServerConfig {
        val prefs = context.gituDataStore.data.first()
        var deviceId = prefs[KEY_DEVICE_ID].orEmpty()
        if (deviceId.length < 16) {
            deviceId = "android_${UUID.randomUUID().toString().replace("-", "")}"
            context.gituDataStore.edit { it[KEY_DEVICE_ID] = deviceId }
        }
        val mode = runCatching { ConnectionMode.valueOf(prefs[KEY_MODE] ?: "LOCAL") }
            .getOrDefault(ConnectionMode.LOCAL)
        val theme = runCatching { ThemePreference.valueOf(prefs[KEY_THEME] ?: "DARK") }
            .getOrDefault(ThemePreference.DARK)
        val liveEnabled = prefs[KEY_LIVE_ACTIVITY] ?: false
        val livePreview = prefs[KEY_LIVE_ACTIVITY_PREVIEW] ?: true
        syncLivePrefsToSharedPrefs(liveEnabled, livePreview)
        return SavedServerConfig(
            serverUrl = prefs[KEY_SERVER_URL] ?: "http://10.0.2.2:8321",
            mode = mode,
            lastEmail = prefs[KEY_EMAIL].orEmpty(),
            theme = theme,
            deviceId = deviceId,
            liveActivityEnabled = liveEnabled,
            liveActivityShowPreview = livePreview,
        )
    }

    suspend fun saveLiveActivityPrefs(enabled: Boolean, showPreview: Boolean) {
        syncLivePrefsToSharedPrefs(enabled, showPreview)
        context.gituDataStore.edit { prefs ->
            prefs[KEY_LIVE_ACTIVITY] = enabled
            prefs[KEY_LIVE_ACTIVITY_PREVIEW] = showPreview
        }
    }

    private fun syncLivePrefsToSharedPrefs(enabled: Boolean, showPreview: Boolean) {
        context.getSharedPreferences(SYNC_PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(SYNC_LIVE_ENABLED, enabled)
            .putBoolean(SYNC_LIVE_PREVIEW, showPreview)
            .apply()
    }

    suspend fun saveConnection(serverUrl: String, mode: ConnectionMode, email: String) {
        context.gituDataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = serverUrl
            prefs[KEY_MODE] = mode.name
            if (email.isNotBlank()) prefs[KEY_EMAIL] = email.trim()
        }
    }

    suspend fun saveTheme(theme: ThemePreference) {
        context.gituDataStore.edit { it[KEY_THEME] = theme.name }
    }

    suspend fun cacheRunSnapshot(run: Run, events: List<RunEvent>) {
        val bounded = CachedRunSnapshot(
            run = run,
            events = events.takeLast(400),
            savedAtMs = System.currentTimeMillis(),
        )
        runCatching {
            val encoded = json.encodeToString(bounded)
            context.gituDataStore.edit { it[KEY_CACHED_RUN] = encoded }
        }
    }

    suspend fun loadCachedRun(): CachedRunSnapshot? {
        val raw = context.gituDataStore.data.first()[KEY_CACHED_RUN] ?: return null
        return runCatching { json.decodeFromString<CachedRunSnapshot>(raw) }.getOrNull()
    }

    suspend fun cacheTeamSnapshot(conversationId: String, threadId: String, view: TeamView) {
        val bounded = CachedTeamSnapshot(
            conversationId = conversationId,
            threadId = threadId,
            view = view.copy(messages = view.messages.takeLast(200)),
            savedAtMs = System.currentTimeMillis(),
        )
        runCatching {
            val encoded = json.encodeToString(bounded)
            context.gituDataStore.edit { it[KEY_CACHED_TEAM] = encoded }
        }
    }

    suspend fun loadCachedTeam(): CachedTeamSnapshot? {
        val raw = context.gituDataStore.data.first()[KEY_CACHED_TEAM] ?: return null
        return runCatching { json.decodeFromString<CachedTeamSnapshot>(raw) }.getOrNull()
    }
}
