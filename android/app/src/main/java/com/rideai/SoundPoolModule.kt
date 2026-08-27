package com.rideai

import android.media.AudioAttributes
import android.media.MediaPlayer
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = SoundPoolModule.NAME)
class SoundPoolModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "SoundPoolModule"
    }

    private var mediaPlayer: MediaPlayer? = null

    override fun getName() = NAME

    @ReactMethod
    fun playLoop(url: String, volume: Float, durationMs: Int, promise: Promise) {
        try {
            mediaPlayer?.apply { if (isPlaying) stop(); release() }
            mediaPlayer = null

            val player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                setDataSource(url)
                isLooping = true  // LOOP the SFX!
                setVolume(volume, volume)
                prepareAsync()
                setOnPreparedListener { mp ->
                    mp.start()
                    promise.resolve(true)
                }
                setOnErrorListener { _, _, _ ->
                    promise.reject("SFX_ERROR", "MediaPlayer error")
                    true
                }
            }
            mediaPlayer = player

            // Auto-stop after durationMs
            reactContext.runOnUiQueueThread {
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    try {
                        player.apply { if (isPlaying) stop(); release() }
                        if (mediaPlayer == player) mediaPlayer = null
                    } catch (e: Exception) { }
                }, durationMs.toLong())
            }
        } catch (e: Exception) {
            promise.reject("SFX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun play(url: String, volume: Float, promise: Promise) {
        try {
            // Stop any existing SFX
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
            mediaPlayer = null

            val player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                setDataSource(url)
                setVolume(volume, volume)
                prepareAsync()
                setOnPreparedListener { mp ->
                    mp.start()
                    promise.resolve(true)
                }
                setOnErrorListener { _, _, _ ->
                    promise.reject("SFX_ERROR", "MediaPlayer error")
                    true
                }
                // Auto-stop after 2 seconds
                setOnCompletionListener { mp ->
                    mp.release()
                    if (mediaPlayer == mp) mediaPlayer = null
                }
            }
            mediaPlayer = player

            // Force stop after 2s regardless
            reactContext.runOnUiQueueThread {
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    try {
                        player.apply {
                            if (isPlaying) stop()
                            release()
                        }
                        if (mediaPlayer == player) mediaPlayer = null
                    } catch (e: Exception) { }
                }, 30000) // 30s for mini-songs
            }
        } catch (e: Exception) {
            promise.reject("SFX_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            mediaPlayer?.apply {
                if (isPlaying) stop()
                release()
            }
            mediaPlayer = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    override fun onCatalystInstanceDestroy() {
        mediaPlayer?.apply {
            try { if (isPlaying) stop(); release() } catch (e: Exception) { }
        }
        mediaPlayer = null
    }
}