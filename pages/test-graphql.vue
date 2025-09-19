<template>
  <div class="container mx-auto p-8">
    <h1 class="text-3xl font-bold mb-8">GraphQL Testing Page</h1>

    <!-- GraphQL Connectivity Test -->
    <div class="bg-white p-6 rounded-lg shadow-lg mb-6">
      <h2 class="text-xl font-semibold mb-4">
        1. GraphQL Endpoint Connectivity
      </h2>
      <button
        @click="testGraphQL"
        :disabled="loading.graphql"
        class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {{ loading.graphql ? "Testing..." : "Test GraphQL Endpoint" }}
      </button>
      <div
        v-if="results.graphql"
        class="mt-4 p-4 rounded"
        :class="
          results.graphql.success
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        "
      >
        <pre class="text-sm">{{
          JSON.stringify(results.graphql, null, 2)
        }}</pre>
      </div>
    </div>

    <!-- Payment Methods Test -->
    <div class="bg-white p-6 rounded-lg shadow-lg mb-6">
      <h2 class="text-xl font-semibold mb-4">2. Available Payment Methods</h2>
      <button
        @click="testPaymentMethods"
        :disabled="loading.paymentMethods"
        class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
      >
        {{ loading.paymentMethods ? "Testing..." : "Get Payment Methods" }}
      </button>
      <div
        v-if="results.paymentMethods"
        class="mt-4 p-4 rounded"
        :class="
          results.paymentMethods.success
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        "
      >
        <pre class="text-sm">{{
          JSON.stringify(results.paymentMethods, null, 2)
        }}</pre>
      </div>
    </div>

    <!-- Mock Checkout Test -->
    <div class="bg-white p-6 rounded-lg shadow-lg mb-6">
      <h2 class="text-xl font-semibold mb-4">
        3. Mock Checkout Test (isPaid: true)
      </h2>
      <button
        @click="testMockCheckout"
        :disabled="loading.mockCheckout"
        class="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
      >
        {{ loading.mockCheckout ? "Testing..." : "Test Mock Checkout" }}
      </button>
      <div
        v-if="results.mockCheckout"
        class="mt-4 p-4 rounded"
        :class="
          results.mockCheckout.success
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        "
      >
        <pre class="text-sm">{{
          JSON.stringify(results.mockCheckout, null, 2)
        }}</pre>
      </div>
    </div>

    <!-- Create Order Test -->
    <div class="bg-white p-6 rounded-lg shadow-lg mb-6">
      <h2 class="text-xl font-semibold mb-4">
        4. Create Order Test (Client-side session)
      </h2>
      <div class="mb-4">
        <label class="block text-sm font-medium mb-2"
          >Product ID (required):</label
        >
        <input
          v-model="productId"
          type="number"
          placeholder="Enter a valid product ID"
          class="border border-gray-300 rounded px-3 py-2 w-32"
        />
      </div>
      <button
        @click="testCreateOrder"
        :disabled="loading.createOrder || !productId"
        class="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 disabled:opacity-50"
      >
        {{ loading.createOrder ? "Testing..." : "Test Create Order" }}
      </button>
      <div
        v-if="results.createOrder"
        class="mt-4 p-4 rounded"
        :class="
          results.createOrder.success
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        "
      >
        <pre class="text-sm">{{
          JSON.stringify(results.createOrder, null, 2)
        }}</pre>
      </div>
    </div>

    <!-- Nuxt Auth Flow Test -->
    <div class="bg-white p-6 rounded-lg shadow-lg mb-6">
      <h2 class="text-xl font-semibold mb-4">
        5. 🚀 Nuxt-GraphQL-Client Auth Flow Test
      </h2>
      <p class="text-sm text-gray-600 mb-4">
        Comprehensive test simulating production authentication patterns using
        nuxt-graphql-client composables
      </p>
      <button
        @click="testNuxtAuth"
        :disabled="loading.nuxtAuth"
        class="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 font-semibold"
      >
        {{
          loading.nuxtAuth ? "Running Tests..." : "🧪 Run Full Auth Test Suite"
        }}
      </button>
      <div v-if="results.nuxtAuth" class="mt-4">
        <div
          class="p-4 rounded-lg mb-4"
          :class="
            results.nuxtAuth.success
              ? 'bg-green-100 border border-green-300'
              : 'bg-red-100 border border-red-300'
          "
        >
          <div class="flex items-center mb-2">
            <span class="text-2xl mr-2">{{
              results.nuxtAuth.success ? "🎉" : "❌"
            }}</span>
            <h3 class="font-bold text-lg">{{ results.nuxtAuth.readiness }}</h3>
          </div>
          <p class="text-sm">{{ results.nuxtAuth.message }}</p>
        </div>

        <!-- Test Results -->
        <div v-if="results.nuxtAuth.testResults" class="space-y-3">
          <h4 class="font-semibold">
            Test Results ({{ results.nuxtAuth.testResults.summary.passed }}/{{
              results.nuxtAuth.testResults.summary.total
            }}
            passed):
          </h4>
          <div
            v-for="test in results.nuxtAuth.testResults.tests"
            :key="test.name"
            class="p-3 rounded border"
            :class="
              test.status === 'PASSED'
                ? 'border-green-300 bg-green-50'
                : 'border-red-300 bg-red-50'
            "
          >
            <div class="flex items-center justify-between">
              <span class="font-medium">{{ test.name }}</span>
              <span
                class="px-2 py-1 rounded text-xs font-bold"
                :class="
                  test.status === 'PASSED'
                    ? 'bg-green-200 text-green-800'
                    : 'bg-red-200 text-red-800'
                "
              >
                {{ test.status }}
              </span>
            </div>
            <div v-if="test.details" class="mt-2 text-sm text-gray-600">
              <pre class="whitespace-pre-wrap">{{
                typeof test.details === "string"
                  ? test.details
                  : JSON.stringify(test.details, null, 2)
              }}</pre>
            </div>
            <div v-if="test.error" class="mt-2 text-sm text-red-600">
              Error: {{ test.error }}
            </div>
          </div>
        </div>

        <!-- Recommendations -->
        <div
          v-if="results.nuxtAuth.recommendations"
          class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded"
        >
          <h4 class="font-semibold mb-2">Recommendations:</h4>
          <ul class="space-y-1">
            <li
              v-for="rec in results.nuxtAuth.recommendations"
              :key="rec"
              class="text-sm"
            >
              {{ rec }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Test Notes -->
    <div class="bg-yellow-50 p-6 rounded-lg">
      <h3 class="text-lg font-semibold mb-2">Test Notes:</h3>
      <ul class="list-disc list-inside space-y-1 text-sm">
        <li>
          All tests use <code>isPaid: true</code> to bypass payment processing
        </li>
        <li>
          Mock transactions use test data - no real payments are processed
        </li>
        <li>
          The endpoint being tested is:
          <code>https://test.proskatersplace.com/graphql</code>
        </li>
        <li>
          Custom headers are included: <code>x-frontend-type: woonuxt</code>
        </li>
        <li>
          For Create Order test, you need a valid product ID from your
          WooCommerce store
        </li>
        <li>
          The Nuxt Auth Flow test simulates production authentication patterns
        </li>
        <li>
          All tests use <code>nuxt-graphql-client</code> composables
          (useGqlToken, useGqlHeaders, etc.)
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
const loading = reactive({
  graphql: false,
  paymentMethods: false,
  mockCheckout: false,
  createOrder: false,
  nuxtAuth: false,
});

const results = reactive({
  graphql: null,
  paymentMethods: null,
  mockCheckout: null,
  createOrder: null,
  nuxtAuth: null,
});

const productId = ref(1);

const testGraphQL = async () => {
  loading.graphql = true;
  try {
    const response = await $fetch("/api/test-graphql");
    results.graphql = response;
  } catch (error) {
    results.graphql = { success: false, error: error.message };
  } finally {
    loading.graphql = false;
  }
};

const testPaymentMethods = async () => {
  loading.paymentMethods = true;
  try {
    const response = await $fetch("/api/test-payment-methods");
    results.paymentMethods = response;
  } catch (error) {
    results.paymentMethods = { success: false, error: error.message };
  } finally {
    loading.paymentMethods = false;
  }
};

const testMockCheckout = async () => {
  loading.mockCheckout = true;
  try {
    const response = await $fetch("/api/test-mock-checkout", {
      method: "POST",
      body: {
        paymentMethod: "cod",
        customerNote: "Mock checkout test from frontend",
      },
    });
    results.mockCheckout = response;
  } catch (error) {
    results.mockCheckout = { success: false, error: error.message };
  } finally {
    loading.mockCheckout = false;
  }
};

const testCreateOrder = async () => {
  loading.createOrder = true;
  try {
    const response = await $fetch("/api/test-create-order", {
      method: "POST",
      body: {
        paymentMethod: "cod",
        customerNote: "CreateOrder test from frontend",
        lineItems: [
          {
            productId: parseInt(productId.value),
            quantity: 1,
          },
        ],
      },
    });
    results.createOrder = response;
  } catch (error) {
    results.createOrder = { success: false, error: error.message };
  } finally {
    loading.createOrder = false;
  }
};

const testNuxtAuth = async () => {
  loading.nuxtAuth = true;
  try {
    const response = await $fetch("/api/test-nuxt-auth", {
      method: "POST",
      body: {
        paymentMethod: "cod",
        billing: {
          firstName: "Test",
          lastName: "User",
          address1: "123 Test Street",
          city: "Test City",
          country: "CA",
          postcode: "K1A0A6",
          email: "test@example.com",
          phone: "555-0123",
        },
      },
    });
    results.nuxtAuth = response;
  } catch (error) {
    results.nuxtAuth = { success: false, error: error.message };
  } finally {
    loading.nuxtAuth = false;
  }
};

// Meta
definePageMeta({
  layout: false,
});

useHead({
  title: "GraphQL Testing - WooNuxt",
});
</script>

<style scoped>
code {
  background-color: #e5e7eb;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 0.875rem;
}
</style>
