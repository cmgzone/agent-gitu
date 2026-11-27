package dev.agentgitu.mobile.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.NoPhotography
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import dev.agentgitu.mobile.data.network.ServerUrlValidator
import dev.agentgitu.mobile.ui.components.StitchCircleIconButton
import dev.agentgitu.mobile.ui.components.StitchPrimaryButton
import dev.agentgitu.mobile.ui.components.StitchSecondaryButton
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private val ScannerCanvas = Color(0xFF09090B)
private val ScannerInk = Color(0xFFFAFAFA)

/**
 * Full-screen, in-app pairing camera. The camera preview is rendered behind
 * Stitch-styled chrome (frame, scan line, torch, permission and error states),
 * so pairing never leaves the app for a system camera intent.
 */
@Composable
fun QrScannerDialog(
    onDismiss: () -> Unit,
    onScanned: (String) -> Unit,
    onEnterManually: () -> Unit,
) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    var permissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var permissionAsked by remember { mutableStateOf(permissionGranted) }
    var cameraError by remember { mutableStateOf<String?>(null) }
    var cameraKey by remember { mutableIntStateOf(0) }
    var torchOn by remember { mutableStateOf(false) }
    var hasFlash by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var success by remember { mutableStateOf(false) }
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
                .background(ScannerCanvas),
        ) {
            if (permissionGranted && cameraError == null) {
                key(cameraKey) {
                    CameraScannerPreview(
                        modifier = Modifier.fillMaxSize(),
                        onScanned = { rawLink ->
                            if (!success) {
                                success = true
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                scope.launch {
                                    delay(420)
                                    onScanned(rawLink)
                                }
                            }
                        },
                        onCameraError = { cameraError = it },
                        onCameraReady = { readyCamera ->
                            camera = readyCamera
                            hasFlash = readyCamera?.cameraInfo?.hasFlashUnit() == true
                        },
                    )
                }

                ScannerOverlay()

                AnimatedVisibility(
                    visible = entered,
                    enter = fadeIn(tween(200)),
                    modifier = Modifier.align(Alignment.TopCenter),
                ) {
                    ScannerTopBar(
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
                    ScannerHintCard(onEnterManually = onEnterManually)
                }

                if (success) {
                    ScannerSuccessOverlay()
                }
            } else {
                ScannerMessagePanel(
                    title = if (cameraError != null) "Camera unavailable" else "Camera access needed",
                    message = cameraError
                        ?: "Allow camera access to scan the QR code shown in Gitu desktop → Settings → General → Phone access.",
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
                    onEnterManually = onEnterManually,
                    onOpenSettings = if (!permissionGranted) openSettings else null,
                    onClose = onDismiss,
                )
            }
        }
    }
}

@Composable
private fun CameraScannerPreview(
    modifier: Modifier,
    onScanned: (String) -> Unit,
    onCameraError: (String) -> Unit,
    onCameraReady: (Camera?) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnScanned by rememberUpdatedState(onScanned)
    val currentOnCameraError by rememberUpdatedState(onCameraError)
    val currentOnCameraReady by rememberUpdatedState(onCameraReady)
    val scanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build(),
        )
    }
    val executor = remember { Executors.newSingleThreadExecutor() }
    val handled = remember { AtomicBoolean(false) }
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
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(executor) { imageProxy ->
                    analyzeQr(imageProxy, scanner, handled, currentOnScanned)
                }
                cameraProvider.unbindAll()
                val camera = cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis,
                )
                provider = cameraProvider
                currentOnCameraReady(camera)
            } catch (error: Throwable) {
                currentOnCameraError(error.message ?: "The camera could not start on this device.")
            }
        }
        future.addListener(listener, ContextCompat.getMainExecutor(context))
        onDispose {
            runCatching { provider?.unbindAll() }
            runCatching { scanner.close() }
            executor.shutdown()
        }
    }

    AndroidView(
        factory = { previewView },
        modifier = modifier,
    )
}

@SuppressLint("UnsafeOptInUsageError")
private fun analyzeQr(
    imageProxy: ImageProxy,
    scanner: BarcodeScanner,
    handled: AtomicBoolean,
    onScanned: (String) -> Unit,
) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }
    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(image)
        .addOnSuccessListener { barcodes ->
            if (!handled.get()) {
                val rawLink = barcodes
                    .asSequence()
                    .mapNotNull { it.rawValue }
                    .firstOrNull { ServerUrlValidator.parseConnectLink(it) != null }
                if (rawLink != null && handled.compareAndSet(false, true)) {
                    Handler(Looper.getMainLooper()).post { onScanned(rawLink) }
                }
            }
        }
        .addOnCompleteListener { imageProxy.close() }
}

