#!/bin/bash
# prod02-migration-prep.sh — run ONCE on PROD-02 (Bitnami) as user bitnami, from the
# Lightsail browser terminal. See wordpress/docs/prod-02-php-upgrade-runbook.md.
#
# What it does (read-only on WordPress, nothing customer-facing):
#   1. Lets PROD-03 (private IP 172.26.4.6 only) read files from this box with its
#      transfer key, so PROD-03 can copy the dump and wp-content over the private network.
#      Remove the line from ~/.ssh/authorized_keys after cutover.
#   2. Writes a Phase 1 inventory (no secrets: constant NAMES only) to ~/migrate/.
#   3. Copies the Apache vhost configs to ~/migrate/apache/.
#   4. Starts a consistent database dump in the background to ~/migrate/db.sql,
#      only if the disk has at least 3x the database size free.
# From the dump onward, edits made on PROD-02 are not carried over unless the cutover
# re-sync runs (the runbook's freeze check catches them).

set -u
mkdir -p ~/migrate/apache && cd ~/migrate || exit 1

KEY='from="172.26.4.6",no-agent-forwarding,no-X11-forwarding,no-port-forwarding ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIGUzsOexpvvw4RP5srCdcnUHJSP1sPru/eFd1u3q+yx prod03-xfer-20261104'
grep -q 'prod03-xfer-20261104' ~/.ssh/authorized_keys 2>/dev/null || echo "$KEY" >> ~/.ssh/authorized_keys

W="sudo wp --path=/opt/bitnami/wordpress"
WPC=$(readlink -f /opt/bitnami/wordpress/wp-content)
CFG=$(readlink -f /opt/bitnami/wordpress/wp-config.php)

{
  echo "== php";        php -v; php -m | tr '\n' ' '; echo
  echo "== core";       $W core version
  echo "== fpm ini";    sudo /opt/bitnami/php/sbin/php-fpm -i 2>/dev/null | grep -E 'memory_limit|upload_max|post_max|max_execution|max_input_vars|opcache.enable|auto_prepend'
  echo "== fpm pool";   sudo grep -hE '^\s*pm' /opt/bitnami/php/etc/php-fpm.d/*.conf
  echo "== paths";      echo "config=$CFG"; echo "wp-content=$WPC"; ls -la /opt/bitnami/wordpress | grep -- '->'
  echo "== docroot extras"
  ( cd /opt/bitnami/wordpress && sudo find -L . -maxdepth 1 -mindepth 1 ! -name 'wp-*' ! -name index.php ! -name xmlrpc.php ! -name license.txt ! -name readme.html -printf '%P\n' )
  echo "== cert";       sudo openssl x509 -in "$(readlink -f /opt/bitnami/apache/conf/bitnami/certs/server.crt)" -noout -issuer -subject -enddate
  echo "== cron";       sudo crontab -l; crontab -l; ls /etc/cron.d; sudo grep -rn 'wp-cron' /etc/crontab /etc/cron.d /var/spool/cron/crontabs; echo "DISABLE_WP_CRON=$($W config get DISABLE_WP_CRON 2>&1)"
  echo "== wp-config constant names (no values)"
  sudo grep -oE "define\(\s*['\"][A-Z0-9_]+['\"]" "$CFG" | sort -u; sudo grep -E '^\$table_prefix' "$CFG"
  echo "== options";    echo "home=$($W option get home)"; echo "siteurl=$($W option get siteurl)"; echo "upload_path=$($W option get upload_path 2>&1)"
  echo "== hpos";       $W option get woocommerce_custom_orders_table_enabled
  echo "== wordfence";  sudo ls -la /opt/bitnami/wordpress/.user.ini /opt/bitnami/wordpress/wordfence-waf.php 2>&1
  echo "== object cache"; sudo head -5 "$WPC/object-cache.php" 2>&1
  echo "== mu-plugins"; ls -la "$WPC/mu-plugins"
  echo "== space";      df -h / "$WPC"; sudo du -sh "$WPC/uploads"; $W db size --human-readable
} > inventory.txt 2>&1

$W plugin list --fields=name,status,version --format=csv > plugins.csv 2>&1
sudo cp /opt/bitnami/apache/conf/vhosts/*.conf apache/ 2>/dev/null
sudo cp /opt/bitnami/apache/conf/vhosts/htaccess/*.conf apache/ 2>/dev/null
sudo chown -R bitnami: ~/migrate

DB_BYTES=$($W db size --size_format=b 2>/dev/null | tr -dc '0-9')
FREE_BYTES=$(df --output=avail -B1 ~ | tail -1 | tr -dc '0-9')
echo "db_bytes=$DB_BYTES free_bytes=$FREE_BYTES" >> inventory.txt
if [ -n "$DB_BYTES" ] && [ -n "$FREE_BYTES" ] && [ "$FREE_BYTES" -gt $((DB_BYTES * 3)) ]; then
  nohup sudo wp --path=/opt/bitnami/wordpress db export /home/bitnami/migrate/db.sql \
    --single-transaction --quick --default-character-set=utf8mb4 > /home/bitnami/migrate/export.log 2>&1 &
  echo "PREP DONE: inventory written, database dump running in the background."
else
  echo "PREP DONE: inventory written. NOT dumping (free space < 3x DB size); PROD-03 will stream the dump instead."
fi
