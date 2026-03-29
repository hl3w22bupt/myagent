# Agent Output Validation Specification

## Purpose

Define the validation mechanism for Agent outputs to ensure structural integrity and completeness before returning results to upper-layer applications.

## ADDED Requirements

### Requirement: Schema validation

The system SHALL validate Agent output against a JSON Schema using Zod.

#### Scenario: Successful schema validation

- **WHEN** Agent output matches the defined schema
- **THEN** validation passes and the result is returned

#### Scenario: Schema validation failure

- **WHEN** Agent output violates the schema (e.g., wrong type, missing required field)
- **THEN** validation fails with a `ValidationError` containing specific error messages

#### Scenario: Nested object validation

- **WHEN** Agent output contains nested objects
- **THEN** the system validates the entire object hierarchy recursively

### Requirement: Completeness validation

The system SHALL verify that all required fields are present in the Agent output.

#### Scenario: All required fields present

- **WHEN** Agent output contains all required fields
- **THEN** validation passes

#### Scenario: Missing required field

- **WHEN** Agent output is missing one or more required fields
- **THEN** validation fails with a list of missing field names

#### Scenario: Empty vs. null handling

- **WHEN** a required field is `null` or empty string/array
- **THEN** validation fails (empty values are considered missing)

### Requirement: Format validation

The system SHALL validate field formats using regular expressions or predefined patterns.

#### Scenario: Valid format

- **WHEN** a field value matches the required format pattern
- **THEN** validation passes for that field

#### Scenario: Invalid format

- **WHEN** a field value does not match the required format pattern
- **THEN** validation fails with a descriptive error message indicating the expected format

#### Scenario: Common format patterns

- **WHEN** using predefined format types (email, url, uuid)
- **THEN** the system applies standard validation rules for that type

### Requirement: Validation strategies

The system SHALL support configurable validation strategies for handling validation failures.

#### Scenario: Strict strategy (default)

- **WHEN** validation fails and strategy is set to `strict`
- **THEN** the system throws a `ValidationError` and does not return the output

#### Scenario: Fallback strategy

- **WHEN** validation fails and strategy is set to `fallback`
- **THEN** the system logs a warning, sanitizes the output, and returns a simplified version

#### Scenario: Disabled validation

- **WHEN** validation is disabled in the configuration
- **THEN** the system skips all validation and returns the output as-is

### Requirement: Configuration via YAML

The system SHALL allow validation rules to be configured in the `agent.yaml` file.

#### Scenario: Defining schema rules

- **WHEN** defining schema validation in `agent.yaml`
- **THEN** the system parses the YAML and constructs Zod schemas accordingly

#### Scenario: Defining required fields

- **WHEN** listing required fields in `agent.yaml`
- **THEN** the system enforces presence checks for those fields

#### Scenario: Defining format patterns

- **WHEN** specifying format patterns in `agent.yaml`
- **THEN** the system compiles the patterns and validates matching fields

### Requirement: Extensibility via custom validators

The system SHALL support custom validation logic through a `CustomValidator` interface.

#### Scenario: Implementing a custom validator

- **WHEN** a user implements the `Validator` interface
- **THEN** the system can use the custom validator in addition to built-in ones

#### Scenario: Combining multiple validators

- **WHEN** multiple validators are configured
- **THEN** the system runs all validators and aggregates their results

### Requirement: Error reporting

The system SHALL provide clear, actionable error messages when validation fails.

#### Scenario: Detailed error messages

- **WHEN** validation fails
- **THEN** the error message includes the field path, expected type/format, and actual value

#### Scenario: Multiple validation errors

- **WHEN** multiple validation rules fail
- **THEN** the system reports all errors in a single validation result

### Requirement: Performance

The system SHALL complete validation within 50ms p99 for typical outputs (< 10KB).

#### Scenario: Small output validation

- **WHEN** validating a small output (< 1KB)
- **THEN** validation completes within 10ms

#### Scenario: Large output validation

- **WHEN** validating a large output (< 10KB)
- **THEN** validation completes within 50ms

#### Scenario: Validation disabled

- **WHEN** validation is disabled
- **THEN** there is no performance overhead

### Requirement: Backward compatibility

The system SHALL not break existing agents that do not define validation rules.

#### Scenario: Agent without validation config

- **WHEN** an agent does not define validation rules in `agent.yaml`
- **THEN** the system executes the agent without validation (backward compatible)

#### Scenario: Gradual adoption

- **WHEN** adding validation to an existing agent
- **THEN** only agents with validation configs are affected
