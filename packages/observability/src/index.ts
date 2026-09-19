export function createLogger(service: string) {
  return {
    info: (message: string, meta?: unknown) => console.log(JSON.stringify({ level: "info", service, message, meta, ts: new Date().toISOString() })),
    error: (message: string, meta?: unknown) => console.error(JSON.stringify({ level: "error", service, message, meta, ts: new Date().toISOString() }))
  };
}

export function requestId() {
  return `req_${Math.random().toString(36).slice(2, 10)}`;
}
