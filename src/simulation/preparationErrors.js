export class SimulationPreparationError extends Error {
  constructor(resource, cause) {
    super(`Simulation resource failed: ${resource}`, { cause });
    this.name = "SimulationPreparationError";
    this.resource = resource;
    this.timedOut = cause?.name === "TimeoutError" || /timeout/i.test(cause?.message ?? "");
  }
}

export async function loadSimulationResource(resource, load, signal) {
  try { return await load(); }
  catch (cause) {
    if (cause instanceof SimulationPreparationError) throw cause;
    throw new SimulationPreparationError(resource, signal?.aborted ? signal.reason ?? cause : cause);
  }
}
