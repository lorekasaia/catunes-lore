package com.lorekasaia.catunes

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast

/**
 * Invisible launcher: asks Termux to run the same `catunes` shortcut script
 * used by the Termux:Widget icon, then closes itself. All the real work
 * (mpv, yt-dlp, the terminal UI) still runs inside Termux — this is just a
 * home-screen icon that doesn't require opening Termux by hand.
 *
 * com.termux.permission.RUN_COMMAND is a runtime ("dangerous") permission:
 * declaring it in the manifest isn't enough, Android must show the grant
 * dialog at least once, which is what onCreate/onRequestPermissionsResult
 * below take care of.
 */
class MainActivity : Activity() {
    private val runCommandPermission = "com.termux.permission.RUN_COMMAND"
    private val requestCode = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (checkSelfPermission(runCommandPermission) == PackageManager.PERMISSION_GRANTED) {
            launchCatunes()
        } else {
            requestPermissions(arrayOf(runCommandPermission), requestCode)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            launchCatunes()
        } else {
            Toast.makeText(
                this,
                "catunes necesita el permiso para pedirle a Termux que corra el comando. Ábrelo de nuevo y acéptalo.",
                Toast.LENGTH_LONG,
            ).show()
            finish()
        }
    }

    private fun launchCatunes() {
        val scriptPath = "/data/data/com.termux/files/home/.shortcuts/catunes"
        val intent = Intent().apply {
            setClassName("com.termux", "com.termux.app.RunCommandService")
            action = "com.termux.RUN_COMMAND"
            putExtra("com.termux.RUN_COMMAND_PATH", scriptPath)
            putExtra("com.termux.RUN_COMMAND_BACKGROUND", false)
            putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", "0")
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (e: Exception) {
            Toast.makeText(
                this,
                "No se pudo abrir Termux. Revisa que allow-external-apps esté activado en ~/.termux/termux.properties.",
                Toast.LENGTH_LONG,
            ).show()
        }

        finish()
    }
}
