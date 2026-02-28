// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');

async function testConnection() {
  // Check if DATABASE_URL is loaded
  if (!process.env.DATABASE_URL) {
    console.error('✗ DATABASE_URL not found in environment variables');
    console.error('Make sure .env.local file exists and contains DATABASE_URL');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  
  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
    
    await prisma.$connect();
    console.log('✓ Database connection successful!');
    
    // Test items with is_combo field
    console.log('\n--- Testing Items with is_combo ---');
    const regularItems = await prisma.item.findMany({
      where: { isPublic: true, is_combo: false },
      take: 3,
      select: { id: true, name: true, is_combo: true }
    });
    console.log('Regular items:', regularItems.length);
    regularItems.forEach(i => console.log(`  - ${i.name} (combo: ${i.is_combo})`));

    const combos = await prisma.item.findMany({
      where: { isPublic: true, is_combo: true },
      take: 3,
      select: { id: true, name: true, is_combo: true }
    });
    console.log('Combo items:', combos.length);
    combos.forEach(i => console.log(`  - ${i.name} (combo: ${i.is_combo})`));

    // Test locations with is_active
    console.log('\n--- Testing Locations with is_active ---');
    const locations = await prisma.location.findMany({
      where: { is_active: true },
      select: { id: true, name: true, is_active: true }
    });
    console.log('Active locations:', locations.length);
    locations.forEach(l => console.log(`  - ${l.name} (active: ${l.is_active})`));

    // Test combo_items
    console.log('\n--- Testing combo_items ---');
    const comboItemsData = await prisma.combo_items.findMany({
      take: 3
    });
    console.log('Combo items records:', comboItemsData.length);
    
    await prisma.$disconnect();
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Database operation failed:');
    console.error('Error:', error.message);
    if (error.code) console.error('Code:', error.code);
    process.exit(1);
  }
}

testConnection();
