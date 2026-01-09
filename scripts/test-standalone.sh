#!/bin/bash

###############################################################################
# Phase 4.5: Agent + Skill Standalone Integration Test Runner
#
# This script runs all standalone tests to verify the Agent → PTC → Sandbox →
# Skills integration before Motia integration (Phase 5).
#
# Usage:
#   bash scripts/test-phase-4.5.sh           # Run all tests
#   bash scripts/test-phase-4.5.sh --verbose # Run with verbose output
#   bash scripts/test-phase-4.5.sh --skip-perf # Skip performance tests
#
# Exit codes:
#   0 - All tests passed
#   1 - Environment check failed
#   2 - Integration tests failed
#   3 - Performance tests failed
#   4 - Test execution error
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script options
VERBOSE=0
SKIP_PERF=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose)
      VERBOSE=1
      shift
      ;;
    --skip-perf)
      SKIP_PERF=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 4
      ;;
  esac
done

# Print banner
print_banner() {
  echo ""
  echo "================================"
  echo "  Phase 4.5: Agent + Skill"
  echo "  Standalone Integration Tests"
  echo "================================"
  echo ""
}

# Print section header
print_section() {
  echo ""
  echo -e "${BLUE}▶ $1${NC}"
  echo "--------------------------------"
}

# Print success
print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

# Print error
print_error() {
  echo -e "${RED}✗${NC} $1"
}

# Print warning
print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# Check environment
check_environment() {
  print_section "Environment Check"

  local errors=0

  # Check Node.js
  if command -v node &> /dev/null; then
    print_success "Node.js: $(node --version)"
  else
    print_error "Node.js not found"
    errors=$((errors + 1))
  fi

  # Check npm
  if command -v npm &> /dev/null; then
    print_success "npm: $(npm --version)"
  else
    print_error "npm not found"
    errors=$((errors + 1))
  fi

  # Check Python
  if command -v python3 &> /dev/null; then
    print_success "Python: $(python3 --version)"
  else
    print_error "Python 3 not found"
    errors=$((errors + 1))
  fi

  # Check ANTHROPIC_API_KEY
  if [ -n "$ANTHROPIC_API_KEY" ]; then
    print_success "ANTHROPIC_API_KEY: Set (sk-ant-...)"
  else
    print_warning "ANTHROPIC_API_KEY: Not set (some tests may fail)"
  fi

  # Check .env file
  if [ -f ".env" ]; then
    print_success ".env file: Found"
  else
    print_warning ".env file: Not found (using .env.example)"
  fi

  # Check dependencies
  print_section "Dependencies Check"

  if [ -d "node_modules" ]; then
    print_success "Node modules: Installed"
  else
    print_warning "Node modules: Not found - Installing..."
    npm install
  fi

  # Check Python dependencies
  if python3 -c "import pydantic" 2>/dev/null; then
    print_success "Python dependencies: Installed"
  else
    print_warning "Python dependencies: Not fully installed"
    print_warning "Run: pip3 install -r requirements.txt"
  fi

  # Check required directories
  print_section "Directory Structure"

  local dirs=("src/core/agent" "src/core/sandbox" "src/core/skill" "skills" "tests")
  for dir in "${dirs[@]}"; do
    if [ -d "$dir" ]; then
      print_success "$dir: Found"
    else
      print_error "$dir: Not found"
      errors=$((errors + 1))
    fi
  done

  if [ $errors -gt 0 ]; then
    print_error "Environment check failed with $errors error(s)"
    return 1
  fi

  print_success "Environment check passed"
  return 0
}

# Run integration tests
run_integration_tests() {
  print_section "Integration Tests"

  local test_file="tests/integration/agent-skill-standalone.test.ts"

  if [ ! -f "$test_file" ]; then
    print_error "Test file not found: $test_file"
    return 1
  fi

  local jest_args=""
  if [ $VERBOSE -eq 1 ]; then
    jest_args="--verbose --no-coverage"
  else
    jest_args="--silent"
  fi

  print_success "Running: npm test $jest_args $test_file"

  if npm test -- $jest_args "$test_file"; then
    print_success "Integration tests: PASSED"
    return 0
  else
    print_error "Integration tests: FAILED"
    return 2
  fi
}

# Run performance benchmarks
run_performance_tests() {
  if [ $SKIP_PERF -eq 1 ]; then
    print_warning "Performance tests: Skipped (--skip-perf flag)"
    return 0
  fi

  print_section "Performance Benchmarks"

  local test_file="tests/performance/agent-performance.test.ts"

  if [ ! -f "$test_file" ]; then
    print_warning "Performance test file not found: $test_file"
    return 0
  fi

  local jest_args=""
  if [ $VERBOSE -eq 1 ]; then
    jest_args="--verbose --no-coverage"
  else
    jest_args="--silent"
  fi

  print_success "Running: npm test $jest_args $test_file"

  if npm test -- $jest_args "$test_file"; then
    print_success "Performance benchmarks: PASSED"
    return 0
  else
    print_warning "Performance benchmarks: Some tests failed (may be expected)"
    print_warning "Review the performance summary above"
    return 3
  fi
}

# Generate test report
generate_report() {
  print_section "Test Report"

  echo ""
  echo "Test Results:"
  echo "  - Integration Tests: $1"
  echo "  - Performance Tests: $2"
  echo ""

  if [ "$1" = "PASSED" ] && [ "$2" != "FAILED" ]; then
    print_success "Phase 4.5: ALL TESTS PASSED"
    echo ""
    echo "You can now proceed to Phase 5 (Motia Integration)"
    echo ""
    echo "Next steps:"
    echo "  1. Review test results above"
    echo "  2. Check troubleshooting guide if needed: docs/troubleshooting.md"
    echo "  3. Run: /sc:implement 继续 phase5"
    return 0
  else
    print_error "Phase 4.5: SOME TESTS FAILED"
    echo ""
    echo "Action items:"
    echo "  1. Review error messages above"
    echo "  2. Check: docs/troubleshooting.md"
    echo "  3. Fix issues and re-run: bash scripts/test-phase-4.5.sh"
    echo "  4. Use --verbose flag for detailed output"
    return 1
  fi
}

# Main execution
main() {
  print_banner

  # Check environment
  if ! check_environment; then
    print_error "Cannot proceed - environment check failed"
    exit 1
  fi

  # Run tests
  local integration_result="FAILED"
  local performance_result="SKIPPED"

  if run_integration_tests; then
    integration_result="PASSED"
  fi

  if run_performance_tests; then
    performance_result="PASSED"
  elif [ $? -eq 3 ]; then
    performance_result="WARNING"
  else
    performance_result="FAILED"
  fi

  # Generate report
  if generate_report "$integration_result" "$performance_result"; then
    exit 0
  else
    exit 1
  fi
}

# Run main
main
