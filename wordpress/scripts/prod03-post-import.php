<?php
// PROD-03 post-import adjustments (idempotent). Re-run after any re-sync from PROD-02 (via prod03-post-import.sh).
global $wpdb;
$t = $wpdb->prefix . 'snippets';

// 1. GraphQL patch snippets off (kept for rollback): #87 schema-flap failsafe, #38 codecept_debug stub.
$wpdb->query( "UPDATE $t SET active = 0 WHERE id IN (87, 38)" );

// 2. Used-up one-shot OPcache reset.
$wpdb->delete( $t, [ 'id' => 88 ] );

// 3. Strip the dead codecept_debug() stub from #40 (only WooGraphQL 0.21.1 called it).
$code = (string) $wpdb->get_var( "SELECT code FROM $t WHERE id = 40" );
$pos  = strrpos( $code, "if (!function_exists('codecept_debug'))" );
$tail = false === $pos ? '' : substr( $code, $pos );
if ( false !== $pos && 2 === substr_count( $tail, '{' ) && false !== strpos( $tail, 'function codecept_debug' ) ) {
	$wpdb->update( $t, [ 'code' => rtrim( substr( $code, 0, $pos ) ) . "\n" ], [ 'id' => 40 ] );
	echo "#40 stub removed\n";
} else {
	echo "#40 unchanged (stub already gone)\n";
}

// 4. Convert every MyISAM table to InnoDB (PROD-02 still has ~43; PROD-03 must not).
//    NO_ENGINE_SUBSTITUTION makes an ALTER fail loudly instead of silently keeping MyISAM;
//    dropping strict/zero-date modes keeps old '0000-00-00' defaults (wp_posts etc.) valid.
$wpdb->query( "SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'" );
$myisam = $wpdb->get_col( "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'MyISAM' ORDER BY TABLE_NAME" );
$failed = [];
foreach ( $myisam as $table ) {
	if ( false === $wpdb->query( "ALTER TABLE `" . esc_sql( $table ) . "` ENGINE = InnoDB" ) ) {
		$failed[] = "$table: {$wpdb->last_error}";
	}
}
$left = (int) $wpdb->get_var( "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'MyISAM'" );
echo 'InnoDB conversion: ' . count( $myisam ) . ' MyISAM table(s) found, ' . ( count( $myisam ) - count( $failed ) ) . " converted, $left left\n";
foreach ( $failed as $line ) {
	echo "  FAILED $line\n";
}

foreach ( $wpdb->get_results( "SELECT id, active, name, LENGTH(code) len FROM $t WHERE id IN (38, 40, 87, 88)" ) as $r ) {
	echo "#{$r->id} active={$r->active} len={$r->len} {$r->name}\n";
}
echo 'codecept in #40: ' . ( false !== strpos( (string) $wpdb->get_var( "SELECT code FROM $t WHERE id = 40" ), 'codecept_debug' ) ? 'yes' : 'no' ) . "\n";
