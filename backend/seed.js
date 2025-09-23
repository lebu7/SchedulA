const database = require('./database');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database with initial data...');

    // Create sample provider
    const hashedPassword = await bcrypt.hash('provider123', 12);
    const providerResult = await database.run(
      `INSERT INTO users (email, password, name, user_type, phone, business_name) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['beauty@salon.com', hashedPassword, 'Beauty Salon Nairobi', 'provider', '+254712345678', 'Nairobi Beauty Experts']
    );

    // Create sample services
    const services = [
      {
        name: 'Haircut and Styling',
        description: 'Professional haircut with modern styling',
        duration_minutes: 60,
        price: 1200,
        category: 'beauty'
      },
      {
        name: 'Manicure and Pedicure',
        description: 'Full hand and foot care treatment',
        duration_minutes: 90,
        price: 1500,
        category: 'beauty'
      },
      {
        name: 'Fitness Consultation',
        description: 'Personalized fitness assessment and plan',
        duration_minutes: 60,
        price: 2000,
        category: 'fitness'
      }
    ];

    for (const service of services) {
      await database.run(
        `INSERT INTO services (provider_id, name, description, duration_minutes, price, category) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [providerResult.id, service.name, service.description, service.duration_minutes, service.price, service.category]
      );
    }

    console.log('✅ Database seeded successfully!');
    console.log('📧 Sample provider: beauty@salon.com');
    console.log('🔑 Password: provider123');
    
  } catch (error) {
    console.error('❌ Seeding error:', error);
  } finally {
    await database.close();
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;