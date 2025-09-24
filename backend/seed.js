const database = require('./database');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database with sample data...');

    // Create sample provider
    const providerPassword = await bcrypt.hash('provider123', 12);
    const providerResult = await database.run(
      `INSERT INTO users (email, password, name, user_type, phone, business_name) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['beauty@salon.com', providerPassword, 'Sarah Beauty', 'provider', '+254712345678', 'Nairobi Beauty Experts']
    );

    // Create sample client
    const clientPassword = await bcrypt.hash('client123', 12);
    await database.run(
      `INSERT INTO users (email, password, name, user_type, phone) 
       VALUES (?, ?, ?, ?, ?)`,
      ['client@example.com', clientPassword, 'John Client', 'client', '+254798765432']
    );

    // Create sample services
    const services = [
      {
        name: 'Haircut and Styling',
        description: 'Professional haircut with modern styling and blow-dry',
        duration_minutes: 60,
        price: 1200,
        category: 'beauty'
      },
      {
        name: 'Manicure and Pedicure',
        description: 'Full hand and foot care treatment with polish',
        duration_minutes: 90,
        price: 1500,
        category: 'beauty'
      },
      {
        name: 'Fitness Consultation',
        description: 'Personalized fitness assessment and workout plan',
        duration_minutes: 60,
        price: 2000,
        category: 'fitness'
      },
      {
        name: 'Skin Care Treatment',
        description: 'Professional facial and skin care routine',
        duration_minutes: 75,
        price: 2500,
        category: 'health'
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
    console.log('👤 Sample Provider: beauty@salon.com / provider123');
    console.log('👤 Sample Client: client@example.com / client123');
    
  } catch (error) {
    console.error('❌ Seeding error:', error);
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}

module.exports = seedDatabase;