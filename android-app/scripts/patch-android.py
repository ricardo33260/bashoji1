#!/usr/bin/env python3
"""Adapte le projet Android généré par `cap add android` : permissions, version, signature release."""
import os
import re
import sys

PERMS = """
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.location.gps" android:required="false" />
"""

# --- Manifeste ---
mp = "android/app/src/main/AndroidManifest.xml"
s = open(mp, encoding="utf-8").read()
if "android.permission.CAMERA" not in s:
    s = s.replace("</manifest>", PERMS + "</manifest>")
open(mp, "w", encoding="utf-8").write(s)

# --- Gradle ---
gp = "android/app/build.gradle"
g = open(gp, encoding="utf-8").read()

code = os.environ.get("VERSION_CODE", "1")
name = os.environ.get("VERSION_NAME", "1.0.0")
g, n1 = re.subn(r"versionCode\s*=?\s*\d+", f"versionCode {code}", g, count=1)
g, n2 = re.subn(r'versionName\s*=?\s*"[^"]*"', f'versionName "{name}"', g, count=1)
if n1 != 1 or n2 != 1:
    sys.exit("build.gradle : versionCode / versionName introuvables")

if os.environ.get("SIGN") == "1":
    signing = """
    signingConfigs {
        release {
            storeFile file("upload.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
"""
    pattern = re.compile(r"([ \t]*)buildTypes\s*\{(\s*)release\s*\{")
    m = pattern.search(g)
    if not m:
        sys.exit("build.gradle : bloc buildTypes/release introuvable")
    repl = (
        signing.lstrip("\n")
        + f"{m.group(1)}buildTypes {{{m.group(2)}release {{\n"
        + f"{m.group(1)}        signingConfig signingConfigs.release"
    )
    g = g[: m.start()] + repl + g[m.end():]

open(gp, "w", encoding="utf-8").write(g)
print(f"OK versionCode={code} versionName={name} sign={os.environ.get('SIGN') == '1'}")