@Composable
private fun ScannerOverlay() {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val frameSize = minOf(maxWidth * 0.74f, maxHeight * 0.5f).coerceAtMost(340.dp)
        val framePx = with(LocalDensity.current) { frameSize.toPx() }
        val infinite = rememberInfiniteTransition(label = "qrScanner")
        val scanProgress by infinite.animateFloat(
            initialValue = 0.08f,
            targetValue = 0.92f,
            animationSpec = infiniteRepeatable(
                animation = tween(2200, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "scanProgress",
        )

        Canvas(modifier = Modifier.fillMaxSize()) {
            val left = (size.width - framePx) / 2f
            val top = (size.height - framePx) / 2f
            val scrim = Color.Black.copy(alpha = 0.52f)

            drawRect(scrim, topLeft = Offset(0f, 0f), size = Size(size.width, top))
            drawRect(
                scrim,
                topLeft = Offset(0f, top + framePx),
                size = Size(size.width, (size.height - top - framePx).coerceAtLeast(0f)),
            )
            drawRect(scrim, topLeft = Offset(0f, top), size = Size(left, framePx))
            drawRect(
                scrim,
                topLeft = Offset(left + framePx, top),
                size = Size((size.width - left - framePx).coerceAtLeast(0f), framePx),
            )

            val corner = 30.dp.toPx()
            val stroke = 4.dp.toPx()
            val cornerColor = ScannerInk
            fun cornerLine(start: Offset, end: Offset) {
                drawLine(
                    color = cornerColor,
                    start = start,
                    end = end,
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
            }

            cornerLine(Offset(left, top + corner), Offset(left, top))
            cornerLine(Offset(left, top), Offset(left + corner, top))
            cornerLine(Offset(left + framePx - corner, top), Offset(left + framePx, top))
            cornerLine(Offset(left + framePx, top), Offset(left + framePx, top + corner))
            cornerLine(Offset(left, top + framePx - corner), Offset(left, top + framePx))
            cornerLine(Offset(left, top + framePx), Offset(left + corner, top + framePx))
            cornerLine(
                Offset(left + framePx - corner, top + framePx),
                Offset(left + framePx, top + framePx),
            )
            cornerLine(
                Offset(left + framePx, top + framePx - corner),
                Offset(left + framePx, top + framePx),
            )

            val lineY = top + framePx * scanProgress
            val inset = 18.dp.toPx()
            drawLine(
                color = ScannerInk.copy(alpha = 0.16f),
                start = Offset(left + inset, lineY),
                end = Offset(left + framePx - inset, lineY),
                strokeWidth = 10.dp.toPx(),
                cap = StrokeCap.Round,
            )
            drawLine(
                color = ScannerInk.copy(alpha = 0.95f),
                start = Offset(left + inset, lineY),
                end = Offset(left + framePx - inset, lineY),
                strokeWidth = 2.dp.toPx(),
                cap = StrokeCap.Round,
            )
        }
    }
}

@Composable
private fun ScannerTopBar(
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
        ScannerGlassIconButton(
            icon = Icons.Default.Close,
            contentDescription = "Close scanner",
            onClick = onClose,
        )
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "Scan to pair",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = ScannerInk,
            )
            Text(
                text = "Agent Gitu mobile",
                style = MaterialTheme.typography.labelSmall,
                color = ScannerInk.copy(alpha = 0.62f),
            )
        }
        if (hasFlash) {
            ScannerGlassIconButton(
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
private fun ScannerHintCard(onEnterManually: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 48.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 440.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color.Black.copy(alpha = 0.66f))
                .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(24.dp))
                .padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Text(
                text = "Point at the pairing QR",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = ScannerInk,
            )
            Text(
                text = "Gitu desktop → Settings → General → Phone access",
                style = MaterialTheme.typography.bodySmall,
                color = ScannerInk.copy(alpha = 0.72f),
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(3.dp))
            ScannerPillButton(
                text = "Enter link manually",
                onClick = onEnterManually,
            )
        }
    }
}

@Composable
private fun ScannerSuccessOverlay() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .clip(CircleShape)
                    .background(ScannerInk),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = null,
                    tint = ScannerCanvas,
                    modifier = Modifier.size(46.dp),
                )
            }
            Text(
                text = "Pairing link found",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = ScannerInk,
            )
        }
    }
}

@Composable
private fun ScannerMessagePanel(
    title: String,
    message: String,
    icon: ImageVector,
    primaryLabel: String,
    onPrimary: () -> Unit,
    onEnterManually: () -> Unit,
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
                contentDescription = "Close scanner",
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
                text = "Enter pairing link manually",
                onClick = onEnterManually,
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
private fun ScannerGlassIconButton(
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
            tint = ScannerInk,
            modifier = Modifier.size(21.dp),
        )
    }
}

@Composable
private fun ScannerPillButton(text: String, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(ScannerInk)
            .clickable {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = ScannerCanvas,
        )
    }
}
