#!/bin/bash
# Controlled FlyingPress cache warm on PROD-03 (cutover night). Replays FlyingPress's own preload request
# (same headers/UA) against the local origin, 1 at a time, pausing while load > 3.5 (8 vCPU burstable: stay under ~40% CPU), then removes the
# finished tasks from FlyingPress's queue so it stops retrying them.
cd /var/www/html
DESK='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
MOB='Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
LIST=~/fp-warm.list
# url<TAB>device, home and shop first, then by FlyingPress priority
wp db query "SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(task_data,'$.url')), JSON_UNQUOTE(JSON_EXTRACT(task_data,'$.device')) FROM wp_flying_press_queue WHERE callback_action='flying_press_preload_url' AND status IN ('pending','failed') ORDER BY (JSON_UNQUOTE(JSON_EXTRACT(task_data,'$.url')) IN ('https://proskatersplace.com/','https://proskatersplace.com/shop/')) DESC, priority DESC, id" --skip-column-names 2>/dev/null > $LIST
echo "[$(date -u +%T)] warming $(wc -l < $LIST) url/device pairs"
warm_one() {
  url="$1"; device="$2"
  while awk '{exit !($1 > 3.5)}' /proc/loadavg; do sleep 5; done
  ua="$DESK"; [ "$device" = "mobile" ] && ua="$MOB"
  code=$(curl -s -o /dev/null -m 90 -w '%{http_code}' --resolve proskatersplace.com:443:127.0.0.1 -k \
    -H 'x-flying-press-preload: 1' -H 'Cookie: wordpress_logged_in_1=1;' -A "$ua" "$url")
  echo "$code $device $url"
}
export -f warm_one; export DESK MOB
awk -F'\t' '{print $1"\t"$2}' $LIST | xargs -P 1 -d '\n' -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r u d <<< "{}"; warm_one "$u" "$d"' > ~/fp-warm.results 2>&1
echo "[$(date -u +%T)] done: $(grep -c '^200 ' ~/fp-warm.results) ok, $(grep -vc '^200 ' ~/fp-warm.results) not 200"
# Drop the preload tasks we just served so FlyingPress does not retry them.
wp db query "DELETE FROM wp_flying_press_queue WHERE callback_action='flying_press_preload_url'" 2>/dev/null && echo "queue cleared"
echo "[$(date -u +%T)] cached files: $(find wp-content/cache/flying-press -type f -name '*.html*' | wc -l)"
