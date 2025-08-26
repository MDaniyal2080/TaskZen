// Jest E2E setup
// Increase default timeout for slower environments (DB + file I/O)
jest.setTimeout(60000);

process.env.NODE_ENV = process.env.NODE_ENV || "test";
