# PROD-02: product recovery + PHP 8.4 upgrade runbook

Status: **draft, 2026-10-30**, revised the same day after an adversarial review. The store has been closed for several weeks, so downtime is acceptable.
Scope: the shared WordPress/WooCommerce backend `ProSkatersPlace-PROD-02`. It serves the US site (the proskatersplace.com theme) and, through WPGraphQL, the Canadian headless frontend. Under CLAUDE.md rule 8 that makes this a cross-site change; see [Cross-site impact](#cross-site-impact).

## What we're doing and why

1. **Recover deleted products.** The founder deleted products, and WordPress permanently purges trashed posts after 30 days, so some are already gone. We copy them back out of the earliest Lightsail snapshot and re-create them on production as **drafts**, tagged `recovered-from-snapshot`. The founder can then sort out which products still exist after the fire. Tool: `wordpress/scripts/recover-deleted-products.php`. **We are not rolling the whole site back.** The snapshot is only the source for the recovered products.
2. **Upgrade PHP to 8.4.** The Lightsail console flags critical PHP CVE-2026-109618 and CVE-2026-109619 on this instance. Both are fixed in PHP **8.4.27** (released 2026-10-21). PHP can't be upgraded in place on a Bitnami instance; AWS's guidance is a new instance plus a data migration ([WordPress by Bitnami](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-wordpress-bitnami.html), [Migrate to Lightsail blueprints](https://docs.aws.amazon.com/lightsail/latest/userguide/migrate-from-bitnami-to-lightsail-blueprints.html)). Bitnami blueprints stopped getting updates after 2026-05-19, and new Bitnami instances can't be created after **2026-11-19**. So we build `PROD-03` from the **current** PROD-02 data, test it on its temporary IP, then move the static IP. PROD-02 stays stopped but intact, so rollback means re-attaching the IP.

## Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Baseline and recovery snapshots** | **Decided 2026-10-30.** Work is **paused** for GraphQL changes on PROD-02. The baseline and rollback point is a **fresh manual snapshot taken immediately before Phase 3**, after that GraphQL work. `PROD-02-after-trash-restore-20261030` (taken 2026-10-30, right after the 415 trashed products were restored to drafts) is an interim backup only. **The Oct 24 automatic snapshot is not used** (the owner's call). It expires at 4:00 AM EDT Oct 31, so the ~30 products purged from production after Oct 24 (4 of them created after May 6) are not recovered. The May 6 manual snapshot `ProSkatersPlace-PROD-02-1778121092` (2026-05-06 22:31 EDT) stays available for an optional older-product recovery (Phase 2). |
| D2 | **Target blueprint**: AWS's Lightsail-packaged WordPress blueprint (Feb 2026, not Bitnami) | Recommended. It ships Debian's PHP **8.2** under mod_php, so Phase 3 switches it to PHP 8.4 FPM from packages.sury.org. The Phase 3 CVE gate (FPM **≥ 8.4.27**) decides. There is no Bitnami fallback to 8.4. AWS's Bitnami-plus-Sury procedure only patches the PHP line Bitnami already ships. |
| D3 | **PHP version** | **Decided: 8.4.** 8.5 skipped. The custom-code audit (all 33 files in `wordpress/`) found nothing that breaks or warns on 8.4. Code that lives only in Code Snippets is outside that audit; Phase 1 exports it for review. |
| D4 | **PROD-03's data source** | **Current PROD-02.** This keeps every setting, page, credential and order. The recovered products arrive as drafts on top (see Phase 2 for the order of operations). |
| D5 | **Go/no-go owner** | **Decided 2026-10-30: the owner's team ("we do").** They decide go, rollback and reopening. Orders reopen only through Phase 6. |

## Known current state (checked 2026-10-30 from a workstation)

- PROD-02 (from the Lightsail console):
  - Bitnami WordPress, "no longer maintained"; bundle 32 GB RAM / 8 vCPU / 640 GB SSD; zone us-east-1a; dual-stack networking.
  - Static IP `ProSkatersPlace-IP-02` = `54.205.226.65`; private IPv4 `172.26.9.66`; IPv6 (see the Lightsail console; not published here). IPv6 changes only if IPv6 is disabled and re-enabled.
  - Current PHP version unknown, but the console's CVE banner means it's below the fixed release.
- PROD-02 IPv4 firewall:
  - HTTPS 443 from 22 source CIDRs (presumably Cloudflare's ranges; copy them exactly).
  - SSH 22 from `45.58.92.233/32`, plus Lightsail browser SSH.
  - **No port 80 rule.** Check the IPv6 rules in the console separately.
- `https://proskatersplace.com/` → 200 via Cloudflare; `/graphql` → 200. `http://54.205.226.65/` → no response; the firewall likely only admits Cloudflare ranges.
- SSH to `:22` times out. Use Lightsail console SSH, or a temporary rule for your own `/32`.
- `test.proskatersplace.com` → 522 (origin down). There's no staging box; PROD-03 on its temporary IP is the rehearsal.

## Phase 0: today, before anything else

- [x] **Stop the trash purge (done 2026-10-30, ~15:50 EDT).**
  - The trash held 415 products: 412 trashed **2026-09-30 13:39–14:51** (site time), 1 from Sep 8, and 2 from Oct 27–28. The Sep 30 batch reached the 30-day purge line at that moment.
  - All 415 were bulk-restored through wp-admin and then set to **draft** through the WooCommerce REST batch endpoint.
  - **Note: WooCommerce restores trashed products to their previous status (usually *publish*), not draft**, so a draft pass is needed after any restore.
  - Belt and braces once SSH works: add `define( 'EMPTY_TRASH_DAYS', 3650 );` to PROD-02's `wp-config.php`. **Never set it to `0`**: that makes every delete permanent.
- [x] ~~Keep the Oct 24 automatic snapshot~~: not kept, by the owner's decision (see D1).
- [x] **Interim manual snapshot of PROD-02** taken 2026-10-30 after the trash restore: `PROD-02-after-trash-restore-20261030`. Confirm it shows *Available*.
- [ ] **Baseline snapshot** right before Phase 3, after the GraphQL work: `PROD-02-pre-php84-<date>`. Wait for *Available*. This is the rollback point for the migration.
- [ ] **CVE stop-gap on PROD-02** while it stays live (it is reachable through Cloudflare):
  - In `/opt/bitnami/php/etc/php.ini` set `session.upload_progress.enabled = 0`.
  - Run `sudo /opt/bitnami/ctlscript.sh restart php-fpm`, then confirm with `php-fpm -i | grep upload_progress` against the FPM binary in `/opt/bitnami/php/sbin`.
  - This covers CVE-2026-109619's confirmed path, and it's also PHP's mitigation for CVE-2026-115560, which no release fixes yet. The real fix for 109618/109619 is the 8.4.27 cutover.

## Phase 1: inventory (no changes to prod)

- [ ] Lightsail → PROD-02 → Networking: record IPv4 and IPv6 firewall rules (ports and source ranges), the static IP's name, the bundle size and the AZ. Also record PROD-02's metric alarms and notification contacts, to recreate on PROD-03.
- [ ] Cloudflare (DNS owner; Paul's role can't edit DNS): record A and **AAAA** records for `@`, `www` and `test`, the SSL/TLS mode, and whether HSTS is on.
  - If there's an AAAA record for `@` or `www`, the DNS owner **deletes it now** and keeps the proxied A record. Lightsail IPv6 is **not** static. Cloudflare still serves IPv6 visitors and prefers IPv4 to the origin anyway, and with no AAAA neither cutover nor rollback needs a DNS edit.
  - Name who holds *SSL and Certificates: Edit*, *Cache Purge* and DNS edit on the .com zone, and book them for Phase 5. Test whether Paul can purge with a single-URL purge of `https://proskatersplace.com/robots.txt`.
- [ ] .ca production Pages project:
  - Record the sitemap size: `curl -s https://proskatersplace.ca/api/sitemap.xml | grep -c '<loc>'`.
  - Confirm `NUXT_PAYMENT_DATA` is bound. If it isn't, Phase 5 skips the KV purge, because Helcim recovery and idempotency records then live in `NUXT_CACHE`.
  - Copy the production `NUXT_CACHE` namespace ID from the project's KV bindings (check the binding name has no stray spaces).
- [ ] From PROD-02 (console SSH), record (no secrets in chat). Start with `W="sudo wp --path=/opt/bitnami/wordpress"; P=$($W db prefix)`.
  - [ ] `php -v`, `php -m`, `$W core version`
  - [ ] The PHP settings FPM uses: `sudo /opt/bitnami/php/sbin/php-fpm -i | grep -E 'memory_limit|upload_max|post_max|max_execution|max_input_vars|opcache\.'`; pool sizes: `sudo grep -hE '^\s*pm' /opt/bitnami/php/etc/php-fpm.d/*.conf`; other overrides in `/opt/bitnami/php/etc/php.ini`
  - [ ] Apache vhosts, including the permalink and redirect rules in `wordpress-vhost.conf` and `wordpress-https-vhost.conf`, plus `/opt/bitnami/apache/conf/vhosts/htaccess/wordpress-htaccess.conf` (Bitnami's replacement for `.htaccess`)
  - [ ] TLS files in `/opt/bitnami/apache/conf/bitnami/certs/`, and the current cert's issuer and expiry: `sudo openssl x509 -in "$(readlink -f /opt/bitnami/apache/conf/bitnami/certs/server.crt)" -noout -issuer -subject -ext subjectAltName -enddate`
  - [ ] What runs WP-cron. Bitnami's system-cron entry is a manual setup, so don't assume it: `sudo grep -rn 'wp-cron\|wp cron' /etc/crontab /etc/cron.d /var/spool/cron/crontabs; systemctl list-timers --all; $W config get DISABLE_WP_CRON`. Note every other crontab line too; Phase 5 ports them.
  - [ ] `wp-config.php`: `$table_prefix`, custom constant **names**, and the lines that must not be ported: `sudo grep -nE 'WP_HOME|WP_SITEURL|HTTP_HOST|X_FORWARDED|WP_CONTENT_DIR|UPLOADS|WP_TEMP_DIR|DISABLE_WP_CRON|WP_CACHE|WP_REDIS|/opt/bitnami|/bitnami/' /opt/bitnami/wordpress/wp-config.php`
  - [ ] Raw URL options, which Bitnami's constants hide: `$W db query "SELECT option_name,option_value FROM ${P}options WHERE option_name IN ('home','siteurl','upload_path')"`. Stored Bitnami paths: `$W db search '/bitnami/' --all-tables-with-prefix --stats`.
  - [ ] Plugins with versions: `$W plugin list --fields=name,status,version,update,update_version --format=csv > ~/plugins-prod02.csv`; `$W theme list`
  - [ ] Premium plugin licences: Slider Revolution, WooCommerce Table Rate Shipping, Price Based on Country Pro, Checkout Field Editor Pro, FiboSearch Pro, PixelYourSite Pro, Forminator Pro, Gravity Forms. Record each licence holder and whether it's active, and download the zip of any version Phase 3 may need from the vendor account now. With a lapsed licence, wp-admin simply offers no update. Slider Revolution 6.x needs an Envato purchase code and runs a one-way migration; without one, decide now what replaces the sliders. Pages that use them: `$W db query "SELECT p.ID,p.post_title FROM ${P}posts p LEFT JOIN ${P}postmeta m ON m.post_id=p.ID AND m.meta_key='_elementor_data' WHERE p.post_status='publish' AND (p.post_content LIKE '%rev_slider%' OR m.meta_value LIKE '%rev_slider%')"`
  - [ ] Code Snippets: Snippets → Export (JSON, all), and dump the active PHP snippets to files:
    ```
    mkdir -p /home/bitnami/migrate/snippets
    $W eval 'global $wpdb; foreach ($wpdb->get_results("SELECT id,name,code FROM {$wpdb->prefix}snippets WHERE active=1 AND scope IN (\"global\",\"admin\",\"front-end\",\"single-use\")") as $s) file_put_contents("/home/bitnami/migrate/snippets/snip-{$s->id}.php", "<?php\n// {$s->name}\n" . $s->code);'
    ```
    Diff each against its repo copy (`wordpress/psp-master-payment-shipping-code-snippets.php`, `hpos-ordernumber-fix.php`, `psp-contact-relay-snippet.php` and so on). Any snippet that isn't in the repo, or has drifted from it, goes through the PHP 8.4 audit before Phase 3. Snippet 87 ("PSP TEMP HOTFIX - GraphQL stability patches") must stay active and WPGraphQL Smart Cache deactivated; see `docs/incident-2026-08-13-graphql-schema-flap.md`.
  - [ ] Wordfence's firewall hooks, which break PROD-03 if copied: `R=/opt/bitnami/wordpress; sudo grep -rn auto_prepend_file /opt/bitnami/php/etc/ $R/.user.ini 2>/dev/null; sudo grep -nE "include|WFWAF" $R/wordfence-waf.php 2>/dev/null; sudo find -L $R -name .user.ini; sudo find -L $R -name .htaccess -exec grep -HnE 'php_value|php_flag|php_admin|auto_prepend' {} +`. Also note whether Wordfence → Firewall shows *Extended Protection*.
  - [ ] Redis: `sudo head -5 "$(readlink -f /opt/bitnami/wordpress/wp-content)/object-cache.php"; $W redis status 2>/dev/null`, and the `WP_REDIS_*` constant names.
  - [ ] How orders are halted: `$W wc payment_gateway list --user=<admin-id> --fields=id,enabled`, `$W option get woocommerce_coming_soon`, active Code Snippets, and any vhost or Cloudflare rule.
  - [ ] Layout: `ls -la /opt/bitnami/wordpress | grep -- '->'`. `wp-content` and `wp-config.php` are usually symlinks into `/bitnami/wordpress`; copy the real path, because copying the link copies nothing. Non-core files in the docroot, which Phase 3 copies across: `cd /opt/bitnami/wordpress && sudo find -L . -maxdepth 1 -mindepth 1 ! -name 'wp-*' ! -name index.php ! -name xmlrpc.php ! -name license.txt ! -name readme.html -printf '%P\n'; ls -laR .well-known 2>/dev/null`
  - [ ] mu-plugins, and space: `df -h / "$(readlink -f /opt/bitnami/wordpress/wp-content)" /home/bitnami; sudo du -sh "$(readlink -f /opt/bitnami/wordpress/wp-content)/uploads"; $W db size --human-readable`

## Phase 2: recover the deleted products

Recommended order: run the recovery on **PROD-02 now**, so the founder can start sorting. The PHP migration in Phase 3 then carries the drafts across. The founder must finish or pause sorting before the Phase 3 dump: from then until the Phase 5 IP move, anything changed on PROD-02 is lost.

**Optional; the owner decides.** The 415 products from the trash are already back as drafts. This phase would add the ~110 older products that are permanently gone but existed on May 6, using **`S=20260506`** with no extra tokens. The Oct 24 pass is dropped (D1). The script's ledger (the `psp_recovery_ledger` option) stops any product being recovered twice. Products that were in the trash *inside* a snapshot need the token `include-snapshot-trash`. The script then restores each one's real slug (from `_wp_desired_post_slug`, dropping `__trashed`) and its variations' pre-trash statuses, and forces the product itself to draft.
- Expected scale comes from `wordpress/docs/product-presence-audit-2026-10-30.csv`: 2,225 product URLs seen in the repo's committed product data (Jun 2025 → Oct 29 2026), of which 1,009 aren't publicly live today. That count includes drafts and anything restored from the trash, so it's an upper bound. The script's `plan` gives the exact numbers. 372 rows have `state_oct30` = `GONE`; the completion gate below checks those.

Before the first side instance:
- [ ] Confirm open question 2 on PROD-02 (the team says there's no WooCommerce Subscriptions): `sudo wp --path=/opt/bitnami/wordpress plugin list --status=active --field=name | grep -Ei 'subscription|funnel|autonami|omnisend|smtp'`. If anything that charges on a schedule turns up after all, **don't boot a snapshot with WordPress**. Use Snapshots → Export to Amazon EC2 and read the MariaDB data from a volume that is never booted.
- [ ] On PROD-02, as `bitnami`, make a transfer key: `ssh-keygen -t ed25519 -N '' -f ~/.ssh/xfer && cat ~/.ssh/xfer.pub`. The launch script below installs it on each side instance. Lightsail firewalls don't filter private-IP traffic between instances in the same Region, so all copying goes over private IPs.

For each snapshot `S`:
- [ ] **Restore it to a private side instance**: Snapshots → *Create new instance* → `PSP-recovery-$S`. Don't attach a static IP. Bundle: Lightsail only lets you restore a snapshot to the **same size or larger**, so this is a 32 GB instance billed hourly.
  - **Launch script.** It runs late in boot, after cron, Apache and MariaDB have started, so it shortens the window in which the snapshot's overdue jobs (customer emails, syncs, scheduled charges) can fire; it can't close it. The outbound block is what stops anything leaving the box. If `nft` is missing, use the equivalent `iptables`/`ip6tables` OUTPUT rules.
    ```
    #!/bin/bash
    # 1. Outbound: only loopback, replies, the Lightsail private range, metadata and DNS
    nft add table inet clone
    nft add chain inet clone out '{ type filter hook output priority 0; policy drop; }'
    nft add rule inet clone out oif lo accept
    nft add rule inet clone out ct state established,related accept
    nft add rule inet clone out ip daddr 172.26.0.0/16 accept
    nft add rule inet clone out ip daddr 169.254.169.254 accept
    nft add rule inet clone out udp dport 53 accept
    # 2. Quarantine WordPress: no mail, no outbound HTTP, no WP-cron, no Action Scheduler runner
    WPC=$(readlink -f /opt/bitnami/wordpress/wp-content)
    mkdir -p "$WPC/mu-plugins"
    cat > "$WPC/mu-plugins/000-quarantine.php" <<'EOF'
    <?php
    if (!defined('DISABLE_WP_CRON')) define('DISABLE_WP_CRON', true);
    add_filter('pre_wp_mail', '__return_false');
    add_filter('pre_http_request', function () { return new WP_Error('quarantine', 'blocked'); }, 1);
    add_filter('action_scheduler_allow_async_request_runner', '__return_false');
    EOF
    # 3. System cron and the web stack off
    sed -i -E '/wp-cron/ s/^([^#])/#\1/' /etc/crontab /etc/cron.d/* /var/spool/cron/crontabs/* 2>/dev/null
    systemctl disable --now cron
    /opt/bitnami/ctlscript.sh stop apache
    /opt/bitnami/ctlscript.sh stop php-fpm
    # 4. Let PROD-02 pull files over the private IP
    echo '<contents of PROD-02 ~/.ssh/xfer.pub>' >> /home/bitnami/.ssh/authorized_keys
    ```
  - **Firewall, the moment the instance appears.** Custom rules aren't copied from snapshots: it starts with the WordPress defaults, 22, 80 and 443 open to everyone on IPv4 **and** IPv6. This box runs the vulnerable old PHP with live API and SMTP keys. Replace the rules with SSH only, keeping browser SSH (your only working SSH path):
    `aws lightsail put-instance-public-ports --instance-name PSP-recovery-$S --port-infos '[{"fromPort":22,"toPort":22,"protocol":"tcp","cidrs":["<your-ip>/32"],"cidrListAliases":["lightsail-connect"]}]'`
    It closes every port not listed. In the console instead: delete every IPv4 and IPv6 rule except SSH, keeping *Allow Lightsail browser SSH* ticked. No 80 or 443. Confirm with `aws lightsail get-instance-port-states --instance-name PSP-recovery-$S`.
- [ ] **Verify after boot, before exporting** (console SSH):
  - `sudo tail -n 20 /var/log/cloud-init-output.log` shows the script ran; `systemctl is-enabled cron` prints `disabled`; `sudo nft list table inet clone` lists the rules; `curl -m 5 -sI https://api.wordpress.org` fails.
  - `sudo journalctl -u cron --since '-2 hours' | grep -i wp-cron` shows no run.
  - `P=$(sudo wp --path=/opt/bitnami/wordpress db prefix); sudo wp --path=/opt/bitnami/wordpress db query "SELECT hook,status,last_attempt_gmt FROM ${P}actionscheduler_actions WHERE last_attempt_gmt >= '<instance-create UTC>'"` returns no rows.
  - Any wp-cron run or any row: stop, record it, and reconcile those emails or charges before going on.
- [ ] From PROD-02, copy the script across: `scp -i ~/.ssh/xfer ~/recover-deleted-products.php bitnami@<side-private-ip>:`. Then on the side instance:
  `sudo wp --path=/opt/bitnami/wordpress eval-file recover-deleted-products.php export /home/bitnami/psp-products-$S.ser.gz`
- [ ] On PROD-02, pull the export and run the dry run:
  `rsync -a -e 'ssh -i ~/.ssh/xfer' bitnami@<side-private-ip>:/home/bitnami/psp-products-$S.ser.gz /home/bitnami/`
  `sudo wp --path=/opt/bitnami/wordpress eval-file recover-deleted-products.php plan /home/bitnami/psp-products-$S.ser.gz`
  The script validates the whole file first, so a truncated copy fails here. Review the summary and `psp-products-$S.ser.gz.plan-<time>.csv` with the founder:
  - counts of *missing → recreate* and *trashed → untrash*
  - SKU and ID conflicts
  - terms that will be created
  - missing image files
- [ ] Manual snapshot `PROD-02-pre-apply-$S`; wait for *Available*. Then run `apply` with the same tokens as `plan`. Keep `psp-products-$S.ser.gz.apply-<time>.csv`: it's the only record of new IDs, `-recovered` SKU renames and FAILED rows.
- [ ] **While `PSP-recovery-$S` is still running**, copy the image files `apply` couldn't find. `<side-uploads>` is `$(readlink -f /opt/bitnami/wordpress/wp-content)/uploads` on the side instance.
  ```
  U=$(readlink -f /opt/bitnami/wordpress/wp-content)/uploads
  rsync -a -e 'ssh -i ~/.ssh/xfer' --files-from=/home/bitnami/psp-products-$S.ser.gz.missing-uploads.txt bitnami@<side-private-ip>:<side-uploads>/ "$U/"
  sudo chown -R bitnami:daemon "$U"
  while read f; do test -f "$U/$f" || echo "STILL MISSING $f"; done < /home/bitnami/psp-products-$S.ser.gz.missing-uploads.txt
  ```
  The last command must print nothing.
- [ ] Gate before deleting `PSP-recovery-$S`: `grep -c ',FAILED,' /home/bitnami/psp-products-$S.ser.gz.apply-*.csv` prints 0 (or every FAILED row is understood), and nothing is STILL MISSING. Then delete the side instance. Keep the snapshot.

After both runs:
- [ ] WooCommerce → Status → Tools → **Regenerate the product lookup tables** and **Regenerate the product attributes lookup table**.
- [ ] **Completion gate**: every audit slug whose `state_oct30` is `GONE` now resolves on PROD-02. On the workstation: `Import-Csv wordpress/docs/product-presence-audit-2026-10-30.csv | ? state_oct30 -like 'GONE*' | % slug | Set-Content -Encoding ascii gone-slugs.txt`. Paste it onto PROD-02 as `~/gone-slugs.txt`, then:
  `while read s; do [ -n "$(sudo wp --path=/opt/bitnami/wordpress post list --post_type=product --post_status=any --name="$s" --format=ids)" ] || echo "$s"; done < ~/gone-slugs.txt`
  Give the founder whatever it prints.
- [ ] Stored redirects can intercept a restored URL. Before the founder publishes anything, list them: `P=$(sudo wp --path=/opt/bitnami/wordpress db prefix); sudo wp --path=/opt/bitnami/wordpress db query "SELECT url,action_data FROM ${P}redirection_items WHERE status='enabled' AND url LIKE '/product/%'"`, plus Rank Math's `${P}rank_math_redirections` if that table exists. Disable a redirect when its recovered product is published.
- [ ] Founder reviews: `wp-admin/edit.php?post_type=product&product_tag=recovered-from-snapshot&post_status=draft`. Publishing a product is a normal edit; remove the tag when done.
- [ ] Remove `~/.ssh/xfer*` from PROD-02.

## Phase 3: build PROD-03 on PHP 8.4

**What the Lightsail-packaged WordPress blueprint actually is** (researched 2026-10-30 from AWS docs; confirm on the box):
- **OS:** Debian, almost certainly 12. Check with `cat /etc/os-release`.
- **Web server and PHP:** Apache 2 with mpm_prefork and **mod_php 8.2** (8.2.35) from Debian's own repositories. AWS documents only `apt upgrade` within that line, and PHP 8.2 reaches end of life 2026-12-31.
- **Database:** MariaDB, with phpMyAdmin installed.
- **Paths and access:** SSH user `admin`; web root `/var/www/html`; `wp-config.php` at **`/var/www/wp-config.php`**; files owned by `admin:www-data`; credentials in `~/application_credentials`. WP-CLI is preinstalled: run it as `admin` from `/var/www/html`, with no sudo and never with `--allow-root` (root-owned files break later uploads and updates). Every PROD-03 `wp` command below runs that way.
- **Preinstalled plugins:** Jetpack, All in One SEO, WP Mail, Google Analytics, All-in-One WP Migration, AMP and W3 Total Cache. The migration below moves the blueprint's whole `wp-content` aside, so none of them, or their drop-ins, survive.
- **`lightsail-memory-config` service:** re-tunes swap, MariaDB, Apache and PHP `memory_limit` at every boot. Check what it writes after the PHP switch.
- **HTTPS:** "Lightsail Setup" issues Let's Encrypt, but only with ports 22, 80 and 443 open to everyone and A/AAAA records resolving to the instance itself, which proxied Cloudflare records never do. Don't run it on PROD-03; use a **Cloudflare Origin CA** certificate.

- [ ] Create `ProSkatersPlace-PROD-03` from the Lightsail WordPress blueprint (ID probably `wordpress_ls_1_0`) in us-east-1a, bundle ≥ PROD-02 (32 GB). **Firewall**, right after creation:
  - IPv4: HTTP and HTTPS from your `/32` only. SSH: keep *Allow Lightsail browser SSH* ticked and add your `/32`; don't replace it, because console SSH is your only working path.
  - IPv6: delete the HTTP, HTTPS and SSH rules until cutover.
- [ ] Confirm the facts above and record them: `cat /etc/os-release; php -v; apache2ctl -M | grep -iE 'php|mpm'; ls /etc/php; systemctl cat lightsail-memory-config; ls -la /var/www /var/www/html`.
- [ ] **Switch to PHP 8.4.27** using the Sury repository. AWS names packages.sury.org as the source for other PHP lines on Debian, but doesn't maintain it.
  1. Add `https://packages.sury.org/php/` with its signing key in `/usr/share/keyrings/sury-php.gpg`.
  2. Install the packages: `apt install php8.4-fpm php8.4-{mysql,curl,gd,imagick,intl,mbstring,xml,zip,bcmath,soap,opcache,redis}`.
  3. Swap Apache from mod_php to FPM: `a2dismod php8.2 mpm_prefork && a2enmod mpm_event proxy_fcgi setenvif && a2enconf php8.4-fpm`.
  4. Make 8.4 the default CLI: `update-alternatives --set php /usr/bin/php8.4`.
  5. Restart: `systemctl restart php8.4-fpm apache2`. `ls /etc/apache2/conf-enabled | grep fpm` must show only `php8.4-fpm.conf`.
  6. Once the site works, `apt purge 'php8.2*' libapache2-mod-php8.2`.
- [ ] **PHP settings.** Debian's defaults apply unless overridden: 128M memory, 2M uploads, and `max_input_vars` 1000, which silently truncates large variable-product saves. FPM and the CLI (WP-CLI, cron) read separate ini trees, so put PROD-02's recorded values in one file and link it into both:
  ```
  sudo tee /etc/php/psp-overrides.ini <<'EOF'
  memory_limit = <recorded, at least 256M>
  upload_max_filesize = <recorded>
  post_max_size = <recorded>
  max_execution_time = <recorded>
  max_input_vars = <recorded, at least 5000>
  session.upload_progress.enabled = 0
  expose_php = Off
  EOF
  for s in fpm cli; do sudo ln -sf /etc/php/psp-overrides.ini /etc/php/8.4/$s/conf.d/99-psp.ini; done
  ```
  `session.upload_progress.enabled = 0` is PHP's recommended mitigation for **CVE-2026-115560** (disclosed 2026-10-23), which 8.4.27 does **not** fix. It also backs up the fix for CVE-2026-109619. WordPress and WooCommerce don't use PHP's upload-progress feature. Port no `/opt/bitnami` paths (`upload_tmp_dir`, `session.save_path`, `error_log`) and no `auto_prepend_file`.

  Pool: Debian's `www.conf` ships `pm.max_children = 5`, which warm-cache and the FlyingPress preload saturate (502/504). In `/etc/php/8.4/fpm/pool.d/www.conf`, use PROD-02's recorded `pm.*` values, or:
  ```
  pm = dynamic
  pm.max_children = <(RAM − MariaDB buffer pool − 2 GB) / ~128 MB; about 100–150 on 32 GB>
  pm.start_servers = 10
  pm.min_spare_servers = 10
  pm.max_spare_servers = 30
  pm.max_requests = 1000
  ```
  Then `sudo systemctl restart php8.4-fpm`.
- [ ] **CVE gate (must pass):**
  - `php-fpm8.4 -v` shows **≥ 8.4.27**.
  - `php-fpm8.4 -i | grep -E 'upload_progress.enabled|memory_hard_limit'` shows upload progress **Off**. Check through the FPM binary; `php -i` reads the CLI config instead.
  - Web probe, on PROD-03:
    ```
    echo '<?php echo PHP_VERSION," ",PHP_SAPI," ",php_ini_loaded_file()," ",ini_get("memory_limit")," ",ini_get("max_input_vars");' | sudo tee /var/www/html/v.php >/dev/null
    curl -s http://127.0.0.1/v.php; echo
    sudo rm -f /var/www/html/v.php
    wp --info | grep -E 'PHP (binary|version)'
    ```
    Expect `8.4.27+ fpm-fcgi /etc/php/8.4/fpm/php.ini` with the overrides file's memory and input-vars values, and the CLI on 8.4 too.
  - Reboot PROD-03 once and re-run the probe, because `lightsail-memory-config` re-tunes PHP at every boot.
- [ ] Extensions present: mysqli, curl, gd or imagick, intl, mbstring, xml, zip, sodium, bcmath, exif, opcache.
- [ ] phpMyAdmin must not be public: `curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: proskatersplace.com' http://127.0.0.1/phpmyadmin/; ls /etc/apache2/conf-enabled | grep -i phpmyadmin`. If it answers and its conf doesn't limit it to `Require local`, run `sudo a2disconf phpmyadmin && sudo systemctl reload apache2`, and use an SSH tunnel for any database GUI.
- [ ] Redis: if PROD-02 uses a Redis object cache (Phase 1), `sudo apt install -y redis-server` and carry over the `WP_REDIS_*` constants. If not, delete `wp-content/object-cache.php` after the restore below.
- [ ] **Keep scheduling off on PROD-03 until Phase 5.** It will hold a copy of the live DB, and its scheduled jobs would run alongside PROD-02's (duplicate emails, feed jobs). Stopping system cron isn't enough: page loads spawn WP-cron, and Action Scheduler's async runner fires on every wp-admin request.
  - `define('DISABLE_WP_CRON', true);` in wp-config (see below), and no system wp-cron entry yet.
  - After the `wp-content` restore, create `/var/www/html/wp-content/mu-plugins/000-psp-migration-hold.php`:
    ```
    <?php
    // Holds background work until cutover. Phase 5 deletes this file.
    add_filter('action_scheduler_allow_async_request_runner', '__return_false');
    add_filter('action_scheduler_queue_runner_concurrent_batches', '__return_zero');
    ```
  - Never add `proskatersplace.com` to PROD-03's own `/etc/hosts`. Its loopback requests now go through Cloudflare to PROD-02; a local mapping would fire the backlog on PROD-03.

**Migrate (the content freeze starts here).** Don't use WordPress Tools → Export/Import (AWS's generic guide suggests it). It leaves out orders, WooCommerce settings and plugin tables.

- [ ] **Transfer key and space.** On PROD-03: `ssh-keygen -t ed25519 -N '' -f ~/.ssh/xfer && cat ~/.ssh/xfer.pub`, and append the key to `/home/bitnami/.ssh/authorized_keys` on PROD-02. PROD-03's `df -h /` must show at least the uploads size plus twice the DB size free. PROD-02 needs 1.5 × the DB size free, with 10% left afterwards, to write the dump; otherwise stream it (below). A full disk on PROD-02 stops MariaDB for both sites.
- [ ] **Freeze and quiesce PROD-02.** The founder has finished or paused sorting. From here until the Phase 5 IP move, nobody edits PROD-02 or logs in to its wp-admin (Action Scheduler's runner fires on admin requests, and a login changes usermeta). Stop its scheduler for the rest of its life:
  ```
  W="sudo wp --path=/opt/bitnami/wordpress"; P=$($W db prefix)
  sudo sed -i -E '/wp-cron/ s/^([^#])/#\1/' /etc/crontab /etc/cron.d/* /var/spool/cron/crontabs/* 2>/dev/null
  $W config set DISABLE_WP_CRON true --raw
  ```
  Optional enforcement (Paul's Cloudflare role includes Firewall): a temporary WAF custom rule that blocks non-GET requests to `/wp-login.php`, `/my-account*`, `/wp-json/*` and `/wp-admin/*` (except `/wp-admin/admin-ajax.php`) from everyone but you. GraphQL mutations can't be blocked without breaking .ca browsing, so the Phase 5 freeze check stays the safety net.
- [ ] **Dump and fingerprint PROD-02.**
  - Definer objects: `$W db query "SELECT (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()), (SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE()), (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE())"`. If any count is non-zero, strip only the definer clauses from the dump with ``sed -E 's/DEFINER=`[^`]*`@`[^`]*`//g'``. Never sed data.
  - Dump, detached from the browser tab (a dropped console session leaves a truncated file that looks valid):
    `mkdir -p /home/bitnami/migrate && nohup sudo wp --path=/opt/bitnami/wordpress db export /home/bitnami/migrate/db.sql --single-transaction --quick --default-character-set=utf8mb4 > /home/bitnami/migrate/export.log 2>&1 &`
    When it finishes, `tail -1 /home/bitnami/migrate/db.sql` must read `-- Dump completed`. Short on space: stream it from PROD-03 instead, `ssh -i ~/.ssh/xfer bitnami@172.26.9.66 'sudo wp --path=/opt/bitnami/wordpress db export - --single-transaction --quick --default-character-set=utf8mb4' > ~/import/db.sql`.
  - Row counts and the freeze fingerprint, right after the dump:
    ```
    for t in posts postmeta users usermeta comments wc_orders wc_orders_meta wc_order_addresses woocommerce_order_items woocommerce_order_itemmeta woocommerce_shipping_zones woocommerce_tax_rates actionscheduler_actions; do echo "$t $($W db query "SELECT COUNT(*) FROM ${P}$t" --skip-column-names)"; done > /home/bitnami/migrate/dump-counts.txt
    echo "CHECKSUM TABLE ${P}posts, ${P}postmeta, ${P}users, ${P}usermeta, ${P}comments, ${P}commentmeta, ${P}term_relationships, ${P}wc_orders, ${P}wc_orders_meta, ${P}actionscheduler_actions, ${P}gf_entry, ${P}frmt_form_entry" > ~/fp.sql
    $W db query < ~/fp.sql > ~/freeze-fingerprint.txt; touch ~/freeze-dump-time
    ```
    The two form-entry tables just report nothing if those plugins aren't installed.
- [ ] **Pull everything to PROD-03** over PROD-02's private IP, using the real `wp-content` path from Phase 1:
  ```
  mkdir -p ~/import
  rsync -a --info=progress2 -e 'ssh -i ~/.ssh/xfer' bitnami@172.26.9.66:/home/bitnami/migrate/ ~/import/
  rsync -a --info=progress2 -e 'ssh -i ~/.ssh/xfer' --exclude '/cache/' bitnami@172.26.9.66:<real-wp-content-path>/ ~/import/wp-content/
  ```
  `sha256sum` of `db.sql` must match on both ends, and `find ~/import/wp-content | wc -l` must roughly match `sudo find -L <real-wp-content-path> | wc -l` on PROD-02, less the cache dir. Never stage a dump under a web root. Any copy that leaves AWS must be encrypted, kept outside OneDrive, and deleted after sign-off.
- [ ] **wp-config.** Edit only `/var/www/wp-config.php`; `sudo find /var/www -maxdepth 2 -name wp-config.php` must return just that file. Never copy PROD-02's file into the web root: WordPress would load it, with Bitnami's DB credentials.
  - Carry over `$table_prefix`, the salts, and only the `define()`s recorded in Phase 1.
  - Replace the blueprint's dynamic `WP_HOME`/`WP_SITEURL` lines with `define('WP_HOME', 'https://proskatersplace.com');` and `define('WP_SITEURL', 'https://proskatersplace.com');`.
  - Add `define('DISABLE_WP_CRON', true);`.
  - Never port Bitnami's `WP_CLI`/`HTTP_HOST` block, the `X-Forwarded-Host` block (Cloudflare passes that header through from clients), dynamic `WP_HOME`/`WP_SITEURL`, `WP_AUTO_UPDATE_CORE`, `auto_prepend_file`, or any line containing `/opt/bitnami` or `/bitnami/`.
- [ ] **wp-content.** Move the blueprint's aside so none of its plugins or drop-ins (`advanced-cache.php`, `object-cache.php`, `db.php`) survive, then put PROD-02's in place:
  ```
  sudo mv /var/www/html/wp-content /var/www/html/wp-content.blueprint
  sudo rsync -a ~/import/wp-content/ /var/www/html/wp-content/
  ```
  Copy the non-core docroot files recorded in Phase 1 to the same paths (never `wp-config.php`, `.user.ini` or `wordfence-waf.php`). Create the hold mu-plugin above. Then apply the blueprint's ownership:
  ```
  sudo chown -R admin:www-data /var/www/html
  sudo find /var/www/html/wp-content -type d -exec chmod 2775 {} +
  sudo find /var/www/html/wp-content -type f -exec chmod 0664 {} +
  ```
- [ ] **Import and check it** (as `admin`, in `/var/www/html`): `wp db reset --yes && wp db import ~/import/db.sql && echo IMPORT_OK`.
  - `grep -c '^CREATE TABLE' ~/import/db.sql` equals `wp db query 'SHOW TABLES' --skip-column-names | wc -l`.
  - The same counts loop, run with `W=wp` and `P=$(wp db prefix)` and written to `~/prod03-counts.txt`, `diff`s clean against `~/import/dump-counts.txt`.
  - `wp option get woocommerce_custom_orders_table_enabled` prints `yes`.
  - Block Phase 4 on any mismatch. `wp db import` stops at its first error and leaves every later table missing while pages still render.
- [ ] **Core and DB updates.** Only `wp-content` came across; core comes from the blueprint. Run `wp core update --version=<PROD-02's core version>`, then `wp core update-db && wp wc update`. `wp option get home` and `wp option get siteurl` must both print `https://proskatersplace.com`.
- [ ] **Bitnami paths and caches.** `sudo grep -rlI --exclude-dir=cache -e '/opt/bitnami' -e '/bitnami/wordpress' /var/www/html/wp-content /var/www/html/.htaccess` and `wp db search '/bitnami/' --all-tables-with-prefix --stats`. If either finds hits, run these in this order, each with `--dry-run` first (the longer string has to go first):
  ```
  wp search-replace '/opt/bitnami/wordpress' '/var/www/html' --all-tables --skip-columns=guid
  wp search-replace 'proskatersplace.com/bitnami/wordpress/' 'proskatersplace.com/' --all-tables --skip-columns=guid
  wp search-replace '/bitnami/wordpress' '/var/www/html' --all-tables --skip-columns=guid
  ```
  Never `sed` the dump: that breaks serialized lengths. Then, regardless: `wp plugin deactivate flying-press && wp plugin activate flying-press` (rewrites `advanced-cache.php` with the new paths), `wp cache flush`, `wp elementor flush-css`. Keep `uploads/elementor/`; it isn't a page cache.
- [ ] **Per-directory PHP settings and Wordfence.** Bitnami runs Apache with `AllowOverride None`, so the `.htaccess` files plugins wrote under `wp-content` have never been read; PROD-03 switches them all on. Under FPM, any `php_value` or `php_flag` line is a 500 for its directory. `sudo find /var/www/html -name .htaccess -exec grep -HnE 'php_value|php_flag|php_admin' {} +` must print nothing. Delete those lines, moving a setting into `/etc/php/psp-overrides.ini` only if it's safe site-wide. A `php_flag engine off` in an uploads `.htaccess` becomes `<FilesMatch "\.php$">Require all denied</FilesMatch>` instead. Wordfence's Extended Protection is set up again in Phase 4, never copied.
- [ ] **Rewrite rules.** Bitnami keeps WordPress's permalink rules in its vhost files, not in `.htaccess`, and `wordpress-htaccess.conf` is a series of `<Directory>` blocks, which return a 500 for every request if pasted into `.htaccess`.
  - `sudo a2enmod rewrite headers expires`
  - `sudo apache2ctl -S; sudo grep -Rn AllowOverride /etc/apache2/apache2.conf /etc/apache2/sites-enabled/` must show `AllowOverride All` for `/var/www/html` (Debian's default is None). Otherwise put the rules in the vhost.
  - Write `/var/www/html/.htaccess`. The first rule keeps old `/bitnami/wordpress/...` URLs working:
    ```
    RewriteEngine On
    RewriteRule ^bitnami/wordpress(/.*) $1 [L]
    # BEGIN WordPress
    <IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
    RewriteBase /
    RewriteRule ^index\.php$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.php [L]
    </IfModule>
    # END WordPress
    ```
  - For every other `<Directory "/opt/bitnami/wordpress/X">` block in `wordpress-htaccess.conf`, copy only its inner lines into `/var/www/html/X/.htaccess`.
  - Port any http→https and www→apex redirects from Bitnami's `wordpress-vhost.conf` and `wordpress-https-vhost.conf` into the new vhost.
- [ ] **TLS.** AWS says certificates can't be transferred, and the Lightsail HTTPS wizard can't work behind Cloudflare's proxy.
  - If PROD-02's cert (Phase 1) is a Cloudflare Origin CA cert covering `proskatersplace.com` and `*.proskatersplace.com`, copy the cert and key to PROD-03. Otherwise the zone admin named in Phase 1 issues one (recommended).
  - If it's Let's Encrypt, copy PROD-02's current fullchain and key as a bridge. PROD-03 won't renew it, so install an Origin CA cert before it expires.
  - Find the SSL vhost (`sudo apache2ctl -S; sudo grep -Rn SSLCertificate /etc/apache2/sites-enabled/`), point `SSLCertificateFile` and `SSLCertificateKeyFile` at the installed files (key mode 600), then `sudo apache2ctl configtest && sudo systemctl reload apache2`.
  - From your workstation: `openssl s_client -connect <PROD-03-ip>:443 -servername proskatersplace.com </dev/null | openssl x509 -noout -subject -issuer -enddate`, then again with `-servername www.proskatersplace.com`. On *Full (strict)* the issuer must be Cloudflare Origin CA or a public CA. If it isn't, don't go to Phase 5.
- [ ] **Code Snippets.** They run on every request, and Phase 4's render checks don't reach the payment hooks. `for f in ~/import/snippets/snip-*.php; do php8.4 -l "$f"; done` must report no errors.
- [ ] **Plugins** arrive at PROD-02's versions with `wp-content`. Change one only when it fails on 8.4 in Phase 4, and install it from the vendor zip downloaded in Phase 1 (`wp plugin install /path/plugin.zip --force`), not through wp-admin's updater. Never move WooCommerce, WooGraphQL or WPGraphQL in this window: a WooCommerce upgrade caused the 2026-08-13 schema flap. Keep snippet 87 active and WPGraphQL Smart Cache deactivated. **Slider Revolution 5.4.8** (2018-era): test it; update to 6.x only with a purchase code, otherwise apply the Phase 1 decision.
- [ ] Last: `sudo find /var/www/html -user root` prints nothing.

## Phase 4: verify PROD-03 before touching the static IP

Cloudflare Origin CA and self-signed certs aren't trusted by browsers, curl or Node, so set up first:
- Download the Origin CA root that matches the cert type: `https://developers.cloudflare.com/ssl/static/origin_ca_rsa_root.pem` (RSA) or `origin_ca_ecc_root.pem` (ECC).
- Point both `proskatersplace.com` and `www.proskatersplace.com` at PROD-03's temporary IP in `C:\Windows\System32\drivers\etc\hosts`.
- curl: `curl --resolve proskatersplace.com:443:<PROD-03-ip> --cacert <root>.pem https://proskatersplace.com/...`. Use `-k` only while PROD-03 still has a self-signed cert.
- Browser: a separate profile with that root imported as a trusted CA.
- Never test via `http://<ip>/`: WordPress redirects to the real domain, which is still PROD-02, and app passwords are refused without HTTPS. Never change home/siteurl or run search-replace to the temporary IP.

- [ ] Marker: `echo prod03 | sudo tee /var/www/html/prod03-marker.txt`. Every test path (curl, browser, the local .ca dev server) must first return `prod03` for `https://proskatersplace.com/prod03-marker.txt`.
- [ ] Re-check the CVE gate through the web: re-create `v.php` from Phase 3, fetch it via `--resolve`, then delete it.
- [ ] `wp core verify-checksums`; `wp plugin verify-checksums --all` (wp.org plugins)
- [ ] Turn on logging without on-screen output. With `WP_DEBUG_DISPLAY` at its default, notices print into pages and can break logins.
  `sudo install -d -o www-data -g www-data -m 0750 /var/log/wordpress`, then set in `/var/www/wp-config.php`:
  ```
  define('WP_DEBUG', true);
  define('WP_DEBUG_DISPLAY', false);
  define('WP_DEBUG_LOG', '/var/log/wordpress/debug.log');
  @ini_set('display_errors', '0');
  ```
  Watch that log plus `/var/log/apache2/error.log` and `/var/log/php8.4-fpm.log`; fatals before WordPress loads never reach `debug.log`. Pass: no `PHP Fatal error`, `Uncaught` or `PHP Warning` lines from active plugins, the theme or our code. `Deprecated` lines are reviewed but don't block. Browse these pages:
  - [ ] home
  - [ ] a category
  - [ ] a simple and a variable product
  - [ ] cart
  - [ ] checkout (render only)
  - [ ] an Elementor page
  - [ ] a brand page
  - [ ] a blog post
  - [ ] a recovered draft (preview)
- [ ] wp-admin: log in; WooCommerce → Status shows PHP 8.4.x, no DB update pending, and no failed scheduled actions. `wp wc payment_gateway list --user=<admin-id> --fields=id,enabled` matches PROD-02's halted state from Phase 1.
- [ ] Wordfence, if PROD-02 had Extended Protection: Wordfence → Firewall → *Optimize the Wordfence Firewall* → Apache + PHP-FPM, then wait 5 minutes. Re-run the web probe with `ini_get("auto_prepend_file")` added: it must print `/var/www/html/wordfence-waf.php`, and the Firewall page must show Extended Protection. If it causes fatals, delete `/var/www/html/.user.ini` and wait 5 minutes.
- [ ] GraphQL:
  - [ ] Run the same product query with .ca headers (`X-Frontend-Type: woonuxt`, a Chrome User-Agent) against PROD-02 (hosts entries commented out) and PROD-03 (`--resolve`, `--cacert`), then `diff` the two responses. Prices and currency markers must be identical.
  - [ ] Schema stability: `for i in $(seq 20); do curl -s --resolve proskatersplace.com:443:<PROD-03-ip> --cacert <root>.pem -H 'Content-Type: application/json' -d '{"query":"{ __type(name:\"Product\"){ name } }"}' https://proskatersplace.com/graphql; echo; done`. Every line must contain `"name":"Product"`, never null.
- [ ] With the **production** .ca credential (`WP_ADMIN_USERNAME` / `WP_ADMIN_APP_PASSWORD` from the Pages project, not a new one):
  - [ ] REST: `curl -sS --resolve proskatersplace.com:443:<PROD-03-ip> --cacert <root>.pem -u "$WP_ADMIN_USERNAME:$WP_ADMIN_APP_PASSWORD" 'https://proskatersplace.com/wp-json/wc/v3/orders?per_page=1'` returns 200.
  - [ ] GraphQL: the same credential with `-H 'Content-Type: application/json' -d '{"query":"{ viewer { username roles { nodes { name } } } }"}' https://proskatersplace.com/graphql` returns a non-null viewer with the administrator role. The .ca order is created by GraphQL `createOrder` over Basic auth, so passing REST doesn't prove this path.
  - [ ] One test order through that same path, so the order hooks first run on 8.4 here rather than on a real card in Phase 6:
    ```
    curl -sS --resolve proskatersplace.com:443:<PROD-03-ip> --cacert <root>.pem -u "$WP_ADMIN_USERNAME:$WP_ADMIN_APP_PASSWORD" -H 'Content-Type: application/json' -d '{"query":"mutation($i:CreateOrderInput!){createOrder(input:$i){order{databaseId orderNumber status}}}","variables":{"i":{"status":"PENDING","isPaid":false,"paymentMethod":"helcimjs","billing":{"email":"<internal address>","country":"CA","state":"ON","postcode":"M9W 4Y6"},"lineItems":[{"productId":<simple product ID>,"quantity":1}]}}}' https://proskatersplace.com/graphql
    ```
    Check the order number, the line-item meta and a clean log, then `wp wc shop_order delete <id> --force=true --user=<admin-id>`. It consumes an order number and may sync to Omnisend, FunnelKit or pixels.
- [ ] REST checks:
  - [ ] the contact relay route
  - [ ] `/wp-json/psp/v1/upsell/health` (if deployed)
- [ ] WP Mail SMTP test email to an internal address.
- [ ] SEO (CLAUDE.md rule 10):
  - [ ] `wp eval 'echo home_url()," ",site_url()," ",get_option("blog_public");'` prints `https://proskatersplace.com https://proskatersplace.com 1`.
  - [ ] The SEO plugin's sitemap index lists the same total URL count via `--resolve` (PROD-03) as via normal DNS (PROD-02).
  - [ ] About 20 top .com URLs (home, top categories, products, blog): 200 with no redirect chain; `<link rel="canonical">` is the same `https://proskatersplace.com` URL; no `noindex` in meta robots or `X-Robots-Tag`; psp-hreflang en-CA alternates present.
  - [ ] `robots.txt` is byte-identical to PROD-02's; spot-check a few Redirection rules.
- [ ] Rewrites and files: a product URL returns 200; `/wp-content/uploads/wc-logs/` returns 403; each docroot file copied in Phase 3 returns 200 with identical bytes.
- [ ] Load: `seq 20 | xargs -P 20 -I{} curl -s -o /dev/null -w '%{http_code}\n' --resolve proskatersplace.com:443:<PROD-03-ip> --cacert <root>.pem https://proskatersplace.com/product/<slug>/ | sort | uniq -c` shows only 200. Repeat with a `/graphql` POST.
- [ ] Local .ca dev server against PROD-03 (hosts file), in PowerShell: `$env:NODE_EXTRA_CA_CERTS='C:\path\<root>.pem'; $env:GQL_HOST='https://proskatersplace.com/graphql'; $env:BASE_URL='https://proskatersplace.com'`. First, `node -e "fetch('https://proskatersplace.com/prod03-marker.txt').then(r=>r.text()).then(console.log)"` must print `prod03`. Then `npm run dev`, load a product page and the cart, and go to checkout with an Ontario address (e.g. M9W 4Y6). *Helcim Payment* must be listed and Canadian rates shown (free over $135), not the CA$113 Default-zone courier. Don't submit payment.

## Phase 5: cutover

Schedule the window clear of 07:15 UTC, when the nightly feed job runs. Have the go/no-go owner (D5), the DNS owner and the *Cache Purge* holder available.

- [ ] Remove the `proskatersplace.com` and `www` hosts entries from your workstation, run `ipconfig /flushdns`, and confirm `nslookup proskatersplace.com` returns Cloudflare addresses.
- [ ] `gh workflow disable "Refresh merchant feed"`, and announce a freeze on pushes to master until the smoke tests pass. Its push would start a production .ca build mid-cutover.
- [ ] Orders are still halted: through `curl --resolve`, a .com checkout on PROD-03 can't complete.
- [ ] Clean up PROD-03: set `WP_DEBUG` to false and remove the `WP_DEBUG_LOG` line; `sudo rm -f /var/www/html/wp-content/debug.log /var/www/html/prod03-marker.txt /var/www/html/v.php`; `sudo find /var/www/html -user root` prints nothing.
- [ ] **Freeze check on PROD-02** (still running; set `W` as in Phase 1):
  - `$W db query < ~/fp.sql | diff ~/freeze-fingerprint.txt -`
  - `sudo find "$(readlink -f /opt/bitnami/wordpress/wp-content)/uploads" -newer ~/freeze-dump-time -type f | head`
  - Any difference means a final re-sync: a fresh dump; on PROD-03 `wp db reset --yes`, the import and its gate, `wp core update-db && wp wc update`; rsync the `wp-content` delta and re-apply ownership; run `~/prod03-post-import.sh` (`wordpress/scripts/`: search-replace, snippet clean-up, MyISAM → InnoDB), the FlyingPress steps and Wordfence's Optimize; then home, a product and `/graphql` via `--resolve`.
- [ ] Remove `~/.ssh/xfer*` on PROD-03 and its line in PROD-02's `authorized_keys`.
- [ ] **Past-due review on PROD-03**, before its scheduler starts. PROD-02 ran nothing after the dump, so these jobs run once, on PROD-03. Cancel only stale one-off customer-facing sends, by hook. Never bulk-cancel: that also cancels the DB-update callbacks.
  - `wp db query "SELECT hook,COUNT(*) FROM $(wp db prefix)actionscheduler_actions WHERE status='pending' AND scheduled_date_gmt < UTC_TIMESTAMP() GROUP BY hook"`; cancel in Tools → Scheduled Actions.
  - `wp cron event list --fields=hook,next_run_gmt,next_run_relative`; `wp cron event delete <hook>` for stale one-offs.
  - If FunnelKit Automations is active, its own queue: `wp db query "SHOW TABLES LIKE '%bwf%'"`, then the same check.
- [ ] **PROD-03 firewall, before the IP move.** IPv4: 443 from the 22 Cloudflare CIDRs recorded in Phase 1, keeping your `/32` for now. PROD-02 has no port 80 rule; don't add one. IPv6: no 80/443 rules, since there's no proxied AAAA for the origin (Phase 1). SSH: browser SSH.
- [ ] **Error sanitizer 1.2.1 on PROD-02 too**, while it still serves, so a rollback keeps the stale-cart recovery and the plain "invalid information" copy. It only changes GraphQL error wording (the .com theme doesn't use GraphQL). In PROD-02's browser terminal:
  ```
  F=$(readlink -f /opt/bitnami/wordpress/wp-content)/mu-plugins/psp-graphql-error-sanitizer.php
  curl -fsSL https://raw.githubusercontent.com/Affinity-Design/woonuxt/master/wordpress/mu-plugins/psp-graphql-error-sanitizer.php -o /tmp/s.php && php -l /tmp/s.php && grep -q 'Version: 1.2.1' /tmp/s.php && sudo cp "$F" ~/psp-graphql-error-sanitizer.php.bak && sudo install -o "$(stat -c %U "$F")" -g "$(stat -c %G "$F")" -m "$(stat -c %a "$F")" /tmp/s.php "$F" && grep -m1 Version "$F"
  ```
  Then a bad token, `curl -s https://proskatersplace.com/graphql -H 'Content-Type: application/json' -H 'woocommerce-session: Session not.a.token' -d '{"query":"{ cart { total } }"}'`, should return "Your cart session expired…". If 0.21.1 still yields the generic copy, it hides the reason and rollback recovery stays as described under Rollback.
- [ ] **.ca frontend is already on the dual-version build** (it went to `master` before the window; see the execution log). Confirm the production Pages deployment is that commit, not `40e5ae0b`. No .ca deploy happens in the window.
- [ ] **Stop PROD-02.** Don't delete it.
- [ ] Lightsail → Networking → static IP: **detach from PROD-02, attach to PROD-03.**
- [ ] Straight away, from a machine with no hosts override: `curl -sS -o /dev/null -w '%{http_code}\n' https://proskatersplace.com/`, and the same for `/graphql`. 200 means carry on; 522 points to the firewall, 526 to the certificate. Then remove your `/32` from 80 and 443 and confirm with `aws lightsail get-instance-port-states --instance-name ProSkatersPlace-PROD-03`, checking both `cidrs` and `ipv6Cidrs`. SSH stays browser SSH only.
- [ ] **Start the scheduler on PROD-03:**
  ```
  rm /var/www/html/wp-content/mu-plugins/000-psp-migration-hold.php
  echo '* * * * * www-data cd /var/www/html && /usr/bin/php8.4 -q wp-cron.php 2>&1 | /usr/bin/logger -t wp-cron' | sudo tee /etc/cron.d/wordpress
  sudo systemctl enable --now cron
  ```
  Keep `DISABLE_WP_CRON` true. Port PROD-02's other cron lines (Phase 1) with their paths rewritten. Within 10 minutes: `wp cron event list --fields=hook,next_run_relative` shows nothing overdue; `wp db query "SELECT COUNT(*) FROM $(wp db prefix)actionscheduler_actions WHERE status='pending' AND scheduled_date_gmt < UTC_TIMESTAMP() - INTERVAL 5 MINUTE"` returns 0; `journalctl -t wp-cron` shows no fatals.
- [ ] Purge caches:
  - [ ] Cloudflare (.com zone), by the *Cache Purge* holder
  - [ ] FlyingPress
  - [ ] .ca `NUXT_CACHE` only, and only if `NUXT_PAYMENT_DATA` is bound (Phase 1). From the repo root in Git Bash, with `CF_ACCOUNT_ID` and `CF_API_TOKEN` set:
    `CF_KV_NAMESPACE_ID_CACHE=<prod NUXT_CACHE id from Phase 1> PURGE_SCRIPT_DATA=false node scripts/prebuild-cache-purge.js`
    It paginates, leaves `NUXT_SCRIPT_DATA` alone and keeps the `calc-stats:` keys. **Don't** use `npm run clear-cache-all`, `clear-page-cache`, `reset-cache` or plain `npm run warm-cache`. They default to the test namespace or to localhost, delete at most 1,000 keys per run, and `--all` wipes `NUXT_SCRIPT_DATA` (sitemap-data, products-list), which shrinks `/api/sitemap.xml` to about 22 URLs. No .ca rebuild is needed: PROD-03 carries PROD-02's data.
  - [ ] Warm: `gh workflow run warm-cache-on-deploy.yml` (runs `cache-warmer.js all --force` against proskatersplace.ca). Its log must show `Successfully fetched N products`.
- [ ] Smoke test through Cloudflare, bypassing its cache: `curl -sS -o /dev/null -D - "https://proskatersplace.com/?cb=$(date +%s)" | grep -iE '^(HTTP/|cf-cache-status)'` must show 200 and never `HIT`. Same for a product URL.
  - [ ] .com home, product, `/graphql`
  - [ ] .ca product page, add to cart, checkout page load
  - [ ] contact form: the `/api/contact` response must be `{"success":true,"provider":"wordpress"}`. Any other provider means the WordPress relay on PROD-03 is broken.
  - [ ] `curl -s https://proskatersplace.ca/api/sitemap.xml | grep -c '<loc>'` matches the Phase 1 count.
  - [ ] `https://proskatersplace.com/phpmyadmin/` and `https://proskatersplace.com/wp-content/debug.log` return 403 or 404.
- [ ] `gh workflow enable "Refresh merchant feed"`, then `gh workflow run "Refresh merchant feed"`. Confirm the run is green and, if it committed, that the deploy went out. Lift the push freeze.
- [ ] **Backups on PROD-03.** A new instance has no automatic snapshots.
  - Enable them at 08:00 UTC: PROD-03 → Snapshots → Automatic snapshots, or `aws lightsail enable-add-on --region us-east-1 --resource-name ProSkatersPlace-PROD-03 --add-on-request addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=08:00}`.
  - Take a manual snapshot `PROD-03-post-cutover-<date>` and wait for *Available*.
  - Recreate PROD-02's metric alarms and notification contacts.
  - Standing rule: a named owner takes a monthly manual snapshot `PROD-03-monthly-YYYYMM` and keeps each for 6–12 months. Seven daily snapshots didn't cover deletions noticed weeks later.
- [ ] **PHP patch owner** (name: ______). Sury isn't covered by Debian security updates. Run `apt-cache policy php8.4-fpm` to read Sury's origin, then add it to `Unattended-Upgrade::Origins-Pattern` in `/etc/apt/apt.conf.d/50unattended-upgrades`, or diarise a monthly `sudo apt update && apt list --upgradable | grep php`. After each PHP update: `sudo systemctl restart php8.4-fpm`, re-run the Phase 3 CVE gate, and check the Lightsail CVE banner is clear. Apply the CVE-2026-115560 fix within 7 days of its release; until then keep `session.upload_progress.enabled = 0`.
- [ ] Update `wordpress/production-wordpress-ssh-access.md` with the new instance name, SSH user, WordPress root, IPv6 and paths.

## Phase 6: soak, then reopen orders

The go/no-go owner (D5) decides each step. Orders stay closed until every gate passes, because rollback is only clean until PROD-03 takes an order.

- [ ] **Rollback triggers for the first hours:** any origin 5xx in Cloudflare Analytics, GraphQL `errors`, or a PHP fatal in the Apache or FPM error log. Fix forward if it's quick (deactivate the plugin, or the snippet via safe mode). If it isn't fixed within 60 minutes, roll back the IP.
- [ ] **Soak for at least 24 h with the scheduler running**, then check:
  - WooCommerce → Status → Scheduled Actions shows no new Failed.
  - `wp cron event list` shows nothing overdue.
  - The FPM and Apache error logs have no fatals.
  - On GitHub, the next scheduled "Refresh merchant feed" run and a "Warm cache after production deploy" run succeeded.
  - The RexTheme product feed file's timestamp has moved forward.
  - PROD-03's first automatic snapshot exists.
- [ ] **.com payment gateways.** .com checkout runs different code from the .ca Helcim path. For each enabled .com gateway (e.g. `helcimjs`, `ppcp-gateway`, `ppcp-credit-card-gateway`, `stripe`), place one real low-value order through Cloudflare with an internal address, then refund it from WooCommerce → Orders → *Refund via <gateway>*. Do this while the store is still closed to customers if the halt mechanism allows it (coming-soon mode lets a logged-in admin check out). Each order must show status processing, the gateway's transaction ID, the refund recorded, a webhook delivery to proskatersplace.com with HTTP 200 in the PayPal or Stripe dashboard, and no new PHP error-log lines.
- [ ] .ca: place one real low-value Helcim order and refund it.
- [ ] Reopen orders by undoing the halt recorded in Phase 1. From here on, fix forward.

## Rollback

- **Recovery (Phase 2):** recovered products are drafts tagged `recovered-from-snapshot`, with `_psp_recovered_source_id` meta, and the `psp_recovery_ledger` option lists them. To undo, delete the tagged drafts, or restore `PROD-02-pre-apply-<S>` (one per run; `PROD-02-after-trash-restore-20261030` predates it). After drafts are deleted, a re-run skips them unless their snapshot IDs are listed in `force-recreate=<id,id,...>`.
- **Before the IP move:** PROD-02 changed only through the recovery and the Phase 3 scheduler stop. If the migration is abandoned, uncomment PROD-02's wp-cron lines and set `DISABLE_WP_CRON` back to its Phase 1 value.
- **After the IP move:**
  1. Rollback is clean only while PROD-03 has written nothing. Once it has orders, customer accounts, contact messages or product edits, prefer a forward fix. After Phase 6 reopens orders, IP rollback is off the table.
  2. Before stopping PROD-03, export what it has done since cutover: the actions it already ran (`wp db query "SELECT hook,args,scheduled_date_gmt FROM $(wp db prefix)actionscheduler_actions WHERE status='complete' AND last_attempt_gmt >= '<cutover UTC>'"`), and any orders and new customers (`wp wc shop_order list --user=<admin-id> --after=<cutover ISO time> --format=json > prod03-orders.json`; `wp user list --role=customer --fields=ID,user_email,user_registered --format=csv`).
  3. Stop PROD-03, re-attach the static IP to PROD-02, and start PROD-02. Back in a few minutes. Remember PROD-02 is still on the vulnerable PHP.
  4. Keep the merchant-feed workflow disabled and pushes to master frozen until these steps are done.
  5. On PROD-02, cancel the pending actions PROD-03 already ran (and the same in FunnelKit's queue if it's active). Only then uncomment its wp-cron lines and restore `DISABLE_WP_CRON` to its Phase 1 value. It was stopped with its scheduler off, so nothing fires before this. Re-enter any exported orders and customers.
  6. Purge the .com zone (the *Cache Purge* holder) and .ca `NUXT_CACHE` with the Phase 5 command, then `gh workflow run warm-cache-on-deploy.yml`.
  7. If an AAAA record was repointed instead of deleted, the DNS owner points it back at PROD-02's IPv6 (recorded in Phase 1; it survives stop/start).
- **.ca frontend:** the current build works on both plugin stacks (it asks the schema before sending the three 1.0-only input fields), so a backend rollback needs no frontend change. Shoppers who browsed during the PROD-03 window hold session tokens PROD-02 rejects; they only get the clean "cart expired" recovery if PROD-02 runs error sanitizer ≥ 1.2.0 (Phase 5 installs 1.2.1). Without it their first cart request fails, cookies are cleared, and signed-in shoppers are signed out once. Cloudflare's rollback target from before this change is deployment `40e5ae0b` (commit `6145604f`). Don't roll back to it while PROD-03 serves: on 1.0.3 it prints `$$12.00&nbsp;CAD` shipping costs, can't sign up customers, and has no stale-session recovery.
- **A Code Snippet fatals:** add `define('CODE_SNIPPETS_SAFE_MODE', true);` to `/var/www/wp-config.php`, deactivate the snippet, then remove the constant.
- Keep PROD-02 (stopped) and its snapshots for at least 14 days. Lightsail still bills stopped instances. Deleting an instance also deletes its automatic snapshots, so before deleting PROD-02, run *Keep snapshot* on its newest automatic snapshot and confirm it now shows under manual snapshots.

## Cross-site impact

- **US (.com):**
  - The theme renders on PROD-03's PHP. Fatals become 500s that Google crawls, so Phase 4 must pass first.
  - Recovered products are drafts: no public URL, no sitemap entry and no feed entry until published.
  - Published products that were deleted have been 404ing. Republishing them with their original IDs and slugs restores the old URLs, unless a stored redirect intercepts them (Phase 2 lists those).
- **CA (.ca):**
  - Relies on WPGraphQL data and schema, the application password (Helcim admin orders), the contact relay route, and KV caches. Phase 5 purges `NUXT_CACHE` only and re-warms it. No .ca rebuild is needed, because PROD-03 carries PROD-02's data and the .ca build already supports both plugin versions.
  - Don't create, rotate or revoke application passwords, and change no Pages env vars (`GQL_HOST`, `BASE_URL`, `WP_ADMIN_*`) for this migration. The migrated DB keeps the current app password valid on both PROD-02 and PROD-03, so rollback keeps working.
  - Drafts aren't exposed to unauthenticated GraphQL.
  - With test's origin down, `.ca` builds introspect whichever backend `GQL_HOST` names. Avoid production .ca builds during the Phase 5 outage window; builds before or after it are safe. The nightly "Refresh merchant feed" job pushes to master and so starts a build, which is why Phase 5 disables it and freezes pushes for the window.
- **Shared infra:** static IP, Cloudflare zone and SSL mode, outbound email, Helcim. The Rollback section lists the extra steps (scheduler, caches, DNS) each one needs.

## Open questions

1. D1: which snapshot predates the deletions, and is it automatic or manual? **Answered in D1.**
2. Is anything that charges on a schedule (WooCommerce Subscriptions) active? **Answered 2026-10-30: no WooCommerce Subscriptions.** The snapshots may be booted for export, with the Phase 2 quarantine (cron off, mail and outbound HTTP blocked), because FunnelKit, Omnisend and SMTP can still email customers. Still run the Phase 2 plugin check on the box to confirm.
3. Does Cloudflare have an AAAA record for the origin? **Partly answered:** the team holds DNS edit, *SSL and Certificates: Edit* and *Cache Purge* on the day ("we can"). Whether an AAAA record exists still needs checking in Phase 1.
4. Which PHP 8.4 build does the Lightsail WordPress blueprint ship? **Answered:** Debian's 8.2 under mod_php; Phase 3 installs Sury 8.4 FPM. Confirm on the box.
5. Who is the go/no-go owner (D5)? **Answered: the owner's team.**
6. Are the premium plugin licences active, and is there a Slider Revolution purchase code? **Answered: licences are active.**
7. Who owns PHP security updates and the monthly snapshot on PROD-03 after cutover? **Answered: the owner's team ("should be fine").** Phase 3 should still enable `unattended-upgrades` for the Sury PHP packages, so CVE fixes land without anyone remembering.
8. Should the optional Cloudflare WAF rule enforce the content freeze (Phase 3)? **Open.** Recommended: yes, for the length of the window. It's one rule, removed after cutover.

## Execution log

**2026-11-04**
- **Change of plan (owner-approved):** PROD-02 runs **PHP 8.0.17**, so WPGraphQL for eCommerce 1.0.3 (needs PHP 8.1) can't be activated there. The GraphQL plugin swap and the removal of the patch snippets (#87, #38, and the stub in #40) move to PROD-03, after it's verified on the current plugins and before the static IP moves. **Hold before the IP move:** the owner signs in to PROD-03 and checks everything is there first.
- Baseline snapshot `PROD-02-pre-php84-20261104` started. The interim `PROD-02-after-trash-restore-20261030` is Available.
- GraphQL-related snippets #38, #40, #47, #87 and #88 exported to `wordpress/snippets/live-2026-11-04/`. #47 ("Allow PSP.ca headers") is dead code: it POSTs every completed order to a `.ca` `/api/sync-order` route that returns 404.
- PROD-02 facts from Site Health:
  - WordPress 7.1.4, PHP **8.0.17** (FPM), MariaDB 10.6.7
  - memory_limit 1024M, upload_max_filesize 80M, time limit 300
  - WooCommerce 11.2.1, WPGraphQL 2.9.1, WooGraphQL 0.21.1, Headless Login 0.4.1, Smart Cache 2.0.1 (inactive)
- **PROD-03 created**:
  - `ProSkatersPlace-PROD-03`, blueprint `wordpress_ls_1_0` (WordPress 7.1.4), 32 GB, us-east-1a, automatic snapshots on
  - temporary IPv4 `184.198.166.240`, private `172.26.4.6`, IPv6 (see the Lightsail console; not published here)
  - Firewall: HTTP, HTTPS and SSH only from the operator's office IP (`/32`), plus Lightsail browser SSH; IPv6 rules removed.
  - Migration SSH key `psp-migrate-20261104` installed for `admin` by the launch script. **Remove it after cutover.**
- PROD-03 Debian 12, OS updates applied (covers the console's CVE-2026-98432 notice). **PHP 8.4.27** installed from packages.sury.org.
  - Apache switched to mpm_event + php8.4-fpm.
  - `/etc/php/psp-overrides.ini` (1024M, 80M, 300s, max_input_vars 10000, `session.upload_progress.enabled = 0`, `expose_php = Off`) linked into fpm and cli.
  - Pool: dynamic, max_children 120.
  - **CVE gate passed:** the web probe shows `8.4.27 fpm-fcgi`, upload_progress off.
- phpMyAdmin symlink removed from the docroot (it answered 200); modules rewrite, headers and expires enabled.
- Debian's `AllowOverride None` on `/var/www/` is still to be handled with the permalink rules after the import.
- Blueprint boot script `/opt/lightsail/scripts/configure_apache_php.sh` only writes the apache2-SAPI ini and the prefork config, so it doesn't touch FPM.
- Transfer key `prod03-xfer-20261104` generated on PROD-03 (`~/.ssh/xfer`).
- Claude's auto-mode safety check blocked Claude from opening SSH on PROD-02 (firewall change and browser terminal), so the PROD-02 step is pasted by the owner.
- **PROD-02 prep** was pasted by the owner, then the data came across over the private network as a tar stream, since PROD-02 has no rsync.
  - Bitnami's `sudo wp` runs as `daemon` and couldn't write the dump into `~bitnami/migrate`, so the dump was streamed straight to PROD-03 (`db export -`, 1.05 GB, "Dump completed 2026-11-04 19:03:54").
  - Row counts and the freeze fingerprint are in PROD-03 `~/import/`.
- **PROD-02 inventory highlights:**
  - DB 2.8 GB; uploads 5.5 GB. `wp-content/updraft` holds 24 GB of old UpdraftPlus backups (not copied to the web root).
  - Cloudflare Origin CA cert valid to 2037, copied to `/etc/ssl/psp/`.
  - Redis 5.0 object cache (`psp_prod:` prefix).
  - HPOS on.
  - Crons: root hourly `wp-cron.php`, bitnami `*/5` curl `wp-cron.php` through Cloudflare, monthly php-fpm restart.
  - Wordfence `.user.ini`/`wordfence-waf.php` present (not copied).
  - Orders are halted by **WooCommerce Maintenance Mode** (`woo_maint_disable_addcart` makes products non-purchasable). All payment gateways stay enabled.
  - Home and siteurl in the DB are `http://127.0.0.1` (hidden by Bitnami constants).
- **PROD-03 install:**
  - wp-config built from the blueprint's DB credentials (the password resolved once into a literal, replacing the blueprint's per-request `shell_exec`) plus PROD-02's salts and settings; `WP_HOME`/`WP_SITEURL` fixed to `https://proskatersplace.com`; Redis constants; `DISABLE_WP_CRON`.
  - wp-content in place without `updraft`/`cache`/`wflogs`. Hold mu-plugin `000-psp-migration-hold.php` stops Action Scheduler, all mail and marketing syncs (Klaviyo and others); the header-gated `X-PSP-Migration-Test` switch only exists for testing.
  - Import: 14/14 table counts match; HPOS yes.
  - Apache vhost `proskatersplace.conf` (origin cert, `AllowOverride All`, xmlrpc and akismet rules ported); search-replace of `/opt/bitnami/wordpress` made 99,213 changes (Wordfence file index, Yoast OG meta, 18 options).
  - PHP extensions added: gmp, ldap, memcached, tidy, sqlite3, imap; `redis-server` installed.
- **Phase 4 on the old plugins: pass.** Pages match PROD-02 (status, title, canonical); robots.txt identical; GraphQL product and prices identical; schema 20/20; no fatals. About 1,000 PHP 8.4 deprecation notices from plugins, non-blocking.
- **GraphQL swap on PROD-03:**
  - WPGraphQL 2.9.1 → **2.26.1**, Headless Login 0.4.1 → **0.4.4** (JWT security fix), WooGraphQL 0.21.1 → **WPGraphQL for eCommerce 1.0.3** (GitHub zips have no top-level folder, so they were renamed into the canonical folders).
  - Snippets **#87 and #38 off**, **#88 deleted**, the dead `codecept_debug` stub removed from **#40** (only 0.21.1 called it).
  - `~/post-import.sh` re-applies all DB-level changes after any re-sync.
  - Old plugin folders are in `~/plugin-backup/`; `~/plugin-stack.sh old|new` switches stacks.
- **1.0.3 regression found and fixed: Canadian carts priced in USD.** 1.0.3 flags GraphQL requests as REST and builds the customer only on `init_graphql_request`, after Price Based on Country's `woocommerce_init` check, so frontend pricing is skipped.
  - The same Toronto cart was $76.99 CAD (total $87.00 with HST) on 0.21.1 and US$54.97 on 1.0.3.
  - Fix: new mu-plugin `wordpress/mu-plugins/psp-graphql-pricing-zone.php` runs `wcpbc()->frontend_pricing_init()` on `init_graphql_request` priority 20. Retested: CAD $76.99 / $87.00 restored; US visitors stay in USD.
  - **Deploy it to production together with 1.0.3.**
- 1.0.3 checks passing:
  - schema stable 20/20
  - all queries and mutations .ca uses present (incl. `validateCheckoutData`)
  - Helcim Payment + Credit/Debit Card listed for CA
  - `format: RAW` works on `ShippingRate.cost`
  - an invalid or stale session token now returns an error (frontend recovery needed)
- **Open:** Toronto `availableShippingMethods.rates` is `null` over HTTP on both stacks (old and new), so it isn't caused by the swap. Under investigation.
- **Toronto `rates: null` explained: test artifact, not the migration.**
  - The test postcode M9W 4Y6 is the store's own postcode and the only location in zone 3 "POS" (zone_order 0). Its only method, `local_pickup:8`, is removed for non-staff by snippet #45 (`psp_filter_shipping_methods_by_role`), leaving no rates.
  - Same on 0.21.1 and on live. **Pre-existing:** a real customer at M9W 4Y6 sees no shipping options, and M9W (Etobicoke) isn't in the "GTA 50km" zone, so it gets Rest-of-Ontario rates.
  - With M5V 2T6 the .ca request sequence returns zone 8 rates in CAD (Store Pickup $0, Courier Ground $12, Next Day $14), and `ChangeShippingMethod` → `table_rate:17:2` gives a total of $99.00 CAD on 1.0.3.
  - **1.0.3 display change to fix in the frontend:** `ShippingRate.cost` is now formatted (`"$12.00&nbsp;CAD"`, was `"12"`), and `components/shopElements/ShippingOptions.vue` prints `$` in front, so it would read `$$12.00&nbsp;CAD`. Use `cost(format: RAW)`.
  - Once a table rate is chosen, `cod` (labelled "Helcim Payment") drops out of `paymentGateways` because COD allows only `local_pickup`; the frontend falls back to its built-in Helcim entry (pre-existing).
- **Owner sign-in check on PROD-03 passed** (separate Chrome profile mapping the domain to PROD-03). WooCommerce → Status: PHP 8.4.27, MariaDB 10.11, WP 7.1.4, WC 11.2.1 (DB current), GraphQL for eCommerce 1.0.3, WPGraphQL 2.26.1, Headless Login 0.4.4, HPOS, Redis; 1,729 products, 2,624 variations. WP Debug on, WP-Cron off and no `HTTP_CF_IPCOUNTRY` are expected until cutover.
- **MyISAM → InnoDB on PROD-03.** 43 tables (107 MB, including `wp_posts`, `wp_users`, `wp_usermeta`, the term tables, `wp_woocommerce_order_items` and `wp_woocommerce_sessions`) converted in 10 s by section 4 of `wordpress/scripts/prod03-post-import.php`. Row counts identical before and after; 0 MyISAM left. Backup of the 43 tables: `~/backup-myisam-20261104-1950.sql.gz`. Any re-sync from PROD-02 brings MyISAM back, and `prod03-post-import.sh` converts it again. PROD-02 is untouched.
  - Pre-existing, not fixed: mixed table collations (`wp_postmeta` utf8mb4_unicode_ci, `wp_wc_orders_meta` utf8mb4_unicode_520_ci) make the Orders screen's UTM-source filter log "Illegal mix of collations". Same on PROD-02.
- **Error sanitizer v1.2.0** installed on PROD-03 (v1.1.0 kept as `~/psp-graphql-error-sanitizer.php.v110.bak`). A stale `woocommerce-session` token now returns "Your cart session expired. Refresh the page to start a new one." plus a new session header, which the .ca frontend uses to start a fresh cart.
- `GRAPHQL_WOOCOMMERCE_SECRET_KEY` is not defined, so 1.0.3 signs sessions with `wp_salt()` (64 characters). If it's ever defined, it must be at least 32 bytes.
- **.ca frontend for 1.0.3 made dual-version and shipped before cutover.** Codegen passes against live PROD-02 (0.21.1) and PROD-03 (1.0.3). `authenticate` (registration, checkout account) and `createdVia` (Helcim admin order) are sent only when the live schema has them. Cloudflare Pages project `prod` builds `master` against `GQL_HOST=https://proskatersplace.com/graphql`, so it follows the static IP; preview builds are off.

**2026-11-05 (UTC) — cutover**
- **Error sanitizer 1.2.1 installed on PROD-02** (private link from PROD-03; v1.1.0 kept as `~bitnami/psp-graphql-error-sanitizer.php.v110.bak`). Coercion errors now read "Some submitted information was invalid". A stale session token still returns generic copy there: 0.21.1 hides the reason, so after a rollback the frontend's stale-cart recovery does not trigger (base logout path runs instead).
- **PROD-03 firewall** copied from PROD-02: 443 from Cloudflare's 22 ranges (15 IPv4, 7 IPv6). The office `/32` was later removed from 443 and the port 80 rule deleted. SSH: office `/32` + Lightsail browser SSH (remove the office rule after the soak).
- **Final re-sync 00:16** (`wordpress/scripts/prod03-final-resync.sh`): PROD-02 had a new customer, a deleted user, saved carts and scheduler activity since the 19:04 dump; no orders. 1,002 MB dump, all 14 table counts matched; `prod03-post-import.sh` re-applied (99,213 path replacements, snippets, 43 MyISAM → InnoDB). Between that dump and the stop, PROD-02 changed only postmeta and Action Scheduler rows (no orders, users or posts).
- **Cutover 00:27:** WP_DEBUG off, merchant-feed workflow disabled, PROD-02 stopped, static IP `ProSkatersPlace-IP-02` detached and attached to PROD-03. Through Cloudflare a minute later: marker `prod03`, home 200, GraphQL 1.0.3, CA price `$18.99 CAD`.
- **Go-live:** hold mu-plugin removed (backup `~/cutover-backup/`); the blueprint has **no `cron` package**, installed it, then `/etc/cron.d/wordpress` runs wp-cron every minute; Wordfence `wp-content/wflogs` owned by www-data (its WAF fataled in cron); `.ca` NUXT_CACHE purged (1,681 keys) and re-warmed; the Cloudflare .com zone was not purged ("Purge Everything" is disabled for our role; .com HTML is not edge-cached, `cf-cache-status` BYPASS/MISS).
- **Incident 00:30–01:20: .com slow / timing out (CPU 100%, burst credits spent).** Three causes stacked:
  1. **FlyingPress purge-everything at go-live** emptied the page cache (and recreated `wp-content/cache` as admin, so it was not writable: fixed with `chown www-data`).
  2. **Rank Math Pro shortcode schema** (`add_schema_from_shortcode` → `DB::get_schema_by_shortcode_id`) ran `SELECT … FROM wp_postmeta WHERE meta_value LIKE '%:"s-…%'` — a full scan of 4.3 M rows, ~30 s each under load, on every uncached page, because the `rank_math_shortcode_schema_<id>` shortcut rows were missing. Created the 3 shortcuts (`wordpress/scripts/rank-math-schema-shortcuts.php`); the scans stopped and pages rendered in 2–3 s.
  3. **FlyingPress self-preload loop.** FlyingPress caches a page only through its preload request, which sends the HTML to its Cloud Optimizer with a hard-coded 15 s timeout and answers 503 on failure, so nothing was cached and the queue retried forever (home 29 times; 210 self-requests / 2 min).
- **Fixes left in place:** PHP-FPM `pm.max_children` 120 → 32 (start 12, spare 8–16) and the FPM slowlog (15 s); MariaDB query cache 256 MB (`/etc/mysql/mariadb.conf.d/70-psp.cnf`, copy in `wordpress/server/prod03/`); Apache `remoteip` for Cloudflare so logs, WordPress and Wordfence see real visitor IPs (`wordpress/server/prod03/apache-remoteip-cloudflare.conf`). A controlled warm (`prod03-flyingpress-warm.sh`, 2 at a time from 127.0.0.1) cached home, shop and the top categories (`HIT`, 0.4 s via Cloudflare).
- **FlyingPress Cloud Optimizer turned off (01:55).** It is FlyingPress's page-analysis API (page-optimizer.flyingpress.com), not a CDN; Cloudflare stays the CDN and FlyingCDN is not used. FlyingPress 5.6.6 calls it for every page with no setting to disable it, and it was returning HTTP 500 `TargetCloseError` for many pages. mu-plugin `psp-flyingpress-local-only.php` answers that request locally with an empty result (re-enable with `define('PSP_FLYINGPRESS_CLOUD_OPTIMIZER', true)`), so every page caches with local optimizations; it also paces the preload queue to one request every 2 s. FlyingPress `lazy_load_exclusions` = `wp-post-image`, `custom-logo` so the main product image and logo still load eagerly. This replaced the earlier 40 s timeout plugin. All temporary Apache 503 rules (GTranslate, crawlers, FlyingPress preload) are removed; a full `wp flying-press preload-cache` (3,571 page/device tasks) runs overnight, one at a time.
- **Load spike 02:55–03:05 UTC, two causes, both handled:** (1) two back-to-back docs-only pushes started two .ca production builds; each purges the .ca page cache, so .ca SSR and the post-deploy warm re-fetched every product from PROD-03 (cancelled the pending "Warm cache after production deploy" run; batch pushes in future). (2) A scraper (Alibaba Cloud `47.79.x.x` plus a Cloudflare egress address, fake Chrome UAs) walked every colour combination on brand archives, e.g. `/brand/endless-blading/?filter_pa_color=silver,purple,gold,black,pink,blue,gray&query_type_pa_color=or`: uncacheable, heavy layered-nav queries, ~150/min. Apache now answers any `filter_pa_*` with 3+ values with `429` + `Retry-After` (shoppers' one- and two-value filters still work; rule in `wordpress/server/prod03/apache-vhost-excerpt.conf`). Load fell from 17 to under 11 within a minute.
- **AI crawlers on translated pages (03:31 UTC):** PerplexityBot crawled ~85 GTranslate pages a minute (`/fi/…`); each one also makes GTranslate fetch the English original from this server, so it cost double and pushed load to ~7. Apache now answers AI crawlers (PerplexityBot, GPTBot, ClaudeBot, Amazonbot, Bytespider, meta-externalagent, OAI-SearchBot, CCBot, Applebot-Extended) with `429` on GTranslate language prefixes only; English pages stay open to them, and Googlebot and visitors are unaffected. Load back to ~3.
- **Snapshots:** automatic daily snapshots at 3:00 AM EST (was 7:00 PM); manual `PROD-03-post-cutover-20261105`.
- **Unstyled pages for anonymous visitors (found 2026-11-06 22:45 UTC, fixed 22:54):** FlyingPress's Cloudflare integration (`cf_page_caching`, Pavel's stored API key) has Cloudflare keep `/wp-content/cache/flying-press/*` for a year and edge-cache HTML. During the cutover outage (~01:29 UTC 11-05) 14 FlyingPress CSS/JS files were briefly missing, so WordPress answered with the Rank Math 404-to-home `301`, and Cloudflare stored those redirects plus the home HTML (`Age` 45 h). Visitors got the home page without Elementor's CSS. Fixed by a Cloudflare purge-everything through FlyingPress's own API call (`FlyingPress\Cloudflare::api`, blocking); the FlyingPress page cache on the server was not touched. Apache now answers a missing file under `/wp-content/cache/flying-press/` with `503`, which Cloudflare does not cache, instead of the redirect (rule in `wordpress/server/prod03/apache-vhost-excerpt.conf`; backup `~/proskatersplace.conf.pre-fpmissing.bak`). A scan of all 12,056 cached page files found every one of the 92 referenced CSS/JS files present.
- **"The Stripe API is temporarily unavailable" ×3 (seen by Pavel 11-06):** leftover WooCommerce session notices from PROD-02's 11-03 22:20 UTC failures (`cURL error 6: getaddrinfo() thread failed to start`), shown once and then cleared. PROD-03 has logged no Stripe errors; `WC_Stripe_API::retrieve('account')` with the live key returns the account with `charges_enabled=true`.
- **Broken srcset scraper (2026-11-13 15:00–16:00 UTC):** one IPv6 client (`2600:4808:53f4:9000:…`, Chrome OS UA) requested ~3,000 junk paths like `/wp-content/uploads/…-300x300.jpg%20300w,%20https:/…` in an hour. Each went through WordPress to Rank Math's 404-to-home `301`, and the 15-minute load reached 5. Apache now answers that pattern with a plain `404` (rule in `wordpress/server/prod03/apache-vhost-excerpt.conf`; backup `~/proskatersplace.conf.pre-srcset.bak`).
- **Pre-launch checkout checks (2026-11-13):** Maintenance Mode's "disable add to cart" makes every product unpurchasable for everyone (admins, GraphQL and the .ca included), so cart, shipping and tax can't be tested while orders are closed. TEMPORARY mu-plugin `psp-prelaunch-bypass.php` (server only, not in the repo: it held a secret) restored WooCommerce's own purchasable answer for requests carrying the secret `X-PSP-Prelaunch` header; everyone else stayed blocked. Removed the same day when orders reopened. Also checked: Stripe live, webhook secret set, plugin auto-updated to 11.2.0 on 11-12 and moved to Stripe-hosted payment-method settings (card, Link, Affirm, Apple Pay, Google Pay); enabled gateways are Helcim, Stripe (+Link, Affirm), PayPal Payments (live) and POS Cashout; WP Mail SMTP (Gmail mailer) sent a test mail with no errors; ShipStation polls with no errors; no past-due or failed scheduled actions since cutover.
- **Orders reopened (2026-11-13 ~16:10 UTC):** maintenance mode off; WooCommerce store notice changed to "Orders have resumed…". Real test order #500049581 on the .ca (Helcim / Google Pay, txn 58265648, $6.77 CAD, Store Pickup): Processing, stock 24→23, "New order" and "Processing order" emails sent, fraud check passed, exported to ShipStation at its 16:46 UTC pull (ShipStation polls about every 70 min). Google Pay orders are refunded in the Helcim dashboard, not WooCommerce.
- **.ca bot storm (2026-11-13 16:29–16:32 UTC):** one IP (213.209.159.133, NL, fake Android Chrome UA) requested ~920 .ca pages in 3 min. Uncached category/product renders make the .ca Worker run heavy WPGraphQL product queries (variations), all 32 PHP workers filled and load reached 26; .ca visitors got Cloudflare 524s. Origin only sees the Worker's address (`2a06:98c0:3600::103`), so it cannot be filtered at Apache. Fixed at Cloudflare on the proskatersplace.ca zone: IP access rule Block 213.209.159.133, plus the free plan's one rate-limiting rule "Throttle fast page crawlers" (`http.request.uri.path contains "/product"`, more than 20 requests per 10 s per IP → block 10 s). Load back to ~1 within minutes. Follow-ups worth doing in the .ca app: normalise query strings before the route-cache lookup, never cache error pages, and stop the daily merchant-feed push from wiping the whole KV route cache.
- **Cleaned up:** transfer key `~/.ssh/xfer*` and the copied origin key / PROD-02 wp-config removed from PROD-03. The matching `prod03-xfer-20261104` line stays in PROD-02's `authorized_keys` (only from `172.26.4.6`); remove it if PROD-02 is ever started. The `psp-migrate` key and office SSH rule stay for the soak.

**Lessons for the next migration (the test site next week):**
- Never purge the page cache at cutover. Warm it on the new box first (through `--resolve`), and check the cache count before moving the IP.
- After any cache incident, also purge Cloudflare: FlyingPress makes Cloudflare cache HTML and its CSS/JS, so a FlyingPress rewarm alone leaves the edge serving the bad copies.
- Create `wp-content/cache` and `wp-content/wflogs` owned by the web user; run every WP-CLI cache command as `www-data`.
- Install `cron` on Lightsail blueprints.
- Size PHP-FPM workers at about 4 per vCPU, not by memory.
- Check `SELECT … WHERE meta_value LIKE` hot spots with the FPM slowlog under a short load test before cutover.

