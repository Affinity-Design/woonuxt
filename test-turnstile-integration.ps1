# PowerShell Test Script for Turnstile Integration
# Run with: powershell -ExecutionPolicy Bypass .\test-turnstile-integration.ps1

param(
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "🚀 Starting Turnstile Integration Tests" -ForegroundColor Blue
Write-Host "=" * 50 -ForegroundColor Blue

function Test-TurnstileVerification {
    Write-Host "🔐 Testing Turnstile verification endpoint..." -ForegroundColor Blue
    
    try {
        # Test with invalid token
        $invalidBody = @{
            turnstileToken = "invalid_token_12345"
        } | ConvertTo-Json
        
        $invalidResult = Invoke-RestMethod -Uri "$BaseUrl/api/verify-turnstile" -Method Post -ContentType "application/json" -Body $invalidBody -ErrorAction Stop
        
        if (-not $invalidResult.success) {
            Write-Host "✅ Invalid token correctly rejected" -ForegroundColor Green
        } else {
            Write-Host "❌ Invalid token test failed" -ForegroundColor Red
            Write-Host "Response: $($invalidResult | ConvertTo-Json)"
        }
        
        # Test with missing token
        $emptyBody = @{} | ConvertTo-Json
        $missingResult = Invoke-RestMethod -Uri "$BaseUrl/api/verify-turnstile" -Method Post -ContentType "application/json" -Body $emptyBody -ErrorAction Stop
        
        if (-not $missingResult.success) {
            Write-Host "✅ Missing token correctly rejected" -ForegroundColor Green
        } else {
            Write-Host "❌ Missing token test failed" -ForegroundColor Red
            Write-Host "Response: $($missingResult | ConvertTo-Json)"
        }
        
    } catch {
        Write-Host "❌ Turnstile verification test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Test-OrderCreationWithoutToken {
    Write-Host "🛒 Testing order creation without Turnstile token..." -ForegroundColor Blue
    
    try {
        $orderData = @{
            billing = @{
                firstName = "Test"
                lastName = "User"
                email = "test@example.com"
                phone = "1234567890"
                address1 = "123 Test St"
                city = "Test City"
                state = "TS"
                postcode = "12345"
                country = "CA"
            }
            transactionId = "test_$(Get-Date -Format 'yyyyMMddHHmmss')"
            lineItems = @(
                @{
                    productId = 1
                    quantity = 1
                    name = "Test Product"
                    total = "10.00"
                }
            )
            cartTotals = @{
                total = "10.00"
            }
            # Note: No turnstileToken provided
        } | ConvertTo-Json -Depth 3
        
        $result = Invoke-RestMethod -Uri "$BaseUrl/api/create-admin-order" -Method Post -ContentType "application/json" -Body $orderData -ErrorAction Stop
        
        if ($result.success -eq $false) {
            Write-Host "✅ Order creation without token correctly rejected" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Order creation without token - check if this is expected" -ForegroundColor Yellow
            Write-Host "Response: $($result | ConvertTo-Json)"
        }
        
    } catch {
        Write-Host "❌ Order creation test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Test-CheckoutPageLoad {
    Write-Host "📄 Testing checkout page load..." -ForegroundColor Blue
    
    try {
        $result = Invoke-WebRequest -Uri "$BaseUrl/checkout" -Method Get -ErrorAction Stop
        
        if ($result.StatusCode -eq 200) {
            $hasVueTurnstile = $result.Content -match "VueTurnstile|turnstile|security check"
            
            if ($hasVueTurnstile) {
                Write-Host "✅ Checkout page contains Turnstile integration" -ForegroundColor Green
            } else {
                Write-Host "⚠️ Checkout page may not have Turnstile integration" -ForegroundColor Yellow
            }
        } else {
            Write-Host "❌ Checkout page returned status: $($result.StatusCode)" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "❌ Checkout page test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Show-ManualTestingInstructions {
    Write-Host ""
    Write-Host "✨ Tests completed!" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Manual testing steps:" -ForegroundColor Yellow
    Write-Host "1. Visit /checkout in your browser" -ForegroundColor Yellow
    Write-Host "2. Fill out the checkout form" -ForegroundColor Yellow
    Write-Host "3. Complete the Turnstile challenge" -ForegroundColor Yellow
    Write-Host "4. Submit the order" -ForegroundColor Yellow
    Write-Host "5. Verify the order is created successfully" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To test spam prevention:" -ForegroundColor Yellow
    Write-Host "1. Try submitting without completing Turnstile" -ForegroundColor Yellow
    Write-Host "2. Should see error message" -ForegroundColor Yellow
    Write-Host "3. Order should NOT be created" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Configuration check:" -ForegroundColor Cyan
    Write-Host "Make sure these environment variables are set:" -ForegroundColor Cyan
    Write-Host "- TURNSTYLE_SITE_KEY" -ForegroundColor Cyan
    Write-Host "- TURNSTYLE_SECRET_KEY" -ForegroundColor Cyan
}

# Run all tests
Test-TurnstileVerification
Write-Host ""

Test-OrderCreationWithoutToken
Write-Host ""

Test-CheckoutPageLoad

Show-ManualTestingInstructions