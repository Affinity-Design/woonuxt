<?php
// Create Rank Math's "rank_math_shortcode_schema_<id>" shortcut rows (meta_value = meta_id of the schema row)
// so RankMath\Schema\DB::get_schema_by_shortcode_id() takes its indexed path instead of a full LIKE scan of
// wp_postmeta. Additive and idempotent: existing shortcuts are left alone.
global $wpdb;
$rows = $wpdb->get_results( "SELECT meta_id, post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key LIKE 'rank\\_math\\_schema\\_%'" );
$created = 0; $existing = 0; $ids = [];
foreach ( $rows as $row ) {
	if ( ! preg_match_all( '/"(s-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/', $row->meta_value, $m ) ) {
		continue;
	}
	foreach ( array_unique( $m[1] ) as $shortcode_id ) {
		// Only the schema's own shortcode: Rank Math stores it as metadata.shortcode.
		$value = maybe_unserialize( $row->meta_value );
		if ( ! is_array( $value ) || ( $value['metadata']['shortcode'] ?? '' ) !== $shortcode_id ) {
			continue;
		}
		$key = 'rank_math_shortcode_schema_' . $shortcode_id;
		$ids[] = $shortcode_id;
		if ( $wpdb->get_var( $wpdb->prepare( "SELECT meta_id FROM {$wpdb->postmeta} WHERE meta_key = %s LIMIT 1", $key ) ) ) {
			$existing++;
			continue;
		}
		add_post_meta( (int) $row->post_id, $key, (string) $row->meta_id );
		$created++;
	}
}
echo "schema rows: " . count( $rows ) . ", shortcode ids: " . count( array_unique( $ids ) ) . ", shortcuts created: $created, already present: $existing\n";
foreach ( [ 's-87b1248d-a68d-43d4-bcce-62b380a7f357', 's-7d9cc317-7976-4595-91db-5eb692f5cd38' ] as $hot ) {
	echo "$hot shortcut: " . ( $wpdb->get_var( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_key = %s", 'rank_math_shortcode_schema_' . $hot ) ) ?: 'MISSING' ) . "\n";
}
