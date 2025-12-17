require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log("🔄 Starting database clear (preserving auth users)...\n");

  try {
    // Delete in reverse order of dependencies (foreign keys)
    const tables = [
      { name: "BlogPostTag", model: "blogPostTag" },
      { name: "BlogTag", model: "blogTag" },
      { name: "BlogPost", model: "blogPost" },
      { name: "BlogCategory", model: "blogCategory" },
      { name: "PurchaseOrderItem", model: "purchaseOrderItem" },
      { name: "PurchaseOrder", model: "purchaseOrder" },
      { name: "Commission", model: "commission" },
      { name: "SaleItem", model: "saleItem" },
      { name: "Sale", model: "sale" },
      { name: "Seller", model: "seller" },
      { name: "Reservation", model: "reservation" },
      { name: "Client", model: "client" },
      { name: "StockTransfer", model: "stockTransfer" },
      { name: "Stock", model: "stock" },
      { name: "Item", model: "item" },
      { name: "Category", model: "category" },
      { name: "Expense", model: "expense" },
      { name: "ExpenseCategory", model: "expenseCategory" },
      { name: "Wallet", model: "wallet" },
      { name: "Budget", model: "budget" },
      { name: "BudgetCategory", model: "budgetCategory" },
      { name: "Goal", model: "goal" },
      { name: "ExchangeRate", model: "exchangeRate" },
      { name: "Location", model: "location" },
      { name: "Banner", model: "banner" },
      { name: "Page", model: "page" },
      { name: "ItemImage", model: "itemImage" },
      { name: "ItemFeature", model: "itemFeature" },
      { name: "CollectionItem", model: "collectionItem" },
      { name: "Collection", model: "collection" },
      { name: "Review", model: "review" },
      { name: "Subscriber", model: "subscriber" },
      { name: "FAQ", model: "fAQ" },
      { name: "Testimonial", model: "testimonial" },
      { name: "ActivityLog", model: "activityLog" },
      { name: "StoreSetting", model: "storeSetting" },
    ];

    // Delete each table
    for (const table of tables) {
      const count = await prisma[table.model].deleteMany({});
      console.log(`✅ ${table.name}: ${count.count} records deleted`);
    }

    console.log("\n✨ Database cleared successfully!");
    console.log("📌 User table (auth) has been preserved");
  } catch (error) {
    console.error("❌ Error clearing database:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
