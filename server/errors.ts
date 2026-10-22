/**
 * Standard Application Error Hierarchy
 * Provides controlled HTTP status mapping and prevents sensitive information leaks in 5xx errors.
 */

export class AppError extends Error {
  public statusCode: number;
  public status: number;
  public isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    this.isOperational = isOperational;
    this.name = new.target.name || "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad Request") {
    super(message, 400);
    this.statusCode = 400;
    this.status = 400;
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation Error") {
    super(message, 400);
    this.statusCode = 400;
    this.status = 400;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
    this.statusCode = 401;
    this.status = 401;
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access forbidden") {
    super(message, 403);
    this.statusCode = 403;
    this.status = 403;
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
    this.statusCode = 404;
    this.status = 404;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super(message, 409);
    this.statusCode = 409;
    this.status = 409;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Payload too large") {
    super(message, 413);
    this.statusCode = 413;
    this.status = 413;
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}
