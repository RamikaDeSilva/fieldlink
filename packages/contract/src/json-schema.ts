import { zodToJsonSchema } from 'zod-to-json-schema';
import { Classification } from './schema.ts';

type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  maxItems?: number;
};

/**
 * JSON Schema handed to QVAC `responseFormat: json_schema`.
 * `patient_count` is deliberately omitted from `required` so a 0.6B model
 * can stay silent; Zod's `.default(1)` fills it after parse.
 */
export function classificationJsonSchema(): Record<string, unknown> {
  const raw = zodToJsonSchema(Classification, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as JsonSchemaObject;

  const required = (raw.required ?? []).filter((key) => key !== 'patient_count');

  return {
    type: 'object',
    additionalProperties: false,
    properties: raw.properties,
    required,
  };
}

export function assertGbnfLegal(schema: Record<string, unknown>): void {
  if (schema.additionalProperties !== false) {
    throw new Error('GBNF schema must set additionalProperties: false');
  }
  const required = schema.required;
  if (Array.isArray(required) && required.includes('patient_count')) {
    throw new Error('patient_count must not be required — small models hallucinate counts');
  }
  if (Array.isArray(required) && required.includes('confidence')) {
    throw new Error('confidence must never leave the model schema');
  }
}
