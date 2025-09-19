#!/usr/bin/env node

const https = require("https");
const http = require("http");

// Test data with coupon
const testData = {
  transactionId: `test-coupon-${Date.now()}`,
  billing: {
    firstName: "Test",
    lastName: "Customer",
    email: "test@example.com",
    address1: "123 Test St",
    city: "Toronto",
    state: "ON",
    postcode: "M5V 3A1",
    country: "CA",
  },
  lineItems: [
    {
      productId: 16774,
      quantity: 1,
    },
  ],
  coupons: [
    {
      code: "TESTCOUPON",
      discountAmount: "0.50",
    },
  ],
};

const postData = JSON.stringify(testData);

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/create-admin-order",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(postData),
  },
};

console.log("Testing admin order creation with coupon...");
console.log("Test data:", JSON.stringify(testData, null, 2));

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("Response body:", data);
    try {
      const result = JSON.parse(data);
      console.log("Parsed result:", JSON.stringify(result, null, 2));
    } catch (e) {
      console.log("Could not parse response as JSON");
    }
  });
});

req.on("error", (e) => {
  console.error(`Request error: ${e.message}`);
});

req.write(postData);
req.end();
