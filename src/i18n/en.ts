import type { Catalog } from './types.js';

export const en: Catalog = {
  ui: {
    'severity.critical': 'Critical',
    'severity.high': 'High',
    'severity.medium': 'Medium',
    'severity.low': 'Low',
    'severity.info': 'Info',
    'status.confirmed': 'confirmed defect',
    'status.probable': 'probable issue',
    'status.warning': 'warning',
    'status.evidence-gap': 'evidence gap',
    'status.false-positive': 'false positive',
    'source.rule': 'rule',
    'source.static-analyzer': 'static analysis',
    'source.test': 'test/command run',
    'source.dependency-analysis': 'dependency analysis',
    'source.ai-reasoning': 'AI agent reasoning',
    'category.requirements': 'A. Requirements',
    'category.architecture': 'B. Architecture',
    'category.implementation': 'C. Implementation',
    'category.security': 'D. Security',
    'category.process': 'E. AI development process',
    'category.ops': 'Operational data',
    'report.title': 'Anomaly Radar report',
    'report.project': 'Project',
    'report.generated': 'Generated',
    'report.summary': 'Summary',
    'report.total': 'Total findings',
    'report.suppressed': 'Suppressed',
    'report.suppressedCritical': 'ATTENTION: Critical/High findings are among the suppressed ones',
    'report.none':
      'No anomalies found. This is not proof of absence of bugs: only enabled rules were checked.',
    'report.observation': 'Observation',
    'report.explanation': 'Explanation',
    'report.consequence': 'Possible consequence',
    'report.verify': 'How to verify',
    'report.fix': 'Recommended fix',
    'report.status': 'Status',
    'report.source': 'Source',
    'report.evidence': 'Evidence',
    'report.location': 'Where',
    'report.suppressedReason': 'Suppressed, reason',
    'report.filesScanned': 'Files scanned',
    'report.analyzers': 'Analyzers',
    'report.rows': 'rows',
    'report.rules': 'Rules',
    'report.severityCol': 'Severity',
    'report.titleCol': 'Title',
    'report.disclaimer':
      'Findings with status "probable issue" and "warning" require manual verification. The source of every finding is stated explicitly.',
  },
  rules: {
    'RADAR-ERR': {
      title: 'Analyzer error',
      observation: 'Analyzer {analyzer} failed: {error}',
      explanation: 'One analyzer could not finish. Its results are missing from this report.',
      consequence: 'Some anomalies may have gone unnoticed.',
      verify: 'Run `lwc radar --verbose` and read the stack trace.',
      fix: 'Report the bug to the project repository with a minimal reproducible example.',
    },
    'REQ-000': {
      title: 'Requirements file not found',
      observation: 'None of the requirement files were found: {list}',
      explanation:
        'The radar cannot check requirements for contradictions and completeness if they are not written down.',
      consequence: 'Code may be written against requirements nobody recorded or reviewed.',
      verify:
        'Check that the project has a requirements file (e.g. REQUIREMENTS.md or .lwc/task.md).',
      fix: 'Create a requirements file or point to it in `.lwc/config.json` → `requirementFiles`.',
    },
    'REQ-001': {
      title: 'Contradiction between requirements',
      observation: 'Requirement "{a}" contradicts requirement "{b}"',
      explanation:
        'Two statements describe the same behaviour with opposite meaning (must / must not, always / never).',
      consequence:
        'The implementation will satisfy one and violate the other; tests will disagree.',
      verify: 'Read both requirements side by side and decide which one is current.',
      fix: 'Keep one requirement or specify the conditions under which each applies.',
    },
    'REQ-002': {
      title: 'Error behaviour is undefined',
      observation:
        'The requirement describes operation "{op}" but never says what happens on failure',
      explanation:
        'Operations touching the outside world (save, send, pay, upload) must define what the user sees and what happens to data on failure.',
      consequence:
        'The AI agent will invent error behaviour: swallow the exception or show a technical message.',
      verify:
        'Search the requirements for "error", "failure", "unavailable", "retry" next to this operation.',
      fix: 'Add: "If {op} fails: … (message, retry, rollback)".',
    },
    'REQ-003': {
      title: 'Edge cases not described',
      observation: '"{term}" is mentioned, but behaviour is not described for: {cases}',
      explanation:
        'Lists, amounts, dates and counts have edge values (empty, zero, negative, maximum). Without an explicit requirement the edge behaviour is chosen at random.',
      consequence: 'Bugs will show up on real data: empty list, zero amount, future date.',
      verify: 'For each object ask: what if it is missing / zero / too large?',
      fix: 'Add requirements for edge values or state explicitly that they are invalid.',
    },
    'REQ-004': {
      title: 'Requirement cannot be verified unambiguously',
      observation: 'The requirement uses an unmeasurable phrase: "{word}"',
      explanation: 'Words like "fast", "user-friendly", "reliable" give no acceptance criterion.',
      consequence: 'No test can be written and nobody can say whether the requirement is met.',
      verify: 'Try to write a test for this requirement. If you cannot, it is unmeasurable.',
      fix: 'Replace with a measurable criterion: "response under 300 ms", "at most 2 clicks".',
    },
    'REQ-005': {
      title: 'Business rule missing from acceptance criteria',
      observation: 'Rule "{rule}" is not mentioned in the acceptance criteria section',
      explanation:
        'Rules from the "Rules" / "Constraints" section must be reflected in acceptance criteria, otherwise nobody checks them.',
      consequence:
        'The rule is implemented superficially or forgotten; acceptance passes without checking it.',
      verify: 'Map every rule to at least one acceptance criterion.',
      fix: 'Add an acceptance criterion that verifies this rule.',
    },
    'ARCH-001': {
      title: 'Cyclic dependency',
      observation: 'Modules import each other in a cycle: {cycle}',
      explanation:
        'An import cycle means the modules cannot be understood, tested or replaced separately.',
      consequence:
        'Unpredictable initialisation order, `undefined` on import, hard-to-write tests.',
      verify: 'Build the import graph (`lwc explain <file>`) and follow the chain.',
      fix: 'Extract shared parts into a separate module or invert one dependency.',
    },
    'ARCH-002': {
      title: 'Declared module boundary violated',
      observation: '{from} imports {to}, which boundary rule "{boundary}" forbids',
      explanation:
        'The configuration declares that this layer must not depend on that one. The code breaks the agreement.',
      consequence: 'Layers blend; replacing storage or UI will require touching the whole project.',
      verify: 'Open `.lwc/config.json` → `boundaries` and the import line.',
      fix: 'Route the dependency through an interface/abstraction or revise the rule.',
    },
    'ARCH-003': {
      title: 'Excessive coupling',
      observation: 'Module {file} imports {n} internal modules (threshold: {max})',
      explanation:
        'A module that knows about everything becomes a centre of gravity: every change touches it.',
      consequence: 'High cost of change and regressions; hard to test in isolation.',
      verify: 'Look at the import list and ask whether all of them belong here.',
      fix: 'Split the module by responsibility or introduce a facade.',
    },
    'ARCH-004': {
      title: 'Documentation diverges from actual structure',
      observation: '{doc} mentions path "{path}", which does not exist in the project',
      explanation:
        'The architecture document describes directories or modules that do not exist (or were renamed).',
      consequence: 'A new developer or AI agent will plan changes on a false map.',
      verify: 'Check for the path in the project tree.',
      fix: 'Update the document or restore the structure.',
    },
    'ARCH-005': {
      title: 'Module interface changed without updating dependents',
      observation:
        'Exports {removed} were removed from {file}, but importing files were not changed: {dependents}',
      explanation:
        'The module stopped exporting names other files use, and those files are untouched in the same change.',
      consequence: 'Import-time or runtime error in the dependent module.',
      verify: 'Run the build/tests or search for uses of the removed names.',
      fix: 'Update dependents or restore the export marked deprecated.',
    },
    'IMPL-001': {
      title: 'Potential data handling error',
      observation: '{what}: `{snippet}`',
      explanation:
        'Parsing external data (JSON, numbers from strings) may throw or produce an unexpected result.',
      consequence: 'Process crash on malformed input or a silent error (NaN, wrong number).',
      verify: 'Feed malformed input to this code and observe the result.',
      fix: 'Wrap parsing in try/catch and validate the result; pass radix 10 to parseInt.',
    },
    'IMPL-002': {
      title: 'Missing exception handling',
      observation: '{what}: `{snippet}`',
      explanation: 'An error here is either swallowed without trace or never caught.',
      consequence: 'Silent data loss or an unhandled exception crashing the process.',
      verify: 'Trigger an error inside this block and check that someone learns about it.',
      fix: 'Handle the error meaningfully: log it, return a clear result or rethrow.',
    },
    'IMPL-003': {
      title: 'Suspicious condition or boundary value',
      observation: '{what}: `{snippet}`',
      explanation:
        'The condition looks like a classic boundary bug (off-by-one, loose comparison, assignment instead of comparison).',
      consequence: 'Out-of-bounds access, wrong branch, skipped first/last element.',
      verify: 'Check behaviour for edge values: empty array, last index, null/0/"".',
      fix: 'Use strict comparison and check range boundaries.',
    },
    'IMPL-004': {
      title: 'No tests for module',
      observation: 'No test file was found for {file}',
      explanation:
        'Nobody has pinned the module behaviour in a test, so no one will notice a regression.',
      consequence: 'Any change can break the module silently.',
      verify: 'Find tests that import this module or mention its name.',
      fix: 'Add at least one test for the main scenario and one edge case.',
    },
    'IMPL-005': {
      title: 'Regression: tests failed',
      observation: 'Command `{command}` exited with code {code}',
      explanation:
        'A real run of the project tests failed. This is an execution result, not a guess.',
      consequence: 'The claimed functionality does not work or existing behaviour is broken.',
      verify: 'Run the command manually and read the output.',
      fix: 'Fix failing tests before claiming readiness.',
    },
    'IMPL-006': {
      title: 'Unused export',
      observation: 'Export "{name}" from {file} is never imported',
      explanation: 'The code exists but nobody uses it: either forgotten or called dynamically.',
      consequence: 'Dead code increases the bug surface and misleads readers.',
      verify: 'Search the project for the name, including dynamic calls and entry points.',
      fix: 'Remove or wire it up; if it is public API, mark it explicitly.',
    },
    'IMPL-007': {
      title: 'Suspicious code duplication',
      observation: 'A fragment of {n} lines repeats in {a} and {b}',
      explanation:
        'Identical blocks usually mean copied logic that will be fixed in one place and forgotten in the other.',
      consequence: 'Behaviour of the copies diverges after edits.',
      verify: 'Compare both fragments; check whether their logic is semantically the same.',
      fix: 'Extract the shared part into a function or module.',
    },
    'SEC-001': {
      title: 'Secret in source code',
      observation: 'Looks like a secret ({kind}): `{snippet}`',
      explanation:
        'Keys, tokens and passwords in code end up in Git history and with anyone who has repository access.',
      consequence: 'Credential compromise; key revocation and redeployment.',
      verify: 'Check whether the value is a real key (not an example/placeholder).',
      fix: 'Move it to environment variables or a secret manager, revoke the key, clean the history.',
    },
    'SEC-002': {
      title: 'Unsafe handling of user input',
      observation: '{what}: `{snippet}`',
      explanation:
        'External data reaches an interpreter (shell, SQL, HTML, eval) without escaping.',
      consequence: 'Arbitrary code execution, SQL injection or XSS.',
      verify: 'Put a quote / semicolon / tag into the input field and check the result.',
      fix: 'Use parameterised queries, safe APIs (spawn with an argument array, textContent) and validation.',
    },
    'SEC-003': {
      title: 'Potential authentication/authorisation issue',
      observation: '{what}: `{snippet}`',
      explanation: 'A route is reachable without an access check, or authentication is weakened.',
      consequence: 'Access to other users’ data or actions without signing in.',
      verify: 'Call the route without a token/session and check the response.',
      fix: 'Add authentication middleware and per-resource authorisation; never disable certificate checks.',
    },
    'SEC-004': {
      title: 'Dangerous file operation',
      observation: '{what}: `{snippet}`',
      explanation:
        'A file path is built from external data, or a recursive delete runs on a variable path.',
      consequence:
        'Reading/deleting files outside the allowed directory (path traversal), data loss.',
      verify: 'Pass a path containing `../` and see where it resolves.',
      fix: 'Normalise the path and verify it stays inside the base directory; never delete recursively on an unchecked variable.',
    },
    'SEC-005': {
      title: 'Suspicious dependency',
      observation: '{what}: {snippet}',
      explanation:
        'A dependency comes from an unverified source, has no pinned version or known problems.',
      consequence: 'Supply-chain attack, non-reproducible build, unpatched vulnerabilities.',
      verify: 'Check the package source and version in the manifest and lock file.',
      fix: 'Pin the version, use the official registry, replace the deprecated package.',
    },
    'SEC-006': {
      title: 'Excessive permissions',
      observation: '{what}: `{snippet}`',
      explanation: 'A process, token or file is granted broader rights than needed.',
      consequence: 'If one component is compromised the attacker gets more than they should.',
      verify: 'Ask: what is the minimum permission this operation needs?',
      fix: 'Narrow permissions to the minimum required (least privilege).',
    },
    'PROC-001': {
      title: 'Code written before requirements were agreed',
      observation: 'Task "{task}" is at stage "{stage}", yet source files were changed: {files}',
      explanation:
        'In the LWC process code is written only after the user confirms the plan (build stage).',
      consequence: 'The user loses control over decisions; changes will need redoing.',
      verify: 'Compare the task stage in `.lwc/session.json` with `git status`.',
      fix: 'Confirm the plan (`lwc task stage build`) or revert the premature changes.',
    },
    'PROC-002': {
      title: 'Result claimed as verified without running a check',
      observation: 'Claim "{claim}" is not backed by a recorded command run',
      explanation:
        'The agent reported a verification, but the evidence log has no real test run after the latest changes.',
      consequence: 'Unverified code is treated as verified; bugs surface later and cost more.',
      verify: 'Open `.lwc/evidence/` and look for a run made after the claim.',
      fix: 'Run checks through `lwc run -- <command>` so the result is recorded.',
    },
    'PROC-003': {
      title: 'File changed outside the agreed task scope',
      observation: 'File {file} is outside the task scope ({scope})',
      explanation: 'The change scope was agreed, yet the agent touched files beyond it.',
      consequence: 'Hidden side changes that nobody reviewed.',
      verify: 'Compare `git status` with `scope` in `.lwc/session.json`.',
      fix: 'Extend the scope explicitly (`lwc task scope add`) or revert the extra changes.',
    },
    'PROC-004': {
      title: 'Changes without tests',
      observation: 'Source files changed ({files}), but no test file was changed',
      explanation: 'New or changed behaviour is not reflected in tests.',
      consequence: 'The claimed behaviour is not checked automatically by anyone.',
      verify: 'Look at the changed files list: are there tests among them?',
      fix: 'Add or update tests for the changed behaviour.',
    },
    'PROC-005': {
      title: 'Success claimed although the check failed',
      observation:
        'The last run of `{command}` exited with code {code}, yet claim "{claim}" was made afterwards',
      explanation: 'The agent reported success after a failed check without a later passing run.',
      consequence: 'False sense of safety; broken code moves on in the process.',
      verify: 'Compare the claim time with the last run time in `.lwc/evidence/`.',
      fix: 'Fix the problem and rerun the check before claiming success.',
    },
    'OPS-001': {
      title: 'Required value missing',
      observation: 'Row {row}: field "{field}" is empty',
      explanation: 'The field is declared required in the report rules, but the value is missing.',
      consequence: 'Totals and calculations will be incomplete or wrong.',
      verify: 'Open row {row} of the source file and check field "{field}".',
      fix: 'Fill in the value at the source or exclude the row with a note.',
    },
    'OPS-002': {
      title: 'Negative value where forbidden',
      observation: 'Row {row}: "{field}" = {value}',
      explanation: 'A quantity or amount of this type cannot be negative under the report rules.',
      consequence:
        'A wrong sign distorts totals; possibly an input error or a refund recorded as a sale.',
      verify: 'Check the row against the primary document.',
      fix: 'Fix the sign or record the operation with the correct type (refund/adjustment).',
    },
    'OPS-003': {
      title: 'Total does not match the sum of parts',
      observation:
        'Row {row}: "{total}" = {declared}, sum of {parts} = {computed} (difference {diff})',
      explanation:
        'The total field must equal the sum of its parts within the configured tolerance.',
      consequence: 'The report is internally inconsistent: either the parts or the total is wrong.',
      verify: 'Add the parts manually for row {row}.',
      fix: 'Recalculate the total or fix the parts at the source.',
    },
    'OPS-004': {
      title: 'Duplicate record',
      observation: 'Rows {rows} share the same key ({key})',
      explanation: 'Two records have the same uniqueness key defined in the rules.',
      consequence: 'Double counting; inflated totals.',
      verify: 'Compare rows {rows} in full.',
      fix: 'Remove the duplicate or refine the uniqueness key if these are different operations.',
    },
    'OPS-005': {
      title: 'Impossible time sequence',
      observation: 'Row {row}: "{after}" ({afterValue}) is earlier than "{before}" ({beforeValue})',
      explanation: 'By the rules, event "{after}" cannot happen before event "{before}".',
      consequence: 'Time or timezone input error; duration calculations become negative.',
      verify: 'Check the timestamps of row {row} and the source timezone.',
      fix: 'Fix the timestamps; align all sources to one timezone.',
    },
    'OPS-006': {
      title: 'Sharp spike relative to history',
      observation:
        '"{field}" = {value}, median of {window} previous periods = {median} (ratio {ratio}, threshold {threshold})',
      explanation:
        'The value differs strongly from history. Not necessarily an error: the rule only flags the value for manual review using a configurable threshold.',
      consequence:
        'If it is an input error, trends are distorted; if real, it is an important event needing attention.',
      verify: 'Compare with historical data ({window} periods) and primary documents.',
      fix: 'Confirm or correct the value; adjust the threshold in the rules if needed.',
    },
    'OPS-007': {
      title: 'Value outside the allowed range',
      observation: 'Row {row}: "{field}" = {value}, allowed [{min}; {max}]',
      explanation: 'The rule defines an allowed range for the field; the value is outside it.',
      consequence: 'Input or unit error, or a violated business constraint.',
      verify: 'Check row {row} and the units.',
      fix: 'Fix the value or revise the range in the rules.',
    },
    'OPS-008': {
      title: 'Value cannot be parsed',
      observation: 'Row {row}: "{field}" = "{value}" is not a valid {type}',
      explanation: 'The field must hold a value of type "{type}", but it cannot be parsed.',
      consequence: 'The row is excluded from numeric checks; totals may be incomplete.',
      verify: 'Open row {row} and check the value format.',
      fix: 'Fix the format (number, date) at the source.',
    },
  },
};
