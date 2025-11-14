<script setup lang="ts">
import VueTurnstile from 'vue-turnstile';

const {setCanadianSEO} = useCanadianSEO();

// Contact page SEO optimization
setCanadianSEO({
  title: 'Contact ProSkaters Place | Toronto Skate Shop | Expert Help',
  description:
    'Contact ProSkaters Place Toronto for expert advice on inline skates, roller skates & protective gear. Visit our Etobicoke shop, call, or message us. Free shipping across Canada!',
  image: '/images/proskaters-place-toronto-store.jpg',
  type: 'website',
});

// LocalBusiness structured data for GMB
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        '@id': 'https://proskatersplace.ca/#business',
        name: 'ProSkaters Place Skate and Ski Shop',
        image: 'https://proskatersplace.ca/images/proskaters-place-toronto-store.jpg',
        description:
          "Toronto's premier inline skate and roller skate shop. Expert fitting, top brands, and skating accessories. Serving Toronto, GTA, and all of Canada since 1995.",
        url: 'https://proskatersplace.ca',
        telephone: '+1-416-739-2929',
        email: 'info@proskatersplace.ca',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '3600 Langstaff Road',
          addressLocality: 'Etobicoke',
          addressRegion: 'ON',
          postalCode: 'M9W 5S4',
          addressCountry: 'CA',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 43.679955,
          longitude: -79.589456,
        },
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: 'Monday',
            opens: '12:00',
            closes: '16:00',
          },
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: 'Tuesday',
            opens: '12:00',
            closes: '16:00',
          },
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: 'Wednesday',
            opens: '12:00',
            closes: '19:00',
          },
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: 'Thursday',
            opens: '12:00',
            closes: '16:00',
          },
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: 'Friday',
            opens: '12:00',
            closes: '16:00',
          },
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: 'Saturday',
            opens: '14:00',
            closes: '19:00',
          },
        ],
        areaServed: [
          {
            '@type': 'City',
            name: 'Toronto',
            '@id': 'https://www.wikidata.org/wiki/Q172',
          },
          {
            '@type': 'AdministrativeArea',
            name: 'Ontario',
            '@id': 'https://www.wikidata.org/wiki/Q1904',
          },
          {
            '@type': 'Country',
            name: 'Canada',
            '@id': 'https://www.wikidata.org/wiki/Q16',
          },
        ],
        sameAs: [
          'https://www.facebook.com/proskatersplace',
          'https://www.instagram.com/proskatersplace',
          'https://www.google.com/maps/place/ProSkaters+Place+Skate+and+Ski+Shop/@43.679955,-79.589456,15z',
        ],
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          reviewCount: '250',
          bestRating: '5',
          worstRating: '1',
        },
        paymentAccepted: 'Cash, Credit Card, Debit Card, PayPal',
        currenciesAccepted: 'CAD',
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Inline Skates & Roller Skates',
          itemListElement: [
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Product',
                name: 'Inline Skates',
                category: 'Sporting Goods',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Product',
                name: 'Roller Skates',
                category: 'Sporting Goods',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Product',
                name: 'Protective Gear',
                category: 'Sporting Goods',
              },
            },
          ],
        },
      }),
    },
  ],
});

const turnstileToken = ref<string>('');
const turnstileError = ref<string>('');
const turnstileMounted = ref(false);
const turnstileSiteKey = useRuntimeConfig();

const form = ref({
  name: '',
  email: '',
  message: '',
});

const status = ref({
  submitting: false,
  success: false,
  error: null,
});

const verifyTurnstile = async () => {
  turnstileError.value = '';
  if (!turnstileToken.value) {
    turnstileError.value = 'Please complete the security check';
    return false;
  }
  return true;
};

