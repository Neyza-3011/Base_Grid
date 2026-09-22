import { describe, it, expect, vi, beforeEach } from "vitest";
import { createShutdownHandler, ShutdownDependencies } from "../server";

describe("Graceful Shutdown Handler (server.ts)", () => {
  let mockServer: any;
  let mockNitro: any;
  let mockDb: any;
  let mockTokenStore: any;
  let mockAdapter: any;
  let mockExit: any;
  let callOrder: string[];

  beforeEach(() => {
    callOrder = [];

    mockServer = {
      close: vi.fn((cb: (err?: Error) => void) => {
        callOrder.push("server.close");
        cb();
      }),
    };

    mockNitro = {
      kill: vi.fn((sig: string) => {
        callOrder.push(`nitro.kill(${sig})`);
        return true;
      }),
    };

    mockDb = {
      close: vi.fn(async () => {
        callOrder.push("db.close");
      }),
    };

    mockAdapter = {
      close: vi.fn(async () => {
        callOrder.push("redis.close");
      }),
    };

    mockTokenStore = {
      getAdapter: vi.fn(() => mockAdapter),
    };

    mockExit = vi.fn();
  });

  it("executes single shutdown in strict order and exits with code 0", async () => {
    const handler = createShutdownHandler({
      server: mockServer,
      nitroProcess: mockNitro,
      db: mockDb,
      tokenStore: mockTokenStore,
      exit: mockExit,
      timeoutMs: 1000,
    });

    await handler("SIGTERM");

    expect(callOrder).toEqual([
      "server.close",
      "nitro.kill(SIGTERM)",
      "db.close",
      "redis.close",
    ]);
    expect(mockExit).toHaveBeenCalledWith(0);
    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  it("ignores second signal and does not initiate a duplicate concurrent shutdown", async () => {
    // Delay server.close to simulate active draining
    let finishServerClose: () => void = () => {};
    mockServer.close = vi.fn((cb: (err?: Error) => void) => {
      callOrder.push("server.close");
      finishServerClose = cb;
    });

    const handler = createShutdownHandler({
      server: mockServer,
      nitroProcess: mockNitro,
      db: mockDb,
      tokenStore: mockTokenStore,
      exit: mockExit,
      timeoutMs: 2000,
    });

    const p1 = handler("SIGTERM");
    const p2 = handler("SIGINT"); // concurrent second signal

    expect(mockServer.close).toHaveBeenCalledTimes(1);

    // Complete draining
    finishServerClose();
    await Promise.all([p1, p2]);

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockDb.close).toHaveBeenCalledTimes(1);
    expect(mockAdapter.close).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("calls and awaits PostgreSQL db.close()", async () => {
    const handler = createShutdownHandler({
      server: mockServer,
      db: mockDb,
      exit: mockExit,
      timeoutMs: 1000,
    });

    await handler("SIGTERM");

    expect(mockDb.close).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("calls and awaits Redis tokenStore close()", async () => {
    const handler = createShutdownHandler({
      server: mockServer,
      tokenStore: mockTokenStore,
      exit: mockExit,
      timeoutMs: 1000,
    });

    await handler("SIGTERM");

    expect(mockAdapter.close).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("sends SIGTERM to Nitro process when present, and safely handles absence of Nitro", async () => {
    // With Nitro
    const handlerWithNitro = createShutdownHandler({
      server: mockServer,
      nitroProcess: mockNitro,
      exit: mockExit,
      timeoutMs: 1000,
    });

    await handlerWithNitro("SIGTERM");
    expect(mockNitro.kill).toHaveBeenCalledWith("SIGTERM");

    // Without Nitro
    mockExit.mockClear();
    const handlerWithoutNitro = createShutdownHandler({
      server: mockServer,
      nitroProcess: null,
      exit: mockExit,
      timeoutMs: 1000,
    });

    await handlerWithoutNitro("SIGTERM");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("forces process exit with code 1 if a component hangs beyond the shutdown timeout", async () => {
    // Simulate server.close hanging and never calling its callback
    mockServer.close = vi.fn((_cb: (err?: Error) => void) => {
      // Intentionally never calls cb()
    });

    const handler = createShutdownHandler({
      server: mockServer,
      nitroProcess: mockNitro,
      db: mockDb,
      tokenStore: mockTokenStore,
      exit: mockExit,
      timeoutMs: 50, // fast timeout for test
    });

    handler("SIGTERM");

    // Wait for the timeout to trigger
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
