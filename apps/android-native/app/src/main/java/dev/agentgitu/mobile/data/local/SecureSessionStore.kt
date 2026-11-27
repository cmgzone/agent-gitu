package dev.agentgitu.mobile.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Encrypted credentials for one saved Gitu server session. */
data class SecureSession(
    val serverUrl: String,
    val mode: String,
    val cookie: String?,
    val accessKey: String?,
    val pikpamToken: String?,
)

/**
 * Keeps the session cookie, access key, and Pikpam token out of plaintext
 * prefs so reopening the app (or returning from the system Back button)
 * restores the signed-in session without asking for the password again.
 */
class SecureSessionStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs: SharedPreferences? by lazy {
        runCatching {
            val masterKey = MasterKey.Builder(appContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                appContext,
                FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }.getOrNull()
    }

    fun save(session: SecureSession) {
        val p = prefs ?: return
        p.edit()
            .putString(KEY_SERVER, session.serverUrl)
            .putString(KEY_MODE, session.mode)
            .putString(KEY_COOKIE, session.cookie)
            .putString(KEY_ACCESS_KEY, session.accessKey)
            .putString(KEY_PIKPAM_TOKEN, session.pikpamToken)
            .apply()
    }

    fun load(): SecureSession? {
        val p = prefs ?: return null
        val serverUrl = p.getString(KEY_SERVER, null)?.takeIf { it.isNotBlank() } ?: return null
        return SecureSession(
            serverUrl = serverUrl,
            mode = p.getString(KEY_MODE, null) ?: "LOCAL",
            cookie = p.getString(KEY_COOKIE, null)?.takeIf { it.isNotBlank() },
            accessKey = p.getString(KEY_ACCESS_KEY, null)?.takeIf { it.isNotBlank() },
            pikpamToken = p.getString(KEY_PIKPAM_TOKEN, null)?.takeIf { it.isNotBlank() },
        )
    }

    fun clear() {
        prefs?.edit()?.clear()?.apply()
    }

    private companion object {
        const val FILE_NAME = "agent_gitu_secure_session"
        const val KEY_SERVER = "server_url"
        const val KEY_MODE = "mode"
        const val KEY_COOKIE = "cookie"
        const val KEY_ACCESS_KEY = "access_key"
        const val KEY_PIKPAM_TOKEN = "pikpam_token"
    }
}
