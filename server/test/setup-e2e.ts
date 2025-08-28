// Jest E2E setup
// Increase default timeout for slower environments (DB + file I/O)
jest.setTimeout(60000);

process.env.NODE_ENV = process.env.NODE_ENV || "test";
// Give Prisma more time to connect during E2E runs on slower machines/CI
if (!process.env.DB_CONNECT_TIMEOUT_MS) {
  process.env.DB_CONNECT_TIMEOUT_MS = "20000"; // 20s
}
