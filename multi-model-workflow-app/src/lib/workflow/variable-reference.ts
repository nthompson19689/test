/**
 * Variable Reference System
 * Parses, validates, and resolves #Step.output syntax
 */

import type { VariableReference, AutocompleteOption, NodeType, NodeOutput } from '@/types';

// Regex to match variable references: #NodeName.field | transform:arg
const VARIABLE_REGEX = /#([a-zA-Z_][a-zA-Z0-9_]*)(?:\.([a-zA-Z_][a-zA-Z0-9_]*))?(?:\s*\|\s*([a-zA-Z_]+)(?::([^\s#}]+))?)?/g;

// Simple regex for finding just the tokens (without capturing groups)
const VARIABLE_TOKEN_REGEX = /#[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?(?:\s*\|[^#}]+)?/g;

/**
 * Parse a string to find all variable references
 */
export function parseVariableReferences(text: string): VariableReference[] {
  const references: VariableReference[] = [];
  const regex = new RegExp(VARIABLE_REGEX.source, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    const [raw, nodeName, outputField, transformName, transformArg] = match;

    references.push({
      raw,
      nodeName,
      outputField,
      transform: transformName
        ? {
            name: transformName,
            args: transformArg ? [transformArg] : undefined,
          }
        : undefined,
    });
  }

  return references;
}

/**
 * Find all variable tokens in a string (simpler match)
 */
export function findVariableTokens(text: string): string[] {
  const matches = text.match(VARIABLE_TOKEN_REGEX);
  return matches || [];
}

/**
 * Check if a string contains variable references
 */
export function hasVariableReferences(text: string): boolean {
  return VARIABLE_TOKEN_REGEX.test(text);
}

/**
 * Transform registry - extensible system for value transforms
 */
type TransformFn = (value: unknown, ...args: string[]) => unknown;

const transforms: Record<string, TransformFn> = {
  /**
   * Truncate text to a maximum length
   * Usage: #Step.text | truncate:280
   */
  truncate: (value: unknown, maxLength?: string): string => {
    const str = String(value);
    const len = maxLength ? parseInt(maxLength, 10) : 100;
    if (str.length <= len) return str;
    return str.slice(0, len - 3) + '...';
  },

  /**
   * Pick a field from an object
   * Usage: #Step.json | pick:fieldName
   */
  pick: (value: unknown, field?: string): unknown => {
    if (!field) return value;
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[field];
  },

  /**
   * Convert to JSON string
   * Usage: #Step.json | json
   */
  json: (value: unknown): string => {
    return JSON.stringify(value, null, 2);
  },

  /**
   * Get first item from array
   * Usage: #Step.items | first
   */
  first: (value: unknown): unknown => {
    if (Array.isArray(value)) return value[0];
    return value;
  },

  /**
   * Get last item from array
   * Usage: #Step.items | last
   */
  last: (value: unknown): unknown => {
    if (Array.isArray(value)) return value[value.length - 1];
    return value;
  },

  /**
   * Count items in array or length of string
   * Usage: #Step.items | count
   */
  count: (value: unknown): number => {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') return value.length;
    return 0;
  },

  /**
   * Convert to lowercase
   * Usage: #Step.text | lower
   */
  lower: (value: unknown): string => {
    return String(value).toLowerCase();
  },

  /**
   * Convert to uppercase
   * Usage: #Step.text | upper
   */
  upper: (value: unknown): string => {
    return String(value).toUpperCase();
  },

  /**
   * Trim whitespace
   * Usage: #Step.text | trim
   */
  trim: (value: unknown): string => {
    return String(value).trim();
  },
};

/**
 * Register a custom transform
 */
export function registerTransform(name: string, fn: TransformFn): void {
  transforms[name] = fn;
}

/**
 * Get available transform names
 */
export function getAvailableTransforms(): string[] {
  return Object.keys(transforms);
}

/**
 * Apply a transform to a value
 */
function applyTransform(
  value: unknown,
  transform: { name: string; args?: string[] }
): unknown {
  const fn = transforms[transform.name];
  if (!fn) {
    console.warn(`Unknown transform: ${transform.name}`);
    return value;
  }
  return fn(value, ...(transform.args || []));
}

/**
 * Context for resolving variable references
 */
export interface ResolveContext {
  outputs: Record<string, NodeOutput>; // nodeName -> output object
  nodeIdToName?: Record<string, string>; // nodeId -> nodeName mapping
}

/**
 * Resolve a single variable reference
 */