async function submitForm() {
  try {
    // Verify Turnstile token
    if (!(await verifyTurnstile())) return;

    // Set submitting state
    status.value.submitting = true;
    status.value.error = null;

    console.log('Submitting form...');

    // Send form data to the API
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...form.value,
        turnstileToken: turnstileToken.value,
      }),
    });

    const result = await response.json();
    console.log('Form submission response:', result);

    if (!response.ok) {
      const errorMsg = result.error || 'Failed to send message';
      console.error('Form submission error:', errorMsg, result);
      throw new Error(errorMsg);
    }

    // Success state
    status.value.success = true;
    console.log('Form submitted successfully');

    // Reset form after submission
    form.value = {name: '', email: '', message: ''};
    turnstileToken.value = '';

    // Reset Turnstile
    if (window.turnstile) {
      window.turnstile.reset();
    }
  } catch (error) {
    console.error('Error submitting form:', error);
    status.value.error = error.message || 'An error occurred while sending your message';
    turnstileToken.value = '';

    // Reset Turnstile
    if (window.turnstile) {
      window.turnstile.reset();
    }
  } finally {
    status.value.submitting = false;

    // Auto-clear success message after 5 seconds
    if (status.value.success) {
      setTimeout(() => {
        status.value.success = false;
      }, 5000);
    }
  }
}
</script>

