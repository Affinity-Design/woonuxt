/**
 * Category-Specific FAQ Manager
 *
 * Provides customized FAQs based on product categories
 * This allows for more targeted answers than the automatic generation
 *
 * Usage:
 * ```typescript
 * const { getFAQsForProduct } = useCategoryFAQs();
 * const customFAQs = getFAQsForProduct(product);
 * ```
 */

interface FAQItem {
  question: string;
  answer: string;
}

export const useCategoryFAQs = () => {
  const {formatCADPrice} = useCanadianSEO();

  /**
   * Category-specific FAQ templates
   * Add new categories here as needed
   */
  const categoryFAQs: Record<string, (product: any) => FAQItem[]> = {
    // Inline Skates
    'inline-skates': (product: any) => [
      {
        question: `What size should I order for ${product.name}?`,
        answer: `For ${product.name}, we recommend ordering your normal shoe size. However, some brands fit differently. Check our detailed size guide or contact us for personalized sizing advice. We offer free returns on unused skates if the size doesn't fit.`,
      },
      {
        question: `Can I use ${product.name} outdoors?`,
        answer: `Yes! ${product.name} is designed for outdoor use. The wheels and bearings are suitable for various outdoor surfaces including pavement, boardwalks, and smooth trails. For rough terrain, consider upgrading to larger outdoor wheels.`,
      },
      {
        question: `Is ${product.name} suitable for beginners?`,
        answer: `${product.name} is ${product.name.toLowerCase().includes('beginner') || product.name.toLowerCase().includes('recreational') ? 'perfect' : 'suitable'} for ${product.name.toLowerCase().includes('advanced') || product.name.toLowerCase().includes('professional') ? 'experienced skaters with proper training' : 'beginners'}. ${!product.name.toLowerCase().includes('advanced') ? 'The stable frame and comfortable fit make it easy to learn.' : 'We recommend taking lessons or practicing in controlled environments.'}`,
      },
      {
        question: `What's included with ${product.name}?`,
        answer: `${product.name} comes with the complete skate setup including frame, wheels, bearings, and brake (where applicable). Some models include carrying bags. Check the product description for full details.`,
      },
      {
        question: `How do I maintain ${product.name}?`,
        answer: `Regular maintenance includes: rotating wheels every 10-15 hours of use, cleaning bearings monthly, checking frame bolts for tightness, and storing in a dry place. We offer maintenance kits and detailed guides on our site.`,
      },
      {
        question: `Can I upgrade the wheels on ${product.name}?`,
        answer: `Yes! ${product.name} accepts standard inline skate wheels. You can upgrade to larger wheels for more speed, softer wheels for smoother rides, or specialized wheels for different skating styles. Contact us for compatibility information.`,
      },
    ],

    // Roller Skates
    'roller-skates': (product: any) => [
      {
        question: `What surface is ${product.name} best for?`,
        answer: `${product.name} is designed for ${product.name.toLowerCase().includes('indoor') ? 'indoor rinks with smooth wooden floors' : 'both indoor and outdoor surfaces'}. The wheel hardness and size are optimized for ${product.name.toLowerCase().includes('outdoor') ? 'pavement and outdoor trails' : 'rink skating and smooth surfaces'}.`,
      },
      {
        question: `Are these quad skates or inline skates?`,
        answer: `${product.name} is a quad (4-wheel) roller skate with a 2x2 wheel configuration. This provides more stability than inline skates and is great for artistic skating, rhythm skating, and recreational use.`,
      },
      {
        question: `What size should I get for ${product.name}?`,
        answer: `Most roller skates run true to size. For ${product.name}, we recommend ordering your regular shoe size. If you're between sizes, size up for comfort. Check our size guide for specific measurements.`,
      },
    ],

    // Protective Gear
    'protective-gear': (product: any) => [
      {
        question: `What protection does ${product.name} provide?`,
        answer: `${product.name} is designed to protect against impacts and abrasions during skating. It meets or exceeds safety standards for ${product.name.toLowerCase().includes('helmet') ? 'head protection' : product.name.toLowerCase().includes('knee') ? 'knee protection' : 'skating safety'}.`,
      },
      {
        question: `What size ${product.name} do I need?`,
        answer: `For proper protection, ${product.name} should fit snugly but not restrict movement. Measure ${product.name.toLowerCase().includes('helmet') ? 'your head circumference just above your eyebrows' : 'around the area to be protected'} and consult our size chart. Contact us if you need sizing assistance.`,
      },
      {
        question: `Is ${product.name} CSA or CPSC approved?`,
        answer: `${product.name} meets ${product.name.toLowerCase().includes('helmet') ? 'CPSC safety standards for impact protection' : 'industry safety standards'}. All our protective gear is tested for durability and safety in skating activities.`,
      },
      {
        question: `Can I wash ${product.name}?`,
        answer: `${product.name.toLowerCase().includes('helmet') ? 'Wipe the helmet with a damp cloth and mild soap. Remove pads for hand washing.' : 'Hand wash with mild soap and air dry. Do not machine wash or dry.'} Regular cleaning extends the life of protective gear and maintains hygiene.`,
      },
    ],

    // Wheels
    wheels: (product: any) => [
      {
        question: `Are ${product.name} compatible with my skates?`,
        answer: `${product.name} fits most standard inline skates with ${product.wheelSize || '80mm'} wheel size. Check your current wheel diameter and axle spacing before purchasing. Contact us with your skate model for compatibility confirmation.`,
      },
      {
        question: `What's the difference between wheel hardness ratings?`,
        answer: `${product.name} has a ${product.hardness || '82A'} durometer rating. Lower numbers (78A-82A) are softer for grip and outdoor use, higher numbers (84A-88A+) are harder for speed and indoor use. These wheels are optimized for ${parseFloat(product.hardness || '82') < 84 ? 'comfort and grip' : 'speed and durability'}.`,
      },
      {
        question: `How long do ${product.name} last?`,
        answer: `Wheel lifespan depends on usage, surface, and skating style. ${product.name} typically lasts 6-18 months with regular use. Rotate wheels every 10-15 hours to extend life and maintain even wear.`,
      },
      {
        question: `Can I use ${product.name} for outdoor skating?`,
        answer: `${parseFloat(product.hardness || '82') < 84 ? 'Yes! These wheels are great for outdoor use.' : 'These are primarily designed for indoor use, but can handle smooth outdoor surfaces.'} For rough terrain, consider softer wheels (78A-82A) with larger diameters.`,
      },
    ],

    // Bearings
    bearings: (product: any) => [
      {
        question: `What does the ABEC rating mean for ${product.name}?`,
        answer: `${product.name} has an ${product.abecRating || 'ABEC-7'} rating. Higher ABEC numbers indicate tighter tolerances and potentially faster spin. However, skate-specific bearings often perform better than ABEC ratings suggest. These bearings provide ${parseFloat(product.abecRating?.replace('ABEC-', '') || '7') >= 7 ? 'excellent speed and smoothness' : 'good reliability and performance'}.`,
      },
      {
        question: `Do I need to clean ${product.name}?`,
        answer: `Yes! Clean ${product.name} every 20-30 hours of skating or when they feel sluggish. Remove shields, clean with bearing cleaner or isopropyl alcohol, dry completely, and re-lubricate. We offer bearing maintenance kits.`,
      },
      {
        question: `Are these bearings waterproof?`,
        answer: `${product.name} ${product.name.toLowerCase().includes('ceramic') ? 'has ceramic balls which resist corrosion better than steel' : 'should be kept dry when possible'}. While they can handle some moisture, avoid skating through deep puddles. Always clean and dry bearings after wet conditions.`,
      },
    ],

    // Frames
    frames: (product: any) => [
      {
        question: `Is ${product.name} compatible with my boots?`,
        answer: `${product.name} uses ${product.mountType || '165mm'} mounting. Check your boot's mounting pattern before purchasing. Most brands follow standard UFS or 165mm mounting. Contact us with your boot model for compatibility confirmation.`,
      },
      {
        question: `What wheel size does ${product.name} accept?`,
        answer: `${product.name} accepts ${product.maxWheelSize || '80mm'} maximum wheel size with ${product.wheelConfiguration || '4x80mm'} configuration. This setup provides ${product.maxWheelSize && parseFloat(product.maxWheelSize) >= 84 ? 'excellent speed and stability' : 'good maneuverability and control'}.`,
      },
    ],
  };

  /**
   * Get FAQs for a specific product based on its categories
   */
  const getFAQsForProduct = (product: any, maxItems: number = 6): FAQItem[] => {
    if (!product?.productCategories?.nodes) {
      return [];
    }

    // Find matching category FAQs
    for (const category of product.productCategories.nodes) {
      const categorySlug = category.slug;
      const categoryFAQGenerator = categoryFAQs[categorySlug];

      if (categoryFAQGenerator) {
        return categoryFAQGenerator(product).slice(0, maxItems);
      }

      // Check parent categories
      const parentSlug = category.parent?.node?.slug;
      if (parentSlug && categoryFAQs[parentSlug]) {
        return categoryFAQs[parentSlug](product).slice(0, maxItems);
      }
    }

    // No specific category FAQs found
    return [];
  };

  /**
   * Get all available category slugs
   */
  const getAvailableCategories = (): string[] => {
    return Object.keys(categoryFAQs);
  };

  /**
   * Add custom category FAQ template
   */
  const registerCategoryFAQs = (categorySlug: string, generator: (product: any) => FAQItem[]) => {
    categoryFAQs[categorySlug] = generator;
  };

  return {
    getFAQsForProduct,
    getAvailableCategories,
    registerCategoryFAQs,
  };
};
