# PassLab

Démo mobile : scanner QR (n'importe quel code) → animation → titre fictif. Tout se personnalise dans l'écran **Réglages** (engrenage en haut à droite). Le badge « DÉMO » est fixe.

## Tester sur le PC
Lance un serveur statique sur ce dossier (ex. `python -m http.server 8080`) et ouvre `http://localhost:8080`.
Sans caméra : ajoute `?sim=1` à l'adresse pour avoir un bouton « Simuler un scan ».

## Tester sur le téléphone (même Wi-Fi)
Double-clique `serve-phone.bat`, puis ouvre l'adresse `https://…:8443/` affichée. Le navigateur affichera un avertissement de certificat (auto-signé) : *Avancé → Continuer*.

## Lien permanent (recommandé)
La caméra exige HTTPS. Le plus simple : glisser-déposer ce dossier sur <https://app.netlify.com/drop> (ou GitHub Pages). Tu obtiens un lien https.
Sur le téléphone : ouvre le lien dans Chrome → menu ⋮ → **Ajouter à l'écran d'accueil** → l'appli s'ouvre en plein écran.

## Comportement
- **Période de validité** : jour choisi (4 par défaut) du mois en cours à 08:51 → même jour du mois suivant à 02:00.
- **Dernière validation** : date du jour + heure du dernier scan. Si tu rouvres l'appli moins de 120 min après (réglable), le titre s'affiche directement ; sinon retour au scanner.
- **Correspondance** : compte à rebours depuis le dernier scan (60 min, réglable).

## Détection QR
`BarcodeDetector` (Android Chrome) avec repli sur jsQR 1.4.0 (`vendor/jsQR.js`, licence Apache-2.0).
