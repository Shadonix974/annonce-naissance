export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(code = "not_found") { super(404, code); }
}
export class UnauthorizedError extends HttpError {
  constructor(code = "unauthorized") { super(401, code); }
}
export class ForbiddenError extends HttpError {
  constructor(code = "forbidden") { super(403, code); }
}
export class ValidationError extends HttpError {
  constructor(code = "invalid_input", message?: string) { super(400, code, message); }
}
export class ConflictError extends HttpError {
  constructor(code = "conflict") { super(409, code); }
}
export class RateLimitError extends HttpError {
  constructor() { super(429, "rate_limited"); }
}
