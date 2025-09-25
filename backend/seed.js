const db = require('./database');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database with sample data...');

    // Create sample provider
    const providerPassword = await bcrypt.hash('provider123', 12);
    const providerResult = await db.run(
      `INSERT INTO users (email, password, name, user_type, phone, business_name) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['salon@nairobi.com', providerPassword, 'Nairobi Beauty Salon', 'provider', '+254712345678', 'Premium Beauty Services']
    );

    // Create sample client
    const clientPassword = await bcrypt.hash('client123', 12);
    await db.run(
      `INSERT INTO users (email, password, name, user_type, phone) 
       VALUES (?, ?, ?, ?, ?)`,
      ['client@example.com', clientPassword, 'John Client', 'client', '+254798765432']
    );

    // Create sample services
    const sampleServices = [
      {
        name: 'Haircut & Styling',
        description: 'Professional haircut with modern styling and blow-dry',
        duration_minutes: 60,
        price: 1200,
        category: 'beauty'
      },
      {
        name: 'Manicure & Pedicure',
        description: 'Complete hand and foot care treatment with polish',
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
      }
    ];

    for (const service of sampleServices) {
      await db.run(
        `INSERT INTO services (provider_id, name, description, duration_minutes, price, category) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [providerResult.id, service.name, service.description, service.duration_minutes, service.price, service.category]
      );
    }

    console.log('✅ Database seeded successfully!');
    console.log('👤 Demo Provider: salon@nairobi.com / provider123');
    console.log('👤 Demo Client: client@example.com / client123');
    
  } catch (error) {
    console.error('❌ Seeding error:', error);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;