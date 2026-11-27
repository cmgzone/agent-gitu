package dev.agentgitu.mobile.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.data.model.ConnectedAppAccount
import dev.agentgitu.mobile.data.model.ConnectedServiceItem
import dev.agentgitu.mobile.data.model.TeamRequest
import dev.agentgitu.mobile.data.model.Teammate
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import java.net.URI

private val cardJsonParser = Json {
    ignoreUnknownKeys = true
    isLenient = true
}

/**
 * Full Web-parity inline Cowork request card renderer covering EVERY request type
 * dynamically with zero raw text or raw JSON dumps:
 * 1) Suggested App Connection card (real SVG/PNG/ICO brand logos, live connected status)
 * 2) Secure Website Browser Auth card (origin favicon, dynamic fields, terms, expiry)
 * 3) Secure Credential card (API key with Show/Hide, structured multi-field OAuth2/Basic/Headers, SSH host fingerprint check)
 * 4) App Action Approval / Email Review card (real app icon, editable message fields, Always Allow / Save Draft / Approve)
 * 5) Question / Approval / Plan Review / Computer Control card (wrapped choices, Recommended badge, Custom answer toggle, Remember for Chief of Staff, collapsible Technical details, clean answered receipt)
 */
@Composable
fun StitchTeamRequestCard(
    request: TeamRequest,
    teammate: Teammate?,
    showAvatar: Boolean = true,
    servicesCatalog: List<ConnectedServiceItem> = emptyList(),
    authLink: String? = null,
    liveConnected: Boolean = false,
    availableAccount: ConnectedAppAccount? = null,
    onAssignExisting: (agentId: String, accountId: String) -> Unit = { _, _ -> },
    onConnectApp: (agentId: String, service: String, requestId: String) -> Unit,
    onOpenAuthUrl: (String) -> Unit,
    onManageApps: (agentId: String) -> Unit,
    onOpenComputer: (agentId: String, agentName: String) -> Unit = { _, _ -> },
    onSubmitCredential: (
        requestId: String,
        label: String,
        provider: String,
        baseUrl: String,
        token: String,
        valPath: String,
        setupJson: String?,
        values: Map<String, String>?,
    ) -> Unit,
    onProbeSshHostKey: (requestId: String, baseUrl: String, onResult: (Result<String>) -> Unit) -> Unit = { _, _, _ -> },
    onSubmitSshCredential: (requestId: String, label: String, baseUrl: String, password: String, fingerprint: String) -> Unit = { _, _, _, _, _ -> },
    onSubmitBrowserAuth: (requestId: String, setupJson: String, values: Map<String, String>, terms: List<String>) -> Unit = { _, _, _, _ -> },
    onAction: (
        action: String,
        response: String?,
        reviewedArgs: JsonObject?,
        rememberForChief: Boolean,
        chiefPattern: String?,
        chiefScope: String?,
    ) -> Unit,
) {
    val s = LocalStitchPalette.current
    val agentName = teammate?.name?.ifBlank { "Teammate" } ?: "Teammate"
    val agentAccent = remember(teammate) {
        parseHexColor(
            resolveCharacterColorHex(teammate?.avatar?.shape, teammate?.avatar?.color, agentName),
            fallback = s.primary,
        )
    }

    // 1. INLINE APP CONNECTION CARD (exact parity with web cwAppConnectionHtml)
    val app = request.appConnection
    if (app != null) {
        val isConnected = liveConnected || request.status == "accepted" || request.response.equals("Connected", ignoreCase = true)
        val isDismissed = request.status == "dismissed"

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(if (showAvatar) 6.dp else 0.dp),
        ) {
            if (showAvatar) {
                StitchCharacterAvatar(
                    label = agentName,
                    accentHex = teammate?.avatar?.color,
                    shapeName = teammate?.avatar?.shape,
                    imageUrl = teammate?.avatar?.imageUrl,
                    size = 26.dp,
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "$agentName • Suggested app",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        color = s.onSurfaceVariant,
                    )
                    if (request.createdAt.isNotBlank()) {
                        Text(
                            text = formatShortTime(request.createdAt),
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            color = s.onSurfaceVariant,
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppServiceLogo(
                        logoUrl = app.logo,
                        serviceSlug = app.service,
                        fallbackLabel = app.name.ifBlank { app.service },
                        servicesCatalog = servicesCatalog,
                        size = 38.dp,
                    )
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text(
                            text = app.name.ifBlank { humanizeActionWords(app.service) },
                            style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.5.sp),
                            color = s.onSurface,
                        )
                        Text(
                            text = "For $agentName only",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                            color = s.onSurfaceVariant,
                        )
                    }
                }

                val reason = app.reason.ifBlank { cardPlainText(request.detail, "") }
                if (reason.isNotBlank()) {
                    Text(text = reason, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                }

                when {
                    isConnected -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(s.successContainer)
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = s.onSuccessContainer, modifier = Modifier.size(14.dp))
                            Text("Connected", style = MaterialTheme.typography.labelSmall, color = s.onSuccessContainer)
                        }
                    }
                    isDismissed -> {
                        StitchBadge(text = "Skipped", tone = BadgeTone.NEUTRAL)
                    }
                    else -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (!authLink.isNullOrBlank()) {
                                StitchPrimaryButton(
                                    text = "Continue sign-in",
                                    icon = Icons.Default.OpenInNew,
                                    onClick = { onOpenAuthUrl(authLink) },
                                )
                            } else if (availableAccount != null) {
                                StitchPrimaryButton(
                                    text = "Assign ${availableAccount.label?.take(12) ?: "account"}",
                                    icon = Icons.Default.Check,
                                    onClick = { onAssignExisting(request.agentId, availableAccount.id) },
                                )
                                StitchSecondaryButton(
                                    text = "New account",
                                    outlined = true,
                                    onClick = { onConnectApp(request.agentId, app.service, request.id) },
                                )
                            } else {
                                StitchPrimaryButton(
                                    text = "Connect",
                                    icon = Icons.Default.Link,
                                    onClick = { onConnectApp(request.agentId, app.service, request.id) },
                                )
                            }
                            StitchSecondaryButton(
                                text = "Use existing",
                                outlined = true,
                                onClick = { onManageApps(request.agentId) },
                            )
                            TextButton(onClick = { onAction("dismiss", null, null, false, null, null) }) {
                                Text("Skip", color = s.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
            }
        }
        return
    }

    // 2. SECURE WEBSITE BROWSER AUTH CARD (exact parity with web cwBrowserAuthHtml)
    if (request.kind == "browser-auth") {
        val card = remember(request.id, request.browserAuth) { request.browserAuthSpec }
        val setupJson = request.browserAuthSetupJson
        val settled = request.status != "open" && request.status != "pending"
        val uriHandler = LocalUriHandler.current
        val originHost = remember(card?.origin) {
            runCatching { URI(card?.origin.orEmpty()).host.orEmpty() }.getOrDefault(card?.origin.orEmpty())
        }
        val titlePrefix = when (card?.mode) {
            "signup" -> "Create account"
            "verify" -> "Verify account"
            else -> "Sign in"
        }
        val expired = (card?.expiresAt ?: Long.MAX_VALUE) <= System.currentTimeMillis()
        val fieldValues = remember(request.id) { mutableStateMapOf<String, String>() }
        val revealedFields = remember(request.id) { mutableStateMapOf<String, Boolean>() }
        val checkedTerms = remember(request.id) { mutableStateMapOf<String, Boolean>() }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(if (showAvatar) 6.dp else 0.dp),
        ) {
            if (showAvatar) {
                StitchCharacterAvatar(
                    label = agentName,
                    accentHex = teammate?.avatar?.color,
                    shapeName = teammate?.avatar?.shape,
                    imageUrl = teammate?.avatar?.imageUrl,
                    size = 26.dp,
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (card?.mode == "signup") "Secure website sign-up" else "Secure website sign-in",
                        style = MaterialTheme.typography.labelSmall,
                        color = agentAccent,
                    )
                    StitchBadge(
                        text = if (settled) request.status.replaceFirstChar { it.uppercase() } else if (expired) "Expired" else "Secure",
                        tone = if (settled) BadgeTone.SUCCESS else if (expired) BadgeTone.WARNING else BadgeTone.PRIMARY,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AppServiceLogo(
                        logoUrl = card?.iconUrl,
                        baseUrl = card?.origin,
                        fallbackLabel = originHost.ifBlank { "Web" },
                        size = 38.dp,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text("$titlePrefix · ${originHost.ifBlank { "Website" }}", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                        if (!card?.origin.isNullOrBlank()) {
                            Text(card!!.origin, style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
                val cleanDetail = cardPlainText(request.detail, "")
                if (cleanDetail.isNotBlank()) {
                    Text(cleanDetail, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                }
                if (settled) {
                    Text(
                        text = request.response?.ifBlank { request.status.replaceFirstChar { it.uppercase() } } ?: "Submitted",
                        style = MaterialTheme.typography.labelMedium,
                        color = s.success,
                    )
                } else if (card != null && !setupJson.isNullOrBlank()) {
                    card.fields.forEach { f ->
                        val isSecret = f.type.equals("password", ignoreCase = true)
                        val visible = revealedFields[f.id] == true
                        StitchInputField(
                            value = fieldValues[f.id].orEmpty(),
                            onValueChange = { fieldValues[f.id] = it },
                            label = if (f.required) f.label else "${f.label} (optional)",
                            mono = isSecret,
                            visualTransformation = if (isSecret && !visible) PasswordVisualTransformation() else VisualTransformation.None,
                            trailingIcon = if (isSecret) {
                                {
                                    IconButton(onClick = { revealedFields[f.id] = !visible }) {
                                        Icon(
                                            if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = if (visible) "Hide" else "Show",
                                            tint = s.onSurfaceVariant,
                                        )
                                    }
                                }
                            } else null,
                        )
                    }
                    card.terms.forEach { term ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Checkbox(
                                checked = checkedTerms[term.id] == true,
                                onCheckedChange = { checkedTerms[term.id] = it },
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(term.label, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                                if (!term.url.isNullOrBlank() && term.url.startsWith("https://")) {
                                    Text(
                                        text = "Read terms",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = s.primary,
                                        modifier = Modifier.clickable { runCatching { uriHandler.openUri(term.url) } },
                                    )
                                }
                            }
                        }
                    }
                    Text(
                        text = "Submitted in your agent's private browser. Credentials never enter chat.",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        color = s.onSurfaceVariant,
                    )
                    val requiredFieldsOk = card.fields.filter { it.required }.all { !fieldValues[it.id].isNullOrBlank() }
                    val requiredTermsOk = card.terms.filter { it.required }.all { checkedTerms[it.id] == true }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StitchPrimaryButton(
                            text = if (expired) "Card expired" else "$titlePrefix & continue",
                            enabled = !expired && requiredFieldsOk && requiredTermsOk,
                            onClick = {
                                val vals = card.fields.associate { it.id to fieldValues[it.id].orEmpty() }
                                val acceptedTerms = card.terms.filter { checkedTerms[it.id] == true }.map { it.id }
                                fieldValues.clear()
                                onSubmitBrowserAuth(request.id, setupJson, vals, acceptedTerms)
                            },
                            modifier = Modifier.weight(1f),
                        )
                        StitchSecondaryButton(
                            text = "Cancel",
                            outlined = true,
                            onClick = { onAction("dismiss", null, null, false, null, null) },
                        )
                    }
                }
            }
        }
        return
    }

    // 3. INLINE SECURE CREDENTIAL CARD (API key / Structured OAuth2-Basic-Headers / SSH — exact parity with cwCredentialFormHtml)
    if (request.kind == "credential") {
        val cred = remember(request.id, request.credential) { request.credentialSpec }
        val setupJson = request.credentialSetupJson
        val settled = request.status != "open" && request.status != "pending"
        val isSsh = cred?.providerHint.equals("ssh", ignoreCase = true) || cred?.baseUrl?.startsWith("ssh:", ignoreCase = true) == true
        val structuredFields = cred?.auth?.fields.orEmpty()
        val reauth = !cred?.connectionId.isNullOrBlank()

        var label by remember(request.id) {
            mutableStateOf(cred?.label ?: cred?.providerHint?.replaceFirstChar { it.uppercase() } ?: request.title.ifBlank { "API Connection" })
        }
        var baseUrl by remember(request.id) { mutableStateOf(cred?.baseUrl.orEmpty()) }
        var token by remember(request.id) { mutableStateOf("") }
        var showToken by remember(request.id) { mutableStateOf(false) }
        val namedValues = remember(request.id) { mutableStateMapOf<String, String>() }
        val revealedNamed = remember(request.id) { mutableStateMapOf<String, Boolean>() }

        // SSH host-key verification state
        var sshFingerprint by remember(request.id) { mutableStateOf("") }
        var sshCheckedAddr by remember(request.id) { mutableStateOf("") }
        var sshConfirmed by remember(request.id) { mutableStateOf(false) }
        var sshProbing by remember(request.id) { mutableStateOf(false) }
        var sshError by remember(request.id) { mutableStateOf<String?>(null) }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(if (showAvatar) 6.dp else 0.dp),
        ) {
            if (showAvatar) {
                StitchCharacterAvatar(
                    label = agentName,
                    accentHex = teammate?.avatar?.color,
                    shapeName = teammate?.avatar?.shape,
                    imageUrl = teammate?.avatar?.imageUrl,
                    size = 26.dp,
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "$agentName • Secure credential request",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        color = agentAccent,
                    )
                    if (settled) {
                        StitchBadge(
                            text = request.status.replaceFirstChar { it.uppercase() },
                            tone = if (request.status == "provided" || request.status == "accepted") BadgeTone.SUCCESS else BadgeTone.NEUTRAL,
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AppServiceLogo(
                        serviceSlug = cred?.providerHint,
                        baseUrl = cred?.baseUrl,
                        fallbackLabel = label,
                        servicesCatalog = servicesCatalog,
                        size = 36.dp,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = cred?.label?.ifBlank { null } ?: cardPlainText(request.title, "Connect ${cred?.providerHint ?: "service"}"),
                            style = MaterialTheme.typography.titleSmall,
                            color = s.onSurface,
                        )
                        if (!cred?.baseUrl.isNullOrBlank()) {
                            Text(
                                text = cred!!.baseUrl!!,
                                style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace, fontSize = 10.5.sp),
                                color = s.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (cred?.auth?.type == "oauth2" && !cred.auth.tokenUrl.isNullOrBlank()) {
                            Text(
                                text = "Auth service: ${cred.auth.tokenUrl}",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                color = s.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                val cleanDetail = cardPlainText(request.detail, "")
                if (cleanDetail.isNotBlank()) {
                    Text(cleanDetail, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                }

                if (settled) {
                    if (!request.response.isNullOrBlank()) {
                        Text(request.response, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                    }
                } else if (isSsh) {
                    StitchInputField(value = label, onValueChange = { label = it }, label = "Connection name")
                    StitchInputField(
                        value = baseUrl,
                        onValueChange = {
                            baseUrl = it
                            if (it.trim() != sshCheckedAddr) {
                                sshFingerprint = ""
                                sshConfirmed = false
                            }
                        },
                        label = "SSH address",
                        placeholder = "ssh://user@host:22",
                        mono = true,
                    )
                    StitchInputField(
                        value = token,
                        onValueChange = { token = it },
                        label = "SSH password",
                        mono = true,
                        visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { showToken = !showToken }) {
                                Icon(if (showToken) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = null, tint = s.onSurfaceVariant)
                            }
                        },
                    )
                    StitchSecondaryButton(
                        text = if (sshProbing) "Checking server key…" else "Check server key",
                        outlined = true,
                        enabled = !sshProbing && baseUrl.isNotBlank(),
                        onClick = {
                            sshProbing = true
                            sshError = null
                            onProbeSshHostKey(request.id, baseUrl.trim()) { res ->
                                sshProbing = false
                                res.onSuccess { fp ->
                                    sshFingerprint = fp
                                    sshCheckedAddr = baseUrl.trim()
                                    sshConfirmed = false
                                }.onFailure { err ->
                                    sshError = err.message ?: "Could not read server key."
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (sshFingerprint.isNotBlank()) {
                        Text(
                            text = "Server fingerprint: $sshFingerprint",
                            style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                            color = s.onSurface,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(s.surfaceContainerLow)
                                .padding(8.dp),
                        )
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Checkbox(checked = sshConfirmed, onCheckedChange = { sshConfirmed = it })
                            Text("Fingerprint matches my server key.", style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                        }
                    }
                    sshError?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = s.error) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StitchPrimaryButton(
                            text = "Test & continue",
                            enabled = token.isNotBlank() && sshFingerprint.isNotBlank() && sshConfirmed && sshCheckedAddr == baseUrl.trim(),
                            onClick = {
                                val pw = token
                                token = ""
                                onSubmitSshCredential(request.id, label, baseUrl.trim(), pw, sshFingerprint)
                            },
                            modifier = Modifier.weight(1f),
                        )
                        StitchSecondaryButton(text = "Dismiss", outlined = true, onClick = { onAction("dismiss", null, null, false, null, null) })
                    }
                } else {
                    if (structuredFields.isNotEmpty()) {
                        structuredFields.forEach { field ->
                            val isSecret = field.secret || field.inputType == "password"
                            val visible = revealedNamed[field.id] == true
                            StitchInputField(
                                value = namedValues[field.id].orEmpty(),
                                onValueChange = { namedValues[field.id] = it },
                                label = if (field.required) field.label else "${field.label} (optional)",
                                mono = isSecret,
                                visualTransformation = if (isSecret && !visible) PasswordVisualTransformation() else VisualTransformation.None,
                                trailingIcon = if (isSecret) {
                                    {
                                        IconButton(onClick = { revealedNamed[field.id] = !visible }) {
                                            Icon(
                                                if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                                contentDescription = if (visible) "Hide" else "Show",
                                                tint = s.onSurfaceVariant,
                                            )
                                        }
                                    }
                                } else null,
                            )
                        }
                    } else {
                        if (setupJson.isNullOrBlank()) {
                            StitchInputField(value = label, onValueChange = { label = it }, label = "Connection name")
                            StitchInputField(value = baseUrl, onValueChange = { baseUrl = it }, label = "API address", mono = true)
                        }
                        StitchInputField(
                            value = token,
                            onValueChange = { token = it },
                            label = "API key or access token",
                            placeholder = "Paste your key here",
                            mono = true,
                            visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                IconButton(onClick = { showToken = !showToken }) {
                                    Icon(
                                        imageVector = if (showToken) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                        contentDescription = if (showToken) "Hide key" else "Show key",
                                        tint = s.onSurfaceVariant,
                                    )
                                }
                            },
                        )
                    }
                    Text(
                        text = "Saved securely in Gitu. Never sent to the model or chat history.",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        color = s.onSurfaceVariant,
                    )
                    val canSubmit = if (structuredFields.isNotEmpty()) {
                        structuredFields.filter { it.required }.all { !namedValues[it.id].isNullOrBlank() }
                    } else {
                        token.isNotBlank() && (!setupJson.isNullOrBlank() || baseUrl.startsWith("http"))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StitchPrimaryButton(
                            text = if (reauth) "Update & continue" else "Connect & continue",
                            enabled = canSubmit,
                            onClick = {
                                val capturedToken = token
                                val capturedValues = if (structuredFields.isNotEmpty()) {
                                    structuredFields.associate { it.id to namedValues[it.id].orEmpty() }
                                } else null
                                token = ""
                                namedValues.clear()
                                onSubmitCredential(
                                    request.id,
                                    label,
                                    cred?.providerHint?.ifBlank { "custom" } ?: "custom",
                                    baseUrl,
                                    capturedToken,
                                    cred?.validationPath ?: "/",
                                    setupJson,
                                    capturedValues,
                                )
                            },
                            modifier = Modifier.weight(1f),
                        )
                        StitchSecondaryButton(
                            text = "Dismiss",
                            outlined = true,
                            onClick = { onAction("dismiss", null, null, false, null, null) },
                        )
                    }
                }
            }
        }
        return
    }

    // 4. APP ACTION APPROVAL CARD (exact parity with web cwAppApprovalPresentation — ZERO raw JSON!)
    val appApproval = remember(request) { parseAppApprovalAction(request) }
    if (appApproval != null) {
        val settled = request.status != "open" && request.status != "pending"
        val editedValues = remember(request.id) {
            mutableStateMapOf<String, String>().apply {
                appApproval.fields.forEach { put(it.key, it.initialText) }
            }
        }
        var hasEdited by remember(request.id) { mutableStateOf(false) }
        var jsonError by remember(request.id) { mutableStateOf<String?>(null) }
        val expandedAdvanced = remember(request.id) { mutableStateMapOf<String, Boolean>() }

        fun buildReviewedArgs(): JsonObject? {
            return try {
                jsonError = null
                buildJsonObject {
                    appApproval.fields.forEach { f ->
                        val rawVal = editedValues[f.key] ?: f.initialText
                        if (f.isJson) {
                            put(f.key, cardJsonParser.parseToJsonElement(rawVal))
                        } else {
                            put(f.key, JsonPrimitive(rawVal))
                        }
                    }
                }
            } catch (e: Exception) {
                jsonError = "Check the JSON formatting in advanced fields."
                null
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(if (showAvatar) 6.dp else 0.dp),
        ) {
            if (showAvatar) {
                StitchCharacterAvatar(
                    label = agentName,
                    accentHex = teammate?.avatar?.color,
                    shapeName = teammate?.avatar?.shape,
                    imageUrl = teammate?.avatar?.imageUrl,
                    size = 26.dp,
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("App approval", style = MaterialTheme.typography.labelSmall, color = s.tertiary)
                    StitchBadge(
                        text = if (settled) {
                            if (request.response == "Always allowed") "Always allowed"
                            else request.status.replaceFirstChar { it.uppercase() }
                        } else "Review required",
                        tone = if (settled) BadgeTone.SUCCESS else BadgeTone.WARNING,
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AppServiceLogo(
                        serviceSlug = appApproval.service,
                        fallbackLabel = appApproval.serviceName,
                        servicesCatalog = servicesCatalog,
                        size = 36.dp,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(appApproval.actionTitle, style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                        Text("${appApproval.serviceName} · Connected account", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                    }
                }

                if (!appApproval.valid) {
                    Text(
                        text = "The action details are incomplete. Ask your teammate to create a fresh review.",
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurfaceVariant,
                    )
                } else if (settled) {
                    appApproval.fields.filter { it.summaryText.isNotBlank() }.forEach { f ->
                        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text(f.label, style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                            Text(f.summaryText, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                        }
                    }
                } else {
                    appApproval.fields.forEach { f ->
                        if (!f.isJson) {
                            val multiline = f.key in setOf("text", "body", "message_body")
                            StitchInputField(
                                value = editedValues[f.key].orEmpty(),
                                onValueChange = {
                                    editedValues[f.key] = it
                                    hasEdited = true
                                },
                                label = f.label,
                                singleLine = !multiline,
                                maxLines = if (multiline) 6 else 1,
                            )
                        } else {
                            if (f.isImportant && f.summaryText.isNotBlank()) {
                                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                    Text(f.label, style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                                    Text(f.summaryText, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                                }
                            }
                            val open = expandedAdvanced[f.key] == true
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { expandedAdvanced[f.key] = !open }
                                    .padding(vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(
                                    if (open) Icons.Default.ExpandLess else Icons.Default.ChevronRight,
                                    contentDescription = null,
                                    tint = s.onSurfaceVariant,
                                    modifier = Modifier.size(15.dp),
                                )
                                Text("${f.label} · Advanced details", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                            }
                            if (open) {
                                StitchInputField(
                                    value = editedValues[f.key].orEmpty(),
                                    onValueChange = {
                                        editedValues[f.key] = it
                                        hasEdited = true
                                    },
                                    label = "${f.label} (JSON)",
                                    mono = true,
                                    singleLine = false,
                                    maxLines = 5,
                                )
                            }
                        }
                    }
                    Text(
                        text = if (appApproval.messageReview) {
                            "Edit before approving. Email messages are reviewed each time."
                        } else {
                            "Accept once, or always allow this tool for $agentName."
                        },
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        color = s.onSurfaceVariant,
                    )
                    jsonError?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = s.error) }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        val approveLabel = when {
                            appApproval.nativeSend -> "Approve send"
                            appApproval.messageReview -> "Approve"
                            else -> "Accept"
                        }
                        StitchPrimaryButton(
                            text = approveLabel,
                            onClick = {
                                val reviewed = buildReviewedArgs() ?: return@StitchPrimaryButton
                                onAction("accept", null, reviewed, false, null, null)
                            },
                        )
                        if (appApproval.nativeSend) {
                            StitchSecondaryButton(
                                text = "Save draft",
                                outlined = true,
                                onClick = {
                                    val reviewed = buildReviewedArgs() ?: return@StitchSecondaryButton
                                    onAction("save-draft", null, reviewed, false, null, null)
                                },
                            )
                        }
                        if (!appApproval.messageReview && !hasEdited) {
                            StitchSecondaryButton(
                                text = "Always allow",
                                outlined = true,
                                onClick = { onAction("always-allow", null, null, false, null, null) },
                            )
                        }
                        StitchSecondaryButton(
                            text = "Dismiss",
                            outlined = true,
                            onClick = { onAction("dismiss", null, null, false, null, null) },
                        )
                    }
                }
            }
        }
        return
    }

    // 5. QUESTION / APPROVAL / PLAN REVIEW / COMPUTER CONTROL / PERMISSION CARD (exact Web CHAT_QUESTION_JS parity)
    val presentation = remember(request) { cardRequestPresentation(request) }
    val settled = request.status != "open" && request.status != "pending"
    val isChiefResolved = settled && request.resolvedBy == "chief"
    val hasChoices = request.options.isNotEmpty()

    var selectedOption by remember(request.id) { mutableStateOf("") }
    var customAnswer by remember(request.id) { mutableStateOf("") }
    var customOpen by remember(request.id) { mutableStateOf(!hasChoices) }
    var showTechnical by remember(request.id) { mutableStateOf(false) }
    var rememberForChief by remember(request.id) { mutableStateOf(false) }
    var chiefPattern by remember(request.id) { mutableStateOf(request.title) }
    var chiefScope by remember(request.id) { mutableStateOf("global") }
    var scopeMenuOpen by remember(request.id) { mutableStateOf(false) }

    val accentBarColor = when {
        settled && isChiefResolved -> agentAccent.copy(alpha = 0.7f)
        settled -> s.outlineVariant
        presentation.kind == "approval" || presentation.kind == "plan_review" || request.kind == "permission" -> s.tertiary
        presentation.isComputer -> s.primary
        else -> agentAccent
    }
    val cardKindLabel = when {
        request.kind == "permission" -> "Permission request"
        request.kind == "recommendation" -> "Recommendation"
        else -> presentation.label
    }
    val stateChipText = when {
        isChiefResolved -> "Handled by Chief"
        request.status == "answered" -> "Answered"
        request.status == "approved" -> "Approved"
        request.status == "accepted" -> "Accepted"
        request.status == "denied" -> "Denied"
        request.status == "dismissed" -> "Dismissed"
        settled -> request.status.replaceFirstChar { it.uppercase() }
        request.kind == "permission" -> "Needs permission"
        else -> presentation.openStateLabel
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(if (showAvatar) 6.dp else 0.dp),
    ) {
        if (showAvatar) {
            StitchCharacterAvatar(
                label = agentName,
                accentHex = teammate?.avatar?.color,
                shapeName = teammate?.avatar?.shape,
                imageUrl = teammate?.avatar?.imageUrl,
                size = 26.dp,
            )
        }
        Row(
            modifier = Modifier
                .weight(1f)
                .height(IntrinsicSize.Min)
                .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                .background(s.surfaceContainerLowest)
                .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp)),
        ) {
            // Left semantic accent stripe matching .chat-question::before
            Box(
                modifier = Modifier
                    .width(3.5.dp)
                    .fillMaxHeight()
                    .background(accentBarColor),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // Header: label pill + state badge
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(accentBarColor.copy(alpha = 0.14f))
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Icon(
                            imageVector = when {
                                presentation.isComputer -> Icons.Default.DesktopWindows
                                presentation.kind == "approval" || request.kind == "permission" -> Icons.Default.VerifiedUser
                                presentation.kind == "plan_review" -> Icons.Default.Description
                                else -> Icons.Default.HelpOutline
                            },
                            contentDescription = null,
                            tint = if (settled) s.onSurfaceVariant else accentBarColor,
                            modifier = Modifier.size(13.dp),
                        )
                        Text(
                            text = cardKindLabel,
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp),
                            color = if (settled) s.onSurfaceVariant else accentBarColor,
                        )
                    }
                    StitchBadge(
                        text = stateChipText,
                        tone = when {
                            isChiefResolved -> BadgeTone.PRIMARY
                            request.status in setOf("answered", "approved", "accepted") -> BadgeTone.SUCCESS
                            request.status in setOf("denied", "dismissed") -> BadgeTone.NEUTRAL
                            presentation.kind == "approval" || presentation.kind == "plan_review" || request.kind == "permission" -> BadgeTone.WARNING
                            else -> BadgeTone.NEUTRAL
                        },
                    )
                }

                // Humanized title & clean detail
                Text(
                    text = presentation.title,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = s.onSurface,
                )
                if (presentation.detail.isNotBlank()) {
                    Text(
                        text = presentation.detail,
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurfaceVariant,
                    )
                }

                // Collapsible Technical details (never dumps raw code/JSON inline)
                if (presentation.technical.isNotBlank()) {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { showTechnical = !showTechnical }
                            .padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            if (showTechnical) Icons.Default.ExpandLess else Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = s.onSurfaceVariant,
                            modifier = Modifier.size(15.dp),
                        )
                        Text("Technical details", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                    }
                    if (showTechnical) {
                        Text(
                            text = presentation.technical,
                            style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace, fontSize = 11.sp),
                            color = s.onSurfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(s.surfaceContainerLow)
                                .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                                .padding(10.dp),
                        )
                    }
                }

                // Open computer handoff CTA
                if (presentation.isComputer && !settled && request.agentId.isNotBlank()) {
                    StitchPrimaryButton(
                        text = "Open computer",
                        icon = Icons.Default.DesktopWindows,
                        onClick = { onOpenComputer(request.agentId, agentName) },
                    )
                }

                if (settled) {
                    val answerText = request.response?.trim().orEmpty()
                    if (answerText.isNotBlank()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(s.surfaceContainerLow)
                                .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                                .padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            Text(
                                text = when {
                                    isChiefResolved && request.status == "approved" -> "${request.resolvedByLabel ?: "Chief of Staff"} approved"
                                    isChiefResolved -> "Chief of Staff answered"
                                    else -> "Your answer"
                                },
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                                color = if (isChiefResolved) agentAccent else s.onSurfaceVariant,
                            )
                            Text(answerText, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                        }
                    }
                } else {
                    when (request.kind) {
                        "permission" -> {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                StitchPrimaryButton(
                                    text = "Allow",
                                    onClick = { onAction("approve", null, null, false, null, null) },
                                    modifier = Modifier.weight(1f),
                                )
                                StitchSecondaryButton(
                                    text = "Deny",
                                    outlined = true,
                                    onClick = { onAction("deny", null, null, false, null, null) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                        "recommendation" -> {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                StitchPrimaryButton(
                                    text = "Accept",
                                    onClick = { onAction("accept", null, null, false, null, null) },
                                    modifier = Modifier.weight(1f),
                                )
                                StitchSecondaryButton(
                                    text = "Dismiss",
                                    outlined = true,
                                    onClick = { onAction("dismiss", null, null, false, null, null) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                        else -> {
                            // Wrapped suggested options with Recommended badge + Custom answer toggle
                            if (hasChoices) {
                                val customToggleLabel = if (presentation.kind == "approval") "Add note" else "Custom answer"
                                @OptIn(ExperimentalLayoutApi::class)
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    request.options.forEach { opt ->
                                        val isSel = selectedOption == opt
                                        val isRec = !request.recommended.isNullOrBlank() && request.recommended == opt
                                        Surface(
                                            shape = RoundedCornerShape(10.dp),
                                            color = when {
                                                isSel -> agentAccent.copy(alpha = 0.16f)
                                                isRec -> agentAccent.copy(alpha = 0.08f)
                                                else -> s.surfaceContainerLow
                                            },
                                            border = BorderStroke(
                                                width = if (isSel) 1.5.dp else 1.dp,
                                                color = when {
                                                    isSel -> agentAccent
                                                    isRec -> agentAccent.copy(alpha = 0.55f)
                                                    else -> s.outlineVariant
                                                },
                                            ),
                                            modifier = Modifier.clickable {
                                                selectedOption = if (isSel) "" else opt
                                            },
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 11.dp, vertical = 8.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            ) {
                                                if (isSel) {
                                                    Icon(Icons.Default.Check, contentDescription = null, tint = agentAccent, modifier = Modifier.size(14.dp))
                                                }
                                                if (isRec) {
                                                    Text(
                                                        text = "RECOMMENDED",
                                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, fontWeight = FontWeight.Bold),
                                                        color = agentAccent,
                                                        modifier = Modifier
                                                            .clip(RoundedCornerShape(4.dp))
                                                            .background(agentAccent.copy(alpha = 0.16f))
                                                            .padding(horizontal = 5.dp, vertical = 1.dp),
                                                    )
                                                }
                                                Text(opt, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                                            }
                                        }
                                    }
                                    Surface(
                                        shape = RoundedCornerShape(10.dp),
                                        color = if (customOpen) agentAccent.copy(alpha = 0.10f) else Color.Transparent,
                                        border = BorderStroke(1.dp, if (customOpen) agentAccent else s.outlineVariant),
                                        modifier = Modifier.clickable { customOpen = !customOpen },
                                    ) {
                                        Text(
                                            text = customToggleLabel,
                                            style = MaterialTheme.typography.labelMedium,
                                            color = if (customOpen) s.onSurface else s.onSurfaceVariant,
                                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 8.dp),
                                        )
                                    }
                                }
                            }

                            if (customOpen || !hasChoices) {
                                StitchInputField(
                                    value = customAnswer,
                                    onValueChange = { customAnswer = it },
                                    label = if (hasChoices) {
                                        if (presentation.kind == "approval") "Note (optional)" else "Custom answer"
                                    } else "Your answer",
                                    placeholder = if (hasChoices) "Write a custom answer or extra details…" else "Write your answer…",
                                    singleLine = false,
                                    maxLines = 4,
                                )
                            }

                            // Remember this answer for Chief of Staff (matches Web)
                            if (presentation.canRemember) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(s.surfaceContainerLow.copy(alpha = 0.7f))
                                        .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                                        .padding(horizontal = 8.dp, vertical = 6.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable { rememberForChief = !rememberForChief },
                                    ) {
                                        Checkbox(
                                            checked = rememberForChief,
                                            onCheckedChange = { rememberForChief = it },
                                            modifier = Modifier.size(32.dp),
                                        )
                                        Text(
                                            text = "Remember this answer for Chief of Staff",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.onSurfaceVariant,
                                        )
                                    }
                                    if (rememberForChief) {
                                        StitchInputField(
                                            value = chiefPattern,
                                            onValueChange = { chiefPattern = it },
                                            label = "Match phrase",
                                            placeholder = "Question text or /regex/",
                                        )
                                        Box {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .background(s.surfaceContainerLowest)
                                                    .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                                                    .clickable { scopeMenuOpen = true }
                                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Text(
                                                    text = if (chiefScope == "conversation") "Scope: This chat only" else "Scope: All chats",
                                                    style = MaterialTheme.typography.labelMedium,
                                                    color = s.onSurface,
                                                )
                                                Icon(Icons.Default.KeyboardArrowDown, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(18.dp))
                                            }
                                            DropdownMenu(expanded = scopeMenuOpen, onDismissRequest = { scopeMenuOpen = false }) {
                                                DropdownMenuItem(
                                                    text = { Text("All chats") },
                                                    onClick = { chiefScope = "global"; scopeMenuOpen = false },
                                                )
                                                DropdownMenuItem(
                                                    text = { Text("This chat only") },
                                                    onClick = { chiefScope = "conversation"; scopeMenuOpen = false },
                                                )
                                            }
                                        }
                                    }
                                }
                            }

                            val combinedResponse = buildString {
                                val sel = selectedOption.trim()
                                val extra = customAnswer.trim()
                                when {
                                    sel.isNotEmpty() && extra.isNotEmpty() -> {
                                        if (extra.startsWith(sel)) append(extra)
                                        else append("$sel\n$extra")
                                    }
                                    sel.isNotEmpty() -> append(sel)
                                    else -> append(extra)
                                }
                            }

                            StitchPrimaryButton(
                                text = "Send answer",
                                enabled = combinedResponse.isNotBlank(),
                                onClick = {
                                    onAction(
                                        "answer",
                                        combinedResponse,
                                        null,
                                        rememberForChief,
                                        chiefPattern.takeIf { it.isNotBlank() },
                                        chiefScope,
                                    )
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        }
    }
}
