import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEngineSession,
  disposeEngine,
  loadEngine,
  type EngineLike,
} from "./engineSession.ts";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("disposeEngine", () => {
  it("interrupts before unload and swallows an unload failure", async () => {
    const order: string[] = [];
    await disposeEngine({
      interruptGenerate() {
        order.push("interrupt");
      },
      unload: async () => {
        order.push("unload");
        throw new Error("worker already gone");
      },
    });
    assert.deepEqual(order, ["interrupt", "unload"]);
  });

  it("unloads again when a second dispose starts during the first", async () => {
    const releases: Array<() => void> = [];
    let calls = 0;
    const engine: EngineLike = {
      unload: () => {
        calls += 1;
        return new Promise<void>((resolve) => {
          releases.push(resolve);
        });
      },
    };
    const first = disposeEngine(engine);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    const second = disposeEngine(engine);
    assert.equal(calls, 1);
    releases[0]?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 2);
    releases[1]?.();
    await first;
    await second;
  });
});

describe("loadEngine", () => {
  it("unloads an engine whose load resolves after unmount", async () => {
    const session = createEngineSession();
    session.mount();
    const unloads: string[] = [];
    const loading = deferred<void>();
    const engine: EngineLike = {
      interruptGenerate() {
        unloads.push("interrupt");
      },
      unload: async () => {
        unloads.push("unload");
      },
    };

    const pending = loadEngine({
      session,
      modelId: "gemma-2-2b-it-q4f16_1-MLC",
      loadedModelId: null,
      create: () => engine,
      load: () => loading.promise,
    });

    const inFlight = session.unmount();
    assert.equal(inFlight, engine);
    void disposeEngine(inFlight);

    loading.resolve();
    const result = await pending;
    assert.equal(result, null);
    assert.equal(session.current(), null);
    assert.ok(unloads.includes("unload"));
  });

  it("does not create another engine when unmount wins during the previous unload", async () => {
    const session = createEngineSession();
    session.mount();
    const firstUnload = deferred<void>();
    const first: EngineLike = {
      unload: () => firstUnload.promise,
    };
    const loaded = await loadEngine({
      session,
      modelId: "a",
      loadedModelId: null,
      create: () => first,
      load: async () => {},
    });
    assert.equal(loaded, first);

    let created = false;
    const second = loadEngine({
      session,
      modelId: "b",
      loadedModelId: "a",
      create: () => {
        created = true;
        return { unload: async () => {} };
      },
      load: async () => {},
    });

    assert.equal(session.unmount(), null);
    firstUnload.resolve();
    assert.equal(await second, null);
    assert.equal(created, false);
  });

  it("disposes the older load when a newer one supersedes it", async () => {
    const session = createEngineSession();
    session.mount();
    const firstLoad = deferred<void>();
    const secondLoad = deferred<void>();
    const unloaded: string[] = [];
    const late: EngineLike = {
      unload: async () => {
        unloaded.push("late");
      },
    };
    const kept: EngineLike = {
      unload: async () => {
        unloaded.push("kept");
      },
    };

    const first = loadEngine({
      session,
      modelId: "a",
      loadedModelId: null,
      create: () => late,
      load: () => firstLoad.promise,
    });
    const second = loadEngine({
      session,
      modelId: "b",
      loadedModelId: null,
      create: () => kept,
      load: () => secondLoad.promise,
    });

    firstLoad.resolve();
    secondLoad.resolve();
    assert.equal(await first, null);
    assert.equal(await second, kept);
    assert.equal(session.current(), kept);
    assert.ok(unloaded.includes("late"));
    assert.equal(unloaded.includes("kept"), false);
  });

  it("unloads a failed load and still hands that engine back to unmount", async () => {
    const session = createEngineSession();
    session.mount();
    let unloaded = 0;
    const engine: EngineLike = {
      unload: async () => {
        unloaded += 1;
      },
    };
    await assert.rejects(
      () =>
        loadEngine({
          session,
          modelId: "a",
          loadedModelId: null,
          create: () => engine,
          load: async () => {
            throw new Error("shader-f16 missing");
          },
        }),
      /shader-f16/,
    );
    assert.equal(session.current(), null);
    assert.equal(unloaded, 1);

    session.mount();
    const hanging = deferred<void>();
    const late: EngineLike = {
      unload: async () => {
        unloaded += 1;
      },
    };
    const pending = loadEngine({
      session,
      modelId: "b",
      loadedModelId: null,
      create: () => late,
      load: () => {
        hanging.reject(new Error("aborted"));
        return hanging.promise;
      },
    });
    void disposeEngine(session.unmount());
    assert.equal(await pending, null);
    assert.ok(unloaded >= 2);
  });

  it("reuses the engine that is already loaded for this model", async () => {
    const session = createEngineSession();
    session.mount();
    let creates = 0;
    const engine: EngineLike = { unload: async () => {} };
    const first = await loadEngine({
      session,
      modelId: "gemma",
      loadedModelId: null,
      create: () => {
        creates += 1;
        return engine;
      },
      load: async () => {},
    });
    const second = await loadEngine({
      session,
      modelId: "gemma",
      loadedModelId: "gemma",
      create: () => {
        creates += 1;
        return { unload: async () => {} };
      },
      load: async () => {
        throw new Error("should reuse");
      },
    });
    assert.equal(first, engine);
    assert.equal(second, engine);
    assert.equal(creates, 1);
  });
});