<template>
  <div class="container my-8 max-w-7xl">
    <!-- PSP Rewards Notice -->
    <div class="mb-8 bg-blue-100 border-l-4 border-blue-500 p-6 rounded-lg shadow-md">
      <div class="flex items-start">
        <Icon name="mdi:gift-outline" class="w-8 h-8 text-blue-600 mr-4 flex-shrink-0 mt-1" />
        <div>
          <h2 class="text-xl font-bold text-blue-900 mb-2">🎁 PSP Rewards Coming Soon to ProSkatersPlace.ca!</h2>
          <p class="text-blue-800 mb-3">
            Our loyalty rewards program is launching soon on the .ca site! Earn points on every purchase and redeem them for exclusive discounts.
          </p>
          <p class="text-blue-800 mb-3"><strong>Need to redeem rewards now?</strong> Please send us a message using the form below, or visit our US site:</p>
          <a
            href="https://proskatersplace.com/"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            <Icon name="mdi:open-in-new" class="w-5 h-5 mr-2" />
            Visit ProSkatersPlace.com
          </a>
        </div>
      </div>
    </div>

    <!-- SEO-optimized H1 -->
    <h1 class="mb-4 text-3xl md:text-4xl font-bold text-primary">Contact ProSkaters Place Toronto</h1>
    <p class="mb-8 text-lg text-gray-700">
      Visit our Etobicoke skate shop, call us, or send a message. We're here to help you find the perfect inline skates or roller skates!
    </p>

    <!-- Contact Info Cards - 4 across -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
      <!-- Visit Us -->
      <div class="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <div class="flex items-center mb-3">
          <Icon name="mdi:map-marker" class="w-8 h-8 text-primary mr-3" />
          <h2 class="text-xl font-semibold">Visit Our Store</h2>
        </div>
        <p class="text-gray-700 mb-2">
          <strong>ProSkaters Place</strong><br />
          3600 Langstaff Road<br />
          Etobicoke, ON M9W 5S4<br />
          Canada
        </p>
      </div>

      <!-- Call Us -->
      <div class="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <div class="flex items-center mb-3">
          <Icon name="mdi:phone" class="w-8 h-8 text-primary mr-3" />
          <h2 class="text-xl font-semibold">Call Us</h2>
        </div>
        <p class="text-gray-700 mb-2">
          <a href="tel:+14167392929" class="text-primary hover:underline text-xl font-semibold"> (416) 739-2929 </a>
        </p>
        <p class="text-sm text-gray-600 mt-3">Speak with our skate experts about sizing, products, or skating advice. We're happy to help!</p>
      </div>

      <!-- Email Us -->
      <div class="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <div class="flex items-center mb-3">
          <Icon name="mdi:email" class="w-8 h-8 text-primary mr-3" />
          <h2 class="text-xl font-semibold">Email Us</h2>
        </div>
        <p class="text-gray-700 mb-2">
          <a href="mailto:info@proskatersplace.ca" class="text-primary hover:underline"> info@proskatersplace.ca </a>
        </p>
        <p class="text-sm text-gray-600 mt-3">Send us your questions or feedback. We typically respond within 24 hours during business days.</p>
      </div>

      <!-- Store Hours Card -->
      <div class="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <div class="flex items-center mb-3">
          <Icon name="mdi:clock-outline" class="w-8 h-8 text-primary mr-3" />
          <h2 class="text-xl font-semibold">Store Hours</h2>
        </div>
        <p class="text-sm text-gray-700">
          <strong>In-Person Pickup:</strong><br />
          Mon, Tue, Thu, Fri: 12-4pm<br />
          Wed: 12-7pm<br />
          Sat: 2-7pm<br />
          Sun: Closed
        </p>
        <p class="text-xs text-primary mt-3 font-semibold">
          💻 Online: 24/7<br />
          Shop anytime!
        </p>
      </div>
    </div>

    <!-- Two Column Layout: Map Left, Contact Form Right -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
      <!-- Left Column: Google Maps -->
      <div>
        <h2 class="text-2xl font-semibold mb-4 text-primary">Find Us on the Map</h2>
        <div class="relative w-full overflow-hidden rounded-lg shadow-lg" style="height: 550px">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2885.4717423046313!2d-79.58945612382175!3d43.679955171100765!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x882b2e0b65e674a9%3A0x63b7bfa03a4fbaa9!2sProSkaters%20Place%20Skate%20and%20Ski%20Shop!5e0!3m2!1sen!2sca!4v1763088514757!5m2!1sen!2sca"
            width="100%"
            height="100%"
            style="border: 0"
            allowfullscreen=""
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
            title="ProSkaters Place Toronto Location Map">
          </iframe>
        </div>
        <p class="text-sm text-gray-600 mt-3">
          <Icon name="mdi:car" class="w-4 h-4 inline mr-1" />
          <strong>Parking:</strong> Free parking available on-site. Easy access from Highway 427 and Langstaff Road.
        </p>
      </div>

      <!-- Right Column: Contact Form -->
      <div>
        <h2 class="text-2xl font-semibold mb-4 text-primary">Send Us a Message</h2>
        <p class="text-gray-700 mb-4">Have a question about sizing, products, or skating? Fill out the form below and we'll get back to you quickly!</p>

        <!-- Success message -->
        <div v-if="status.success" class="mb-4 p-4 bg-green-100 text-green-800 rounded-lg border border-green-300">
          ✓ Your message has been sent successfully! We'll get back to you soon.
        </div>

        <!-- Error message -->
        <div v-if="status.error" class="mb-4 p-4 bg-red-100 text-red-800 rounded-lg border border-red-300">
          {{ status.error }}
        </div>

        <form @submit.prevent="submitForm" class="space-y-4 bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <div>
            <label for="name" class="block mb-2 font-medium text-gray-700">Your Name *</label>
            <input
              type="text"
              id="name"
              v-model="form.name"
              required
              class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              :disabled="status.submitting"
              placeholder="John Smith" />
          </div>
          <div>
            <label for="email" class="block mb-2 font-medium text-gray-700">Your Email *</label>
            <input
              type="email"
              id="email"
              v-model="form.email"
              required
              class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              :disabled="status.submitting"
              placeholder="john@example.com" />
          </div>
          <div>
            <label for="message" class="block mb-2 font-medium text-gray-700">Your Message *</label>
            <textarea
              id="message"
              v-model="form.message"
              required
              class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              rows="6"
              :disabled="status.submitting"
              placeholder="I'm interested in learning more about..."></textarea>
          </div>

          <!-- Turnstile widget -->
          <div class="my-4 turnstile-contact-widget">
            <ClientOnly>
              <VueTurnstile
                :site-key="turnstileSiteKey.public.turnstile?.siteKey"
                v-model="turnstileToken"
                theme="light"
                size="compact"
                @verify="
                  () => {
                    turnstileMounted = true;
                    turnstileError = '';
                    if (!turnstileToken) console.error('No token after mount');
                  }
                "
                @error="
                  () => {
                    turnstileError = 'Security check failed - please try again';
                  }
                "
                :reset-interval="30000" />
              <div v-if="turnstileError" class="text-red-500 text-sm mt-2">
                {{ turnstileError }}
              </div>
            </ClientOnly>
          </div>

          <button
            type="submit"
            class="w-full bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="status.submitting">
            <span v-if="status.submitting">
              <Icon name="mdi:loading" class="w-5 h-5 inline animate-spin mr-2" />
              Sending...
            </span>
            <span v-else>
              <Icon name="mdi:send" class="w-5 h-5 inline mr-2" />
              Send Message
            </span>
          </button>
        </form>
      </div>
    </div>

    <!-- FAQ Section - Full Width Below -->
    <div class="mb-12">
      <h2 class="text-2xl font-semibold mb-4 text-primary">Frequently Asked Questions</h2>
      <p class="text-gray-700 mb-6">Quick answers to common questions about shopping at ProSkaters Place.</p>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <FaqAccordion />
        </div>

        <!-- Trust Signals -->
        <div class="bg-blue-50 p-6 rounded-lg border border-blue-200 h-fit">
          <h3 class="text-lg font-semibold mb-3 text-primary">Why Shop at ProSkaters Place?</h3>
          <ul class="space-y-2 text-sm text-gray-700">
            <li class="flex items-start">
              <Icon name="mdi:check-circle" class="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>Expert Fitting:</strong> Over 25 years of experience helping Canadians find the perfect skates</span>
            </li>
            <li class="flex items-start">
              <Icon name="mdi:check-circle" class="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>Free Shipping:</strong> On orders over $99 across Canada</span>
            </li>
            <li class="flex items-start">
              <Icon name="mdi:check-circle" class="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>Top Brands:</strong> Rollerblade, K2, Bauer, Moxi, and more</span>
            </li>
            <li class="flex items-start">
              <Icon name="mdi:check-circle" class="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>Local Toronto Shop:</strong> Visit our Etobicoke store for personalized service</span>
            </li>
            <li class="flex items-start">
              <Icon name="mdi:check-circle" class="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>Secure Payment:</strong> Multiple payment options including PayPal, Stripe, and Helcim</span>
            </li>
            <li class="flex items-start">
              <Icon name="mdi:check-circle" class="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
              <span><strong>Easy Returns:</strong> Hassle-free return policy within 30 days</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- SEO Content Section -->
    <div class="mt-12 bg-gray-50 p-8 rounded-lg">
      <h2 class="text-2xl font-semibold mb-4 text-primary">Your Toronto Inline Skate & Roller Skate Experts</h2>
      <div class="prose prose-lg max-w-none text-gray-700">
        <p>
          ProSkaters Place has been Toronto's trusted skate shop since 1995, serving customers from across the GTA, Ontario, and all of Canada. Located in
          Etobicoke near Highway 427 and Langstaff Road, our store specializes in inline skates, roller skates, protective gear, wheels, bearings, and skating
          accessories.
        </p>
        <p class="mt-4">
          Whether you're shopping online or visiting our physical location, our team provides expert advice on skate sizing, brand selection, and skating
          techniques. We carry premium brands including Rollerblade, K2, Bauer, Powerslide, FR Skates, Moxi, Riedell, and Sure-Grip. From recreational fitness
          skating to aggressive inline skating and artistic roller skating, we have the equipment and expertise to help you succeed.
        </p>
        <p class="mt-4">
          <strong>Contact us today</strong> by phone at <a href="tel:+14167392929" class="text-primary hover:underline">(416) 739-2929</a>, visit our Etobicoke
          store at 3600 Langstaff Road, or send us a message using the form above. We're here to help you enjoy the thrill of skating!
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Turnstile widget positioning for contact form */
.turnstile-contact-widget {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  pointer-events: auto;
}

/* Mobile positioning - center bottom */
@media (max-width: 768px) {
  .turnstile-contact-widget {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    bottom: 10px;
  }
}
</style>
