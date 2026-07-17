import { ValidationError } from '@nestjs/common';

export function buildValidationErrorResponse(errors: ValidationError[]) {
  return errors.map((error) => ({
    property: error.property,
    constraints: error.constraints ?? {},
    children: buildValidationErrorResponse(error.children ?? []),
  }));
}
