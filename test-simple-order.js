#!/usr/bin/env node

const http = require("http");

// Simple test data without coupon
const testData = {
  transactionId: `test-simple-${Date.now()}`,
  billing: {
    firstName: "Test",
    lastName: "Customer",
    email: "test@example.com",
  },
  lineItems: [
    {
      productId: 16774,
      quantity: 1,
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
  timeout: 5000,
};

console.log("Testing simple admin order creation...");

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("Response:", data);
  });
});

req.on("timeout", () => {
  console.log("Request timed out");
  req.destroy();
});

req.on("error", (e) => {
  console.error(`Request error: ${e.message}`);
});

req.write(postData);
req.end();
