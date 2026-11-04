#!/bin/bash
# PROD-03 post-import steps (idempotent). Run after the import and after any cutover re-sync.
set -eu
cd /var/www/html
wp search-replace "/opt/bitnami/wordpress" "/var/www/html" --all-tables --skip-columns=guid --report-changed-only 2>/dev/null | tail -1
wp eval-file ~/prod03-post-import.php 2>/dev/null
wp cache flush 2>/dev/null; wp elementor flush-css 2>/dev/null | tail -1
