import './src/config/database.js';

console.log('🧪 Testing Schedula Backend API');
console.log('================================\n');

// Test data
const testUsers = {
  client: {
    email: 'testclient@example.com',
    password: 'password123',
    name: 'Test Client',
    user_type: 'client',
    phone: '+254712345678'
  },
  provider: {
    email: 'testprovider@example.com',
    password: 'password123',
    name: 'Test Provider',
    user_type: 'provider',
    business_name: 'Test Business',
    phone: '+254798765432'
  }
};

const testService = {
  name: 'Haircut',
  description: 'Professional haircut service',
  category: 'Beauty',
  duration: 60,
  price: 25.00
};

async function testAPI() {
  console.log('1. Testing User Registration...');
  
  // Test client registration
  try {
    const clientRes = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUsers.client)
    });
    const clientData = await clientRes.json();
    console.log('✅ Client registration:', clientData.message);
  } catch (error) {
    console.log('❌ Client registration failed:', error.message);
  }

  // Test provider registration
  try {
    const providerRes = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUsers.provider)
    });
    const providerData = await providerRes.json();
    console.log('✅ Provider registration:', providerData.message);
  } catch (error) {
    console.log('❌ Provider registration failed:', error.message);
  }

  console.log('\n2. Testing Health Check...');
  try {
    const healthRes = await fetch('http://localhost:5000/api/health');
    const healthData = await healthRes.json();
    console.log('✅ Health check:', healthData.status);
  } catch (error) {
    console.log('❌ Health check failed - is the server running?');
    console.log('💡 Start the server with: npm run dev');
    return;
  }

  console.log('\n🎯 Backend API testing completed!');
  console.log('\nNext steps:');
  console.log('1. Start the server: npm run dev');
  console.log('2. Test the endpoints with Postman or curl');
  console.log('3. Begin frontend development');
}

testAPI();