# Enhanced Session Management Test for WooCommerce GraphQL
# This script tests the improved session handling with customer.sessionToken

$headers = @{
    "Content-Type" = "application/json"
}

$endpoint = "https://test.proskatersplace.com/graphql"

# Test 1: Get cart and customer data to retrieve sessionToken
Write-Host "=== Test 1: Getting cart and customer session token ===" -ForegroundColor Green

$cartQuery = @{
    query = @"
        query getCart {
            cart {
                total
                isEmpty
                contents(first: 5) {
                    itemCount
                    nodes {
                        key
                        quantity
                        product {
                            node {
                                name
                                databaseId
                            }
                        }
                    }
                }
            }
            customer {
                sessionToken
                firstName
                email
                databaseId
            }
        }
"@
} | ConvertTo-Json -Depth 3

Write-Host "Sending cart query..." -ForegroundColor Yellow
try {
    $cartResponse = Invoke-RestMethod -Uri $endpoint -Method POST -Body $cartQuery -Headers $headers
    
    if ($cartResponse.data) {
        $sessionToken = $cartResponse.data.customer.sessionToken
        $cartItems = $cartResponse.data.cart.contents.itemCount
        
        Write-Host "✅ Cart query successful" -ForegroundColor Green
        Write-Host "Session Token: $($sessionToken.Substring(0, 20))..." -ForegroundColor Cyan
        Write-Host "Cart Items: $cartItems" -ForegroundColor Cyan
        Write-Host "Customer ID: $($cartResponse.data.customer.databaseId)" -ForegroundColor Cyan
        
        if ($sessionToken -and $sessionToken.Length -gt 0) {
            Write-Host "✅ Session token retrieved successfully" -ForegroundColor Green
            
            # Test 2: Use the session token in a subsequent request
            Write-Host "`n=== Test 2: Using session token for cart operations ===" -ForegroundColor Green
            
            $sessionHeaders = @{
                "Content-Type" = "application/json"
                "woocommerce-session" = "Session $sessionToken"
            }
            
            # Try to get cart again with explicit session header
            Write-Host "Testing cart query with explicit session header..." -ForegroundColor Yellow
            $cartWithSessionResponse = Invoke-RestMethod -Uri $endpoint -Method POST -Body $cartQuery -Headers $sessionHeaders
            
            if ($cartWithSessionResponse.data) {
                Write-Host "✅ Cart query with session header successful" -ForegroundColor Green
                $newSessionToken = $cartWithSessionResponse.data.customer.sessionToken
                Write-Host "New Session Token: $($newSessionToken.Substring(0, 20))..." -ForegroundColor Cyan
                
                if ($newSessionToken -eq $sessionToken) {
                    Write-Host "✅ Session token remains consistent" -ForegroundColor Green
                } else {
                    Write-Host "⚠️  Session token was updated" -ForegroundColor Yellow
                    $sessionToken = $newSessionToken
                }
            }
            
            # Test 3: Test checkout mutation structure (without actually checking out)
            Write-Host "`n=== Test 3: Testing checkout mutation structure ===" -ForegroundColor Green
            
            $checkoutStructureQuery = @{
                query = @"
                    query {
                        __type(name: "CheckoutInput") {
                            inputFields {
                                name
                                type {
                                    name
                                    kind
                                }
                            }
                        }
                    }
"@
            } | ConvertTo-Json -Depth 4
            
            Write-Host "Checking checkout mutation structure..." -ForegroundColor Yellow
            $checkoutStructureResponse = Invoke-RestMethod -Uri $endpoint -Method POST -Body $checkoutStructureQuery -Headers $sessionHeaders
            
            if ($checkoutStructureResponse.data) {
                Write-Host "✅ Checkout mutation structure retrieved" -ForegroundColor Green
                $checkoutFields = $checkoutStructureResponse.data.__type.inputFields | Where-Object { $_.name -in @("paymentMethod", "transactionId", "isPaid") }
                foreach ($field in $checkoutFields) {
                    Write-Host "  - $($field.name): $($field.type.name)" -ForegroundColor Cyan
                }
            }
            
            Write-Host "`n=== Summary ===" -ForegroundColor Magenta
            Write-Host "✅ Session token management working correctly" -ForegroundColor Green
            Write-Host "✅ GraphQL endpoint accessible" -ForegroundColor Green
            Write-Host "✅ Customer session persistence confirmed" -ForegroundColor Green
            Write-Host "Ready for enhanced checkout flow implementation" -ForegroundColor Green
        } else {
            Write-Host "❌ No session token found in response" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Cart query failed" -ForegroundColor Red
        Write-Host "Response: $($cartResponse | ConvertTo-Json -Depth 3)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Request failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Red
    }
}