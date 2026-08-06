/**
 * JSON Schema → TypeBox 运行时转换（README 8.3.3）：
 * MCP tools/list 的 inputSchema（JSON Schema）转成 pi registerTool 需要的 parameters（TSchema）。
 * 不支持的构造降级为 Type.Any() 并记录 warning，不影响其余字段。
 * 运行环境：pi 扩展（README 4.12 可用导入含 typebox）；测试环境通过 pnpm alias
 * typebox → @sinclair/typebox 解析，逻辑与主进程保持一致。
 */
import { type TSchema, Type } from 'typebox';

export interface SchemaConversionResult {
  schema: TSchema;
  warnings: string[];
}

type NumberOptions = {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOptions(node: Record<string, unknown>): NumberOptions {
  const options: NumberOptions = {};
  if (typeof node.minimum === 'number') options.minimum = node.minimum;
  if (typeof node.maximum === 'number') options.maximum = node.maximum;
  if (typeof node.exclusiveMinimum === 'number') options.exclusiveMinimum = node.exclusiveMinimum;
  if (typeof node.exclusiveMaximum === 'number') options.exclusiveMaximum = node.exclusiveMaximum;
  return options;
}

function literalValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function stringOptions(node: Record<string, unknown>): {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
} {
  const options: { minLength?: number; maxLength?: number; pattern?: string } = {};
  if (typeof node.minLength === 'number') options.minLength = node.minLength;
  if (typeof node.maxLength === 'number') options.maxLength = node.maxLength;
  if (typeof node.pattern === 'string') options.pattern = node.pattern;
  return options;
}

function arrayOptions(node: Record<string, unknown>): { minItems?: number; maxItems?: number } {
  const options: { minItems?: number; maxItems?: number } = {};
  if (typeof node.minItems === 'number') options.minItems = node.minItems;
  if (typeof node.maxItems === 'number') options.maxItems = node.maxItems;
  return options;
}

/**
 * 转换 MCP 工具的 inputSchema。支持 object / string / number / integer / boolean /
 * array / null / enum / const / oneOf / anyOf / allOf；$ref / $defs / definitions
 * 及未知构造降级为 Type.Any() 并记录 warning（README 8.3.3 降级策略）。
 */
export function jsonSchemaToTypeBox(input: unknown): SchemaConversionResult {
  const warnings: string[] = [];

  const convert = (node: unknown, path: string): TSchema => {
    if (!isRecord(node)) {
      warnings.push(`${path}: 非对象节点，降级为 Any`);
      return Type.Any();
    }
    if (
      typeof node.$ref === 'string' ||
      node.$defs !== undefined ||
      node.definitions !== undefined
    ) {
      warnings.push(`${path}: $ref/$defs/definitions 暂不支持，降级为 Any`);
      return Type.Any();
    }
    if ('const' in node) {
      const value = literalValue(node.const);
      if (value === undefined || value === null) {
        warnings.push(`${path}: const 值类型不支持，降级为 Any`);
        return Type.Any();
      }
      return Type.Literal(value);
    }
    if (Array.isArray(node.enum)) {
      if (node.enum.length === 0) {
        warnings.push(`${path}: 空 enum，降级为 Any`);
        return Type.Any();
      }
      const values = node.enum
        .map(literalValue)
        .filter((v): v is string | number | boolean => v !== undefined && v !== null);
      if (values.length !== node.enum.length) {
        warnings.push(`${path}: enum 含 null/不支持值，降级为 Any`);
        return Type.Any();
      }
      if (values.length === 1) {
        const [single] = values;
        if (single !== undefined) return Type.Literal(single);
      }
      return Type.Union(values.map((v) => Type.Literal(v)));
    }
    const branches = Array.isArray(node.oneOf)
      ? node.oneOf
      : Array.isArray(node.anyOf)
        ? node.anyOf
        : null;
    if (branches) {
      const converted = branches.map((branch, index) => convert(branch, `${path}[${index}]`));
      if (converted.length === 1) {
        const [single] = converted;
        if (single !== undefined) return single;
      }
      return Type.Union(converted);
    }
    if (Array.isArray(node.allOf)) {
      const converted = node.allOf.map((item, index) => convert(item, `${path}.allOf[${index}]`));
      if (converted.length === 1) {
        const [single] = converted;
        if (single !== undefined) return single;
      }
      return Type.Intersect(converted);
    }
    const rawType = node.type;
    const types = Array.isArray(rawType) ? rawType : typeof rawType === 'string' ? [rawType] : [];
    if (types.length > 1) {
      return Type.Union(types.map((t) => convert({ ...node, type: t }, path)));
    }
    switch (types[0]) {
      case 'string':
        return Type.String(stringOptions(node));
      case 'number':
        return Type.Number(numberOptions(node));
      case 'integer':
        return Type.Integer(numberOptions(node));
      case 'boolean':
        return Type.Boolean();
      case 'null':
        return Type.Null();
      case 'array': {
        const items = node.items !== undefined ? convert(node.items, `${path}.items`) : Type.Any();
        return Type.Array(items, arrayOptions(node));
      }
      case 'object':
      case undefined: {
        const properties = isRecord(node.properties) ? node.properties : {};
        const required = new Set(
          Array.isArray(node.required)
            ? node.required.filter((r): r is string => typeof r === 'string')
            : [],
        );
        const objProps: Record<string, TSchema> = {};
        for (const [key, value] of Object.entries(properties)) {
          const converted = convert(value, `${path}.${key}`);
          objProps[key] = required.has(key) ? converted : Type.Optional(converted);
        }
        const options: { additionalProperties?: boolean } = {};
        if (node.additionalProperties === false) options.additionalProperties = false;
        return Type.Object(objProps, options);
      }
      default:
        warnings.push(`${path}: type 构造未支持（${String(node.type ?? '?')}），降级为 Any`);
        return Type.Any();
    }
  };

  return { schema: convert(input, '$'), warnings };
}
