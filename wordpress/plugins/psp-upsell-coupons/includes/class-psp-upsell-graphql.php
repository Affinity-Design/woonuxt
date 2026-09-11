<?php
/**
 * WPGraphQL schema extension. Contract: specs/002-conditional-upsell-coupons/contracts/graphql-schema.md
 *
 * Registration is defensive: WooGraphQL 0.21.1 has been seen to drop its
 * schema intermittently, so missing Cart/Product types skip those fields
 * instead of fataling, and nothing here ever surfaces as a GraphQL error.
 */

if (!defined('ABSPATH')) {
    exit;
}

class PSP_Upsell_GraphQL {

    public static function init() {
        add_action('graphql_register_types', array(__CLASS__, 'register'), 20, 1);
    }

    public static function register($type_registry = null) {
        if (!function_exists('register_graphql_object_type') || !function_exists('register_graphql_field') || !function_exists('register_graphql_enum_type')) {
            return;
        }
        try {
            self::register_types();

            $has_cart = self::type_exists($type_registry, 'Cart');
            $has_product = self::type_exists($type_registry, 'Product');

            if ($has_cart) {
                register_graphql_field('Cart', 'upsell', array(
                    'type'        => array('non_null' => 'CartUpsellState'),
                    'description' => 'Conditional upsell evaluation for this cart (auto-applies/removes UPSELL-* coupons).',
                    'resolve'     => function () {
                        if (!function_exists('WC') || !WC()->cart) {
                            return self::empty_cart_state();
                        }
                        PSP_Upsell_Channel::force('ca');
                        PSP_Upsell_Engine::mark_dirty();
                        WC()->cart->calculate_totals();
                        return PSP_Upsell_Engine::public_state('en');
                    },
                ));
            }

            if ($has_product) {
                register_graphql_field('Product', 'upsell', array(
                    'type'        => array('non_null' => 'ProductUpsellState'),
                    'description' => 'Whether this product triggers or is targeted by an active upsell rule.',
                    'args'        => array('channel' => array('type' => 'UpsellChannelEnum', 'defaultValue' => 'ca')),
                    'resolve'     => function ($source, $args) {
                        $pid = self::product_id_from_source($source);
                        $channel = self::channel_arg($args);
                        $offers = $pid ? PSP_Upsell_Engine::product_offers($pid, $channel, 'en') : array();
                        $has_trigger = false;
                        $is_target = false;
                        foreach ($offers as $offer) {
                            if ($offer['side'] === 'trigger') {
                                $has_trigger = true;
                            } else {
                                $is_target = true;
                            }
                        }
                        return array('has_upsell_trigger' => $has_trigger, 'is_upsell_target' => $is_target, 'offers' => $offers);
                    },
                ));
            }

            register_graphql_field('RootQuery', 'upsellRules', array(
                'type'        => array('non_null' => array('list_of' => array('non_null' => 'UpsellRule'))),
                'description' => 'Active, in-schedule upsell rules for a storefront channel.',
                'args'        => array('channel' => array('type' => 'UpsellChannelEnum', 'defaultValue' => 'ca')),
                'resolve'     => function ($source, $args) {
                    return array_values(PSP_Upsell_Rules::get_active(self::channel_arg($args)));
                },
            ));

            update_option(PSP_UPSELL_OPTION_GRAPHQL, array('at' => gmdate('c'), 'cart' => $has_cart, 'product' => $has_product), false);
        } catch (\Throwable $e) {
            error_log('[psp-upsell] GraphQL registration skipped: ' . $e->getMessage());
            update_option(PSP_UPSELL_OPTION_GRAPHQL, false, false);
        }
    }

