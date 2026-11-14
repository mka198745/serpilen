import "dotenv/config";
import { seedDatabase } from "../src/db/seed";

async function main() {
  console.log("Seeding started...");
  const res = await seedDatabase();
  console.log("Seed result:", res);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
