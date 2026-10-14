export class ConfigurationNotReadyError extends Error {
  constructor(public readonly reason: string) { super(reason); this.name = "ConfigurationNotReadyError"; }
}
export class ConfigurationConflictError extends Error {
  constructor(public readonly reason: string) { super(reason); this.name = "ConfigurationConflictError"; }
}
