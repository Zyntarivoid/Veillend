function normalizeBody(body) {
  if (body === undefined || body === null) {
    return {};
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  return body;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(value) {
  return typeof value === 'string' && /.+@.+\..+/.test(value);
}

function routeKey(route) {
  return route.replace(/^\/+|\/+$/g, '').replace(/^api\//i, '');
}

function validatePayload(route, method, payload) {
  const body = normalizeBody(payload);

  if (body === null) {
    return [{ field: 'body', message: 'Request body must be a JSON object.' }];
  }

  const key = routeKey(route);
  const issues = [];

  if (method !== 'GET' && method !== 'DELETE') {
    if (Object.keys(body).length === 0) {
      issues.push({ field: 'body', message: 'Payload must include at least one field.' });
    }
  }

  if (key === 'users' || key.endsWith('/users')) {
    if (!isNonEmptyString(body.name)) {
      issues.push({ field: 'name', message: 'Name is required.' });
    }

    if (!isValidEmail(body.email)) {
      issues.push({ field: 'email', message: 'A valid email is required.' });
    }
  }

  if (key === 'auth/login' || key.endsWith('/auth/login')) {
    if (!isValidEmail(body.email)) {
      issues.push({ field: 'email', message: 'A valid email is required.' });
    }

    if (typeof body.password !== 'string' || body.password.length < 8) {
      issues.push({ field: 'password', message: 'Password must be at least 8 characters long.' });
    }
  }

  if (typeof body.email === 'string' && body.email.length > 0 && !isValidEmail(body.email)) {
    issues.push({ field: 'email', message: 'Email must be a valid address.' });
  }

  if (typeof body.password === 'string' && body.password.length > 0 && body.password.length < 8) {
    issues.push({ field: 'password', message: 'Password must be at least 8 characters long.' });
  }

  if (typeof body.name === 'string' && body.name.trim().length === 0) {
    issues.push({ field: 'name', message: 'Name cannot be empty.' });
  }

  if (typeof body.title === 'string' && body.title.trim().length === 0) {
    issues.push({ field: 'title', message: 'Title cannot be empty.' });
  }

  if (typeof body.age === 'number' && !Number.isInteger(body.age)) {
    issues.push({ field: 'age', message: 'Age must be an integer.' });
  }

  return issues;
}

function buildSuccessEnvelope(data, meta = {}) {
  return {
    success: true,
    data,
    meta,
  };
}

function buildErrorEnvelope(message, details = [], code = 'VALIDATION_ERROR') {
  return {
    success: false,
    error: {
      message,
      code,
      details,
    },
  };
}

module.exports = {
  buildErrorEnvelope,
  buildSuccessEnvelope,
  validatePayload,
};
