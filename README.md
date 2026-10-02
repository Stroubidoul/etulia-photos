# Etulia Photos (photos.etulia.fr)

PWA : albums photos produits et réalisations (NAS Tech Zone + dépôts téléphone via Supabase Storage).
Connexion avec le compte Etulia ; accès réservé aux utilisateurs cochés « Etulia Photos » dans le BO du CRM (et à la direction).

Fichiers : `index.html`, `css/app.css`, `js/app.js`, `sw.js`, `manifest.json`, `version.json`, `icons/`.
À chaque modification visible : bumper `APP_VERSION` (js/app.js), `?v=` (index.html), `CACHE` (sw.js), `version.json`.
Base : migration 67 (tables `photo_albums`, `photo_items`, vue `photo_albums_v`, bucket `etulia-photos`).
Index NAS : script `etulia_photos_sync.py` (dépôt privé etulia-metre-sources), à lancer sur le Mac après un dépôt de photos.
