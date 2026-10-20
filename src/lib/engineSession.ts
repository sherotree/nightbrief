export type EngineLike = {
  unload: () => Promise<void>;
  interruptGenerate?: () => void | Promise<void>;
};

export type EngineSession = {
  mount(): void;
  /** Invalidate in-flight loads and hand back the engine that must be unloaded. */
  unmount(): EngineLike | null;
  isMounted(): boolean;
  startLoad(): number;
  isCurrent(token: number): boolean;
  /**
   * Keep this engine only when the load is still the one the page wants.
   * "dispose" means the caller must unload it — the usual case is that
   * Create/reload finished after navigation.
   */
  adopt(token: number, engine: EngineLike): "keep" | "dispose";
  release(): EngineLike | null;
  current(): EngineLike | null;
};

const disposeQueue = new WeakMap<EngineLike, Promise<void>>();

/**
 * Interrupt and unload. A second call waits for the first unload, then unloads
 * again, so a pipeline that finished loading after the first unload is not left
 * resident.
 */
export function disposeEngine(
  engine: EngineLike | null | undefined,
): Promise<void> {
  if (!engine) return Promise.resolve();
  const previous = disposeQueue.get(engine) ?? Promise.resolve();
  const next = previous.then(() => unloadOnce(engine));
  disposeQueue.set(engine, next);
  return next;
}

async function unloadOnce(engine: EngineLike): Promise<void> {
  try {
    const interrupt = engine.interruptGenerate?.();
    if (interrupt) await interrupt;
  } catch {
    // The worker may already be gone.
  }
  try {
    await engine.unload();
  } catch {
    // Leaving the page should not raise a second failure.
  }
}

export function createEngineSession(): EngineSession {
  let mounted = false;
  let generation = 0;
  let engine: EngineLike | null = null;

  return {
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      generation += 1;
      const current = engine;
      engine = null;
      return current;
    },
    isMounted() {
      return mounted;
    },
    startLoad() {
      generation += 1;
      return generation;
    },
    isCurrent(token: number) {
      return mounted && token === generation;
    },
    adopt(token, next) {
      if (!mounted || token !== generation) return "dispose";
      engine = next;
      return "keep";
    },
    release() {
      const current = engine;
      engine = null;
      return current;
    },
    current() {
      return engine;
    },
  };
}

/**
 * Load a model onto an engine the session can already see.
 * `create` must return the engine before weights load, so unmount can unload
 * it while `load` is still running. `CreateMLCEngine` hides that instance
 * until reload finishes; callers should construct first, then reload.
 */
export async function loadEngine<T extends EngineLike>(options: {
  session: EngineSession;
  modelId: string;
  loadedModelId: string | null;
  create: (modelId: string) => T;
  load: (engine: T, modelId: string) => Promise<void>;
  onReplacing?: () => void;
}): Promise<T | null> {
  const existing = options.session.current();
  if (
    existing &&
    options.loadedModelId === options.modelId &&
    options.session.isMounted()
  ) {
    return existing as T;
  }

  const token = options.session.startLoad();
  const previous = options.session.release();
  if (previous) {
    options.onReplacing?.();
    await disposeEngine(previous);
  }
  if (!options.session.isCurrent(token)) return null;

  const engine = options.create(options.modelId);
  if (options.session.adopt(token, engine) === "dispose") {
    await disposeEngine(engine);
    return null;
  }

  try {
    await options.load(engine, options.modelId);
  } catch (error) {
    await disposeEngine(engine);
    if (options.session.current() === engine) options.session.release();
    if (!options.session.isCurrent(token)) return null;
    throw error;
  }

  if (!options.session.isCurrent(token)) {
    await disposeEngine(engine);
    if (options.session.current() === engine) options.session.release();
    return null;
  }
  return engine;
}