export function resolveReference(
  ref: VariableReference,
  context: ResolveContext
): unknown {
  // First try to find by node name
  let output = context.outputs[ref.nodeName];

  // If not found and we have id->name mapping, try by id
  if (!output && context.nodeIdToName) {
    for (const [nodeId, nodeName] of Object.entries(context.nodeIdToName)) {
      if (nodeName === ref.nodeName || nodeId === ref.nodeName) {
        output = context.outputs[nodeId] || context.outputs[nodeName];
        break;
      }
    }
  }

  if (!output) {
    throw new Error(`Unknown node reference: ${ref.nodeName}`);
  }

  // Get the specific field or entire output
  let value: unknown = output;
  if (ref.outputField) {
    if (typeof output === 'object' && output !== null) {
      value = (output as Record<string, unknown>)[ref.outputField];
      if (value === undefined) {
        throw new Error(`Unknown output field: ${ref.nodeName}.${ref.outputField}`);
      }
    } else {
      throw new Error(`Cannot access field ${ref.outputField} on non-object output`);
    }
  }

  // Apply transform if present
  if (ref.transform) {
    value = applyTransform(value, ref.transform);
  }

  return value;
}

/**
 * Resolve all variable references in a string
 * Returns the string with all references replaced
 */
export function resolveVariablesInString(
  text: string,
  context: ResolveContext
): string {
  const references = parseVariableReferences(text);

  if (references.length === 0) {
    return text;
  }

  let result = text;
  for (const ref of references) {
    try {
      const value = resolveReference(ref, context);
      const stringValue =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      result = result.replace(ref.raw, stringValue);
    } catch (error) {
      // Keep original reference if resolution fails
      console.error(`Failed to resolve ${ref.raw}:`, error);
    }
  }

  return result;
}

/**
 * Resolve variables in a config object (recursively)
 */
export function resolveVariablesInConfig<T extends object>(
  config: T,
  context: ResolveContext
): T {
  const result = { ...config };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      (result as Record<string, unknown>)[key] = resolveVariablesInString(value, context);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = resolveVariablesInConfig(
        value as object,
        context
      );
    } else if (Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = value.map((item) =>
        typeof item === 'string'
          ? resolveVariablesInString(item, context)
          : typeof item === 'object' && item !== null
          ? resolveVariablesInConfig(item, context)
          : item
      );
    }
  }

  return result;
}

/**
 * Validate variable references in a config object
 * Returns list of errors (empty if valid)
 */
export function validateVariableReferences(
  text: string,
  availableNodes: Array<{ name: string; nodeType: NodeType }>
): string[] {
  const references = parseVariableReferences(text);
  const errors: string[] = [];
  const nodeNames = new Set(availableNodes.map((n) => n.name));

  for (const ref of references) {
    if (!nodeNames.has(ref.nodeName)) {
      errors.push(`Unknown node: ${ref.nodeName}`);
    }
    if (ref.transform && !transforms[ref.transform.name]) {
      errors.push(`Unknown transform: ${ref.transform.name}`);
    }
  }

  return errors;
}

/**
 * Get output fields for a node type
 */
export function getNodeOutputFields(nodeType: NodeType): string[] {
  switch (nodeType) {
    case 'SCRAPE_URL':
      return ['raw_html', 'clean_text', 'title'];
    case 'RESEARCH':
      return ['text', 'citations'];
    case 'ANALYZE':
      return ['json', 'text'];
    case 'GENERATE_TEXT':
      return ['text'];
    case 'GENERATE_IMAGE':
      return ['image', 'revised_prompt'];
    default:
      return [];
  }
}

/**
 * Generate autocomplete options based on available nodes
 */
export function generateAutocompleteOptions(
  availableNodes: Array<{ id: string; name: string; nodeType: NodeType }>,
  currentInput: string
): AutocompleteOption[] {
  const options: AutocompleteOption[] = [];

  // Check if we're completing after a dot
  const dotMatch = currentInput.match(/#([a-zA-Z_][a-zA-Z0-9_]*)\.$/);

  if (dotMatch) {
    // User typed "#NodeName." - show field options
    const nodeName = dotMatch[1];
    const node = availableNodes.find((n) => n.name === nodeName);

    if (node) {
      const fields = getNodeOutputFields(node.nodeType);
      for (const field of fields) {
        options.push({
          label: `#${nodeName}.${field}`,
          value: `#${nodeName}.${field}`,
          type: 'field',
          nodeType: node.nodeType,
        });
      }
    }
  } else {
    // Show node name options
    for (const node of availableNodes) {
      options.push({
        label: `#${node.name}`,
        value: `#${node.name}`,
        type: 'node',
        nodeType: node.nodeType,
      });

      // Also show common fields
      const fields = getNodeOutputFields(node.nodeType);
      for (const field of fields) {
        options.push({
          label: `#${node.name}.${field}`,
          value: `#${node.name}.${field}`,
          type: 'field',
          nodeType: node.nodeType,
        });
      }
    }
  }

  // Filter by current input if needed
  const hashMatch = currentInput.match(/#([a-zA-Z0-9_.]*)$/);
  if (hashMatch && hashMatch[1]) {
    const searchTerm = hashMatch[1].toLowerCase();
    return options.filter((opt) =>
      opt.value.toLowerCase().includes(searchTerm)
    );
  }

  return options;
}
