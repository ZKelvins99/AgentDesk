import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { jsonSchemaToTypeBox } from '../../../resources/pi-ext/agentdesk-bridge/schema-to-typebox';

describe('jsonSchemaToTypeBox（README 8.3.3）', () => {
  it('object：required 与 optional、additionalProperties: false', () => {
    const { schema, warnings } = jsonSchemaToTypeBox({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'integer' } },
      required: ['a'],
      additionalProperties: false,
    });
    expect(warnings).toEqual([]);
    expect(Value.Check(schema, { a: 'x' })).toBe(true);
    expect(Value.Check(schema, { a: 'x', b: 1 })).toBe(true);
    expect(Value.Check(schema, { b: 1 })).toBe(false);
    expect(Value.Check(schema, { a: 'x', extra: 1 })).toBe(false);
  });

  it('string：minLength / maxLength / pattern', () => {
    const { schema } = jsonSchemaToTypeBox({
      type: 'string',
      minLength: 2,
      maxLength: 4,
      pattern: '^[a-z]+$',
    });
    expect(Value.Check(schema, 'ab')).toBe(true);
    expect(Value.Check(schema, 'abcde')).toBe(false);
    expect(Value.Check(schema, 'AB')).toBe(false);
  });

  it('number / integer / boolean / array / null', () => {
    expect(Value.Check(jsonSchemaToTypeBox({ type: 'number', minimum: 1 }).schema, 1)).toBe(true);
    expect(Value.Check(jsonSchemaToTypeBox({ type: 'number', minimum: 1 }).schema, 0)).toBe(false);
    expect(Value.Check(jsonSchemaToTypeBox({ type: 'integer' }).schema, 1.5)).toBe(false);
    expect(Value.Check(jsonSchemaToTypeBox({ type: 'boolean' }).schema, true)).toBe(true);
    expect(
      Value.Check(
        jsonSchemaToTypeBox({ type: 'array', items: { type: 'string' }, minItems: 1 }).schema,
        ['a'],
      ),
    ).toBe(true);
    expect(
      Value.Check(
        jsonSchemaToTypeBox({ type: 'array', items: { type: 'string' }, minItems: 1 }).schema,
        [],
      ),
    ).toBe(false);
    expect(Value.Check(jsonSchemaToTypeBox({ type: 'null' }).schema, null)).toBe(true);
  });

  it('enum → 字面量联合；单值 enum → 单字面量', () => {
    const { schema } = jsonSchemaToTypeBox({ type: 'string', enum: ['a', 'b', 'c'] });
    expect(Value.Check(schema, 'a')).toBe(true);
    expect(Value.Check(schema, 'd')).toBe(false);
    const single = jsonSchemaToTypeBox({ type: 'string', enum: ['only'] });
    expect(Value.Check(single.schema, 'only')).toBe(true);
    expect(Value.Check(single.schema, 'other')).toBe(false);
  });

  it('const → 字面量', () => {
    const { schema } = jsonSchemaToTypeBox({ const: 42 });
    expect(Value.Check(schema, 42)).toBe(true);
    expect(Value.Check(schema, 43)).toBe(false);
  });

  it('oneOf / anyOf → 联合；allOf → 交集', () => {
    const anyOf = jsonSchemaToTypeBox({ anyOf: [{ type: 'string' }, { type: 'integer' }] });
    expect(Value.Check(anyOf.schema, 'x')).toBe(true);
    expect(Value.Check(anyOf.schema, 1)).toBe(true);
    expect(Value.Check(anyOf.schema, true)).toBe(false);

    const oneOf = jsonSchemaToTypeBox({ oneOf: [{ type: 'string' }, { type: 'null' }] });
    expect(Value.Check(oneOf.schema, 'x')).toBe(true);
    expect(Value.Check(oneOf.schema, null)).toBe(true);

    const allOf = jsonSchemaToTypeBox({
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        { type: 'object', properties: { b: { type: 'integer' } } },
      ],
    });
    expect(Value.Check(allOf.schema, { a: 'x', b: 1 })).toBe(true);
    expect(Value.Check(allOf.schema, { b: 1 })).toBe(false);
  });

  it('多 type 数组 → 联合（含 null）', () => {
    const { schema } = jsonSchemaToTypeBox({ type: ['string', 'null'] });
    expect(Value.Check(schema, 'x')).toBe(true);
    expect(Value.Check(schema, null)).toBe(true);
    expect(Value.Check(schema, 1)).toBe(false);
  });

  it('$ref / 未知 type → 降级 Any 并记录 warning', () => {
    const ref = jsonSchemaToTypeBox({ $ref: '#/definitions/Thing' });
    expect(ref.warnings.length).toBeGreaterThan(0);
    expect(Value.Check(ref.schema, { anything: true })).toBe(true);

    const unknown = jsonSchemaToTypeBox({ type: 'date' });
    expect(unknown.warnings.length).toBeGreaterThan(0);
    expect(Value.Check(unknown.schema, '2026-01-01')).toBe(true);
  });

  it('空对象 {} → 任意 object 通过', () => {
    const { schema, warnings } = jsonSchemaToTypeBox({});
    expect(warnings).toEqual([]);
    expect(Value.Check(schema, {})).toBe(true);
    expect(Value.Check(schema, { a: 1 })).toBe(true);
  });
});
