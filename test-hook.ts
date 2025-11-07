// Test file to verify git hooks work
export function testFunction() {
  const unusedVariable = "This will trigger ESLint error";

  // TypeScript error: missing return type
  return 123
}

// Another error: variable declared but never used
const anotherUnused = "test";
