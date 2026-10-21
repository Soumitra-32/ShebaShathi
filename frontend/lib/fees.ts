/**
 * Deterministic fee calculation from the verified local fee catalog.
 *
 * The browser performs the arithmetic itself: only the public catalog (labels,
 * amounts, source URLs, verification dates) is fetched from the project
 * backend, and the claimed amount never leaves the device.
 */

export interface FeeParameterOption {
  value: string;
  label_bn: string;
  label_en: string;
}

export interface FeeParameter {
  id: string;
  type: "select" | "number";
  label_bn: string;
  label_en: string;
  options?: FeeParameterOption[];
  applies_when?: Record<string, string>;
  min?: number;
  max?: number;
  default?: number;
  hint_bn?: string;
  hint_en?: string;
}

export interface FeeComponent {
  id: string;
  label_bn: string;
  label_en: string;
  amount: number;
}

export interface FeeVariableComponent {
  id: string;
  label_bn: string;
  label_en: string;
  amount_per_unit: number;
  unit_field: string;
  min_units: number;
}

export interface FeeRule {
  id: string;
  selection: Record<string, string>;
  components: FeeComponent[];
  total: number;
  variable_components?: FeeVariableComponent[];
  notes_bn?: string;
  notes_en?: string;
}

export interface FeeService {
  service_id: string;
  label_bn: string;
  label_en: string;
  authority_bn: string;
  authority_en: string;
  available: boolean;
  source_url: string;
  last_verified: string;
  scope_note_bn?: string;
  scope_note_en?: string;
  unavailable_reason_bn?: string;
  unavailable_reason_en?: string;
  parameters: FeeParameter[];
  fee_rules: FeeRule[];
}

export interface FeeCatalog {
  catalog_version?: string;
  currency?: string;
  last_updated?: string;
  notes_bn?: string;
  notes_en?: string;
  services: FeeService[];
}

export type FeeErrorReason =
  | "unknown_service"
  | "service_unavailable"
  | "unknown_parameter"
  | "invalid_option"
  | "out_of_range"
  | "not_published";

export interface FeeCalculation {
  ok: boolean;
  service?: FeeService;
  rule?: FeeRule;
  components: FeeComponent[];
  total: number;
  error?: FeeErrorReason;
}

export interface ClaimComparison {
  claimed: number;
  official: number;
  difference: number;
  differencePct: number;
  status: "higher" | "equal" | "lower";
}

/** Parameters that apply to the currently selected options. */
export function visibleParameters(service: FeeService, selection: Record<string, string>): FeeParameter[] {
  return service.parameters.filter((parameter) => {
    if (!parameter.applies_when) return true;
    return Object.entries(parameter.applies_when).every(([key, value]) => selection[key] === value);
  });
}

/** Default selection for a service, taken from the parameter definitions. */
export function defaultSelection(service: FeeService): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const parameter of service.parameters) {
    if (parameter.type === "select" && parameter.options?.length) {
      selection[parameter.id] = parameter.options[0].value;
    } else if (parameter.type === "number" && typeof parameter.default === "number") {
      selection[parameter.id] = String(parameter.default);
    }
  }
  return selection;
}

/**
 * Keep only the parameters that apply to the current selection and fill in
 * defaults for newly visible parameters.
 */
export function resolveSelection(
  service: FeeService,
  raw: Record<string, string>
): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const parameter of visibleParameters(service, raw)) {
    const value = raw[parameter.id];
    if (value !== undefined && value !== "") {
      selection[parameter.id] = value;
      continue;
    }
    if (parameter.type === "select" && parameter.options?.length) {
      selection[parameter.id] = parameter.options[0].value;
    } else if (parameter.type === "number" && typeof parameter.default === "number") {
      selection[parameter.id] = String(parameter.default);
    }
  }
  return selection;
}

/** Find the published rule that matches the selection exactly. */
export function findRule(service: FeeService, selection: Record<string, string>): FeeRule | undefined {
  return service.fee_rules.find((rule) =>
    Object.entries(rule.selection).every(([key, value]) => String(selection[key] ?? "") === String(value))
  );
}

/** Calculate the official fee breakdown for a selection. */
export function calculateFee(service: FeeService, selection: Record<string, string>): FeeCalculation {
  const empty: FeeCalculation = { ok: false, components: [], total: 0 };
  if (!service) return { ...empty, error: "unknown_service" };
  if (!service.available) return { ...empty, error: "service_unavailable" };

  const allowed = new Set(service.parameters.map((parameter) => parameter.id));
  for (const key of Object.keys(selection)) {
    if (!allowed.has(key)) return { ...empty, error: "unknown_parameter" };
  }

  for (const parameter of visibleParameters(service, selection)) {
    const value = selection[parameter.id];
    if (value === undefined || value === "") continue;
    if (parameter.type === "select") {
      const allowedValues = new Set((parameter.options ?? []).map((option) => option.value));
      if (!allowedValues.has(value)) return { ...empty, error: "invalid_option" };
    } else {
      const number = Number(value);
      if (!Number.isInteger(number)) return { ...empty, error: "invalid_option" };
      if (number < (parameter.min ?? 0) || number > (parameter.max ?? 10000)) {
        return { ...empty, error: "out_of_range" };
      }
    }
  }

  const rule = findRule(service, selection);
  if (!rule) return { ...empty, error: "not_published" };

  const components: FeeComponent[] = rule.components.map((component) => ({ ...component }));
  let total = components.reduce((sum, component) => sum + component.amount, 0);

  for (const variable of rule.variable_components ?? []) {
    const units = Number(selection[variable.unit_field] ?? 0) || 0;
    if (units >= variable.min_units) {
      const amount = variable.amount_per_unit * units;
      components.push({
        id: variable.id,
        label_bn: variable.label_bn,
        label_en: variable.label_en,
        amount,
      });
      total += amount;
    }
  }

  return { ok: true, service, rule, components, total };
}

/** Compare a claimed amount with the calculated official amount. */
export function compareWithClaimed(official: number, claimed: number): ClaimComparison {
  const difference = Math.round((claimed - official) * 100) / 100;
  const differencePct = official > 0 ? Math.round((difference / official) * 10000) / 100 : 0;
  return {
    claimed,
    official,
    difference,
    differencePct,
    status: difference > 0 ? "higher" : difference === 0 ? "equal" : "lower",
  };
}