    private static function type_exists($type_registry, $name) {
        if (!$type_registry || !method_exists($type_registry, 'get_type')) {
            return true; // older signature — let WPGraphQL decide
        }
        try {
            return (bool) $type_registry->get_type($name);
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function channel_arg($args) {
        $channel = isset($args['channel']) ? strtolower((string) $args['channel']) : 'ca';
        return in_array($channel, PSP_Upsell_Rules::CHANNELS, true) ? $channel : 'ca';
    }

    private static function product_id_from_source($source) {
        if (!is_object($source)) {
            return 0;
        }
        foreach (array('databaseId', 'ID') as $key) {
            try {
                $value = $source->$key;
            } catch (\Throwable $e) {
                $value = null;
            }
            if (is_numeric($value) && (int) $value > 0) {
                return (int) $value;
            }
        }
        return 0;
    }

    private static function empty_cart_state() {
        return array(
            'channel'             => 'ca',
            'rules_version'       => PSP_Upsell_Rules::version(),
            'eligible_offers'     => array(),
            'applied_auto_coupons' => array(),
            'cart_notices'        => array(),
            'missing_qualifiers'  => array(),
            'line_item_discounts' => array(),
            'validated_coupons'   => array(),
        );
    }

    /** Field reading a snake_case key from an array source. */
    private static function field($type, $key, $description = '') {
        return array(
            'type'        => $type,
            'description' => $description,
            'resolve'     => function ($source) use ($key) {
                if (is_array($source)) {
                    return $source[$key] ?? null;
                }
                return is_object($source) && isset($source->$key) ? $source->$key : null;
            },
        );
    }

    private static function nn_list($type) {
        return array('non_null' => array('list_of' => array('non_null' => $type)));
    }

    private static function register_types() {
        register_graphql_enum_type('UpsellChannelEnum', array(
            'description' => 'Storefront channel.',
            'values'      => array(
                'CA'  => array('value' => 'ca', 'description' => 'proskatersplace.ca (headless)'),
                'COM' => array('value' => 'com', 'description' => 'proskatersplace.com (classic)'),
            ),
        ));
        register_graphql_enum_type('UpsellOfferStateEnum', array(
            'values' => array(
                'INACTIVE'  => array('value' => 'inactive'),
                'PENDING'   => array('value' => 'pending'),
                'APPLIED'   => array('value' => 'applied'),
                'DISMISSED' => array('value' => 'dismissed'),
            ),
        ));
        register_graphql_enum_type('UpsellNoticeKindEnum', array(
            'values' => array('PENDING' => array('value' => 'pending'), 'APPLIED' => array('value' => 'applied')),
        ));
        register_graphql_enum_type('UpsellSideEnum', array(
            'values' => array('TRIGGER' => array('value' => 'trigger'), 'TARGET' => array('value' => 'target')),
        ));

        register_graphql_object_type('UpsellTerm', array(
            'fields' => array(
                'databaseId' => self::field(array('non_null' => 'Int'), 'id'),
                'slug'       => self::field(array('non_null' => 'String'), 'slug'),
                'name'       => self::field(array('non_null' => 'String'), 'name'),
            ),
        ));
        register_graphql_object_type('UpsellSelector', array(
            'fields' => array(
                'taxonomy' => self::field(array('non_null' => 'String'), 'taxonomy'),
                'termIds'  => self::field(self::nn_list('Int'), 'term_ids', 'Expanded match set (children included).'),
                'terms'    => self::field(self::nn_list('UpsellTerm'), 'terms', 'Terms the merchant picked.'),
            ),
        ));
        register_graphql_object_type('UpsellDiscount', array(
            'fields' => array(
                'type'    => self::field(array('non_null' => 'String'), 'type'),
                'amount'  => self::field(array('non_null' => 'Float'), 'amount'),
                'display' => self::field(array('non_null' => 'String'), 'display'),
            ),
        ));
        register_graphql_object_type('UpsellNotices', array(
            'fields' => array(
                'productTrigger' => self::field('String', 'product_trigger'),
                'productTarget'  => self::field('String', 'product_target'),
                'cartPending'    => self::field('String', 'cart_pending'),
                'cartApplied'    => self::field('String', 'cart_applied'),
                'checkout'       => self::field('String', 'checkout'),
                'couponLabel'    => self::field('String', 'coupon_label'),
            ),
        ));

        register_graphql_object_type('UpsellRule', array(
            'description' => 'A compiled, active upsell rule.',
            'fields'      => array(
                'databaseId'          => self::field(array('non_null' => 'Int'), 'id'),
                'name'                => self::field(array('non_null' => 'String'), 'name'),
                'priority'            => self::field(array('non_null' => 'Int'), 'priority'),
                'hash'                => self::field(array('non_null' => 'String'), 'hash'),
                'channels'            => self::field(self::nn_list('UpsellChannelEnum'), 'channels'),
                'triggerSelectors'    => array('type' => self::nn_list('UpsellSelector'), 'resolve' => function ($r) { return $r['trigger']['selectors']; }),
                'triggerLabel'        => array('type' => array('non_null' => 'String'), 'resolve' => function ($r) { return $r['trigger']['label']; }),
                'triggerMinQty'       => array('type' => array('non_null' => 'Int'), 'resolve' => function ($r) { return (int) $r['trigger']['min_qty']; }),
                'targetSelectors'     => array('type' => self::nn_list('UpsellSelector'), 'resolve' => function ($r) { return $r['target']['selectors']; }),
                'targetMatch'         => array('type' => array('non_null' => 'String'), 'resolve' => function ($r) { return $r['target']['match']; }),
                'targetLabel'         => array('type' => array('non_null' => 'String'), 'resolve' => function ($r) { return $r['target']['label']; }),
                'excludeTriggerItems' => array('type' => array('non_null' => 'Boolean'), 'resolve' => function ($r) { return (bool) $r['target']['exclude_trigger_items']; }),
                'discount'            => self::field(array('non_null' => 'UpsellDiscount'), 'discount'),
                'notices'             => array(
                    'type'    => array('non_null' => 'UpsellNotices'),
                    'args'    => array('locale' => array('type' => 'String', 'defaultValue' => 'en')),
                    'resolve' => function ($r, $args) {
                        $out = array();
                        foreach (PSP_Upsell_Rules::NOTICE_KEYS as $key) {
                            $out[$key] = PSP_Upsell_Rules::notice_text($r, $key, $args['locale'] ?? 'en');
                        }
                        return $out;
                    },
                ),
                'ctaTriggerSide'      => array(
                    'type'    => array('non_null' => 'String'),
                    'args'    => array('channel' => array('type' => 'UpsellChannelEnum', 'defaultValue' => 'ca')),
                    'resolve' => function ($r, $args) { return $r['cta'][self::channel_arg($args)]['trigger_side']; },
                ),
                'ctaTargetSide'       => array(
                    'type'    => array('non_null' => 'String'),
                    'args'    => array('channel' => array('type' => 'UpsellChannelEnum', 'defaultValue' => 'ca')),
                    'resolve' => function ($r, $args) { return $r['cta'][self::channel_arg($args)]['target_side']; },
                ),
            ),
        ));

        register_graphql_object_type('UpsellProductOffer', array(
            'fields' => array(
                'rule'    => self::field(array('non_null' => 'UpsellRule'), 'rule'),
                'side'    => self::field(array('non_null' => 'UpsellSideEnum'), 'side'),
                'text'    => array(
                    'type'    => array('non_null' => 'String'),
                    'args'    => array('locale' => array('type' => 'String', 'defaultValue' => 'en')),
                    'resolve' => function ($o, $args) {
                        $key = $o['side'] === 'trigger' ? 'product_trigger' : 'product_target';
                        return PSP_Upsell_Rules::notice_text($o['rule'], $key, $args['locale'] ?? 'en');
                    },
                ),
                'ctaPath' => array(
                    'type'    => array('non_null' => 'String'),
                    'args'    => array('channel' => array('type' => 'UpsellChannelEnum', 'defaultValue' => 'ca')),
                    'resolve' => function ($o, $args) { return $o['rule']['cta'][self::channel_arg($args)][$o['side'] . '_side']; },
                ),
            ),
        ));
        register_graphql_object_type('ProductUpsellState', array(
            'fields' => array(
                'hasUpsellTrigger' => self::field(array('non_null' => 'Boolean'), 'has_upsell_trigger'),
                'isUpsellTarget'   => self::field(array('non_null' => 'Boolean'), 'is_upsell_target'),
                'offers'           => self::field(self::nn_list('UpsellProductOffer'), 'offers'),
            ),
        ));

        register_graphql_object_type('UpsellEligibleOffer', array(
            'fields' => array(
                'ruleId'     => self::field(array('non_null' => 'Int'), 'rule_id'),
                'state'      => self::field(array('non_null' => 'UpsellOfferStateEnum'), 'state'),
                'label'      => self::field(array('non_null' => 'String'), 'label'),
                'couponCode' => self::field('String', 'coupon_code'),
                'discount'   => self::field('String', 'discount'),
            ),
        ));
        register_graphql_object_type('UpsellCartNotice', array(
            'fields' => array(
                'ruleId'  => self::field(array('non_null' => 'Int'), 'rule_id'),
                'kind'    => self::field(array('non_null' => 'UpsellNoticeKindEnum'), 'kind'),
                'text'    => self::field(array('non_null' => 'String'), 'text'),
                'ctaPath' => self::field('String', 'cta_path'),
            ),
        ));
        register_graphql_object_type('UpsellMissingQualifier', array(
            'fields' => array(
                'ruleId'  => self::field(array('non_null' => 'Int'), 'rule_id'),
                'label'   => self::field(array('non_null' => 'String'), 'label'),
                'ctaPath' => self::field(array('non_null' => 'String'), 'cta_path'),
            ),
        ));
        register_graphql_object_type('UpsellLineItemDiscount', array(
            'fields' => array(
                'cartItemKey' => self::field(array('non_null' => 'String'), 'cart_item_key'),
                'ruleId'      => self::field(array('non_null' => 'Int'), 'rule_id'),
                'couponCode'  => self::field(array('non_null' => 'String'), 'coupon_code'),
                'amount'      => self::field(array('non_null' => 'String'), 'amount', 'Raw store-currency amount (unformatted).'),
                'label'       => self::field(array('non_null' => 'String'), 'label'),
            ),
        ));
        register_graphql_object_type('CartUpsellState', array(
            'fields' => array(
                'channel'            => self::field(array('non_null' => 'UpsellChannelEnum'), 'channel'),
                'rulesVersion'       => self::field(array('non_null' => 'String'), 'rules_version'),
                'eligibleOffers'     => self::field(self::nn_list('UpsellEligibleOffer'), 'eligible_offers'),
                'appliedAutoCoupons' => self::field(self::nn_list('String'), 'applied_auto_coupons'),
                'cartNotices'        => array(
                    'type'    => self::nn_list('UpsellCartNotice'),
                    'args'    => array('locale' => array('type' => 'String', 'defaultValue' => 'en')),
                    'resolve' => function ($state, $args) {
                        $locale = PSP_Upsell_Rules::normalize_locale($args['locale'] ?? 'en');
                        if ($locale === 'en') {
                            return $state['cart_notices'];
                        }
                        return PSP_Upsell_Engine::public_state($locale)['cart_notices'];
                    },
                ),
                'missingQualifiers'  => self::field(self::nn_list('UpsellMissingQualifier'), 'missing_qualifiers'),
                'lineItemDiscounts'  => self::field(self::nn_list('UpsellLineItemDiscount'), 'line_item_discounts'),
                'validatedCoupons'   => self::field(self::nn_list('String'), 'validated_coupons'),
            ),
        ));
    }
}
