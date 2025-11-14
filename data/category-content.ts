/**
 * Category SEO Content Data
 *
 * SEO-optimized content for each category including:
 * - Top/bottom descriptions with keywords
 * - Trust signals and benefits
 * - Category-specific FAQs
 * - Internal linking to subcategories
 * - Buying guides
 *
 * Canadian SEO Focus:
 * - Geographic keywords (Canada, Toronto, Ontario)
 * - CAD pricing emphasis
 * - Shipping information
 * - Local trust signals
 */

export interface CategoryContentData {
  topDescription: string;
  bottomDescription?: string;
  benefits: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  subcategories?: Array<{
    name: string;
    slug: string;
    count: number;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  buyingGuide?: {
    title: string;
    description: string;
    link: string;
    linkText: string;
  };
  keywords: string[]; // Target keywords for this category
  h2Headings: string[]; // Suggested H2 headings for content
}

export const categoryContentData: Record<string, CategoryContentData> = {
  'inline-skates': {
    topDescription: `<h2 class="text-2xl font-bold mb-4">Shop Premium Inline Skates in Canada</h2>
      <p>
        Welcome to ProSkaters Place, <strong>Canada's premier destination for inline skates</strong>. Based in Toronto, we ship nationwide with <strong>free delivery on orders over $99 CAD</strong>. Whether you're a beginner looking for your first pair of recreational skates or a professional speed skater, we have the perfect inline skates for you. Browse our extensive collection of <strong>150+ inline skate models</strong> from top brands including Rollerblade, K2, Powerslide, FR Skates, and Seba. All prices in CAD with expert sizing advice available. Shop with confidence knowing you're getting authentic products backed by manufacturer warranties and our Toronto-based customer service team.
      </p>`,

    bottomDescription: `<h2 class="text-2xl font-bold mb-4 mt-12">Why Buy Inline Skates from ProSkaters Place Canada?</h2>
      <p class="mb-4">
        <strong>🇨🇦 Canadian-Owned & Operated</strong> - We understand the unique needs of Canadian skaters, from weather considerations to sizing for winter socks. Our Toronto warehouse ensures fast shipping across Ontario, Quebec, BC, Alberta, and all provinces.
      </p>
      <p class="mb-4">
        <strong>Expert Advice</strong> - Our team of experienced skaters provides personalized recommendations. Not sure which inline skates are right for you? Contact us for free sizing and selection advice. We'll help you find the perfect fit for your skill level, budget, and skating style.
      </p>
      <p class="mb-4">
        <strong>Price Match Guarantee</strong> - Find a lower price on identical inline skates from a Canadian retailer? We'll match it. All prices in CAD with no hidden fees or surprise currency conversions at checkout.
      </p>
      <h3 class="text-xl font-semibold mb-3">Popular Inline Skate Categories:</h3>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li><strong>Recreational Inline Skates</strong> - Perfect for fitness, commuting, and casual skating</li>
        <li><strong>Aggressive Inline Skates</strong> - Built for skateparks, grinds, and tricks</li>
        <li><strong>Speed Inline Skates</strong> - Low-profile racing skates for maximum speed</li>
        <li><strong>Urban Inline Skates</strong> - Durable skates for city streets and rough terrain</li>
        <li><strong>Kids' Inline Skates</strong> - Adjustable sizes and safety features for growing feet</li>
      </ul>
      <p>
        All inline skates ship from our Toronto location with tracking. Most orders arrive within 2-5 business days across Canada. Need it faster? Ask about express shipping options.
      </p>`,

    benefits: [
      {
        icon: 'mdi:truck-fast',
        title: 'Free Shipping',
        description: 'On orders over $99 CAD across Canada',
      },
      {
        icon: 'mdi:currency-usd',
        title: 'CAD Pricing',
        description: 'All prices in Canadian dollars',
      },
      {
        icon: 'mdi:account-question',
        title: 'Expert Advice',
        description: 'Free sizing & selection help',
      },
      {
        icon: 'mdi:shield-check',
        title: 'Warranty',
        description: 'Manufacturer warranties on all skates',
      },
    ],

    faqs: [
      {
        question: 'What size inline skates should I buy?',
        answer:
          "Inline skates typically fit 1-1.5 sizes smaller than your shoe size. For example, if you wear size 10 shoes, you'll likely need size 8.5-9 inline skates. Each brand has specific sizing charts available on product pages. We recommend measuring your foot in centimeters for the most accurate fit. Contact us for personalized sizing advice – we're happy to help!",
      },
      {
        question: 'Do you ship inline skates across Canada?',
        answer:
          'Yes! We ship inline skates nationwide from our Toronto warehouse. Free shipping on orders over $99 CAD to all provinces including Ontario, Quebec, BC, Alberta, Manitoba, Saskatchewan, Nova Scotia, New Brunswick, PEI, Newfoundland, Yukon, NWT, and Nunavut. Most orders arrive within 2-5 business days. Express shipping available for urgent orders.',
      },
      {
        question: 'What are the best inline skates for beginners in Canada?',
        answer:
          'For Canadian beginners, we recommend recreational inline skates from Rollerblade (Zetrablade, Macroblade) or K2 (F.I.T. series). These offer great support, comfortable fit, and are perfect for learning. Prices range from $150-$300 CAD. They work well on Canadian bike paths and smooth pavement. Avoid cheap department store skates – they make learning harder and less enjoyable.',
      },
      {
        question: 'Can I skate outdoors in Canadian weather?',
        answer:
          'Absolutely! Our inline skates are designed for outdoor use on Canadian roads and paths. For best performance, skate in temperatures above 5°C (40°F). Clean and dry your bearings after skating in wet conditions. We recommend 80-85A wheels for Canadian pavement – they balance speed and grip well. Store skates indoors during winter to prevent bearing damage from freezing temperatures.',
      },
      {
        question: "What's included with inline skate purchases?",
        answer:
          'All inline skates include: skates, frames, wheels, bearings, and brake (if applicable). Most also include basic Allen keys for adjustments. We recommend adding protective gear (helmet, knee pads, wrist guards) to your order. All products ship in original packaging with manufacturer warranties. Setup instructions included. Need help? Our Toronto team is here to assist.',
      },
      {
        question: 'Do you offer returns on inline skates?',
        answer:
          "Yes, we accept returns within 30 days of purchase for unworn inline skates in original packaging. Skates must be unused with no outdoor wear. Return shipping costs apply. We want you to be 100% happy with your purchase! If sizing isn't right, contact us within 7 days for fastest exchange processing. Exchanges ship free from our Toronto warehouse.",
      },
    ],

    buyingGuide: {
      title: 'Not Sure Which Inline Skates to Choose?',
      description: 'Read our comprehensive inline skate buying guide with sizing tips, brand comparisons, and recommendations for every skill level.',
      link: '/blog/best-inline-skates-2025',
      linkText: 'Read Buying Guide',
    },

    keywords: [
      'inline skates Canada',
      'buy inline skates Toronto',
      'roller blades Canada',
      'inline skating Canada',
      'Rollerblade Canada',
      'K2 inline skates',
      'speed skates Canada',
      'aggressive inline skates',
      'inline skates free shipping',
      'inline skates CAD',
    ],

    h2Headings: [
      'Shop Premium Inline Skates in Canada',
      'Why Buy Inline Skates from ProSkaters Place Canada?',
      'Popular Inline Skate Categories',
      'Frequently Asked Questions',
    ],
  },

  'roller-skates': {
    topDescription: `<h2 class="text-2xl font-bold mb-4">Premium Roller Skates Canada | Quad Skates</h2>
      <p>
        Shop <strong>Canada's best selection of roller skates</strong> at ProSkaters Place Toronto. From classic quad skates to modern artistic skates, we carry <strong>100+ roller skate models</strong> for all skill levels. Free shipping on orders over $99 CAD nationwide. Browse roller skates from top brands including Moxi, Sure-Grip, Riedell, Chaya, and Impala. Perfect for roller rinks, outdoor skating, artistic skating, and roller derby. All prices in Canadian dollars with expert advice available.
      </p>`,

    bottomDescription: `<h2 class="text-2xl font-bold mb-4 mt-12">The Best Roller Skates in Canada</h2>
      <p class="mb-4">
        Whether you're <strong>roller skating in Toronto</strong>, Vancouver, or anywhere across Canada, ProSkaters Place has the perfect quad skates for you. Our selection includes indoor roller skates for rink skating, outdoor roller skates for parks and trails, and artistic skates for advanced moves.
      </p>
      <p>
        <strong>Why Choose Our Roller Skates?</strong> Every pair ships from Toronto with tracking, arrives within 2-5 business days, and includes full manufacturer warranty. Need help choosing? Our team can recommend the best roller skates for your skill level, skating surface, and budget.
      </p>`,

    benefits: [
      {
        icon: 'mdi:truck-fast',
        title: 'Fast Shipping',
        description: 'Free on $99+ orders across Canada',
      },
      {
        icon: 'mdi:star',
        title: 'Top Brands',
        description: 'Moxi, Sure-Grip, Riedell, Chaya',
      },
      {
        icon: 'mdi:hand-heart',
        title: 'Beginner Friendly',
        description: 'Perfect for new skaters',
      },
      {
        icon: 'mdi:map-marker',
        title: 'Toronto Based',
        description: 'Canadian owned & operated',
      },
    ],

    faqs: [
      {
        question: "What's the difference between roller skates and inline skates?",
        answer:
          'Roller skates (quad skates) have 4 wheels in a 2x2 configuration, offering more stability and balance – perfect for beginners and artistic skating. Inline skates have wheels in a single line, allowing for faster speeds and better maneuverability. In Canada, roller skates are popular for indoor rinks and outdoor recreational skating, while inline skates are preferred for fitness and speed skating.',
      },
      {
        question: 'Can I use roller skates outdoors in Canada?',
        answer:
          'Yes! Many roller skates work great outdoors on Canadian bike paths and smooth pavement. Look for outdoor roller skates with softer wheels (78A-85A durometer) that absorb bumps better. Avoid skating on rough surfaces or in wet conditions. We recommend checking wheel hardness on each product page – our team can help you choose the right wheels for outdoor Canadian skating.',
      },
      {
        question: 'What size roller skates should I order?',
        answer:
          "Roller skate sizing varies by brand. Most fit true to your shoe size or slightly smaller. Measure your foot in centimeters and check each brand's sizing chart on product pages. Moxi and Riedell have detailed size guides. Not sure? Contact our Toronto team for free sizing advice – we'll help you get the perfect fit. Wrong size? We offer exchanges within 30 days.",
      },
      {
        question: 'Are roller skates good for beginners?',
        answer:
          'Absolutely! Roller skates (quad skates) are often easier for beginners than inline skates due to their wider wheelbase and better balance. We recommend starting with recreational roller skates that have heel brakes and good ankle support. Popular beginner models include Sure-Grip Boardwalk, Moxi Beach Bunny, and Chaya Melrose. All priced in CAD with free shipping over $99.',
      },
      {
        question: 'Do you have roller skates for kids in Canada?',
        answer:
          "Yes! We carry adjustable roller skates for kids that grow with their feet (sizes typically 11-2 and 2-5). These are perfect for Canadian families as they last through multiple growth spurts. Kid's roller skates include safety features like extra ankle support and quality bearings. Ships free on orders over $99 CAD. See our Kids' Skates category for full selection.",
      },
    ],

    buyingGuide: {
      title: 'New to Roller Skating?',
      description: "Learn everything about choosing roller skates, from sizing to wheel selection, in our complete Canadian buyer's guide.",
      link: '/blog/roller-skating-toronto-guide',
      linkText: 'Read Roller Skate Guide',
    },

    keywords: [
      'roller skates Canada',
      'quad skates Canada',
      'buy roller skates Toronto',
      'Moxi skates Canada',
      'roller skating Canada',
      'outdoor roller skates',
      'roller rink skates',
      'artistic roller skates',
      'roller derby skates Canada',
    ],

    h2Headings: ['Premium Roller Skates Canada | Quad Skates', 'The Best Roller Skates in Canada', 'Frequently Asked Questions About Roller Skates'],
  },

  'protective-gear': {
    topDescription: `<h2 class="text-2xl font-bold mb-4">Protective Gear for Skating | Helmets, Pads & Guards</h2>
      <p>
        Stay safe while skating with <strong>premium protective gear from Canada's trusted skate shop</strong>. Shop 80+ safety products including helmets, knee pads, elbow pads, and wrist guards. Free shipping on orders over $99 CAD across Canada. All protective gear is safety-certified and tested for skating. Perfect for inline skating, roller skating, skateboarding, and scootering. Sizes available for kids, youth, and adults. Ships from Toronto within 1-2 business days.
      </p>`,

    benefits: [
      {
        icon: 'mdi:shield-check',
        title: 'Safety Certified',
        description: 'CPSC & ASTM approved gear',
      },
      {
        icon: 'mdi:human-child',
        title: 'All Ages',
        description: 'Kids to adult sizes available',
      },
      {
        icon: 'mdi:truck-fast',
        title: 'Fast Shipping',
        description: 'Ships same day from Toronto',
      },
      {
        icon: 'mdi:cash-multiple',
        title: 'Value Packs',
        description: 'Save with complete protection sets',
      },
    ],

    faqs: [
      {
        question: 'What protective gear do I need for skating?',
        answer:
          'At minimum, we recommend a certified helmet, wrist guards, and knee pads for all skaters in Canada. Beginners should also add elbow pads. This "full protection" setup prevents the most common skating injuries. Advanced skaters may skip some pads but should always wear a helmet. We offer complete protection sets that save you money compared to buying items individually.',
      },
      {
        question: 'How do I choose the right helmet size?',
        answer:
          'Measure your head circumference just above your eyebrows with a flexible measuring tape. Compare to the size chart on each helmet product page. A properly fitted helmet should sit level on your head, not rock back and forth, and the chin strap should be snug but comfortable. Canadian safety standards require CPSC or ASTM certification – all our helmets meet these requirements.',
      },
      {
        question: 'Can kids use adult protective gear?',
        answer:
          "No – kids need properly sized protective gear for effective protection. Adult gear is too large and won't stay in place during falls. We carry dedicated kids' protective gear in sizes XS-L (typically ages 4-14). Kids' gear is designed with smaller proportions and features easy-adjust straps. Free shipping on orders over $99 CAD includes kids' protection sets.",
      },
    ],

    keywords: ['protective gear Canada', 'skate helmet', 'knee pads', 'wrist guards', 'safety gear', 'skating protection'],

    h2Headings: ['Protective Gear for Skating', 'Choosing the Right Safety Equipment'],
  },

  'clearance-items': {
    topDescription: `<h2 class="text-2xl font-bold mb-4">Clearance Skates & Gear | Up to 60% Off</h2>
      <p>
        <strong>Save big on clearance inline skates, roller skates, and accessories</strong> at ProSkaters Place Canada. Limited quantities, previous season models, and overstock items at massive discounts. All products are brand new, authentic, and include manufacturer warranties. Free shipping over $99 CAD. Shop now before they're gone! Clearance items update weekly. All prices in Canadian dollars. Ships from Toronto within 1-2 business days. No returns on clearance items – sales are final.
      </p>`,

    benefits: [
      {
        icon: 'mdi:tag-percent',
        title: 'Up to 60% Off',
        description: 'Huge savings on quality gear',
      },
      {
        icon: 'mdi:new-box',
        title: 'Brand New',
        description: 'All items unused & authentic',
      },
      {
        icon: 'mdi:clock-fast',
        title: 'Limited Stock',
        description: 'Shop now before sold out',
      },
      {
        icon: 'mdi:truck',
        title: 'Fast Shipping',
        description: 'Free over $99 CAD',
      },
    ],

    faqs: [
      {
        question: 'Why are clearance items so cheap?',
        answer:
          "Clearance items are previous season models, discontinued colors, or overstock that we're making room for. All products are brand new, unused, and authentic. They include full manufacturer warranties. Nothing is wrong with them – we just need to clear space for new inventory. This is your chance to save 30-60% on quality inline skates and gear.",
      },
      {
        question: 'Can I return clearance items?',
        answer:
          "Clearance items are final sale and cannot be returned or exchanged. We recommend double-checking sizes and specifications before ordering. Need sizing help? Contact our Toronto team before purchasing – we're happy to help ensure you order the right size. Most clearance items ship within 1-2 business days.",
      },
      {
        question: 'How often do clearance items change?',
        answer:
          'We add new clearance items weekly, typically on Mondays. Popular sizes and models sell out quickly – sometimes within hours. Sign up for our email newsletter to get notified when new clearance items are added. Follow us on Instagram @proskatersplace for clearance alerts. All clearance prices are in CAD with free shipping over $99.',
      },
    ],

    keywords: ['clearance skates', 'discount inline skates', 'cheap roller skates Canada', 'skate sale', 'clearance skating gear'],

    h2Headings: ['Clearance Skates & Gear', 'Massive Savings on Quality Products'],
  },
};

// Export helper function to get category content
export const getCategoryContent = (slug: string): CategoryContentData | null => {
  return categoryContentData[slug] || null;
};
