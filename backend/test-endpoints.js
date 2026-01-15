const API_BASE = 'http://localhost:5000/api';

async function testEndpoint(method, endpoint, data = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const result = await response.json();
    
    console.log(`${method} ${endpoint}: ${response.status}`);
    if (response.ok) {
      console.log('✅ Success:', result.message || 'OK');
    } else {
      console.log('❌ Error:', result.error);
    }
    
    return result;
  } catch (error) {
    console.log(`❌ ${method} ${endpoint}:`, error.message);
    return null;
  }
}

async function runTests() {
  console.log('🧪 Testing Schedula API Endpoints\n');
  
  // Test health endpoint
  await testEndpoint('GET', '/health');
  
  // Test services endpoint (should work without auth)
  await testEndpoint('GET', '/services');
  
  // Test registration
  const clientData = {
    email: 'testclient@example.com',
    password: 'password123',
    name: 'Test Client',
    user_type: 'client',
    phone: '+254712345678'
  };
  
  const clientResult = await testEndpoint('POST', '/auth/register', clientData);
  
  // Test provider registration
  const providerData = {
    email: 'testprovider@example.com',
    password: 'password123', 
    name: 'Test Provider',
    user_type: 'provider',
    business_name: 'Test Business',
    phone: '+254798765432'
  };
  
  const providerResult = await testEndpoint('POST', '/auth/register', providerData);
  
  console.log('\n🎯 Basic API testing completed!');
  console.log('\nNext: Test authenticated endpoints with the tokens above.');
}

runTests();