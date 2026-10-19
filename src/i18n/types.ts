export interface RuleText {
  title: string;
  observation: string;
  explanation: string;
  consequence: string;
  verify: string;
  fix: string;
}

export interface Catalog {
  ui: Record<string, string>;
  rules: Record<string, RuleText>;
}
