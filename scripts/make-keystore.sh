#!/usr/bin/env bash
# À lancer UNE SEULE FOIS sur ton ordinateur (nécessite Java : commande keytool).
# Crée la clé d'envoi (upload key) pour le Play Store. GARDE le fichier .jks et les mots de passe
# dans un endroit sûr (gestionnaire de mots de passe) : ne les mets jamais dans Git.
set -euo pipefail
ALIAS="bashoji"
keytool -genkeypair -v -keystore bashoji-upload.jks -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000
echo
echo "Alias de la clé : $ALIAS"
echo "Colle le texte ci-dessous dans le secret GitHub ANDROID_KEYSTORE_BASE64 :"
echo
base64 -w0 bashoji-upload.jks 2>/dev/null || base64 bashoji-upload.jks | tr -d '\n'
echo
