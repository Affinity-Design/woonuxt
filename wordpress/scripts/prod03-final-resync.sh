#!/bin/bash
# PROD-03 final re-sync from PROD-02 (cutover night). Run on PROD-03 as admin. Idempotent.
set -u
cd /var/www/html
R="ssh -i /home/admin/.ssh/xfer -o BatchMode=yes bitnami@172.26.9.66"
W="sudo wp --path=/opt/bitnami/wordpress --skip-plugins --skip-themes"
TABLES="posts postmeta users usermeta comments wc_orders wc_orders_meta wc_order_addresses woocommerce_order_items woocommerce_order_itemmeta woocommerce_shipping_zones woocommerce_tax_rates actionscheduler_actions snippets"
log() { echo "[$(date -u +%H:%M:%S)] $*"; }

PREV_DUMP_TIME=$(cat ~/import/freeze-dump-time.txt)
mv ~/import/db.sql ~/import/db.first.sql 2>/dev/null

log "1. dump PROD-02 -> PROD-03"
$R "$W db export - --single-transaction --quick --default-character-set=utf8mb4" > ~/import/db.sql 2> ~/import/db-export.err
log "dump exit=$? size=$(du -h ~/import/db.sql | cut -f1) complete=$(tail -c 200 ~/import/db.sql | grep -c 'Dump completed')"
$R "for t in $TABLES; do echo \"\$t \$($W db query \"SELECT COUNT(*) FROM wp_\$t\" --skip-column-names 2>/dev/null)\"; done" > ~/import/dump-counts.txt 2>&1
$R "$W db query 'CHECKSUM TABLE wp_posts, wp_postmeta, wp_users, wp_usermeta, wp_comments, wp_commentmeta, wp_term_relationships, wp_wc_orders, wp_wc_orders_meta, wp_actionscheduler_actions'" > ~/import/freeze-fingerprint.txt 2>&1
date -u +%FT%TZ > ~/import/freeze-dump-time.txt
[ "$(tail -c 200 ~/import/db.sql | grep -c 'Dump completed')" = 1 ] || { log "DUMP INCOMPLETE - stopping"; exit 1; }

log "2. import"
redis-cli FLUSHALL >/dev/null
wp db reset --yes >/dev/null 2>&1 && wp db import ~/import/db.sql >/dev/null 2>&1 && log "IMPORT_OK"
for t in $TABLES; do echo "$t $(wp db query "SELECT COUNT(*) FROM wp_$t" --skip-column-names 2>/dev/null)"; done > ~/prod03-counts.txt
diff ~/import/dump-counts.txt ~/prod03-counts.txt && log "COUNTS MATCH" || log "COUNTS DIFFER"

log "3. post-import (search-replace, snippets, InnoDB, caches)"
~/prod03-post-import.sh 2>&1 | grep -v "Deprecated\|PG_ORIGIN_META_KEY"
log "4. core + WooCommerce DB updates"
wp core update-db 2>&1 | tail -1
wp wc update 2>&1 | tail -1

log "5. wp-content uploads delta since $PREV_DUMP_TIME"
$R "cd \$(readlink -f /opt/bitnami/wordpress/wp-content) && sudo find uploads -newermt '$PREV_DUMP_TIME' -type f -print0 | sudo tar --null -T - -cf -" | sudo tar -C /var/www/html/wp-content -xf - && log "uploads delta copied"
sudo chown -R admin:www-data /var/www/html/wp-content/uploads

log "6. checks"
wp plugin list --name=wp-graphql,wp-graphql-woocommerce,wp-graphql-headless-login --fields=name,status,version --format=csv 2>/dev/null
echo "hpos: $(wp option get woocommerce_custom_orders_table_enabled 2>/dev/null)  home: $(wp option get home 2>/dev/null)"
echo "engines: $(wp db query "SELECT GROUP_CONCAT(CONCAT(ENGINE,'=',c)) FROM (SELECT ENGINE, COUNT(*) c FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() GROUP BY ENGINE) x" --skip-column-names 2>/dev/null)"
echo "products: $(wp db query "SELECT CONCAT(SUM(post_status='publish'),' publish / ',SUM(post_status='draft'),' draft') FROM wp_posts WHERE post_type='product'" --skip-column-names 2>/dev/null)"
log "RESYNC DONE"
