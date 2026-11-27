package dev.agentgitu.mobile.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.view.Surface
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.NoPhotography
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import dev.agentgitu.mobile.ui.components.StitchCircleIconButton
import dev.agentgitu.mobile.ui.components.StitchPrimaryButton
import dev.agentgitu.mobile.ui.components.StitchSecondaryButton
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import java.io.File

private val CameraCanvas = Color(0xFF09090B)
private val CameraInk = Color(0xFFFAFAFA)

/** Full-screen, Stitch-styled camera that captures a photo into the chat uploader. */
@Composable
fun CameraCaptureDialog(
    onDismiss: () -> Unit,
    onCaptured: (File) -> Unit,
) {
    val context = LocalContext.current
    var permissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var permissionAsked by remember { mutableStateOf(permissionGranted) }
    var cameraError by remember { mutableStateOf<String?>(null) }
    var captureError by remember { mutableStateOf<String?>(null) }
    var cameraKey by remember { mutableIntStateOf(0) }
    var torchOn by remember { mutableStateOf(false) }
    var hasFlash by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var capturing by remember { mutableStateOf(false) }
    var entered by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permissionGranted = granted
        permissionAsked = true
        if (!granted) cameraError = null
    }

    LaunchedEffect(Unit) { entered = true }
    LaunchedEffect(Unit) {
        if (!permissionGranted) {
            permissionAsked = true
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    val openSettings: () -> Unit = {
        runCatching {
            context.startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${context.packageName}"),
                ),
            )
        }
        Unit
    }

    val capturePhoto: () -> Unit = {
        val capture = imageCapture
        if (capture != null && !capturing) {
            capturing = true
            captureError = null
            val file = File(context.cacheDir, "gitu-photo-${System.currentTimeMillis()}.jpg")
            val output = ImageCapture.OutputFileOptions.Builder(file).build()
            capture.takePicture(
                output,
                ContextCompat.getMainExecutor(context),
                object : ImageCapture.OnImageSavedCallback {
                    override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                        capturing = false
                        if (file.length() > 0) {
                            onCaptured(file)
                        } else {
                            captureError = "The camera returned an empty photo. Try again."
                        }
                    }

                    override fun onError(exception: ImageCaptureException) {
                        capturing = false
                        captureError = exception.message ?: "Could not capture the photo."
                    }
                },
            )
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(CameraCanvas),
        ) {
            if (permissionGranted && cameraError == null) {
                key(cameraKey) {
                    CameraCapturePreview(
                        modifier = Modifier.fillMaxSize(),
                        onCameraError = { cameraError = it },
                        onCameraReady = { readyCamera, readyCapture ->
                            camera = readyCamera
                            imageCapture = readyCapture
                            hasFlash = readyCamera?.cameraInfo?.hasFlashUnit() == true
                        },
                    )
                }

                CameraGridOverlay()

                AnimatedVisibility(
                    visible = entered,
                    enter = fadeIn(tween(200)),
                    modifier = Modifier.align(Alignment.TopCenter),
                ) {
                    CameraTopBar(
                        hasFlash = hasFlash,
                        torchOn = torchOn,
                        onClose = onDismiss,
                        onToggleTorch = {
                            val next = !torchOn
                            torchOn = next
                            camera?.cameraControl?.enableTorch(next)
                        },
                    )
                }

                AnimatedVisibility(
                    visible = entered,
                    enter = fadeIn(tween(220)),
                    modifier = Modifier.align(Alignment.BottomCenter),
                ) {
                    CameraBottomBar(
                        capturing = capturing,
                        error = captureError,
                        onCapture = capturePhoto,
                    )
                }

                if (capturing) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.22f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(34.dp),
                            strokeWidth = 2.5.dp,
                            color = CameraInk,
                        )
                    }
                }
            } else {
                CameraMessagePanel(
                    title = if (cameraError != null) "Camera unavailable" else "Camera access needed",
                    message = cameraError
                        ?: "Allow camera access to take a photo for this chat. The photo is uploaded when you capture it.",
                    icon = if (cameraError != null) Icons.Default.CameraAlt else Icons.Default.NoPhotography,
                    primaryLabel = if (cameraError != null || permissionAsked) "Try camera again" else "Allow camera",
                    onPrimary = {
                        if (!permissionGranted) {
                            permissionAsked = true
                            permissionLauncher.launch(Manifest.permission.CAMERA)
                        } else {
                            cameraError = null
                            torchOn = false
                            hasFlash = false
                            cameraKey += 1
                        }
                    },
                    onOpenSettings = if (!permissionGranted) openSettings else null,
                    onClose = onDismiss,
                )
            }
        }
    }
}

@Composable
private fun CameraCapturePreview(
    modifier: Modifier,
    onCameraError: (String) -> Unit,
    onCameraReady: (Camera?, ImageCapture?) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnError by rememberUpdatedState(onCameraError)
    val currentOnReady by rememberUpdatedState(onCameraReady)
    val previewView = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            setBackgroundColor(android.graphics.Color.BLACK)
        }
    }
    var provider by remember { mutableStateOf<ProcessCameraProvider?>(null) }

    DisposableEffect(lifecycleOwner) {
        val future = ProcessCameraProvider.getInstance(context)
        val listener = Runnable {
            try {
                val cameraProvider = future.get()
                val preview = Preview.Builder()
                    .build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }
                val capture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()
                cameraProvider.unbindAll()
                val camera = cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    capture,
                )
                capture.targetRotation = previewView.display?.rotation ?: Surface.ROTATION_0
                provider = cameraProvider
                currentOnReady(camera, capture)
            } catch (error: Throwable) {
                currentOnError(error.message ?: "The camera could not start on this device.")
            }
        }
        future.addListener(listener, ContextCompat.getMainExecutor(context))
        onDispose {
            runCatching { provider?.unbindAll() }
        }
    }

    AndroidView(factory = { previewView }, modifier = modifier)
}

@Composable
private fun CameraGridOverlay() {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val line = 1.dp.toPx()
        val color = Color.White.copy(alpha = 0.14f)
        for (index in 1..2) {
            val x = size.width * index / 3f
            val y = size.height * index / 3f
            drawLine(color, Offset(x, 0f), Offset(x, size.height), line, StrokeCap.Round)
            drawLine(color, Offset(0f, y), Offset(size.width, y), line, StrokeCap.Round)
        }
    }
}

@Composable
private fun CameraTopBar(
    hasFlash: Boolean,
    torchOn: Boolean,
    onClose: () -> Unit,
    onToggleTorch: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CameraGlassIconButton(
            icon = Icons.Default.Close,
            contentDescription = "Close camera",
            onClick = onClose,
        )
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "Take a photo",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = CameraInk,
            )
            Text(
                text = "Attaches to your message",
                style = MaterialTheme.typography.labelSmall,
                color = CameraInk.copy(alpha = 0.62f),
            )
        }
        if (hasFlash) {
            CameraGlassIconButton(
                icon = if (torchOn) Icons.Default.FlashOn else Icons.Default.FlashOff,
                contentDescription = if (torchOn) "Turn flashlight off" else "Turn flashlight on",
                onClick = onToggleTorch,
            )
        } else {
            Spacer(modifier = Modifier.size(44.dp))
        }
    }
}

@Composable
private fun CameraBottomBar(
    capturing: Boolean,
    error: String?,
    onCapture: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (!error.isNullOrBlank()) {
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFFFFB4AB),
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.Black.copy(alpha = 0.68f))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
        ShutterButton(capturing = capturing, onClick = onCapture)
        Text(
            text = if (capturing) "Saving photo…" else "Captured photos upload in the background",
            style = MaterialTheme.typography.labelSmall,
            color = CameraInk.copy(alpha = 0.72f),
        )
    }
}

@Composable
private fun ShutterButton(capturing: Boolean, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    Box(
        modifier = Modifier
            .size(84.dp)
            .clip(CircleShape)
            .border(4.dp, CameraInk.copy(alpha = if (capturing) 0.5f else 1f), CircleShape)
            .padding(7.dp)
            .clip(CircleShape)
            .background(CameraInk.copy(alpha = if (capturing) 0.5f else 1f))
            .clickable(enabled = !capturing) {
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        if (capturing) {
            CircularProgressIndicator(
                modifier = Modifier.size(26.dp),
                strokeWidth = 2.5.dp,
                color = CameraCanvas,
            )
        }
    }
}

@Composable
private fun CameraMessagePanel(
    title: String,
    message: String,
    icon: ImageVector,
    primaryLabel: String,
    onPrimary: () -> Unit,
    onOpenSettings: (() -> Unit)?,
    onClose: () -> Unit,
) {
    val palette = LocalStitchPalette.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            StitchCircleIconButton(
                icon = Icons.Default.Close,
                contentDescription = "Close camera",
                onClick = onClose,
            )
        }
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .widthIn(max = 420.dp)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(78.dp)
                    .clip(CircleShape)
                    .background(palette.surfaceContainerLow),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = palette.onSurfaceVariant,
                    modifier = Modifier.size(34.dp),
                )
            }
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                color = palette.onSurface,
                textAlign = TextAlign.Center,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = palette.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            StitchPrimaryButton(
                text = primaryLabel,
                onClick = onPrimary,
                modifier = Modifier.fillMaxWidth(),
            )
            StitchSecondaryButton(
                text = "Close",
                onClick = onClose,
                modifier = Modifier.fillMaxWidth(),
            )
            if (onOpenSettings != null) {
                TextButton(onClick = onOpenSettings) {
                    Text(
                        text = "Open Android settings",
                        color = palette.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CameraGlassIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.42f))
            .border(1.dp, Color.White.copy(alpha = 0.16f), CircleShape)
            .clickable {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = CameraInk,
            modifier = Modifier.size(21.dp),
        )
    }
}
